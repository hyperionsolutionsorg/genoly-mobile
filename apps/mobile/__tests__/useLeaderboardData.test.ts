/**
 * useLeaderboardData.test.ts — Step 8 hook coverage.
 *
 * Covers:
 *   1. todayLocalDateString returns YYYY-MM-DD in local TZ
 *   2. skipInitialRefresh disables on-mount fetch
 *   3. drain-then-fetch order on mount
 *   4. rows + goals are stored from the server response
 *   5. drain failure is non-fatal — fetch still runs
 *   6. fetch failure surfaces in error state
 *   7. refresh() re-runs the cycle
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';

jest.mock('../utils/api', () => ({
  apiClient: {
    getLeaderboard: jest.fn(),
  },
}));

jest.mock('@genoly/sync-queue', () => ({
  createSyncQueue: jest.fn(),
}));

import {
  useLeaderboardData,
  todayLocalDateString,
} from '../hooks/useLeaderboardData';
import { apiClient } from '../utils/api';

function makeQueue(opts: { drainError?: Error } = {}) {
  return {
    drain: jest.fn().mockImplementation(() => {
      if (opts.drainError) return Promise.reject(opts.drainError);
      return Promise.resolve({
        accepted: 0,
        rejectedPermanent: 0,
        retriesExhausted: 0,
        retryablePending: 0,
        serverTime: null,
      });
    }),
    getQueueDepth: jest.fn().mockResolvedValue(0),
    getDeadLetterDepth: jest.fn().mockResolvedValue(0),
    clearDeadLetters: jest.fn(),
  };
}

function makeBoard(today: string) {
  return {
    date: today,
    myStepGoal: 10000,
    myCalorieGoal: 500,
    rows: [
      {
        rank: 1,
        fitnessUserId: 'u-a',
        displayName: 'Alice',
        avatarPhotoKey: null,
        isMe: false,
        steps: 14500,
        caloriesActive: 600,
        caloriesBasal: 1400,
        lastSyncedAt: Date.now(),
      },
      {
        rank: 2,
        fitnessUserId: 'u-me',
        displayName: 'Me',
        avatarPhotoKey: null,
        isMe: true,
        steps: 8200,
        caloriesActive: 320,
        caloriesBasal: 1450,
        lastSyncedAt: Date.now(),
      },
      {
        rank: 3,
        fitnessUserId: 'u-b',
        displayName: 'Bob',
        avatarPhotoKey: null,
        isMe: false,
        steps: 5100,
        caloriesActive: 240,
        caloriesBasal: 1380,
        lastSyncedAt: Date.now(),
      },
    ],
  };
}

describe('todayLocalDateString', () => {
  it('formats as YYYY-MM-DD in local TZ', () => {
    const fixed = new Date(2026, 4, 29);
    expect(todayLocalDateString(fixed)).toBe('2026-05-29');
  });
  it('handles year + month boundary correctly', () => {
    const fixed = new Date(2026, 0, 1);
    expect(todayLocalDateString(fixed)).toBe('2026-01-01');
  });
});

describe('useLeaderboardData', () => {
  beforeEach(() => {
    (apiClient.getLeaderboard as jest.Mock).mockReset();
  });

  it('skipInitialRefresh disables on-mount fetch', () => {
    const queue = makeQueue();
    const { result } = renderHook(() =>
      useLeaderboardData({ syncQueue: queue as never, skipInitialRefresh: true }),
    );
    expect(queue.drain).not.toHaveBeenCalled();
    expect(apiClient.getLeaderboard).not.toHaveBeenCalled();
    expect(result.current.initialLoading).toBe(false);
  });

  it('drains then fetches on mount, stores rows + goals', async () => {
    const today = todayLocalDateString();
    (apiClient.getLeaderboard as jest.Mock).mockResolvedValue(makeBoard(today));
    const queue = makeQueue();

    const { result } = renderHook(() =>
      useLeaderboardData({ syncQueue: queue as never }),
    );
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(queue.drain).toHaveBeenCalledTimes(1);
    expect(apiClient.getLeaderboard).toHaveBeenCalledTimes(1);
    expect(apiClient.getLeaderboard).toHaveBeenCalledWith({ date: today });
    expect(result.current.rows).toHaveLength(3);
    expect(result.current.myStepGoal).toBe(10000);
    expect(result.current.myCalorieGoal).toBe(500);
    expect(result.current.date).toBe(today);
    expect(result.current.error).toBeNull();
  });

  it('drain failure is non-fatal — fetch still runs', async () => {
    const today = todayLocalDateString();
    (apiClient.getLeaderboard as jest.Mock).mockResolvedValue(makeBoard(today));
    const queue = makeQueue({ drainError: new Error('drain boom') });

    const { result } = renderHook(() =>
      useLeaderboardData({ syncQueue: queue as never }),
    );
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(queue.drain).toHaveBeenCalled();
    expect(apiClient.getLeaderboard).toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.rows).toHaveLength(3);
  });

  it('fetch failure surfaces in error state', async () => {
    (apiClient.getLeaderboard as jest.Mock).mockRejectedValue(new Error('network down'));
    const queue = makeQueue();

    const { result } = renderHook(() =>
      useLeaderboardData({ syncQueue: queue as never }),
    );
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(result.current.error).toBe('network down');
    expect(result.current.rows).toHaveLength(0);
  });

  it('refresh() re-runs the cycle', async () => {
    const today = todayLocalDateString();
    (apiClient.getLeaderboard as jest.Mock).mockResolvedValue(makeBoard(today));
    const queue = makeQueue();

    const { result } = renderHook(() =>
      useLeaderboardData({ syncQueue: queue as never }),
    );
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(queue.drain).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });

    expect(queue.drain).toHaveBeenCalledTimes(2);
    expect(apiClient.getLeaderboard).toHaveBeenCalledTimes(2);
  });
});
