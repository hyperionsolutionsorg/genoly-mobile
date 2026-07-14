/**
 * Persistence layer for the sync queue.
 *
 * The queue itself is platform-agnostic logic (see `queue.ts`); this file
 * defines the abstract `SyncStore` interface and provides two
 * implementations:
 *
 *   - `MemoryStore` — in-memory Map<id, row>. Used for tests and as a
 *     fallback when expo-sqlite isn't loadable (e.g. running scripts in
 *     Node without the native module).
 *
 *   - `ExpoSqliteStore` — SQLite-backed, durable across app launches.
 *     Wraps `expo-sqlite`'s async API. The native module is lazy-loaded
 *     via try/catch require, same defensive pattern as health-sync and
 *     preferences.ts — so this file IS importable from Node tests; it
 *     just can't OPEN the database without expo-sqlite present.
 *
 * Schema (SQLite):
 *
 *   CREATE TABLE sync_outbox (
 *     id TEXT PRIMARY KEY,                     -- caller-supplied (uuid)
 *     payload_json TEXT NOT NULL,              -- JSON-serialized HealthEntryUpload
 *     attempts INTEGER NOT NULL DEFAULT 0,     -- retry count
 *     last_attempt_at INTEGER,                 -- ms since epoch, null until first attempt
 *     dead_lettered_at INTEGER,                -- ms since epoch when moved to DLQ
 *     created_at INTEGER NOT NULL              -- ms since epoch
 *   );
 *   CREATE INDEX sync_outbox_by_dead_lettered ON sync_outbox(dead_lettered_at);
 *
 * Why ID is caller-supplied: dedupe. If the device's drainer crashes
 * mid-batch, restart might re-enqueue identical entries. Caller passes
 * a deterministic UUID (e.g. `${userId}-${date}-${source}`); we use
 * INSERT OR REPLACE for idempotency.
 */

import type { HealthEntryUpload } from '@genoly/types';

// ── Row shape ─────────────────────────────────────────────────────────

export interface SyncOutboxRow {
  id: string;
  payload: HealthEntryUpload;
  attempts: number;
  lastAttemptAt: number | null;
  deadLetteredAt: number | null;
  createdAt: number;
}

// ── Store interface ───────────────────────────────────────────────────

export interface SyncStore {
  /** Idempotent upsert. If id already exists, REPLACE the row (resets
   *  attempts to 0). Caller's choice — they pass the dedupe key. */
  upsert(row: Pick<SyncOutboxRow, 'id' | 'payload' | 'createdAt'>): Promise<void>;

  /** Fetch the next batch of NOT-yet-dead-lettered rows, ordered by
   *  createdAt ASC. Limit = batch size. */
  fetchBatch(limit: number): Promise<SyncOutboxRow[]>;

  /** Increment `attempts` and set `lastAttemptAt` to now. */
  recordAttempt(ids: string[], now: number): Promise<void>;

  /** Delete rows by ID (successful upload). */
  deleteRows(ids: string[]): Promise<void>;

  /** Mark rows as dead-lettered (max retries exceeded OR permanent
   *  server-side rejection). */
  markDeadLettered(ids: string[], now: number): Promise<void>;

  /** Count of NOT-yet-dead-lettered rows (for getQueueDepth). */
  countPending(): Promise<number>;

  /** Count of dead-lettered rows. */
  countDeadLettered(): Promise<number>;

  /** Hard-delete all dead-lettered rows (for the user-triggered "clear
   *  errors" button in Settings). */
  clearDeadLettered(): Promise<void>;

  /** Hard-delete EVERY row (pending + dead-lettered). Used by the
   *  "delete my health data" control so wiped server data can't be
   *  re-uploaded by a later drain of stale local rows. */
  clearAll(): Promise<void>;
}

// ── MemoryStore ───────────────────────────────────────────────────────

export class MemoryStore implements SyncStore {
  private rows = new Map<string, SyncOutboxRow>();

  async upsert(row: Pick<SyncOutboxRow, 'id' | 'payload' | 'createdAt'>): Promise<void> {
    this.rows.set(row.id, {
      id: row.id,
      payload: row.payload,
      attempts: 0,
      lastAttemptAt: null,
      deadLetteredAt: null,
      createdAt: row.createdAt,
    });
  }

  async fetchBatch(limit: number): Promise<SyncOutboxRow[]> {
    return Array.from(this.rows.values())
      .filter((r) => r.deadLetteredAt === null)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limit);
  }

  async recordAttempt(ids: string[], now: number): Promise<void> {
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row) {
        row.attempts += 1;
        row.lastAttemptAt = now;
      }
    }
  }

  async deleteRows(ids: string[]): Promise<void> {
    for (const id of ids) this.rows.delete(id);
  }

  async markDeadLettered(ids: string[], now: number): Promise<void> {
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row) row.deadLetteredAt = now;
    }
  }

  async countPending(): Promise<number> {
    return Array.from(this.rows.values()).filter((r) => r.deadLetteredAt === null).length;
  }

  async countDeadLettered(): Promise<number> {
    return Array.from(this.rows.values()).filter((r) => r.deadLetteredAt !== null).length;
  }

  async clearDeadLettered(): Promise<void> {
    for (const [id, row] of this.rows) {
      if (row.deadLetteredAt !== null) this.rows.delete(id);
    }
  }

  async clearAll(): Promise<void> {
    this.rows.clear();
  }

  /** Test helper — inspect raw row state without filtering. */
  __inspect(): SyncOutboxRow[] {
    return Array.from(this.rows.values());
  }
}

// ── ExpoSqliteStore ───────────────────────────────────────────────────

interface SQLiteDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: unknown[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
}

interface SQLiteModule {
  openDatabaseAsync(name: string): Promise<SQLiteDatabase>;
}

function loadSqlite(): SQLiteModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- REASON: native module must resolve synchronously.
    const mod = require('expo-sqlite');
    return (mod?.default ?? mod) as SQLiteModule;
  } catch {
    return null;
  }
}

interface ExpoSqliteRow {
  id: string;
  payload_json: string;
  attempts: number;
  last_attempt_at: number | null;
  dead_lettered_at: number | null;
  created_at: number;
}

function rowFromDb(r: ExpoSqliteRow): SyncOutboxRow {
  return {
    id: r.id,
    payload: JSON.parse(r.payload_json) as HealthEntryUpload,
    attempts: r.attempts,
    lastAttemptAt: r.last_attempt_at,
    deadLetteredAt: r.dead_lettered_at,
    createdAt: r.created_at,
  };
}

export class ExpoSqliteStore implements SyncStore {
  private db: SQLiteDatabase | null = null;
  private dbName: string;

  constructor(dbName: string = 'genoly_sync.db') {
    this.dbName = dbName;
  }

  /** Initialize the database connection + ensure the schema exists.
   *  Must be called before any other method. Safe to call multiple
   *  times (idempotent). */
  async init(): Promise<void> {
    if (this.db) return;
    const sqlite = loadSqlite();
    if (!sqlite) {
      throw new Error('expo-sqlite not loadable — falling back to MemoryStore is the caller\'s responsibility');
    }
    this.db = await sqlite.openDatabaseAsync(this.dbName);
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at INTEGER,
        dead_lettered_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sync_outbox_by_dead_lettered ON sync_outbox(dead_lettered_at);
    `);
  }

  private requireDb(): SQLiteDatabase {
    if (!this.db) {
      throw new Error('ExpoSqliteStore.init() must be called first');
    }
    return this.db;
  }

  async upsert(row: Pick<SyncOutboxRow, 'id' | 'payload' | 'createdAt'>): Promise<void> {
    const db = this.requireDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_outbox (id, payload_json, attempts, last_attempt_at, dead_lettered_at, created_at)
       VALUES (?, ?, 0, NULL, NULL, ?)`,
      row.id,
      JSON.stringify(row.payload),
      row.createdAt,
    );
  }

  async fetchBatch(limit: number): Promise<SyncOutboxRow[]> {
    const db = this.requireDb();
    const results = await db.getAllAsync<ExpoSqliteRow>(
      `SELECT * FROM sync_outbox WHERE dead_lettered_at IS NULL ORDER BY created_at ASC LIMIT ?`,
      limit,
    );
    return results.map(rowFromDb);
  }

  async recordAttempt(ids: string[], now: number): Promise<void> {
    if (ids.length === 0) return;
    const db = this.requireDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE sync_outbox SET attempts = attempts + 1, last_attempt_at = ? WHERE id IN (${placeholders})`,
      now,
      ...ids,
    );
  }

  async deleteRows(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = this.requireDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(`DELETE FROM sync_outbox WHERE id IN (${placeholders})`, ...ids);
  }

  async markDeadLettered(ids: string[], now: number): Promise<void> {
    if (ids.length === 0) return;
    const db = this.requireDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE sync_outbox SET dead_lettered_at = ? WHERE id IN (${placeholders})`,
      now,
      ...ids,
    );
  }

  async countPending(): Promise<number> {
    const db = this.requireDb();
    const result = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM sync_outbox WHERE dead_lettered_at IS NULL`,
    );
    return result?.c ?? 0;
  }

  async countDeadLettered(): Promise<number> {
    const db = this.requireDb();
    const result = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM sync_outbox WHERE dead_lettered_at IS NOT NULL`,
    );
    return result?.c ?? 0;
  }

  async clearDeadLettered(): Promise<void> {
    const db = this.requireDb();
    await db.runAsync(`DELETE FROM sync_outbox WHERE dead_lettered_at IS NOT NULL`);
  }

  async clearAll(): Promise<void> {
    const db = this.requireDb();
    await db.runAsync(`DELETE FROM sync_outbox`);
  }
}
