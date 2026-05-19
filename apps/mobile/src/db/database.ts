import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { runMigrations } from './migrations';

export { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';

export const DB_NAME = 'obd_chat.db';

let _db: SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLiteDatabase> {
  if (_db) return _db;
  _db = await openDatabaseAsync(DB_NAME);
  await runMigrations(_db);
  return _db;
}

export async function clearDb(): Promise<void> {
  if (_db) {
    await _db.closeAsync();
    _db = null;
  }
  await deleteDatabaseAsync(DB_NAME);
}
