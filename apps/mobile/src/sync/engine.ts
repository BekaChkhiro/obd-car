/**
 * Mobile ↔ backend sync engine.
 *
 * Order of operations on a sync tick:
 *   1. push pending writes (vehicles → sessions → messages → tool_calls)
 *   2. pull rows changed since `last_pulled_at` cursor (same FK order)
 *   3. advance the cursor to the server-reported `server_time`
 *
 * Concurrency: a single in-flight promise is shared across callers so
 * AppState foreground events and manual triggers can't double-fire.
 *
 * Failure model: per-row failures are marked sync_status='failed' so the
 * UI can surface them; the rest of the batch still pushes. Network
 * errors bail out and leave rows as 'pending' for the next tick.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import {
  messagesRepo,
  sessionsRepo,
  syncCursorsRepo,
  toolCallsRepo,
  vehiclesRepo,
} from '../db';
import type {
  Message,
  Session,
  ToolCall,
  Vehicle,
} from '../db';
import { syncApi } from './client';
import type {
  MessagePushPayload,
  PullResponse,
  PushAck,
  PushRequest,
  PushResponse,
  SessionPushPayload,
  SyncResult,
  ToolCallPushPayload,
  VehiclePushPayload,
} from './types';

const SYNCED_SENTINEL = 1;

function vehicleToPush(v: Vehicle): VehiclePushPayload {
  return {
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    vin: v.vin,
    created_at: v.created_at,
    updated_at: v.updated_at,
    deleted_at: v.deleted_at,
  };
}

function sessionToPush(s: Session): SessionPushPayload {
  return {
    id: s.id,
    vehicle_id: s.vehicle_id,
    created_at: s.created_at,
  };
}

function messageToPush(m: Message): MessagePushPayload {
  return {
    id: m.id,
    session_id: m.session_id,
    role: m.role,
    content: m.content,
    created_at: m.created_at,
  };
}

function toolCallToPush(t: ToolCall): ToolCallPushPayload {
  return {
    id: t.id,
    message_id: t.message_id,
    tool_name: t.tool_name,
    input: t.input,
    output: t.output,
    created_at: t.created_at,
  };
}

async function applyAcks(
  db: SQLiteDatabase,
  acks: PushAck[],
  onSynced: (id: string) => Promise<void>,
  onFailed: (id: string) => Promise<void>,
): Promise<{ conflicts: number; failures: number }> {
  let conflicts = 0;
  let failures = 0;
  for (const ack of acks) {
    if (ack.accepted) {
      await onSynced(ack.id);
    } else {
      if (ack.conflict === 'server-newer') conflicts += 1;
      else failures += 1;
      await onFailed(ack.id);
    }
  }
  return { conflicts, failures };
}

async function applyPull(
  db: SQLiteDatabase,
  userId: number,
  pull: PullResponse,
): Promise<void> {
  // FK order: vehicles → sessions → messages → tool_calls.
  for (const v of pull.vehicles) {
    await vehiclesRepo.upsertVehicle(db, {
      id: v.id,
      user_id: userId,
      make: v.make,
      model: v.model,
      year: v.year,
      vin: v.vin,
      created_at: v.created_at,
      updated_at: v.updated_at,
      deleted_at: v.deleted_at,
      sync_status: 'synced',
      server_id: SYNCED_SENTINEL,
    });
  }

  for (const s of pull.sessions) {
    await sessionsRepo.upsertServerSession(db, {
      id: s.id,
      user_id: userId,
      vehicle_id: s.vehicle_id,
      created_at: s.created_at,
      sync_status: 'synced',
      server_id: SYNCED_SENTINEL,
    });
  }

  for (const m of pull.messages) {
    await messagesRepo.upsertServerMessage(db, {
      id: m.id,
      session_id: m.session_id,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      sync_status: 'synced',
      server_id: SYNCED_SENTINEL,
    });
  }

  for (const t of pull.tool_calls) {
    await toolCallsRepo.upsertServerToolCall(db, {
      id: t.id,
      message_id: t.message_id,
      tool_name: t.tool_name,
      input: t.input,
      output: t.output,
      created_at: t.created_at,
      sync_status: 'synced',
      server_id: SYNCED_SENTINEL,
    });
  }
}

async function gatherPushRequest(db: SQLiteDatabase): Promise<PushRequest> {
  const [vehicles, sessions, messages, toolCalls] = await Promise.all([
    vehiclesRepo.getPendingVehicles(db),
    sessionsRepo.getPendingSessions(db),
    messagesRepo.getPendingMessages(db),
    toolCallsRepo.getPendingToolCalls(db),
  ]);

  return {
    vehicles: vehicles.map(vehicleToPush),
    sessions: sessions.map(sessionToPush),
    messages: messages.map(messageToPush),
    tool_calls: toolCalls.map(toolCallToPush),
  };
}

async function applyPushResponse(
  db: SQLiteDatabase,
  response: PushResponse,
): Promise<{ conflicts: number; failures: number }> {
  let conflicts = 0;
  let failures = 0;

  for (const [acks, onSynced, onFailed] of [
    [
      response.vehicles,
      (id: string) => vehiclesRepo.markVehicleSynced(db, id, SYNCED_SENTINEL),
      (id: string) => vehiclesRepo.markVehicleFailed(db, id),
    ] as const,
    [
      response.sessions,
      (id: string) => sessionsRepo.markSessionSynced(db, id, SYNCED_SENTINEL),
      (id: string) => sessionsRepo.markSessionFailed(db, id),
    ] as const,
    [
      response.messages,
      (id: string) => messagesRepo.markMessageSynced(db, id, SYNCED_SENTINEL),
      (id: string) => messagesRepo.markMessageFailed(db, id),
    ] as const,
    [
      response.tool_calls,
      (id: string) => toolCallsRepo.markToolCallSynced(db, id, SYNCED_SENTINEL),
      (id: string) => toolCallsRepo.markToolCallFailed(db, id),
    ] as const,
  ]) {
    const result = await applyAcks(db, acks, onSynced, onFailed);
    conflicts += result.conflicts;
    failures += result.failures;
  }

  return { conflicts, failures };
}

export interface SyncOptions {
  /** Skip the push leg (useful for pull-only initial hydration). */
  skipPush?: boolean;
  /** Skip the pull leg. */
  skipPull?: boolean;
}

let inFlight: Promise<SyncResult> | null = null;

/**
 * Run a single sync pass. Concurrent callers receive the same promise so
 * we never double-push the same pending rows.
 */
export function sync(
  db: SQLiteDatabase,
  userId: number,
  options: SyncOptions = {},
): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSync(db, userId, options).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(
  db: SQLiteDatabase,
  userId: number,
  options: SyncOptions,
): Promise<SyncResult> {
  const result: SyncResult = {
    pushed: { vehicles: 0, sessions: 0, messages: 0, tool_calls: 0 },
    pulled: { vehicles: 0, sessions: 0, messages: 0, tool_calls: 0 },
    conflicts: 0,
    failures: 0,
    serverTime: null,
  };

  if (!options.skipPush) {
    const request = await gatherPushRequest(db);
    const total =
      request.vehicles.length +
      request.sessions.length +
      request.messages.length +
      request.tool_calls.length;
    if (total > 0) {
      const response = await syncApi.push(request);
      const counts = await applyPushResponse(db, response);
      result.pushed.vehicles = request.vehicles.length;
      result.pushed.sessions = request.sessions.length;
      result.pushed.messages = request.messages.length;
      result.pushed.tool_calls = request.tool_calls.length;
      result.conflicts += counts.conflicts;
      result.failures += counts.failures;
    }
  }

  if (!options.skipPull) {
    const since = await syncCursorsRepo.getCursor(db, 'vehicles');
    const pull = await syncApi.pull(since);
    await applyPull(db, userId, pull);
    result.pulled.vehicles = pull.vehicles.length;
    result.pulled.sessions = pull.sessions.length;
    result.pulled.messages = pull.messages.length;
    result.pulled.tool_calls = pull.tool_calls.length;
    result.serverTime = pull.server_time;
    // One cursor covers every entity — they share server_time.
    await syncCursorsRepo.setCursor(db, 'vehicles', pull.server_time);
    await syncCursorsRepo.setCursor(db, 'sessions', pull.server_time);
    await syncCursorsRepo.setCursor(db, 'messages', pull.server_time);
    await syncCursorsRepo.setCursor(db, 'tool_calls', pull.server_time);
  }

  return result;
}

/** Visible for tests — clear the singleton in-flight promise. */
export function _resetForTests(): void {
  inFlight = null;
}
