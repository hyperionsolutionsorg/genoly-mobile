/**
 * healthSync.ts — the PRODUCER side of the fitness daily-sync pipeline.
 *
 * Root cause (2026-07-13): the pipeline had a queue, a drainer
 * (SyncQueue.drain via useDashboardData + backgroundSync) and a server
 * endpoint — but NOTHING ever read the device health store into the
 * queue. `SyncQueue.enqueue()` had zero production call sites, so
 * `sync/daily` never received real data on any build. This module is
 * the missing stage: read daily aggregates from HealthKit / Health
 * Connect, map them to `HealthEntryUpload` rows, and enqueue them for
 * the existing drainers to upload.
 *
 * Window policy (AGENTS.md §3.7): 30 days on the FIRST collection after
 * install/grant (so leaderboards feel real on day one), 7 days steady-
 * state (covers the dashboard window + timezone stragglers; server
 * upserts are idempotent by (userId, date), so overlap is free).
 *
 * DEV mock: honors the Settings "mock health data" toggle (__DEV__
 * only) with deterministic synthetic samples — same generator seed
 * style as lib/challengeSync.ts — because emulators expose no health
 * store. Production builds ignore the toggle.
 *
 * Health reads stay behind the @genoly/health-sync adapter interface
 * (AGENTS.md §3.3) — this module never imports platform health APIs.
 */

import {
  createHealthAdapter,
  MockHealthAdapter,
  type HealthAdapter,
  type HealthMetric,
  type HealthSample,
} from '@genoly/health-sync';
import type { HealthEntryUpload } from '@genoly/types';
import { createSyncQueue, type DrainResult, type SyncQueue } from '@genoly/sync-queue';

import { apiClient } from './api';
import {
  getHealthSyncEnabled,
  getLastHealthCollectAt,
  getUseMockHealthData,
  setLastHealthCollectAt,
  setLastHealthReadDiag,
} from './preferences';

/** Bumped whenever the read path changes — shows up in the Settings
 *  diagnostic line so a screenshot identifies the installed build. */
export const HEALTH_READ_REV = 'r62';

// ── Constants ─────────────────────────────────────────────────────────

/** First-ever collection window (days, inclusive of today). */
export const INITIAL_PULL_DAYS = 30;

/** Steady-state collection window (days, inclusive of today). */
export const STEADY_PULL_DAYS = 7;

const COLLECTED_METRICS: HealthMetric[] = ['steps', 'caloriesActive', 'distanceMeters'];

// ── Result shape ──────────────────────────────────────────────────────

export interface HealthCollectResult {
  /**
   * - 'disabled'        — health sync toggle is off
   * - 'unavailable'     — no health store on this device (emulator, web)
   * - 'no-permissions'  — store present but no read grants (user revoked
   *                       or never granted)
   * - 'no-data'         — permissions fine, store just has nothing in
   *                       the window
   * - 'enqueued'        — rows enqueued for upload
   * - 'error'           — read/enqueue threw (see reason)
   */
  status: 'disabled' | 'unavailable' | 'no-permissions' | 'no-data' | 'enqueued' | 'error';
  /** Rows enqueued (0 unless status === 'enqueued'). */
  enqueued: number;
  /** Machine-readable detail for diagnostics/logging. */
  reason?: string;
}

// ── Date helpers (local TZ — mirror useDashboardData's) ─────────────

function toLocalDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function daysAgoLocal(n: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return toLocalDateString(d);
}

/**
 * Unix ms of local midnight for a YYYY-MM-DD local date — the
 * `dateUtcStart` the server contract expects ("start of that local day
 * in UTC").
 */
export function localDateToUtcStartMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

// ── DEV synthetic samples (emulators have no health store) ──────────

/** Deterministic synthetic steps: same day → same number (5k–14k). */
function syntheticStepsFor(date: string): number {
  let hash = 0;
  for (let i = 0; i < date.length; i++) {
    hash = (hash * 31 + date.charCodeAt(i)) | 0;
  }
  return 5000 + (Math.abs(hash) % 9000);
}

function buildMockSamples(startDate: string, endDate: string): HealthSample[] {
  const samples: HealthSample[] = [];
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  for (let ts = start; ts <= end; ts += 86_400_000) {
    const date = new Date(ts).toISOString().slice(0, 10);
    const steps = syntheticStepsFor(date);
    samples.push({
      date,
      steps,
      caloriesActive: Math.round(steps * 0.04),
      distanceMeters: Math.round(steps * 0.7),
      source: 'health_connect',
    });
  }
  return samples;
}

// ── The producer ──────────────────────────────────────────────────────

export interface CollectOptions {
  /** Override the adapter (tests). */
  adapter?: HealthAdapter;
  /** Skip the healthSyncEnabled gate (permissions screen calls this
   *  right after setting the flag — races AsyncStorage otherwise). */
  assumeEnabled?: boolean;
  /**
   * Force a specific read window (days, inclusive of today), bypassing
   * the initial/steady policy. Used by the Settings "Sync last 30 days"
   * action: source apps (e.g. Samsung Health) backfill Health Connect on
   * their own schedule, so history that wasn't there on the first
   * collection can be captured later. Server upserts are idempotent by
   * (userId, date), so re-reading a window is always safe.
   */
  windowDays?: number;
}

/**
 * Read the device health store and enqueue `HealthEntryUpload` rows for
 * the drainers. Never throws — returns a status instead (callers run in
 * fire-and-forget or background-task contexts).
 */
export async function collectHealthDataIntoQueue(
  queue: SyncQueue,
  options: CollectOptions = {},
): Promise<HealthCollectResult> {
  try {
    if (!options.assumeEnabled && !(await getHealthSyncEnabled())) {
      return { status: 'disabled', enqueued: 0 };
    }

    const lastCollectAt = await getLastHealthCollectAt();
    const windowDays =
      options.windowDays ?? (lastCollectAt === null ? INITIAL_PULL_DAYS : STEADY_PULL_DAYS);
    const endDate = toLocalDateString(new Date());
    const startDate = daysAgoLocal(windowDays - 1);

    const useMock = typeof __DEV__ !== 'undefined' && __DEV__ && (await getUseMockHealthData());
    const adapter =
      options.adapter ??
      (useMock
        ? new MockHealthAdapter({ samples: buildMockSamples(startDate, endDate), platform: 'android' })
        : createHealthAdapter());

    if (!(await adapter.isAvailable())) {
      return { status: 'unavailable', enqueued: 0, reason: 'health-store-unavailable' };
    }

    const samples = await adapter.readDailyAggregates({
      startDate,
      endDate,
      metrics: COLLECTED_METRICS,
    });

    // Persist read diagnostics for the Settings readout (fire-and-forget;
    // never let diagnostics break the pipeline).
    try {
      const adapterDiag = adapter.getReadDiagnostics?.() ?? null;
      const todaySample = samples.find((s) => s.date === endDate);
      await setLastHealthReadDiag({
        at: Date.now(),
        rev: HEALTH_READ_REV,
        status: samples.length > 0 ? 'read' : 'empty',
        samples: samples.length,
        todaySteps: typeof todaySample?.steps === 'number' ? todaySample.steps : null,
        metrics: (adapterDiag?.metrics ?? {}) as Record<
          string,
          { path: string; days: number; aggregateError?: string }
        >,
      });
    } catch {
      // Best-effort only.
    }

    if (samples.length === 0) {
      // Distinguish "nothing recorded" from "we can't read at all" where
      // the platform can tell us (Android; iOS returns null = unknowable).
      const granted = await adapter.getGrantedMetrics?.();
      if (Array.isArray(granted) && granted.length === 0) {
        return { status: 'no-permissions', enqueued: 0, reason: 'no-read-grants' };
      }
      return { status: 'no-data', enqueued: 0 };
    }

    const entries: HealthEntryUpload[] = samples.map((s) => {
      const entry: HealthEntryUpload = {
        date: s.date,
        dateUtcStart: localDateToUtcStartMs(s.date),
        steps: s.steps ?? 0,
        caloriesActive: s.caloriesActive ?? 0,
        source: s.source,
      };
      if (typeof s.caloriesBasal === 'number') entry.caloriesBasal = s.caloriesBasal;
      if (typeof s.distanceMeters === 'number') entry.distanceMeters = s.distanceMeters;
      return entry;
    });

    // Deterministic id per (date, source): re-collecting the same day
    // upserts the row (INSERT OR REPLACE) with fresher numbers instead
    // of duplicating it. Server side is idempotent by (userId, date).
    await queue.enqueue(entries, (e) => `${e.date}:${e.source}`);
    await setLastHealthCollectAt(Date.now());

    return { status: 'enqueued', enqueued: entries.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[healthSync] collect failed:', msg);
    }
    return { status: 'error', enqueued: 0, reason: msg };
  }
}

/**
 * Convenience one-shot: build a queue, collect, drain. Used by the
 * permissions screen right after a grant (day-one initial pull) and by
 * the Settings re-enable path. Fire-and-forget safe — never throws.
 */
export async function collectAndDrainNow(
  options: CollectOptions = {},
): Promise<{ collect: HealthCollectResult; drain: DrainResult | null }> {
  try {
    const queue = await createSyncQueue({ apiClient });
    const collect = await collectHealthDataIntoQueue(queue, options);
    if (collect.status !== 'enqueued') {
      return { collect, drain: null };
    }
    const drain = await queue.drain();
    return { collect, drain };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[healthSync] collectAndDrainNow failed:', msg);
    }
    return { collect: { status: 'error', enqueued: 0, reason: msg }, drain: null };
  }
}
