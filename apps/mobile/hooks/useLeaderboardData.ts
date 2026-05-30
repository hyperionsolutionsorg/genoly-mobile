/**
 * useLeaderboardData — Step 8 of Phase 1.
 *
 * Powers the Leaderboard screen. Mirrors `useDashboardData`'s pattern:
 *
 *   1. Compute "today" in the device's LOCAL timezone (server keys
 *      leaderboard rows by user-local YYYY-MM-DD per fitness-api-contract.md).
 *   2. On mount AND on refresh(), drain the SyncQueue first so any locally
 *      queued health uploads land on the server BEFORE we fetch the
 *      leaderboard. This way the user always sees their freshest data on
 *      the board.
 *   3. Fetch the leaderboard via `apiClient.getLeaderboard({ date })` and
 *      return the rows + the user's step + calorie goals (used for
 *      progress overlays — Step 10 territory, but exposed now).
 *
 * Date math note: same local-TZ approach as Dashboard. We use the device's
 * local YYYY-MM-DD to match server's per-user-local keying.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Leaderboard, LeaderboardRow } from '@genoly/types';
import { apiClient } from '../utils/api';
import { createSyncQueue, type SyncQueue } from '@genoly/sync-queue';

// ── Public types ─────────────────────────────────────────────────────

export interface LeaderboardData {
  /** The board for "today" (local-TZ date). */
  rows: LeaderboardRow[];
  /** Date the server keyed the board against (echoed for display). */
  date: string;
  /** User's daily step goal, if set. null = no active goal. */
  myStepGoal: number | null;
  /** User's daily calorie goal, if set. null = no active goal. */
  myCalorieGoal: number | null;
  /** True while a drain+fetch cycle is running. */
  refreshing: boolean;
  /** True until the first cycle settles. */
  initialLoading: boolean;
  /** Last error message; cleared on next refresh attempt. */
  error: string | null;
  /** Trigger a manual drain + fetch. */
  refresh: () => Promise<void>;
}

// ── Date helper (local TZ) ─────────────────────────────────────────

/** Format today's date as YYYY-MM-DD in the device's local timezone.
 *  See useDashboardData for the same helper + rationale. */
function todayLocalDateString(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ── The hook ─────────────────────────────────────────────────────────

export interface UseLeaderboardDataOptions {
  /** Inject a SyncQueue for tests. Production callers omit and we build
   *  one via createSyncQueue(). */
  syncQueue?: SyncQueue;
  /** Skip on-mount auto-refresh. Used by tests for explicit timing. */
  skipInitialRefresh?: boolean;
}

export function useLeaderboardData(
  options: UseLeaderboardDataOptions = {},
): LeaderboardData {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [date, setDate] = useState<string>(() => todayLocalDateString());
  const [myStepGoal, setMyStepGoal] = useState<number | null>(null);
  const [myCalorieGoal, setMyCalorieGoal] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!options.skipInitialRefresh);
  const [error, setError] = useState<string | null>(null);

  const queueRef = useRef<SyncQueue | null>(options.syncQueue ?? null);

  async function ensureQueue(): Promise<SyncQueue> {
    if (queueRef.current) return queueRef.current;
    const q = await createSyncQueue({ apiClient });
    queueRef.current = q;
    return q;
  }

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const queue = await ensureQueue();

      // Best-effort drain — failures don't block the read.
      try {
        await queue.drain();
      } catch {
        // Drain failure is non-fatal; show server snapshot as-is.
      }

      const today = todayLocalDateString();
      setDate(today);

      const result: Leaderboard = await apiClient.getLeaderboard({ date: today });
      setRows(result.rows);
      setMyStepGoal(result.myStepGoal);
      setMyCalorieGoal(result.myCalorieGoal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load leaderboard';
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

  return {
    rows,
    date,
    myStepGoal,
    myCalorieGoal,
    refreshing,
    initialLoading,
    error,
    refresh,
  };
}

// Exported for tests.
export { todayLocalDateString };
