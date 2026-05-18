"""Sync endpoints for the mobile client.

Two operations:

  POST /sync/push  — client uploads pending local writes
  GET  /sync/pull  — client downloads server rows since `since` cursor

Conflict policy:
  • messages, sessions, tool_calls: immutable; server-wins on PK collision
    (the existing row is preserved; the push is acked with `accepted=true`
    because the local copy and server copy are equivalent in practice).
  • vehicles: last-write-wins on `updated_at`. If the server copy is
    strictly newer, the push is rejected with `conflict="server-newer"`
    and the canonical row is delivered on the next pull.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import get_current_user
from ..db import get_session
from ..models import DiagnosticSession, Message, ToolCall, User, Vehicle, utcnow
from .schemas import (
    MessagePull,
    MessagePush,
    PullResponse,
    PushAck,
    PushRequest,
    PushResponse,
    SessionPull,
    SessionPush,
    ToolCallPull,
    ToolCallPush,
    VehiclePull,
    VehiclePush,
)

router = APIRouter(prefix="/sync", tags=["sync"])


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────


def _as_naive_utc(dt: datetime) -> datetime:
    """Normalise to naive UTC — SQLite stores naive timestamps."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(UTC).replace(tzinfo=None)
    return dt


def _ensure_utc(dt: datetime) -> datetime:
    """Return an aware UTC datetime regardless of stored zone awareness."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


async def _push_vehicle(session: AsyncSession, user_id: int, payload: VehiclePush) -> PushAck:
    existing = await session.get(Vehicle, payload.id)

    incoming_updated = _as_naive_utc(payload.updated_at)
    incoming_created = _as_naive_utc(payload.created_at)
    incoming_deleted = _as_naive_utc(payload.deleted_at) if payload.deleted_at else None

    if existing is None:
        vehicle = Vehicle(
            id=payload.id,
            user_id=user_id,
            make=payload.make,
            model=payload.model,
            year=payload.year,
            vin=payload.vin,
            created_at=incoming_created,
            updated_at=incoming_updated,
            deleted_at=incoming_deleted,
        )
        session.add(vehicle)
        return PushAck(
            id=payload.id,
            accepted=True,
            server_updated_at=_ensure_utc(incoming_updated),
        )

    if existing.user_id != user_id:
        # Row belongs to another user — refuse silently and signal a conflict
        # so the client drops or ignores its local copy.
        return PushAck(
            id=payload.id,
            accepted=False,
            server_updated_at=_ensure_utc(existing.updated_at),
            conflict="server-newer",
        )

    server_updated = existing.updated_at
    if server_updated.tzinfo is None:
        server_updated_cmp = server_updated.replace(tzinfo=UTC)
    else:
        server_updated_cmp = server_updated.astimezone(UTC)

    client_updated_cmp = _ensure_utc(payload.updated_at)

    if server_updated_cmp >= client_updated_cmp and server_updated_cmp != client_updated_cmp:
        # Server strictly newer — reject this push; the pull will deliver the
        # canonical row.
        return PushAck(
            id=payload.id,
            accepted=False,
            server_updated_at=_ensure_utc(existing.updated_at),
            conflict="server-newer",
        )

    existing.make = payload.make
    existing.model = payload.model
    existing.year = payload.year
    existing.vin = payload.vin
    existing.updated_at = incoming_updated
    existing.deleted_at = incoming_deleted
    return PushAck(
        id=payload.id,
        accepted=True,
        server_updated_at=_ensure_utc(incoming_updated),
    )


async def _push_session(session: AsyncSession, user_id: int, payload: SessionPush) -> PushAck:
    existing = await session.get(DiagnosticSession, payload.id)
    created = _as_naive_utc(payload.created_at)

    if existing is None:
        # `started_at` mirrors created_at; vehicle linkage is optional.
        session.add(
            DiagnosticSession(
                id=payload.id,
                user_id=user_id,
                vin=None,
                started_at=created,
                # vehicle_id has no FK on backend DiagnosticSession — but we
                # don't track it server-side yet; intentionally dropped.
            )
        )
        return PushAck(
            id=payload.id,
            accepted=True,
            server_updated_at=_ensure_utc(created),
        )

    if existing.user_id != user_id:
        return PushAck(
            id=payload.id,
            accepted=False,
            server_updated_at=_ensure_utc(existing.started_at),
            conflict="server-newer",
        )

    # Sessions are append-only; nothing to mutate.
    return PushAck(
        id=payload.id,
        accepted=True,
        server_updated_at=_ensure_utc(existing.started_at),
    )


async def _push_message(session: AsyncSession, user_id: int, payload: MessagePush) -> PushAck:
    # Validate parent session belongs to user
    parent = await session.get(DiagnosticSession, payload.session_id)
    if parent is None or parent.user_id != user_id:
        return PushAck(
            id=payload.id,
            accepted=False,
            server_updated_at=_ensure_utc(utcnow()),
            conflict="server-newer",
        )

    existing = await session.get(Message, payload.id)
    created = _as_naive_utc(payload.created_at)

    if existing is None:
        session.add(
            Message(
                id=payload.id,
                session_id=payload.session_id,
                role=payload.role,
                content=payload.content,
                created_at=created,
            )
        )
        return PushAck(
            id=payload.id,
            accepted=True,
            server_updated_at=_ensure_utc(created),
        )

    # Server-wins for immutable messages: keep existing, ack as accepted.
    return PushAck(
        id=payload.id,
        accepted=True,
        server_updated_at=_ensure_utc(existing.created_at),
    )


async def _push_tool_call(session: AsyncSession, user_id: int, payload: ToolCallPush) -> PushAck:
    # Validate parent message → session → user
    parent_msg = await session.get(Message, payload.message_id)
    if parent_msg is None:
        return PushAck(
            id=payload.id,
            accepted=False,
            server_updated_at=_ensure_utc(utcnow()),
            conflict="server-newer",
        )
    parent_session = await session.get(DiagnosticSession, parent_msg.session_id)
    if parent_session is None or parent_session.user_id != user_id:
        return PushAck(
            id=payload.id,
            accepted=False,
            server_updated_at=_ensure_utc(utcnow()),
            conflict="server-newer",
        )

    existing = await session.get(ToolCall, payload.id)
    created = _as_naive_utc(payload.created_at)

    if existing is None:
        session.add(
            ToolCall(
                id=payload.id,
                message_id=payload.message_id,
                tool_name=payload.tool_name,
                input=payload.input,
                output=payload.output,
                created_at=created,
            )
        )
        return PushAck(
            id=payload.id,
            accepted=True,
            server_updated_at=_ensure_utc(created),
        )

    # Allow filling in the output (tool calls become 'complete' when output
    # arrives) — but never overwrite a non-null output.
    if existing.output is None and payload.output is not None:
        existing.output = payload.output

    return PushAck(
        id=payload.id,
        accepted=True,
        server_updated_at=_ensure_utc(existing.created_at),
    )


# ──────────────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────────────


@router.post("/push", response_model=PushResponse)
async def push(
    body: PushRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PushResponse:
    # FK order: vehicles → sessions → messages → tool_calls.
    vehicle_acks = [await _push_vehicle(session, user.id, v) for v in body.vehicles]
    await session.flush()

    session_acks = [await _push_session(session, user.id, s) for s in body.sessions]
    await session.flush()

    message_acks = [await _push_message(session, user.id, m) for m in body.messages]
    await session.flush()

    tool_call_acks = [await _push_tool_call(session, user.id, t) for t in body.tool_calls]
    await session.commit()

    return PushResponse(
        vehicles=vehicle_acks,
        sessions=session_acks,
        messages=message_acks,
        tool_calls=tool_call_acks,
    )


@router.get("/pull", response_model=PullResponse)
async def pull(
    since: datetime | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PullResponse:
    cutoff = _as_naive_utc(since) if since is not None else None

    vehicle_stmt = select(Vehicle).where(Vehicle.user_id == user.id)
    if cutoff is not None:
        vehicle_stmt = vehicle_stmt.where(Vehicle.updated_at > cutoff)
    vehicle_stmt = vehicle_stmt.order_by(Vehicle.updated_at.asc())
    vehicles = (await session.execute(vehicle_stmt)).scalars().all()

    session_stmt = select(DiagnosticSession).where(DiagnosticSession.user_id == user.id)
    if cutoff is not None:
        session_stmt = session_stmt.where(DiagnosticSession.started_at > cutoff)
    session_stmt = session_stmt.order_by(DiagnosticSession.started_at.asc())
    sessions = (await session.execute(session_stmt)).scalars().all()

    # Messages + tool_calls scoped via parent session.user_id
    message_stmt = (
        select(Message)
        .join(DiagnosticSession, Message.session_id == DiagnosticSession.id)
        .where(DiagnosticSession.user_id == user.id)
    )
    if cutoff is not None:
        message_stmt = message_stmt.where(Message.created_at > cutoff)
    message_stmt = message_stmt.order_by(Message.created_at.asc())
    messages = (await session.execute(message_stmt)).scalars().all()

    tool_call_stmt = (
        select(ToolCall)
        .join(Message, ToolCall.message_id == Message.id)
        .join(DiagnosticSession, Message.session_id == DiagnosticSession.id)
        .where(DiagnosticSession.user_id == user.id)
    )
    if cutoff is not None:
        tool_call_stmt = tool_call_stmt.where(ToolCall.created_at > cutoff)
    tool_call_stmt = tool_call_stmt.order_by(ToolCall.created_at.asc())
    tool_calls = (await session.execute(tool_call_stmt)).scalars().all()

    # Cursor = max(server now, latest returned timestamp). Using the latest
    # returned timestamp guards against clients with clocks ahead of ours:
    # without it the next pull would re-emit those rows forever.
    server_now = utcnow()
    candidates: list[datetime] = [_ensure_utc(server_now)]
    candidates.extend(_ensure_utc(v.updated_at) for v in vehicles)
    candidates.extend(_ensure_utc(s.started_at) for s in sessions)
    candidates.extend(_ensure_utc(m.created_at) for m in messages)
    candidates.extend(_ensure_utc(t.created_at) for t in tool_calls)
    next_cursor = max(candidates)

    return PullResponse(
        vehicles=[VehiclePull.model_validate(v) for v in vehicles],
        sessions=[
            SessionPull(
                id=s.id,
                # backend doesn't track vehicle_id on session yet; leave None
                vehicle_id=None,
                created_at=_ensure_utc(s.started_at),
            )
            for s in sessions
        ],
        messages=[MessagePull.model_validate(m) for m in messages],
        tool_calls=[ToolCallPull.model_validate(t) for t in tool_calls],
        server_time=next_cursor,
    )
