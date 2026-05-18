import type { SQLiteDatabase } from 'expo-sqlite';
import type { Vehicle } from '../schema';

export async function getVehicles(
  db: SQLiteDatabase,
  userId: number,
): Promise<Vehicle[]> {
  return db.getAllAsync<Vehicle>(
    'SELECT * FROM vehicles WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    userId,
  );
}

export async function getVehicle(
  db: SQLiteDatabase,
  id: string,
): Promise<Vehicle | null> {
  return db.getFirstAsync<Vehicle>('SELECT * FROM vehicles WHERE id = ?', id);
}

export async function upsertVehicle(
  db: SQLiteDatabase,
  vehicle: Omit<
    Vehicle,
    'created_at' | 'updated_at' | 'deleted_at' | 'sync_status' | 'server_id'
  > &
    Partial<
      Pick<
        Vehicle,
        'created_at' | 'updated_at' | 'deleted_at' | 'sync_status' | 'server_id'
      >
    >,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO vehicles (id, user_id, make, model, year, vin, updated_at, deleted_at, sync_status, server_id)
     VALUES ($id, $user_id, $make, $model, $year, $vin, $updated_at, $deleted_at, $sync_status, $server_id)
     ON CONFLICT(id) DO UPDATE SET
       make        = excluded.make,
       model       = excluded.model,
       year        = excluded.year,
       vin         = excluded.vin,
       updated_at  = excluded.updated_at,
       deleted_at  = excluded.deleted_at,
       sync_status = excluded.sync_status,
       server_id   = excluded.server_id`,
    {
      $id: vehicle.id,
      $user_id: vehicle.user_id,
      $make: vehicle.make ?? null,
      $model: vehicle.model ?? null,
      $year: vehicle.year ?? null,
      $vin: vehicle.vin ?? null,
      $updated_at: vehicle.updated_at ?? new Date().toISOString(),
      $deleted_at: vehicle.deleted_at ?? null,
      $sync_status: vehicle.sync_status ?? 'pending',
      $server_id: vehicle.server_id ?? null,
    },
  );
}

export async function markVehicleSynced(
  db: SQLiteDatabase,
  id: string,
  serverId: number,
): Promise<void> {
  await db.runAsync(
    "UPDATE vehicles SET sync_status = 'synced', server_id = ? WHERE id = ?",
    serverId,
    id,
  );
}

export async function markVehicleFailed(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync(
    "UPDATE vehicles SET sync_status = 'failed' WHERE id = ?",
    id,
  );
}

export async function getPendingVehicles(db: SQLiteDatabase): Promise<Vehicle[]> {
  return db.getAllAsync<Vehicle>(
    "SELECT * FROM vehicles WHERE sync_status = 'pending' ORDER BY created_at ASC",
  );
}
