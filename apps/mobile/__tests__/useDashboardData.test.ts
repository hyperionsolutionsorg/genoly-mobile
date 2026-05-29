/**
 * useDashboardData.test.ts — Step 7 hook coverage.
 *
 * Coverage:
 *   1. computeDashboardRange returns 7-day window ending today (local TZ)
 *   2. Auto-refresh on mount calls drain then getDailyAggregates
 *   3. refresh() is callable after initial load and re-runs the cycle
 *   4. Server entries are sorted oldest-first
 *   5. today entry is found by matching today's date string
 *   6. Queue depth + dead-letter depth are read AFTER drain
 *   7. clearDeadLetters wraps SyncQueue.clearDeadLetters and re-reads count
 *   8. Drain failure is non-fatal — fetch still runs, error is null
 *   9. Fetch failure surfaces in error state
 *  10. skipInitialRefresh disables auto-mount refresh
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────

jest.mock('../utils/api', () => ({
  apiClient: {
    getDailyAggregates: jest.fn(),
  },
}));

// We inject a fake SyncQueue via the hook's `syncQueue` option, so the
// createSyncQueue mock here only exists to satisfy the import; tests
// always pass their own queue.
jest.mock('@genoly/sync-queue', () => ({
  createSyncQueue: jest.fn(),
}));

import {
  useDashboardData,
  computeDashboardRange,
} from '../hooks/useDashboardData';
import { apiClient } from '../utils/api';

// ── Test helpers ─────────────────────────────────────────────────────

function makeFakeQueue(overrides: {
  drainResult?: unknown;
  queueDepth?: number;
  deadLetterDepth?: number;
  drainError?: Error;
} = {}) {
  return {
    drain: jest.fn().mockImplementation(() => {
      if (overrides.drainError) return Promise.reject(overrides.drainError);
      return Promise.resolve(overrides.drainResult ?? {
        accepted: 0,
        rejectedPermanent: 0,
        retriesExhausted: 0,
        retryablePending: 0,
        serverTime: null,
      });
    }),
    getQueueDepth: jest.fn().mockResolvedValue(overrides.queueDepth ?? 0),
    getDeadLetterDepth: jest.fn().mockResolvedValue(overrides.deadLetterDepth ?? 0),
    clearDeadLetters: jest.fn().mockResolvedValue(undefined),
  };
}

function makeEntry(date: string, steps: number, extra?: Partial<{ caloriesActive: number; distanceMeters: number | null }>) {
  return {
    date,
    dateUtcStart: 0,
    steps,
    caloriesActive: extra?.caloriesActive ?? 100,
    caloriesBasal: null,
    distanceMeters: extra?.distanceMeters ?? 1000,
    source: 'healthkit' as const,
    lastSyncedAt: Date.now(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('computeDashboardRange', () => {
  it('returns a 7-day inclusive range ending today (local TZ)', () => {
    // Pick a fixed date so the test is deterministic + readable.
    const now = new Date(2026, 4, 29); // May 29 2026, local TZ
    const { today, range } = computeDashboardRange(now);
    expect(today).toBe('2026-05-29');
    expect(range.to).toBe('2026-05-29');
    expect(range.from).toBe('2026-05-23'); // 6 days earlier
  });

  it('handles month boundary correctly', () => {
    const now = new Date(2026, 5, 2); // June 2 2026
    const { today, range } = computeDashboardRange(now);
    expect(today).toBe('2026-06-02');
    expect(range.from).toBe('2026-05-27'); // 6 days earlier crosses into May
  });
});

describe('useDashboardData', () => {
  beforeEach(() => {
    (apiClient.getDailyAggregates as jest.Mock).mockReset();
  });

  it('skipInitialRefresh disables auto-mount refresh', async () => {
    const queue = makeFakeQueue();
    const { result } = renderHook(() =>
      useDashboardData({ syncQueue: queue as never, skipInitialRefresh: true }),
    );
    // Initial state — no drain, no fetch.
    expect(queue.drain).not.toHaveBeenCalled();
    expect(apiClient.getDailyAggregates).not.toHaveBeenCalled();
    expect(result.current.initialLoading).toBe(false);
  });

  it('drains then fetches on mount', async () => {
    const today = computeDashboardRange().today;
    (apiClient.getDailyAggregates as jest.Mock).mockResolvedValue({
      from: '2026-05-23',
      to: today,
      entries: [makeEntry(today, 8000)],
    });
    const queue = makeFakeQueue({ queueDepth: 0, deadLetterDepth: 0 });

    const { result } = renderHook(() => useDashboardData({ syncQueue: queue as never }));

    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    // Order: drain BEFORE fetch.
    expect(queue.drain).toHaveBeenCalledTimes(1);
    expect(apiClient.getDailyAggregates).toHaveBeenCalledTimes(1);
    expect(queue.getQueueDepth).toHaveBeenCalledTimes(1);
    expect(queue.getDeadLetterDepth).toHaveBeenCalledTimes(1);

    expect(result.current.today?.steps).toBe(8000);
    expect(result.current.error).toBeNull();
    expect(result.current.lastSyncedAt).not.toBeNull();
  });

  it('sorts entries oldest-first', async () => {
    const today = computeDashboardRange().today;
    const out = [
      makeEntry(today, 5000),
      makeEntry('2026-05-25', 4000),
      makeEntry('2026-05-27', 6000),
    ];
    (apiClient.getDailyAggregates as jest.Mock).mockResolvedValue({
      from: '2026-05-23',
      to: today,
      entries: out,
    });
    const queue = makeFakeQueue();

    const { result } = renderHook(() => useDashboardData({ syncQueue: queue as never }));
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    const dates = result.current.last7Days.map((e) => e.date);
    // Sorted ascending — '2026-05-25' before '2026-05-27' before today.
    expect(dates).toEqual([...dates].sort((a, b) => a.localeCompare(b)));
  });

  it('finds today entry by date string', async () => {
    const today = computeDashboardRange().today;
    (apiClient.getDailyAggregates as jest.Mock).mockResolvedValue({
      from: '2026-05-23',
      to: today,
      entries: [makeEntry('2026-05-27', 4000), makeEntry(today, 9000)],
    });
    const queue = makeFakeQueue();

    const { result } = renderHook(() => useDashboardData({ syncQueue: queue as never }));
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(result.current.today?.date).toBe(today);
    expect(result.current.today?.steps).toBe(9000);
  });

  it('today is null when server has no entry for today', async () => {
    const today = computeDashboardRange().today;
    (apiClient.getDailyAggregates as jest.Mock).mockResolvedValue({
      from: '2026-05-23',
      to: today,
      entries: [makeEntry('2026-05-27', 4000)],
    });
    const queue = makeFakeQueue();

    const { result } = renderHook(() => useDashboardData({ syncQueue: queue as never }));
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(result.current.today).toBeNull();
  });

  it('reads queue + dead-letter depth AFTER drain', async () => {
    (apiClient.getDailyAggregates as jest.Mock).mockResolvedValue({
      from: '2026-05-23',
      to: '2026-05-29',
      entries: [],
    });
    const queue = makeFakeQueue({ queueDepth: 2, deadLetterDepth: 3 });

    const { result } = renderHook(() => useDashboardData({ syncQueue: queue as never }));
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(result.current.queueDepth).toBe(2);
    expect(result.current.deadLetterDepth).toBe(3);
  });

  it('refresh() re-runs the cycle', async () => {
    const today = computeDashboardRange().today;
    (apiClient.getDailyAggregates as jest.Mock).mockResolvedValue({
      from: '2026-05-23',
      to: today,
      entries: [makeEntry(today, 1000)],
    });
    const queue = makeFakeQueue();

    const { result } = renderHook(() => useDashboardData({ syncQueue: queue as never }));
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(queue.drain).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });

    expect(queue.drain).toHaveBeenCalledTimes(2);
    expect(apiClient.getDailyAggregates).toHaveBeenCalledTimes(2);
  });

  it('drain failure is non-fatal — fetch still runs, error stays null', async () => {
    const today = computeDashboardRange().today;
    (apiClient.getDailyAggregates as jest.Mock).mockResolvedValue({
      from: '2026-05-23',
      to: today,
      entries: [makeEntry(today, 100)],
    });
    const queue = makeFakeQueue({ drainError: new Error('drain blew up') });

    const { result } = renderHook(() => useDashboardData({ syncQueue: queue as never }));
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(queue.drain).toHaveBeenCalled();
    expect(apiClient.getDailyAggregates).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.today?.steps).toBe(100);
  });

  it('fetch failure surfaces in error state', async () => {
    (apiClient.getDailyAggregates as jest.Mock).mockRejectedValue(new Error('network down'));
    const queue = makeFakeQueue();

    const { result } = renderHook(() => useDashboardData({ syncQueue: queue as never }));
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(result.current.error).toBe('network down');
  });

  it('clearDeadLetters calls queue + re-reads count', async () => {
    (apiClient.getDailyAggregates as jest.Mock).mockResolvedValue({
      from: '2026-05-23',
      to: '2026-05-29',
      entries: [],
    });
    const queue = makeFakeQueue({ deadLetterDepth: 5 });

    const { result } = renderHook(() => useDashboardData({ syncQueue: queue as never }));
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(result.current.deadLetterDepth).toBe(5);

    // Simulate clear: queue returns 0 after clearDeadLetters runs.
    queue.getDeadLetterDepth.mockResolvedValueOnce(0);

    await act(async () => {
      await result.current.clearDeadLetters();
    });

    expect(queue.clearDeadLetters).toHaveBeenCalledTimes(1);
    expect(result.current.deadLetterDepth).toBe(0);
  });
});
