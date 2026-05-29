/**
 * SyncQueue test suite — uses MemoryStore for deterministic testing.
 *
 * Coverage:
 *   - enqueue() idempotency (same ID = upsert, not duplicate)
 *   - drain() — empty queue, full-success batch, partial-reject batch,
 *     retryable error, permanent error, max-attempts exhaustion
 *   - getQueueDepth() / getDeadLetterDepth()
 *   - clearDeadLetters()
 *   - Concurrent drain() calls — second one no-ops while first is in flight
 */

import { SyncQueue } from './queue';
import { MemoryStore } from './store';
import { ApiClientError } from '@genoly/api-client';
import type { ApiClient } from '@genoly/api-client';
import type { HealthEntryUpload } from '@genoly/types';

// ── Helpers ──────────────────────────────────────────────────────────

function makeEntry(date: string, steps: number): HealthEntryUpload {
  return {
    date,
    steps,
    caloriesActive: 100,
    source: 'healthkit',
  };
}

function makeId(entry: HealthEntryUpload): string {
  return `test-user-${entry.date}-${entry.source}`;
}

/** Build a minimal ApiClient mock — only the methods SyncQueue calls.
 *  Cast to ApiClient at the call site since we only implement one method. */
function makeMockApiClient(
  syncImpl: (entries: HealthEntryUpload[]) => Promise<
    | { accepted: number; rejected: Array<{ index: number; code: string; message: string }>; serverTime: number }
    | never
  >,
): ApiClient {
  return {
    syncDailyAggregates: syncImpl,
  } as unknown as ApiClient;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('SyncQueue', () => {
  describe('enqueue', () => {
    it('stores entries with deterministic IDs', async () => {
      const store = new MemoryStore();
      const apiClient = makeMockApiClient(async () => ({ accepted: 0, rejected: [], serverTime: 0 }));
      const queue = new SyncQueue({ apiClient, store });

      await queue.enqueue([makeEntry('2026-05-28', 8000)], makeId);
      expect(await queue.getQueueDepth()).toBe(1);

      const rows = store.__inspect();
      expect(rows[0].id).toBe('test-user-2026-05-28-healthkit');
      expect(rows[0].attempts).toBe(0);
      expect(rows[0].deadLetteredAt).toBeNull();
    });

    it('upserts on duplicate ID (resets attempts)', async () => {
      const store = new MemoryStore();
      const apiClient = makeMockApiClient(async () => ({ accepted: 0, rejected: [], serverTime: 0 }));
      const queue = new SyncQueue({ apiClient, store });

      await queue.enqueue([makeEntry('2026-05-28', 8000)], makeId);
      // Simulate a failed attempt incrementing the counter.
      await store.recordAttempt(['test-user-2026-05-28-healthkit'], Date.now());
      expect(store.__inspect()[0].attempts).toBe(1);

      // Re-enqueue same date → upsert resets attempts.
      await queue.enqueue([makeEntry('2026-05-28', 9000)], makeId);
      expect(store.__inspect()[0].attempts).toBe(0);
      expect(store.__inspect()[0].payload.steps).toBe(9000); // payload updated
    });
  });

  describe('drain — happy path', () => {
    it('no-ops on empty queue', async () => {
      const store = new MemoryStore();
      const apiClient = makeMockApiClient(async () => {
        throw new Error('should not call apiClient on empty queue');
      });
      const queue = new SyncQueue({ apiClient, store });

      const result = await queue.drain();
      expect(result.accepted).toBe(0);
      expect(result.retryablePending).toBe(0);
    });

    it('uploads all entries when server accepts everything', async () => {
      const store = new MemoryStore();
      let callsToServer = 0;
      const apiClient = makeMockApiClient(async (entries) => {
        callsToServer += 1;
        return { accepted: entries.length, rejected: [], serverTime: 1700000000000 };
      });
      const queue = new SyncQueue({ apiClient, store });

      await queue.enqueue(
        [
          makeEntry('2026-05-26', 8000),
          makeEntry('2026-05-27', 9000),
          makeEntry('2026-05-28', 10000),
        ],
        makeId,
      );

      const result = await queue.drain();
      expect(result.accepted).toBe(3);
      expect(result.rejectedPermanent).toBe(0);
      expect(result.serverTime).toBe(1700000000000);
      expect(callsToServer).toBe(1);
      expect(await queue.getQueueDepth()).toBe(0);
    });

    it('respects batchSize — one drain() processes one batch', async () => {
      const store = new MemoryStore();
      const apiClient = makeMockApiClient(async (entries) => ({
        accepted: entries.length,
        rejected: [],
        serverTime: 0,
      }));
      const queue = new SyncQueue({ apiClient, store, batchSize: 2 });

      await queue.enqueue(
        [
          makeEntry('2026-05-26', 1),
          makeEntry('2026-05-27', 2),
          makeEntry('2026-05-28', 3),
        ],
        makeId,
      );

      const first = await queue.drain();
      expect(first.accepted).toBe(2);
      expect(await queue.getQueueDepth()).toBe(1);

      const second = await queue.drain();
      expect(second.accepted).toBe(1);
      expect(await queue.getQueueDepth()).toBe(0);
    });
  });

  describe('drain — partial rejection', () => {
    it('dead-letters rejected rows and deletes accepted rows', async () => {
      const store = new MemoryStore();
      const apiClient = makeMockApiClient(async (entries) => {
        // Reject the middle row.
        return {
          accepted: entries.length - 1,
          rejected: [{ index: 1, code: 'validation_failed', message: 'invalid date' }],
          serverTime: 1700000000000,
        };
      });
      const queue = new SyncQueue({ apiClient, store });

      await queue.enqueue(
        [
          makeEntry('2026-05-26', 1),
          makeEntry('2026-05-27', 2), // this one will be rejected
          makeEntry('2026-05-28', 3),
        ],
        makeId,
      );

      const result = await queue.drain();
      expect(result.accepted).toBe(2);
      expect(result.rejectedPermanent).toBe(1);

      // Queue depth excludes dead-lettered.
      expect(await queue.getQueueDepth()).toBe(0);
      expect(await queue.getDeadLetterDepth()).toBe(1);
    });
  });

  describe('drain — retryable error', () => {
    it('keeps rows pending after a 5xx error', async () => {
      const store = new MemoryStore();
      const apiClient = makeMockApiClient(async () => {
        throw new ApiClientError({ code: 'internal', message: 'server down' }, 503);
      });
      const queue = new SyncQueue({ apiClient, store });

      await queue.enqueue([makeEntry('2026-05-28', 8000)], makeId);

      const result = await queue.drain();
      expect(result.retryablePending).toBe(1);
      expect(result.retriesExhausted).toBe(0);
      expect(await queue.getQueueDepth()).toBe(1); // still pending
    });

    it('keeps rows pending after a network error (non-ApiClientError)', async () => {
      const store = new MemoryStore();
      const apiClient = makeMockApiClient(async () => {
        throw new Error('Network request failed');
      });
      const queue = new SyncQueue({ apiClient, store });

      await queue.enqueue([makeEntry('2026-05-28', 8000)], makeId);

      const result = await queue.drain();
      expect(result.retryablePending).toBe(1);
      expect(await queue.getQueueDepth()).toBe(1);
    });

    it('dead-letters a row after MAX_ATTEMPTS retries', async () => {
      const store = new MemoryStore();
      const apiClient = makeMockApiClient(async () => {
        throw new ApiClientError({ code: 'internal', message: 'still down' }, 500);
      });
      // maxAttempts = 3 to make the test fast.
      const queue = new SyncQueue({ apiClient, store, maxAttempts: 3 });

      await queue.enqueue([makeEntry('2026-05-28', 8000)], makeId);

      // First two attempts → still pending.
      const r1 = await queue.drain();
      expect(r1.retryablePending).toBe(1);

      const r2 = await queue.drain();
      expect(r2.retryablePending).toBe(1);

      // Third attempt → exhausted, dead-lettered.
      const r3 = await queue.drain();
      expect(r3.retriesExhausted).toBe(1);
      expect(r3.retryablePending).toBe(0);
      expect(await queue.getQueueDepth()).toBe(0);
      expect(await queue.getDeadLetterDepth()).toBe(1);
    });
  });

  describe('drain — permanent error', () => {
    it('dead-letters the whole batch on a non-retryable 4xx', async () => {
      const store = new MemoryStore();
      const apiClient = makeMockApiClient(async () => {
        // 401 unauthenticated is NOT retryable (token's bad, retries won't help).
        throw new ApiClientError({ code: 'unauthenticated', message: 'bad token' }, 401);
      });
      const queue = new SyncQueue({ apiClient, store });

      await queue.enqueue(
        [makeEntry('2026-05-26', 1), makeEntry('2026-05-27', 2)],
        makeId,
      );

      const result = await queue.drain();
      expect(result.rejectedPermanent).toBe(2);
      expect(await queue.getQueueDepth()).toBe(0);
      expect(await queue.getDeadLetterDepth()).toBe(2);
    });

    it('treats rate_limited (429) as retryable', async () => {
      const store = new MemoryStore();
      const apiClient = makeMockApiClient(async () => {
        throw new ApiClientError({ code: 'rate_limited', message: 'slow down' }, 429);
      });
      const queue = new SyncQueue({ apiClient, store, maxAttempts: 5 });

      await queue.enqueue([makeEntry('2026-05-28', 8000)], makeId);

      const result = await queue.drain();
      expect(result.retryablePending).toBe(1);
      expect(result.rejectedPermanent).toBe(0);
    });
  });

  describe('dead-letter management', () => {
    it('clearDeadLetters() removes all dead-lettered rows', async () => {
      const store = new MemoryStore();
      const apiClient = makeMockApiClient(async () => {
        throw new ApiClientError({ code: 'unauthenticated', message: 'bad' }, 401);
      });
      const queue = new SyncQueue({ apiClient, store });

      await queue.enqueue([makeEntry('2026-05-28', 8000)], makeId);
      await queue.drain(); // dead-letters the row

      expect(await queue.getDeadLetterDepth()).toBe(1);
      await queue.clearDeadLetters();
      expect(await queue.getDeadLetterDepth()).toBe(0);
    });
  });

  describe('concurrency', () => {
    it('second concurrent drain() no-ops while first is in flight', async () => {
      const store = new MemoryStore();
      let resolveServer: ((value: { accepted: number; rejected: never[]; serverTime: number }) => void) | null = null;
      const apiClient = makeMockApiClient(async () => {
        return new Promise((resolve) => {
          resolveServer = resolve;
        });
      });
      const queue = new SyncQueue({ apiClient, store });

      await queue.enqueue([makeEntry('2026-05-28', 8000)], makeId);

      // Start two drains in parallel.
      const drain1 = queue.drain();
      const drain2 = queue.drain();

      // Resolve the in-flight server call.
      resolveServer!({ accepted: 1, rejected: [], serverTime: 0 });

      const [r1, r2] = await Promise.all([drain1, drain2]);

      // One of them did the work (accepted=1); the other was a no-op.
      const totalAccepted = r1.accepted + r2.accepted;
      expect(totalAccepted).toBe(1);
    });
  });
});
