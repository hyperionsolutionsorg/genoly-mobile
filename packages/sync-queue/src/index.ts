/**
 * @genoly/sync-queue — offline-tolerant outbox for health-aggregate
 * uploads.
 *
 * Public API:
 *   - SyncQueue          — main class. Construct with apiClient + store.
 *   - createSyncQueue()  — convenience factory that wires up an
 *                          ExpoSqliteStore (production) or MemoryStore
 *                          (test) automatically based on environment.
 *   - MemoryStore        — exported for tests.
 *   - ExpoSqliteStore    — exported in case the caller wants explicit
 *                          control of the DB filename / init timing.
 *
 * Forkability constraint: same as @genoly/health-sync. This package
 * imports from @genoly/api-client + @genoly/types but NOTHING outside.
 * Drainer logic lives here, not in screens.
 */

import type { ApiClient } from '@genoly/api-client';
import { SyncQueue, type DrainResult, type SyncQueueOptions, BATCH_SIZE, MAX_ATTEMPTS } from './queue';
import { MemoryStore, ExpoSqliteStore, type SyncStore, type SyncOutboxRow } from './store';

export { SyncQueue, MemoryStore, ExpoSqliteStore };
export type { DrainResult, SyncQueueOptions, SyncStore, SyncOutboxRow };
export { BATCH_SIZE, MAX_ATTEMPTS };

/**
 * Convenience factory: open an ExpoSqliteStore, init() it, and wrap in
 * a SyncQueue. Falls back to a MemoryStore + warning if expo-sqlite
 * isn't loadable (test environments, web preview).
 *
 * Caller still needs to call drain() — this factory doesn't kick off
 * the drainer. Step 6 (background fetch) and Step 7 (foreground pull)
 * each schedule drain() themselves.
 */
export async function createSyncQueue(opts: {
  apiClient: ApiClient;
  dbName?: string;
  batchSize?: number;
  maxAttempts?: number;
}): Promise<SyncQueue> {
  let store: SyncStore;
  try {
    const sqliteStore = new ExpoSqliteStore(opts.dbName);
    await sqliteStore.init();
    store = sqliteStore;
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[sync-queue] ExpoSqliteStore unavailable, falling back to MemoryStore: ${msg}`);
    }
    store = new MemoryStore();
  }
  return new SyncQueue({
    apiClient: opts.apiClient,
    store,
    batchSize: opts.batchSize,
    maxAttempts: opts.maxAttempts,
  });
}
