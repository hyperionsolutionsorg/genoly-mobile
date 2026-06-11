/**
 * challengeSync.ts — feeds step counts from the device health store into
 * the walking challenges the member has JOINED (explicit opt-in only —
 * privacy invariant §6.7: health data never leaves the device for a
 * challenge the user didn't join).
 *
 * Source: @genoly/health-sync adapter (HealthKit / Health Connect), or a
 * deterministic synthetic generator when the DEV-only "mock health data"
 * toggle is on (simulators expose no health store — brief §7.3).
 *
 * Throttle: at most one sync per challenge per 15 minutes (AsyncStorage
 * timestamp), so opening the hub repeatedly doesn't hammer Convex
 * (141% bandwidth posture). The server clamps + replaces per-day counts,
 * so re-syncs are idempotent.
 */

import type { ConvexReactClient } from 'convex/react';
import { createHealthAdapter, MockHealthAdapter, type HealthSample } from '@genoly/health-sync';

import {
  challengeSyncMySteps,
  type ChallengeSummary,
} from './genolyApi';
import {
  getChallengeSyncedAt,
  setChallengeSyncedAt,
  getHealthSyncEnabled,
  getUseMockHealthData,
} from '../utils/preferences';

const SYNC_THROTTLE_MS = 15 * 60 * 1000;

export function isoDayUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Deterministic synthetic steps: same device+day → same number (5k–14k). */
export function syntheticStepsFor(date: string): number {
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
    const date = isoDayUtc(ts);
    samples.push({
      date,
      steps: syntheticStepsFor(date),
      caloriesActive: 0,
      source: 'healthkit',
    });
  }
  return samples;
}

export interface ChallengeSyncResult {
  challengeId: string;
  status: 'synced' | 'throttled' | 'no_data' | 'unavailable' | 'error';
  currentSteps?: number;
}

/**
 * Read the health store for the challenge window and push per-day step
 * totals. `force` skips the throttle (the detail screen's "Sync now").
 */
export async function syncChallengeSteps(
  convex: ConvexReactClient,
  challenge: Pick<ChallengeSummary, '_id' | 'startAt' | 'endAt'>,
  options: { force?: boolean } = {},
): Promise<ChallengeSyncResult> {
  const challengeId = challenge._id;
  try {
    if (!options.force) {
      const lastSynced = await getChallengeSyncedAt(challengeId);
      if (lastSynced && Date.now() - lastSynced < SYNC_THROTTLE_MS) {
        return { challengeId, status: 'throttled' };
      }
    }

    const startDate = isoDayUtc(challenge.startAt);
    const endDate = isoDayUtc(Math.min(challenge.endAt, Date.now()));

    const useMock = __DEV__ && (await getUseMockHealthData());
    const adapter = useMock
      ? new MockHealthAdapter({ samples: buildMockSamples(startDate, endDate) })
      : createHealthAdapter();

    if (!useMock) {
      const healthEnabled = await getHealthSyncEnabled();
      if (!healthEnabled || !(await adapter.isAvailable())) {
        return { challengeId, status: 'unavailable' };
      }
    }

    const samples = await adapter.readDailyAggregates({
      startDate,
      endDate,
      metrics: ['steps'],
    });
    const days = samples
      .filter((sample) => typeof sample.steps === 'number' && sample.steps > 0)
      .map((sample) => ({ date: sample.date, steps: sample.steps }));
    if (days.length === 0) {
      return { challengeId, status: 'no_data' };
    }

    const result = await convex.mutation(challengeSyncMySteps, { challengeId, days });
    await setChallengeSyncedAt(challengeId, Date.now());
    return { challengeId, status: 'synced', currentSteps: result.currentSteps };
  } catch {
    return { challengeId, status: 'error' };
  }
}

/** Sync every active joined challenge (hub mount). Sequential, best-effort. */
export async function syncAllJoinedChallenges(
  convex: ConvexReactClient,
  challenges: Pick<ChallengeSummary, '_id' | 'startAt' | 'endAt' | 'status'>[],
): Promise<ChallengeSyncResult[]> {
  const results: ChallengeSyncResult[] = [];
  for (const challenge of challenges) {
    if (challenge.status !== 'active') continue;
    results.push(await syncChallengeSteps(convex, challenge));
  }
  return results;
}
