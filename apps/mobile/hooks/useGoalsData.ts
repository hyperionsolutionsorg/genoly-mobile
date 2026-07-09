/**
 * useGoalsData — Step 10 of Phase 1.
 *
 * Powers the Goals screen (`app/goals.tsx`) and the Goals history screen
 * (`app/goals-history.tsx`). Mirrors the drain-free shape of
 * `useFriendsData` (refresh / refreshing / initialLoading / error) — goals
 * are interactive/synchronous per mobile-sync-architecture.md §5 ("Goal
 * creation" is explicitly listed as NOT going through the offline sync
 * queue), so there's no outbox to flush before reading.
 *
 * Responsibilities:
 *
 *   1. On mount and on refresh(), call `apiClient.getGoals()` and expose
 *      the caller's active goals (max 4 — 2 periods × 2 metrics per the
 *      contract).
 *   2. Wrap `upsertGoal` (PUT, idempotent create-or-update for a
 *      (period, metric) pair) and `archiveGoal` (DELETE, archives not
 *      deletes) with:
 *        - a per-goal `busyGoalKey` (period:metric for upsert, the goalId
 *          for archive) so the screen can show a per-row spinner instead
 *          of a global one,
 *        - NO auto-retry (mutations never auto-retry per AGENTS.md §3.5 —
 *          `FetchApiClient.request()` already enforces this; the hook
 *          just surfaces the resulting error for the screen to show and
 *          lets the user explicitly retry the tap),
 *        - a local re-fetch of the active-goals list on success so the
 *          screen stays in sync without the caller remembering to refresh.
 *   3. Surface a friendly `actionError` message separate from `error` (the
 *      list-fetch error) so a failed upsert/archive doesn't get confused
 *      with a failed initial load — same pattern as `useFriendsData`.
 *   4. Expose `fetchHistory()` — a one-shot read (not auto-refreshed) for
 *      the archived-goals list, since history is viewed far less often
 *      than active goals and doesn't need to live in the same
 *      refresh-on-mount cycle. Callers (the history screen) call it on
 *      their own mount.
 *
 * Error-code → copy mapping lives here (not in the screen) per
 * mobile-sync-architecture.md §6: screens never branch on `code` directly.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ArchivedGoal, Goal, GoalMetric, GoalPeriod } from '@genoly/types';
import { ApiClientError } from '@genoly/api-client';
import { apiClient } from '../utils/api';

// ── Public types ─────────────────────────────────────────────────────

export interface UpsertGoalResult {
  ok: boolean;
  /** True when the server made no writes because the same target was
   *  already active (idempotent no-op) — lets the screen skip the
   *  success toast or word it differently ("already set to..."). */
  created: boolean;
}

export interface GoalsData {
  /** Currently active goals (max 4). */
  goals: Goal[];
  /** True while a refresh() cycle is running. */
  refreshing: boolean;
  /** True until the first fetch cycle settles. */
  initialLoading: boolean;
  /** Last error message from fetching the active-goals list. */
  error: string | null;
  /** Trigger a manual re-fetch of the active goals list. */
  refresh: () => Promise<void>;

  /** Key of the goal currently processing an upsert/archive, formatted
   *  as `${period}:${metric}` for upserts or the raw goalId for
   *  archives. null when idle. */
  busyGoalKey: string | null;
  /** Last error message from an action (upsert/archive). Cleared at the
   *  start of the next action. */
  actionError: string | null;

  /** PUT /goals — create-or-update the goal for a (period, metric) pair,
   *  then refreshes the active list on success. */
  upsertGoal: (opts: { period: GoalPeriod; metric: GoalMetric; target: number }) => Promise<UpsertGoalResult>;
  /** DELETE /goals/:goalId — archives (not deletes), then refreshes the
   *  active list on success. */
  archiveGoal: (goalId: string) => Promise<boolean>;

  /** Archived goals from the last fetchHistory() call. Empty until the
   *  caller invokes fetchHistory(). */
  history: ArchivedGoal[];
  /** True while fetchHistory() is in flight. */
  historyLoading: boolean;
  /** Last error from fetchHistory(). */
  historyError: string | null;
  /** GET /goals/history — one-shot read, not auto-triggered on mount
   *  (history is viewed far less often than the active list). */
  fetchHistory: (opts?: { period?: GoalPeriod; metric?: GoalMetric; limit?: number }) => Promise<void>;
}

// ── Error copy mapping (mobile-sync-architecture.md §6) ─────────────

/**
 * Maps a thrown error to user-facing copy for goals actions. Sentence
 * case, direct, per DESIGN.md tone rules. Exported for tests.
 */
export function goalsActionErrorMessage(err: unknown, action: 'upsert' | 'archive' | 'history'): string {
  if (err instanceof ApiClientError) {
    switch (err.code) {
      case 'validation_failed':
      case 'bad_request':
        return action === 'upsert'
          ? 'Enter a valid, non-negative whole number for your target.'
          : err.message;
      case 'not_found':
        return "That goal no longer exists — it may have already been archived.";
      case 'unauthenticated':
      case 'token_revoked':
      case 'token_expired':
        return 'Your session expired. Please sign in again.';
      case 'rate_limited':
        return 'Slow down a sec, then try again.';
      default:
        return 'Something went wrong on our end. Please try again.';
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

/** Stable key for a (period, metric) pair — used as busyGoalKey while an
 *  upsert is in flight, before the server has minted/kept a goal id. */
export function goalKey(period: GoalPeriod, metric: GoalMetric): string {
  return `${period}:${metric}`;
}

// ── The hook ─────────────────────────────────────────────────────────

export interface UseGoalsDataOptions {
  /** Skip the on-mount auto-refresh. Used by tests that want to control
   *  timing explicitly. */
  skipInitialRefresh?: boolean;
}

export function useGoalsData(options: UseGoalsDataOptions = {}): GoalsData {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!options.skipInitialRefresh);
  const [error, setError] = useState<string | null>(null);

  const [busyGoalKey, setBusyGoalKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [history, setHistory] = useState<ArchivedGoal[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const result = await apiClient.getGoals();
      setGoals(result.goals);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load goals';
      setError(msg);
    } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (options.skipInitialRefresh) return;
    refresh();
    // refresh is stable via useCallback([]); running once on mount is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upsertGoalFn = useCallback(
    async (opts: { period: GoalPeriod; metric: GoalMetric; target: number }): Promise<UpsertGoalResult> => {
      setBusyGoalKey(goalKey(opts.period, opts.metric));
      setActionError(null);
      try {
        const result = await apiClient.upsertGoal(opts);
        await refresh();
        return { ok: true, created: result.created };
      } catch (err) {
        setActionError(goalsActionErrorMessage(err, 'upsert'));
        return { ok: false, created: false };
      } finally {
        setBusyGoalKey(null);
      }
    },
    [refresh],
  );

  const archiveGoalFn = useCallback(
    async (goalId: string): Promise<boolean> => {
      setBusyGoalKey(goalId);
      setActionError(null);
      try {
        await apiClient.archiveGoal(goalId);
        await refresh();
        return true;
      } catch (err) {
        setActionError(goalsActionErrorMessage(err, 'archive'));
        return false;
      } finally {
        setBusyGoalKey(null);
      }
    },
    [refresh],
  );

  const fetchHistory = useCallback(
    async (opts?: { period?: GoalPeriod; metric?: GoalMetric; limit?: number }) => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const result = await apiClient.getGoalsHistory(opts);
        setHistory(result.goals);
      } catch (err) {
        setHistoryError(goalsActionErrorMessage(err, 'history'));
      } finally {
        setHistoryLoading(false);
      }
    },
    [],
  );

  return {
    goals,
    refreshing,
    initialLoading,
    error,
    refresh,
    busyGoalKey,
    actionError,
    upsertGoal: upsertGoalFn,
    archiveGoal: archiveGoalFn,
    history,
    historyLoading,
    historyError,
    fetchHistory,
  };
}
