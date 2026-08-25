import type { SQLiteDatabase } from 'expo-sqlite';

type Migration = (db: SQLiteDatabase) => Promise<void>;

const migrations: Migration[] = [
  // v1 — initial schema
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id          TEXT PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        make        TEXT,
        model       TEXT,
        year        INTEGER,
        vin         TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        sync_status TEXT NOT NULL DEFAULT 'pending',
        server_id   INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_vehicles_user_id_created_at
        ON vehicles (user_id, created_at);

      CREATE TABLE IF NOT EXISTS sessions (
        id          TEXT PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        vehicle_id  TEXT REFERENCES vehicles(id),
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        sync_status TEXT NOT NULL DEFAULT 'pending',
        server_id   INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id_created_at
        ON sessions (user_id, created_at);

      CREATE TABLE IF NOT EXISTS messages (
        id          TEXT PRIMARY KEY,
        session_id  TEXT NOT NULL REFERENCES sessions(id),
        role        TEXT NOT NULL,
        content     TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        sync_status TEXT NOT NULL DEFAULT 'pending',
        server_id   INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session_id_created_at
        ON messages (session_id, created_at);

      CREATE TABLE IF NOT EXISTS tool_calls (
        id          TEXT PRIMARY KEY,
        message_id  TEXT NOT NULL REFERENCES messages(id),
        tool_name   TEXT NOT NULL,
        input       TEXT NOT NULL,
        output      TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        sync_status TEXT NOT NULL DEFAULT 'pending',
        server_id   INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_tool_calls_message_id
        ON tool_calls (message_id);
    `);
  },
  // v2 — sync cursor + LWW metadata for vehicles
  async (db) => {
    await db.execAsync(`
      ALTER TABLE vehicles
        ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'));
      ALTER TABLE vehicles
        ADD COLUMN deleted_at TEXT;

      CREATE TABLE IF NOT EXISTS sync_cursors (
        entity         TEXT PRIMARY KEY,
        last_pulled_at TEXT
      );
    `);
  },
  // v3 — session control (title / lifecycle / soft delete) + live recordings
  async (db) => {
    await db.execAsync(`
      ALTER TABLE sessions
        ADD COLUMN title TEXT;
      ALTER TABLE sessions
        ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'));
      ALTER TABLE sessions
        ADD COLUMN ended_at TEXT;
      ALTER TABLE sessions
        ADD COLUMN deleted_at TEXT;

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id_updated_at
        ON sessions (user_id, updated_at);

      -- A live-data capture run. adapter_kind is stored per recording, not
      -- derived at read time, so a simulated run can never later be displayed
      -- as if it had come off a real ECU.
      CREATE TABLE IF NOT EXISTS recordings (
        id            TEXT PRIMARY KEY,
        user_id       INTEGER NOT NULL,
        vehicle_id    TEXT REFERENCES vehicles(id),
        session_id    TEXT REFERENCES sessions(id),
        label         TEXT,
        adapter_kind  TEXT NOT NULL,
        started_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        ended_at      TEXT,
        sample_count  INTEGER NOT NULL DEFAULT 0,
        deleted_at    TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_recordings_user_id_started_at
        ON recordings (user_id, started_at);

      CREATE TABLE IF NOT EXISTS recording_samples (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id  TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
        ts            TEXT NOT NULL,
        metric        TEXT NOT NULL,
        value         REAL NOT NULL,
        unit          TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_recording_samples_recording_id_ts
        ON recording_samples (recording_id, ts);
    `);
  },
];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );
  `);

  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
  );
  let currentVersion = row?.version ?? 0;

  for (let i = currentVersion; i < migrations.length; i++) {
    await db.withExclusiveTransactionAsync(async () => {
      await migrations[i]!(db);
      await db.runAsync(
        'INSERT INTO schema_version (version) VALUES (?)',
        i + 1,
      );
    });
    currentVersion = i + 1;
  }
}
