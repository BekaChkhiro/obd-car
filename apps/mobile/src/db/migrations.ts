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
