/**
 * useGoalsData.test.ts — Step 10 hook coverage.
 *
 * Covers:
 *   1. skipInitialRefresh disables on-mount fetch
 *   2. fetches active goals on mount
 *   3. fetch failure surfaces in error state
 *   4. refresh() re-runs the cycle
 *   5. upsertGoal success re-fetches goals and reports created:true/false
 *   6. upsertGoal failure maps error codes to friendly copy, does not refetch
 *   7. archiveGoal success calls apiClient.archiveGoal, then refresh
 *   8. archiveGoal failure (404 not_found) maps to friendly copy
 *   9. busyGoalKey is set during the action and cleared after
 *   10. fetchHistory is a one-shot read, not triggered on mount
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';

jest.mock('../utils/api', () => ({
  apiClient: {
    getGoals: jest.fn(),
    getGoalsHistory: jest.fn(),
    upsertGoal: jest.fn(),
    archiveGoal: jest.fn(),
  },
}));

import { useGoalsData, goalsActionErrorMessage, goalKey } from '../hooks/useGoalsData';
import { apiClient } from '../utils/api';
import { ApiClientError } from '@genoly/api-client';

function makeGoals() {
  return {
    goals: [
      {
        id: 'g-steps-daily',
        period: 'daily' as const,
        metric: 'steps' as const,
        target: 10000,
        effectiveFrom: 1000,
        createdAt: 1000,
      },
      {
        id: 'g-calories-daily',
        period: 'daily' as const,
        metric: 'calories' as const,
        target: 500,
        effectiveFrom: 1000,
        createdAt: 1000,
      },
    ],
  };
}

function resetMocks() {
  (apiClient.getGoals as jest.Mock).mockReset();
  (apiClient.getGoalsHistory as jest.Mock).mockReset();
  (apiClient.upsertGoal as jest.Mock).mockReset();
  (apiClient.archiveGoal as jest.Mock).mockReset();
}

describe('useGoalsData', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('skipInitialRefresh disables on-mount fetch', () => {
    const { result } = renderHook(() => useGoalsData({ skipInitialRefresh: true }));
    expect(apiClient.getGoals).not.toHaveBeenCalled();
    expect(result.current.initialLoading).toBe(false);
  });

  it('fetches active goals on mount', async () => {
    (apiClient.getGoals as jest.Mock).mockResolvedValue(makeGoals());
    const { result } = renderHook(() => useGoalsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(apiClient.getGoals).toHaveBeenCalledTimes(1);
    expect(result.current.goals).toHaveLength(2);
    expect(result.current.goals[0].metric).toBe('steps');
    expect(result.current.error).toBeNull();
  });

  it('fetch failure surfaces in error state', async () => {
    (apiClient.getGoals as jest.Mock).mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useGoalsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(result.current.error).toBe('network down');
    expect(result.current.goals).toHaveLength(0);
  });

  it('refresh() re-runs the fetch', async () => {
    (apiClient.getGoals as jest.Mock).mockResolvedValue(makeGoals());
    const { result } = renderHook(() => useGoalsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(apiClient.getGoals).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });

    expect(apiClient.getGoals).toHaveBeenCalledTimes(2);
  });

  it('upsertGoal: success calls apiClient.upsertGoal then re-fetches, reports created:true', async () => {
    (apiClient.getGoals as jest.Mock).mockResolvedValue(makeGoals());
    (apiClient.upsertGoal as jest.Mock).mockResolvedValue({
      id: 'g-steps-daily',
      status: 'active',
      created: true,
    });
    const { result } = renderHook(() => useGoalsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    let outcome: { ok: boolean; created: boolean } = { ok: false, created: false };
    await act(async () => {
      outcome = await result.current.upsertGoal({ period: 'daily', metric: 'steps', target: 12000 });
    });

    expect(outcome).toEqual({ ok: true, created: true });
    expect(apiClient.upsertGoal).toHaveBeenCalledWith({ period: 'daily', metric: 'steps', target: 12000 });
    expect(apiClient.getGoals).toHaveBeenCalledTimes(2);
    expect(result.current.actionError).toBeNull();
    expect(result.current.busyGoalKey).toBeNull();
  });

  it('upsertGoal: created:false surfaces the idempotent-no-op result without a fake "new goal" signal', async () => {
    (apiClient.getGoals as jest.Mock).mockResolvedValue(makeGoals());
    (apiClient.upsertGoal as jest.Mock).mockResolvedValue({
      id: 'g-steps-daily',
      status: 'active',
      created: false,
    });
    const { result } = renderHook(() => useGoalsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    let outcome: { ok: boolean; created: boolean } = { ok: false, created: true };
    await act(async () => {
      outcome = await result.current.upsertGoal({ period: 'daily', metric: 'steps', target: 10000 });
    });

    expect(outcome).toEqual({ ok: true, created: false });
  });

  it('upsertGoal: 400 validation_failed maps to a friendly message and does not refetch', async () => {
    (apiClient.getGoals as jest.Mock).mockResolvedValue(makeGoals());
    (apiClient.upsertGoal as jest.Mock).mockRejectedValue(
      new ApiClientError({ code: 'validation_failed', message: 'target must be a non-negative integer' }, 400),
    );
    const { result } = renderHook(() => useGoalsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    let outcome: { ok: boolean; created: boolean } = { ok: true, created: true };
    await act(async () => {
      outcome = await result.current.upsertGoal({ period: 'daily', metric: 'steps', target: -1 });
    });

    expect(outcome).toEqual({ ok: false, created: false });
    expect(result.current.actionError).toBe('Enter a valid, non-negative whole number for your target.');
    // Only the initial mount fetch — a failed upsert doesn't trigger a refetch.
    expect(apiClient.getGoals).toHaveBeenCalledTimes(1);
  });

  it('archiveGoal: calls apiClient.archiveGoal, refreshes, tracks busyGoalKey', async () => {
    (apiClient.getGoals as jest.Mock).mockResolvedValue(makeGoals());
    (apiClient.archiveGoal as jest.Mock).mockResolvedValue(undefined);
    const { result } = renderHook(() => useGoalsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.archiveGoal('g-steps-daily');
    });

    expect(ok).toBe(true);
    expect(apiClient.archiveGoal).toHaveBeenCalledWith('g-steps-daily');
    expect(apiClient.getGoals).toHaveBeenCalledTimes(2);
    expect(result.current.busyGoalKey).toBeNull();
  });

  it('archiveGoal: 404 not_found maps to a friendly "already archived" message', async () => {
    (apiClient.getGoals as jest.Mock).mockResolvedValue(makeGoals());
    (apiClient.archiveGoal as jest.Mock).mockRejectedValue(
      new ApiClientError({ code: 'not_found', message: 'Goal not found' }, 404),
    );
    const { result } = renderHook(() => useGoalsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    await act(async () => {
      await result.current.archiveGoal('bogus');
    });

    expect(result.current.actionError).toBe(
      "That goal no longer exists — it may have already been archived.",
    );
  });

  it('busyGoalKey is set to the (period,metric) key while upsertGoal is in flight', async () => {
    (apiClient.getGoals as jest.Mock).mockResolvedValue(makeGoals());
    let resolveUpsert: (v: { id: string; status: 'active'; created: boolean }) => void = () => {};
    (apiClient.upsertGoal as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveUpsert = resolve; }),
    );
    const { result } = renderHook(() => useGoalsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    let pending!: Promise<{ ok: boolean; created: boolean }>;
    act(() => {
      pending = result.current.upsertGoal({ period: 'weekly', metric: 'calories', target: 3000 });
    });

    await waitFor(() => expect(result.current.busyGoalKey).toBe(goalKey('weekly', 'calories')));

    await act(async () => {
      resolveUpsert({ id: 'g-new', status: 'active', created: true });
      await pending;
    });

    expect(result.current.busyGoalKey).toBeNull();
  });

  it('fetchHistory is a one-shot read, not triggered on mount', async () => {
    (apiClient.getGoals as jest.Mock).mockResolvedValue(makeGoals());
    (apiClient.getGoalsHistory as jest.Mock).mockResolvedValue({
      goals: [
        {
          id: 'g-old',
          period: 'daily' as const,
          metric: 'steps' as const,
          target: 8000,
          effectiveFrom: 100,
          archivedAt: 900,
          createdAt: 50,
        },
      ],
    });
    const { result } = renderHook(() => useGoalsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(apiClient.getGoalsHistory).not.toHaveBeenCalled();
    expect(result.current.history).toHaveLength(0);

    await act(async () => {
      await result.current.fetchHistory({ period: 'daily' });
    });

    expect(apiClient.getGoalsHistory).toHaveBeenCalledWith({ period: 'daily' });
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].id).toBe('g-old');
    expect(result.current.historyError).toBeNull();
  });

  it('fetchHistory failure surfaces in historyError', async () => {
    (apiClient.getGoals as jest.Mock).mockResolvedValue(makeGoals());
    (apiClient.getGoalsHistory as jest.Mock).mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useGoalsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    await act(async () => {
      await result.current.fetchHistory();
    });

    expect(result.current.historyError).toBe('network down');
    expect(result.current.historyLoading).toBe(false);
  });
});

describe('goalsActionErrorMessage', () => {
  it('maps unauthenticated/token_revoked/token_expired to a re-login message', () => {
    expect(
      goalsActionErrorMessage(new ApiClientError({ code: 'unauthenticated', message: 'x' }, 401), 'upsert'),
    ).toBe('Your session expired. Please sign in again.');
    expect(
      goalsActionErrorMessage(new ApiClientError({ code: 'token_expired', message: 'x' }, 401), 'archive'),
    ).toBe('Your session expired. Please sign in again.');
  });

  it('maps rate_limited to a slow-down message', () => {
    expect(
      goalsActionErrorMessage(new ApiClientError({ code: 'rate_limited', message: 'x' }, 429), 'upsert'),
    ).toBe('Slow down a sec, then try again.');
  });

  it('falls back to a generic message for a non-ApiClientError', () => {
    expect(goalsActionErrorMessage(new Error('boom'), 'archive')).toBe('boom');
    expect(goalsActionErrorMessage('not an error', 'archive')).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('goalKey', () => {
  it('formats a stable period:metric key', () => {
    expect(goalKey('daily', 'steps')).toBe('daily:steps');
    expect(goalKey('weekly', 'calories')).toBe('weekly:calories');
  });
});
