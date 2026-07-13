/**
 * useDashboardData — Step 7 of Phase 1.
 *
 * Powers the Dashboard screen. Responsibilities:
 *
 *   1. Compute the "today" and "last 7 days" date window in the device's
 *      LOCAL timezone (matches how the server keys daily entries by
 *      user-local YYYY-MM-DD per fitness-api-contract.md).
 *   2. On mount AND on refresh(), run a foreground drain of the
 *      `@genoly/sync-queue` outbox so any locally-queued health-aggregate
 *      uploads land on the server BEFORE we fetch the 7-day window.
 *      This makes "open the app → see latest data" Just Work.
 *   3. Fetch the 7-day range via `apiClient.getDailyAggregates({ from, to })`
 *      and return the entries indexed by date.
 *   4. Surface SyncQueue depth + dead-letter depth so the screen can show
 *      sync status + the dead-letter banner.
 *
 * Why this lives as a hook (and not a Zustand store yet): Phase 1 has only
 * one screen consuming this data (Dashboard). When Friends + Leaderboard
 * ship and start sharing API state, we lift this into Zustand. Premature
 * to do it now.
 *
 * Date math note: we use the device's local timezone via `Date.getFullYear()`
 * etc. rather than `toISOString().slice(0,10)` which would give UTC. The
 * server expects YYYY-MM-DD per the user's local time — see the architecture
 * doc §9 (clock-drift defense) and §10 (sparse semantics).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HealthEntry } from '@genoly/types';
import { apiClient } from '../utils/api';
import { collectHealthDataIntoQueue } from '../utils/healthSync';
import { createSyncQueue, type SyncQueue } from '@genoly/sync-queue';

// ── Public types ─────────────────────────────────────────────────────

export interface DashboardData {
  /** Today's HealthEntry if the server has one for today; null if not yet
   *  synced for today (very common during the first sync of the day). */
  today: HealthEntry | null;
  /** Last 7 days (oldest first). Each entry corresponds to a date in
   *  the window; days with no server data are absent (sparse). */
  last7Days: HealthEntry[];
  /** Range used to fetch — exposed for UI ("from X to Y") + tests. */
  range: { from: string; to: string };
  /** Number of rows currently queued for upload (pending drain). */
  queueDepth: number;
  /** Number of rows that hit MAX_ATTEMPTS or were permanently rejected
   *  by the server. UI surfaces these in the dead-letter banner. */
  deadLetterDepth: number;
  /** Timestamp (Unix ms) of the most recent drain completion. null
   *  before the first drain settles. */
  lastSyncedAt: number | null;
  /** True while a drain+fetch cycle is running. */
  refreshing: boolean;
  /** True until the FIRST drain+fetch cycle has completed, even if it
   *  failed. Used to gate skeleton vs content. */
  initialLoading: boolean;
  /** Last error from drain or fetch. Cleared on next refresh attempt. */
  error: string | null;
  /** Trigger a manual drain + fetch. Idempotent against in-flight ones. */
  refresh: () => Promise<void>;
  /** Clear dead-lettered rows. Wraps SyncQueue.clearDeadLetters() and
   *  re-reads deadLetterDepth. UI confirms before calling. */
  clearDeadLetters: () => Promise<void>;
}

// ── Date helpers (local TZ) ─────────────────────────────────────────

/** Format a Date as YYYY-MM-DD in the device's local timezone.
 *  Intentionally NOT using toISOString() — that's UTC and would shift
 *  the date for users in westerly timezones around midnight. */
function toLocalDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Return the date N days ago in local TZ, as a YYYY-MM-DD string. */
function daysAgoLocal(n: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return toLocalDateString(d);
}

/**
 * Compute today + the 7-day range. Today is INCLUDED — so `from` is
 * 6 days before today and `to` is today, giving 7 days inclusive.
 * Exported for unit testing.
 */
export function computeDashboardRange(now: Date = new Date()): {
  today: string;
  range: { from: string; to: string };
} {
  const today = toLocalDateString(now);
  const from = daysAgoLocal(6, now);
  return { today, range: { from, to: today } };
}

// ── The hook ─────────────────────────────────────────────────────────

export interface UseDashboardDataOptions {
  /** Inject a SyncQueue for tests. Production callers omit and we
   *  build one via createSyncQueue(). */
  syncQueue?: SyncQueue;
  /** Skip the on-mount auto-refresh. Used by tests that want to
   *  control timing explicitly. */
  skipInitialRefresh?: boolean;
}

export function useDashboardData(options: UseDashboardDataOptions = {}): DashboardData {
  const [today, setToday] = useState<HealthEntry | null>(null);
  const [last7Days, setLast7Days] = useState<HealthEntry[]>([]);
  const [range, setRange] = useState(() => computeDashboardRange().range);
  const [queueDepth, setQueueDepth] = useState(0);
  const [deadLetterDepth, setDeadLetterDepth] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!options.skipInitialRefresh);
  const [error, setError] = useState<string | null>(null);

  // Cached SyncQueue instance — lazy-init on first use to avoid running
  // expo-sqlite during tests that pass their own queue.
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

      // 0. PRODUCE: read the device health store into the queue (the
      // collector gates itself on healthSyncEnabled and never throws).
      // Without this step the queue is permanently empty and the drain
      // below is a no-op — see utils/healthSync.ts header.
      await collectHealthDataIntoQueue(queue);

      // 1. Drain whatever's pending. We catch errors so a drain failure
      // doesn't block the read — a stale view is better than no view.
      try {
        await queue.drain();
      } catch {
        // Drain errors are non-fatal here; the user still gets the
        // last server snapshot. The next refresh will retry.
      }

      // 2. Recompute the date window — important if the user has the
      // app open across midnight.
      const computed = computeDashboardRange();
      setRange(computed.range);

      // 3. Fetch the 7-day window.
      const result = await apiClient.getDailyAggregates(computed.range);

      // Sort oldest-first so the UI bars render left-to-right.
      const sorted = [...result.entries].sort((a, b) => a.date.localeCompare(b.date));
      const todayEntry = sorted.find((e) => e.date === computed.today) ?? null;

      setLast7Days(sorted);
      setToday(todayEntry);

      // 4. Read queue counters AFTER the drain so the UI reflects
      // post-drain depth.
      const [qd, dl] = await Promise.all([
        queue.getQueueDepth(),
        queue.getDeadLetterDepth(),
      ]);
      setQueueDepth(qd);
      setDeadLetterDepth(dl);
      setLastSyncedAt(Date.now());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh dashboard';
      setError(msg);
    } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, []);

  // Auto-refresh on mount unless explicitly opted out.
  useEffect(() => {
    if (options.skipInitialRefresh) return;
    refresh();
    // We intentionally only run this once on mount. refresh is stable
    // (useCallback with []), so re-running is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearDeadLetters = useCallback(async () => {
    const queue = await ensureQueue();
    await queue.clearDeadLetters();
    const dl = await queue.getDeadLetterDepth();
    setDeadLetterDepth(dl);
  }, []);

  return {
    today,
    last7Days,
    range,
    queueDepth,
    deadLetterDepth,
    lastSyncedAt,
    refreshing,
    initialLoading,
    error,
    refresh,
    clearDeadLetters,
  };
}
