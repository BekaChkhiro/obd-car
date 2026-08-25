import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  AdapterKind,
  Recording,
  RecordingMetric,
  RecordingSample,
} from '../schema';

export interface RecordingSummary extends Recording {
  /** Wall-clock length in ms, or null while the recording is still running. */
  duration_ms: number | null;
}

/** Aggregate for one metric across a recording. */
export interface MetricStats {
  metric: RecordingMetric;
  unit: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  last: number;
}

export interface NewSample {
  metric: RecordingMetric;
  value: number;
  unit: string;
  /** ISO-8601. Defaults to now when omitted. */
  ts?: string;
}

const NOT_DELETED = 'deleted_at IS NULL';

export async function startRecording(
  db: SQLiteDatabase,
  recording: {
    id: string;
    userId: number;
    vehicleId?: string | null;
    sessionId?: string | null;
    label?: string | null;
    adapterKind: AdapterKind;
  },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO recordings (id, user_id, vehicle_id, session_id, label, adapter_kind)
     VALUES (?, ?, ?, ?, ?, ?)`,
    recording.id,
    recording.userId,
    recording.vehicleId ?? null,
    recording.sessionId ?? null,
    recording.label ?? null,
    recording.adapterKind,
  );
}

/**
 * Append a batch of samples and advance the recording's counter.
 *
 * Batched on purpose: the dashboard poller produces an RPM reading every
 * 250 ms, and one transaction per reading would keep the SQLite writer busy
 * for the whole drive.
 */
export async function appendSamples(
  db: SQLiteDatabase,
  recordingId: string,
  samples: readonly NewSample[],
): Promise<void> {
  if (samples.length === 0) return;

  await db.withExclusiveTransactionAsync(async () => {
    for (const sample of samples) {
      await db.runAsync(
        `INSERT INTO recording_samples (recording_id, ts, metric, value, unit)
         VALUES (?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')), ?, ?, ?)`,
        recordingId,
        sample.ts ?? null,
        sample.metric,
        sample.value,
        sample.unit,
      );
    }
    await db.runAsync(
      'UPDATE recordings SET sample_count = sample_count + ? WHERE id = ?',
      samples.length,
      recordingId,
    );
  });
}

export async function stopRecording(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE recordings
     SET ended_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND ended_at IS NULL`,
    id,
  );
}

export async function getRecording(
  db: SQLiteDatabase,
  id: string,
): Promise<Recording | null> {
  return db.getFirstAsync<Recording>(
    `SELECT * FROM recordings WHERE id = ? AND ${NOT_DELETED}`,
    id,
  );
}

export async function getRecordings(
  db: SQLiteDatabase,
  userId: number,
): Promise<RecordingSummary[]> {
  return db.getAllAsync<RecordingSummary>(
    `SELECT *,
            CASE WHEN ended_at IS NULL THEN NULL
                 ELSE CAST((julianday(ended_at) - julianday(started_at)) * 86400000 AS INTEGER)
            END AS duration_ms
     FROM recordings
     WHERE user_id = ? AND ${NOT_DELETED}
     ORDER BY started_at DESC`,
    userId,
  );
}

/** Any recording left open by a crash or force-quit, so the UI can close it out. */
export async function getOpenRecording(
  db: SQLiteDatabase,
  userId: number,
): Promise<Recording | null> {
  return db.getFirstAsync<Recording>(
    `SELECT * FROM recordings
     WHERE user_id = ? AND ended_at IS NULL AND ${NOT_DELETED}
     ORDER BY started_at DESC
     LIMIT 1`,
    userId,
  );
}

export async function getMetricStats(
  db: SQLiteDatabase,
  recordingId: string,
): Promise<MetricStats[]> {
  return db.getAllAsync<MetricStats>(
    `SELECT metric,
            unit,
            COUNT(*) AS count,
            MIN(value) AS min,
            MAX(value) AS max,
            AVG(value) AS avg,
            (SELECT value FROM recording_samples inner_s
              WHERE inner_s.recording_id = s.recording_id AND inner_s.metric = s.metric
              ORDER BY inner_s.ts DESC, inner_s.id DESC LIMIT 1) AS last
     FROM recording_samples s
     WHERE s.recording_id = ?
     GROUP BY metric, unit
     ORDER BY metric`,
    recordingId,
  );
}

export async function getSamples(
  db: SQLiteDatabase,
  recordingId: string,
  metric: RecordingMetric,
  limit = 500,
): Promise<RecordingSample[]> {
  return db.getAllAsync<RecordingSample>(
    `SELECT * FROM recording_samples
     WHERE recording_id = ? AND metric = ?
     ORDER BY ts ASC, id ASC
     LIMIT ?`,
    recordingId,
    metric,
    limit,
  );
}

export async function renameRecording(
  db: SQLiteDatabase,
  id: string,
  label: string | null,
): Promise<void> {
  const trimmed = label?.trim();
  await db.runAsync(
    'UPDATE recordings SET label = ? WHERE id = ?',
    trimmed ? trimmed : null,
    id,
  );
}

/** Soft-delete the recording and drop its samples — they are the bulk of the rows. */
export async function deleteRecording(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.withExclusiveTransactionAsync(async () => {
    await db.runAsync('DELETE FROM recording_samples WHERE recording_id = ?', id);
    await db.runAsync(
      `UPDATE recordings
       SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
      id,
    );
  });
}
