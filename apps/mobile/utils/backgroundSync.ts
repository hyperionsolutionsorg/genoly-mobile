/**
 * backgroundSync.ts — Step 6 of Phase 1.
 *
 * Wires `expo-background-fetch` + `expo-task-manager` to call
 * `SyncQueue.drain()` periodically while the app is in the background.
 *
 * Pattern (per mobile-sync-architecture.md §13):
 *
 *   1. A NAMED TaskManager task is registered ONCE at module load
 *      (idempotent — TaskManager dedupes registrations by name).
 *   2. The task body creates a fresh SyncQueue against the app's
 *      shared ApiClient and calls `drain()` once. It does NOT loop —
 *      one drain per wake-up keeps us under the iOS 30-second budget.
 *   3. Outer wiring (`registerBackgroundSync()` / `unregisterBackgroundSync()`)
 *      registers the task with BackgroundFetch on demand. Callers:
 *        - permissions screen, when user grants → register
 *        - settings screen, when user toggles → register / unregister
 *        - _layout cold-start, when healthSyncEnabled=true → register
 *          (re-registration is idempotent on iOS / Android)
 *   4. The task ALWAYS reads `getHealthSyncEnabled()` at start. If the
 *      user has disabled sync since last register, the task returns
 *      NoData immediately. We don't rely on unregister fully removing
 *      pending wake-ups — both ends of the gate matter.
 *
 * Why a single drain() per wake (not a while loop):
 *   - iOS background fetch caps at ~30 seconds. A loop that hits a slow
 *     network can kill the task before the next wake registers.
 *   - One batch up to BATCH_SIZE=50 rows is generally enough to keep
 *     queue depth bounded. If the user produces > 50 entries in 15
 *     minutes, the next wake catches up.
 *   - The foreground drain (Step 7+) will drain to empty.
 *
 * Native module loading is wrapped in try/catch so this file is safe to
 * import from Node tests (which mock the modules).
 */

import { apiClient } from './api';
import { getHealthSyncEnabled } from './preferences';
import { createSyncQueue, type DrainResult, type SyncQueue } from '@genoly/sync-queue';

// ── Public constants ──────────────────────────────────────────────────

export const GENOLY_BG_SYNC_TASK = 'genoly.sync.healthAggregates';

/** Minimum interval iOS honors. Android may honor smaller; this is the
 *  hint, not a guarantee — the OS picks the actual cadence based on
 *  battery, usage patterns, etc. */
export const BG_SYNC_MIN_INTERVAL_SEC = 15 * 60;

// ── Native module loading (defensive) ────────────────────────────────

interface TaskManagerModule {
  defineTask(taskName: string, fn: () => Promise<unknown>): void;
  isTaskRegisteredAsync(taskName: string): Promise<boolean>;
  unregisterTaskAsync(taskName: string): Promise<void>;
}

interface BackgroundFetchModule {
  BackgroundFetchResult: { NewData: number; NoData: number; Failed: number };
  registerTaskAsync(taskName: string, opts?: { minimumInterval?: number; stopOnTerminate?: boolean; startOnBoot?: boolean }): Promise<void>;
  unregisterTaskAsync(taskName: string): Promise<void>;
  getStatusAsync(): Promise<number | null>;
}

let cachedTaskManager: TaskManagerModule | null = null;
let cachedBackgroundFetch: BackgroundFetchModule | null = null;
let taskDefined = false;

function getTaskManager(): TaskManagerModule | null {
  if (cachedTaskManager) return cachedTaskManager;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- REASON: lazy require keeps this module importable in Node tests.
    const mod = require('expo-task-manager');
    cachedTaskManager = (mod?.default ?? mod) as TaskManagerModule;
    return cachedTaskManager;
  } catch {
    return null;
  }
}

function getBackgroundFetch(): BackgroundFetchModule | null {
  if (cachedBackgroundFetch) return cachedBackgroundFetch;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- REASON: lazy require keeps this module importable in Node tests.
    const mod = require('expo-background-fetch');
    cachedBackgroundFetch = (mod?.default ?? mod) as BackgroundFetchModule;
    return cachedBackgroundFetch;
  } catch {
    return null;
  }
}

// ── Task definition (registered once at module load) ─────────────────

/**
 * The task body. Exported so tests can call it directly without going
 * through TaskManager.
 *
 * Returns one of:
 *   - 'no-data'    — health sync disabled OR queue empty (drained nothing)
 *   - 'new-data'   — drained at least one row
 *   - 'failed'     — drain threw (caught and returned)
 *
 * The caller (TaskManager) maps these to BackgroundFetchResult enums.
 */
export async function runBackgroundSyncTask(): Promise<'new-data' | 'no-data' | 'failed'> {
  try {
    const enabled = await getHealthSyncEnabled();
    if (!enabled) return 'no-data';

    const queue: SyncQueue = await createSyncQueue({ apiClient });
    const result: DrainResult = await queue.drain();

    const didWork =
      result.accepted > 0 ||
      result.rejectedPermanent > 0 ||
      result.retriesExhausted > 0 ||
      result.retryablePending > 0;

    return didWork ? 'new-data' : 'no-data';
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[backgroundSync] task threw: ${msg}`);
    }
    return 'failed';
  }
}

/**
 * Define the named task at module level. Must be called BEFORE any
 * register/unregister. Idempotent on its first call; subsequent calls
 * are no-ops.
 *
 * Called automatically by `registerBackgroundSync()`. Exposed in case a
 * caller wants to define the task without registering yet (e.g. tests).
 */
export function ensureTaskDefined(): boolean {
  if (taskDefined) return true;
  const tm = getTaskManager();
  const bf = getBackgroundFetch();
  if (!tm || !bf) return false;

  tm.defineTask(GENOLY_BG_SYNC_TASK, async () => {
    const outcome = await runBackgroundSyncTask();
    switch (outcome) {
      case 'new-data':
        return bf.BackgroundFetchResult.NewData;
      case 'no-data':
        return bf.BackgroundFetchResult.NoData;
      case 'failed':
        return bf.BackgroundFetchResult.Failed;
    }
  });
  taskDefined = true;
  return true;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Register the background-sync task with BackgroundFetch. Idempotent —
 * safe to call on every cold start.
 *
 * Returns true if registration succeeded, false if the native modules
 * are unavailable (web preview, Node tests, etc.).
 */
export async function registerBackgroundSync(): Promise<boolean> {
  if (!ensureTaskDefined()) return false;
  const bf = getBackgroundFetch();
  if (!bf) return false;
  try {
    await bf.registerTaskAsync(GENOLY_BG_SYNC_TASK, {
      minimumInterval: BG_SYNC_MIN_INTERVAL_SEC,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    return true;
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[backgroundSync] register failed: ${msg}`);
    }
    return false;
  }
}

/**
 * Unregister the background-sync task. Called when the user disables
 * health sync from Settings or signs out.
 */
export async function unregisterBackgroundSync(): Promise<boolean> {
  const tm = getTaskManager();
  const bf = getBackgroundFetch();
  if (!tm || !bf) return false;
  try {
    const registered = await tm.isTaskRegisteredAsync(GENOLY_BG_SYNC_TASK);
    if (!registered) return true;
    await bf.unregisterTaskAsync(GENOLY_BG_SYNC_TASK);
    return true;
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[backgroundSync] unregister failed: ${msg}`);
    }
    return false;
  }
}

/**
 * Check whether the background task is currently registered. Useful for
 * the Settings UI to display sync state.
 */
export async function isBackgroundSyncRegistered(): Promise<boolean> {
  const tm = getTaskManager();
  if (!tm) return false;
  try {
    return await tm.isTaskRegisteredAsync(GENOLY_BG_SYNC_TASK);
  } catch {
    return false;
  }
}

// ── Test helpers ──────────────────────────────────────────────────────

/** Clear cached native module references + reset task-defined flag.
 *  ONLY for tests. */
export function __resetBackgroundSyncForTests(): void {
  cachedTaskManager = null;
  cachedBackgroundFetch = null;
  taskDefined = false;
}
