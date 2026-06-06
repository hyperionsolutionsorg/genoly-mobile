/**
 * SyncQueue — offline-tolerant outbox for health-aggregate uploads.
 *
 * Pattern from mobile-sync-architecture.md §11 (conflict resolution) +
 * §5 (retry policy):
 *
 *   1. Caller enqueues HealthEntryUpload rows (one row per (userId, date)).
 *   2. The drainer fetches batches of up to BATCH_SIZE rows from the
 *      store, ordered by createdAt ASC.
 *   3. For each batch, drain() calls `apiClient.syncDailyAggregates()`
 *      with the batch payload and receives `{ accepted, rejected[], serverTime }`.
 *   4. Outcomes:
 *      - HTTP success + no `rejected` entries → delete all batch rows.
 *      - HTTP success + some `rejected` entries → delete accepted rows,
 *        mark rejected rows as dead-lettered (server says "permanent
 *        problem with this row, don't retry").
 *      - HTTP failure (network, 5xx, 429) → recordAttempt() on the batch,
 *        bump retry counter. If a row's attempts reach MAX_ATTEMPTS,
 *        mark it as dead-lettered.
 *
 *   5. Background fetch (Step 6, future) wakes the drainer every ~15
 *      minutes. The drainer also runs on app foreground via Step 7+
 *      explicit pull. Idempotent — safe to call concurrently (the
 *      store uses sequential transactions per op).
 *
 * Test mode: pass a MemoryStore in the constructor. Production: pass
 * a (init()-already-called) ExpoSqliteStore.
 */

import type { ApiClient } from '@genoly/api-client';
import { ApiClientError } from '@genoly/api-client';
import type { HealthEntryUpload } from '@genoly/types';
import type { SyncStore, SyncOutboxRow } from './store';

// ── Constants ─────────────────────────────────────────────────────────

/** Max rows per upload batch. Matches server contract recommendation. */
export const BATCH_SIZE = 50;

/** Max retries before a row is dead-lettered. 5 attempts ≈ 5 days of
 *  drain cycles at one per ~24 hours (background fetch), or much faster
 *  if user opens the app + foreground drainer fires. */
export const MAX_ATTEMPTS = 5;

/** Retryable HTTP statuses. 5xx + 429 + 408 are server-side or
 *  transient; everything else (4xx auth/permission/validation) is
 *  permanent → dead-letter. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

// ── Public API ────────────────────────────────────────────────────────

export interface DrainResult {
  /** Rows uploaded successfully (server accepted, we deleted locally). */
  accepted: number;
  /** Rows the server explicitly rejected (dead-lettered). */
  rejectedPermanent: number;
  /** Rows that hit MAX_ATTEMPTS on this drain (dead-lettered). */
  retriesExhausted: number;
  /** Rows that hit a retryable error and stay in the queue for next drain. */
  retryablePending: number;
  /** Server's reported time, if we successfully reached the server. */
  serverTime: number | null;
}

export interface SyncQueueOptions {
  /** API client to call. Required. */
  apiClient: ApiClient;
  /** Persistence layer. Required. */
  store: SyncStore;
  /** Override the batch size. Default: 50. */
  batchSize?: number;
  /** Override max retries. Default: 5. */
  maxAttempts?: number;
}

export class SyncQueue {
  private apiClient: ApiClient;
  private store: SyncStore;
  private batchSize: number;
  private maxAttempts: number;
  private draining = false;

  constructor(options: SyncQueueOptions) {
    this.apiClient = options.apiClient;
    this.store = options.store;
    this.batchSize = options.batchSize ?? BATCH_SIZE;
    this.maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  }

  /**
   * Enqueue health-aggregate rows. Caller must supply deterministic IDs
   * (e.g. `${userId}-${date}-${source}`) — INSERT OR REPLACE means
   * re-enqueuing the same id resets attempts to 0 (treats it as a fresh
   * client-side update).
   */
  async enqueue(entries: HealthEntryUpload[], idFor: (entry: HealthEntryUpload) => string): Promise<void> {
    const now = Date.now();
    for (const entry of entries) {
      await this.store.upsert({
        id: idFor(entry),
        payload: entry,
        createdAt: now,
      });
    }
  }

  /**
   * Drain a single batch. Returns a summary. Call repeatedly until
   * `accepted + rejectedPermanent + retriesExhausted + retryablePending`
   * equals 0 (queue empty) OR you want to back off (e.g. exit the
   * background-fetch window).
   *
   * Concurrent-safe: if a drain is already in flight, subsequent calls
   * return an empty result (no-op) until the in-flight one finishes.
   */
  async drain(): Promise<DrainResult> {
    if (this.draining) {
      return {
        accepted: 0,
        rejectedPermanent: 0,
        retriesExhausted: 0,
        retryablePending: 0,
        serverTime: null,
      };
    }
    this.draining = true;
    try {
      const batch = await this.store.fetchBatch(this.batchSize);
      if (batch.length === 0) {
        return {
          accepted: 0,
          rejectedPermanent: 0,
          retriesExhausted: 0,
          retryablePending: 0,
          serverTime: null,
        };
      }

      const payloads = batch.map((row) => row.payload);

      try {
        const response = await this.apiClient.syncDailyAggregates(payloads);
        return await this.handleSuccess(batch, response);
      } catch (err) {
        return await this.handleError(batch, err);
      }
    } finally {
      this.draining = false;
    }
  }

  /** Current count of rows waiting to upload. */
  async getQueueDepth(): Promise<number> {
    return this.store.countPending();
  }

  /** Current count of dead-lettered rows (uploaded-failed-permanently). */
  async getDeadLetterDepth(): Promise<number> {
    return this.store.countDeadLettered();
  }

  /** Hard-delete all dead-lettered rows. User-triggered. */
  async clearDeadLetters(): Promise<void> {
    return this.store.clearDeadLettered();
  }

  // ── Internal handlers ──────────────────────────────────────────────

  /**
   * HTTP-200 path. Server returned a per-row result. Accepted rows are
   * deleted locally; rejected rows are moved to dead-letter (their
   * problem is permanent — invalid date, validation error, etc.).
   */
  private async handleSuccess(
    batch: SyncOutboxRow[],
    response: {
      accepted: number;
      rejected: Array<{ index: number; code: string; message: string }>;
      serverTime: number;
    },
  ): Promise<DrainResult> {
    const rejectedIndices = new Set(response.rejected.map((r) => r.index));
    const acceptedIds: string[] = [];
    const rejectedIds: string[] = [];

    batch.forEach((row, i) => {
      if (rejectedIndices.has(i)) {
        rejectedIds.push(row.id);
      } else {
        acceptedIds.push(row.id);
      }
    });

    await this.store.deleteRows(acceptedIds);
    if (rejectedIds.length > 0) {
      await this.store.markDeadLettered(rejectedIds, Date.now());
    }

    return {
      accepted: acceptedIds.length,
      rejectedPermanent: rejectedIds.length,
      retriesExhausted: 0,
      retryablePending: 0,
      serverTime: response.serverTime,
    };
  }

  /**
   * Error path. Distinguish retryable (network failures, 5xx, 429) from
   * permanent (4xx auth/validation that's not per-row).
   *
   *   - Retryable → recordAttempt() on the whole batch. If any row hits
   *     MAX_ATTEMPTS, mark THAT row as dead-lettered. Others stay
   *     pending for next drain.
   *
   *   - Permanent → dead-letter the whole batch. The user will see "X
   *     entries failed to sync" in Settings and can manually clear them.
   */
  private async handleError(batch: SyncOutboxRow[], err: unknown): Promise<DrainResult> {
    const isRetryable = this.isRetryableError(err);
    const now = Date.now();

    if (!isRetryable) {
      // Permanent failure → dead-letter the entire batch.
      const ids = batch.map((r) => r.id);
      await this.store.markDeadLettered(ids, now);
      return {
        accepted: 0,
        rejectedPermanent: ids.length,
        retriesExhausted: 0,
        retryablePending: 0,
        serverTime: null,
      };
    }

    // Retryable → bump attempts, dead-letter rows that hit MAX_ATTEMPTS.
    const ids = batch.map((r) => r.id);
    // Capture attempts BEFORE recordAttempt() so in-memory stores that
    // mutate the same objects in-place don't corrupt the exhaustion check.
    const attemptsBefore = new Map(batch.map((r) => [r.id, r.attempts]));
    await this.store.recordAttempt(ids, now);

    // Recompute after the increment using the saved before-values.
    const exhaustedIds: string[] = [];
    const stillPendingIds: string[] = [];
    for (const row of batch) {
      const newAttempts = (attemptsBefore.get(row.id) ?? 0) + 1;
      if (newAttempts >= this.maxAttempts) {
        exhaustedIds.push(row.id);
      } else {
        stillPendingIds.push(row.id);
      }
    }

    if (exhaustedIds.length > 0) {
      await this.store.markDeadLettered(exhaustedIds, now);
    }

    return {
      accepted: 0,
      rejectedPermanent: 0,
      retriesExhausted: exhaustedIds.length,
      retryablePending: stillPendingIds.length,
      serverTime: null,
    };
  }

  /** Decide whether an error should retry (transient) or dead-letter
   *  (permanent). Distinguishes ApiClientError by status + code from
   *  raw network errors. */
  private isRetryableError(err: unknown): boolean {
    if (err instanceof ApiClientError) {
      // 4xx (except 408 + 429) is permanent. 5xx + 408 + 429 is retryable.
      if (RETRYABLE_STATUSES.has(err.status)) return true;
      // Special-case: 'rate_limited' code (which maps to 429) is retryable.
      if (err.code === 'rate_limited') return true;
      return false;
    }
    // Non-ApiClientError → network / parse / unknown. Treat as retryable;
    // these typically indicate transient connectivity issues.
    return true;
  }
}
