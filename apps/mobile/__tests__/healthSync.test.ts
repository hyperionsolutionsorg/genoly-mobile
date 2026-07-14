/**
 * healthSync.test.ts — the fitness-path PRODUCER (utils/healthSync.ts,
 * added 2026-07-13).
 *
 * Root cause pinned here: SyncQueue.enqueue() previously had ZERO
 * production call sites — the pipeline had drainers but no producer, so
 * sync/daily never received device data on any build. These tests cover
 * the collector's gating, window policy, upload mapping (dateUtcStart),
 * and idempotent enqueue ids.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../utils/api', () => ({
  apiClient: {},
}));

jest.mock('@genoly/sync-queue', () => ({
  createSyncQueue: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MockHealthAdapter, type HealthSample } from '@genoly/health-sync';
import {
  collectHealthDataIntoQueue,
  localDateToUtcStartMs,
  INITIAL_PULL_DAYS,
  STEADY_PULL_DAYS,
} from '../utils/healthSync';
import { setHealthSyncEnabled, setLastHealthCollectAt } from '../utils/preferences';

function makeQueue() {
  return { enqueue: jest.fn().mockResolvedValue(undefined) };
}

function localDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function sample(daysAgo: number, steps: number): HealthSample {
  return {
    date: localDate(daysAgo),
    steps,
    caloriesActive: 100,
    distanceMeters: 900,
    source: 'health_connect',
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('collectHealthDataIntoQueue', () => {
  it("returns 'disabled' without touching the adapter when health sync is off", async () => {
    const queue = makeQueue();
    const adapter = new MockHealthAdapter({ samples: [sample(1, 5000)] });
    const spy = jest.spyOn(adapter, 'readDailyAggregates');

    const result = await collectHealthDataIntoQueue(queue as never, { adapter });

    expect(result.status).toBe('disabled');
    expect(spy).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("returns 'unavailable' when the device has no health store", async () => {
    await setHealthSyncEnabled(true);
    const queue = makeQueue();
    const adapter = new MockHealthAdapter({ available: false });

    const result = await collectHealthDataIntoQueue(queue as never, { adapter });

    expect(result.status).toBe('unavailable');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("returns 'no-permissions' when the store is present but read grants are missing", async () => {
    await setHealthSyncEnabled(true);
    const queue = makeQueue();
    const adapter = new MockHealthAdapter({ samples: [sample(1, 5000)], denyPermissions: true });

    const result = await collectHealthDataIntoQueue(queue as never, { adapter });

    expect(result.status).toBe('no-permissions');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("returns 'no-data' when permissions are fine but the window is empty", async () => {
    await setHealthSyncEnabled(true);
    const queue = makeQueue();
    const adapter = new MockHealthAdapter({ samples: [] });

    const result = await collectHealthDataIntoQueue(queue as never, { adapter });

    expect(result.status).toBe('no-data');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues HealthEntryUpload rows with server-contract fields', async () => {
    await setHealthSyncEnabled(true);
    const queue = makeQueue();
    const adapter = new MockHealthAdapter({ samples: [sample(1, 7500), sample(2, 6200)] });

    const result = await collectHealthDataIntoQueue(queue as never, { adapter });

    expect(result.status).toBe('enqueued');
    expect(result.enqueued).toBe(2);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);

    const [entries, idFor] = queue.enqueue.mock.calls[0];
    const entry = entries.find((e: { date: string }) => e.date === localDate(1));
    expect(entry).toMatchObject({
      date: localDate(1),
      dateUtcStart: localDateToUtcStartMs(localDate(1)),
      steps: 7500,
      caloriesActive: 100,
      distanceMeters: 900,
      source: 'health_connect',
    });
    // Deterministic id per (date, source) → re-collection upserts.
    expect(idFor(entry)).toBe(`${localDate(1)}:health_connect`);
  });

  it('uses the 30-day window on first collection, 7-day after', async () => {
    await setHealthSyncEnabled(true);
    const queue = makeQueue();
    const adapter = new MockHealthAdapter({ samples: [sample(0, 1000)] });
    const spy = jest.spyOn(adapter, 'readDailyAggregates');

    // First ever collection → INITIAL_PULL_DAYS window.
    await collectHealthDataIntoQueue(queue as never, { adapter });
    expect(spy.mock.calls[0][0].startDate).toBe(localDate(INITIAL_PULL_DAYS - 1));

    // A successful collection stamps lastHealthCollectAt → steady window.
    await collectHealthDataIntoQueue(queue as never, { adapter });
    expect(spy.mock.calls[1][0].startDate).toBe(localDate(STEADY_PULL_DAYS - 1));
  });

  it('keeps the 30-day window while collections keep failing to find data', async () => {
    await setHealthSyncEnabled(true);
    const queue = makeQueue();
    const empty = new MockHealthAdapter({ samples: [] });
    const spy = jest.spyOn(empty, 'readDailyAggregates');

    await collectHealthDataIntoQueue(queue as never, { adapter: empty });
    await collectHealthDataIntoQueue(queue as never, { adapter: empty });

    // No successful collection → no timestamp → still the initial window.
    expect(spy.mock.calls[1][0].startDate).toBe(localDate(INITIAL_PULL_DAYS - 1));
  });

  it('windowDays overrides the initial/steady policy (Settings "Sync last 30 days")', async () => {
    await setHealthSyncEnabled(true);
    // Steady state (a prior collect happened) — normally a 7-day window.
    await setLastHealthCollectAt(Date.now() - 60_000);
    const queue = makeQueue();
    const adapter = new MockHealthAdapter({ samples: [sample(0, 100)] });
    const spy = jest.spyOn(adapter, 'readDailyAggregates');

    await collectHealthDataIntoQueue(queue as never, { adapter, windowDays: 30 });

    expect(spy.mock.calls[0][0].startDate).toBe(localDate(29));
    expect(spy.mock.calls[0][0].endDate).toBe(localDate(0));
  });

  it('assumeEnabled bypasses the preference read (permissions-screen race)', async () => {
    // healthSyncEnabled deliberately NOT set.
    const queue = makeQueue();
    const adapter = new MockHealthAdapter({ samples: [sample(1, 5000)] });

    const result = await collectHealthDataIntoQueue(queue as never, { adapter, assumeEnabled: true });

    expect(result.status).toBe('enqueued');
  });

  it("returns 'error' (never throws) when enqueue explodes", async () => {
    await setHealthSyncEnabled(true);
    const queue = { enqueue: jest.fn().mockRejectedValue(new Error('sqlite full')) };
    const adapter = new MockHealthAdapter({ samples: [sample(1, 5000)] });

    const result = await collectHealthDataIntoQueue(queue as never, { adapter });

    expect(result.status).toBe('error');
    expect(result.reason).toContain('sqlite full');
  });

  it('steady-state window still overlaps the dashboard 7-day view', async () => {
    await setHealthSyncEnabled(true);
    await setLastHealthCollectAt(Date.now() - 60_000);
    const queue = makeQueue();
    const adapter = new MockHealthAdapter({ samples: [sample(0, 100)] });
    const spy = jest.spyOn(adapter, 'readDailyAggregates');

    await collectHealthDataIntoQueue(queue as never, { adapter });

    const opts = spy.mock.calls[0][0];
    expect(opts.startDate).toBe(localDate(6));
    expect(opts.endDate).toBe(localDate(0));
  });
});

describe('localDateToUtcStartMs', () => {
  it('returns local midnight for the given calendar date', () => {
    const ms = localDateToUtcStartMs('2026-07-13');
    const d = new Date(ms);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(13);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
});
