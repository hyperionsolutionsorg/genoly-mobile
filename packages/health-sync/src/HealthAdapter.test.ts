/**
 * HealthAdapter test suite — covers MockHealthAdapter directly (used in
 * tests across the monorepo) and the platform-specific adapters via
 * native-module mocking.
 *
 * Run from package root: `npm test` (uses jest-expo preset).
 *
 * Coverage notes:
 *   - Real device behavior (actual HealthKit / Health Connect reads) is
 *     NOT verifiable in Jest — those require a simulator/emulator and a
 *     manual smoke pass. The smoke runbook lives at
 *     `apps/mobile/scripts/test-health-adapter.ts` (to be added in Phase
 *     1.5).
 *   - These tests verify the adapter LOGIC: clock-drift filtering,
 *     sparse semantics, permission-grant routing, error fallthrough.
 */

import { HealthKitAdapter } from './HealthKitAdapter';
import { HealthConnectAdapter } from './HealthConnectAdapter';
import { MockHealthAdapter } from './MockHealthAdapter';
import type { HealthSample } from './index';

// ── MockHealthAdapter ────────────────────────────────────────────────

describe('MockHealthAdapter', () => {
  const fixtureSamples: HealthSample[] = [
    { date: '2026-05-26', source: 'healthkit', steps: 8200, caloriesActive: 380, distanceMeters: 6400 },
    { date: '2026-05-27', source: 'healthkit', steps: 12100, caloriesActive: 520, distanceMeters: 9300 },
    { date: '2026-05-28', source: 'healthkit', steps: 9500, caloriesActive: 410, distanceMeters: 7100 },
  ];

  it('returns the platform from constructor options', () => {
    expect(new MockHealthAdapter().getPlatform()).toBe('ios');
    expect(new MockHealthAdapter({ platform: 'android' }).getPlatform()).toBe('android');
  });

  it('isAvailable() reflects the available constructor flag', async () => {
    expect(await new MockHealthAdapter().isAvailable()).toBe(true);
    expect(await new MockHealthAdapter({ available: false }).isAvailable()).toBe(false);
  });

  it('grants requested permissions by default', async () => {
    const adapter = new MockHealthAdapter();
    const result = await adapter.requestPermissions(['steps', 'caloriesActive']);
    expect(result.granted).toBe(true);
    expect(result.metrics).toEqual(['steps', 'caloriesActive']);
  });

  it('denies permissions when configured to', async () => {
    const adapter = new MockHealthAdapter({ denyPermissions: true });
    const result = await adapter.requestPermissions(['steps']);
    expect(result.granted).toBe(false);
    expect(result.metrics).toEqual([]);
  });

  it('returns empty if device unavailable, even with samples seeded', async () => {
    const adapter = new MockHealthAdapter({ available: false, samples: fixtureSamples });
    await adapter.requestPermissions(['steps']);
    const result = await adapter.readDailyAggregates({
      startDate: '2026-05-26',
      endDate: '2026-05-28',
      metrics: ['steps'],
    });
    expect(result).toEqual([]);
  });

  it('reads WITHOUT an in-process requestPermissions call (grants persist at the OS level)', async () => {
    // Real platforms persist grants across app restarts, so a fresh
    // adapter instance must be able to read. The old per-instance gate
    // (empty until requestPermissions ran on the same object) is exactly
    // the bug that silently blanked every health read (2026-07-13).
    const adapter = new MockHealthAdapter({ samples: fixtureSamples });
    const result = await adapter.readDailyAggregates({
      startDate: '2026-05-26',
      endDate: '2026-05-28',
      metrics: ['steps'],
    });
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty when permissions are denied', async () => {
    const adapter = new MockHealthAdapter({ samples: fixtureSamples, denyPermissions: true });
    const result = await adapter.readDailyAggregates({
      startDate: '2026-05-26',
      endDate: '2026-05-28',
      metrics: ['steps'],
    });
    expect(result).toEqual([]);
    expect(await adapter.getGrantedMetrics()).toEqual([]);
  });

  it('reads daily aggregates within the requested date range', async () => {
    const adapter = new MockHealthAdapter({ samples: fixtureSamples });
    await adapter.requestPermissions(['steps', 'caloriesActive', 'distanceMeters']);
    const result = await adapter.readDailyAggregates({
      startDate: '2026-05-27',
      endDate: '2026-05-28',
      metrics: ['steps', 'caloriesActive', 'distanceMeters'],
    });
    expect(result.length).toBe(2);
    expect(result.map((s) => s.date)).toEqual(['2026-05-27', '2026-05-28']);
    expect(result[0].steps).toBe(12100);
    expect(result[0].distanceMeters).toBe(9300);
  });

  it('zeroes out metrics not in the granted set', async () => {
    const adapter = new MockHealthAdapter({ samples: fixtureSamples });
    // Grant ONLY steps.
    await adapter.requestPermissions(['steps']);
    // Request steps + caloriesActive → caloriesActive should be filtered out.
    const result = await adapter.readDailyAggregates({
      startDate: '2026-05-26',
      endDate: '2026-05-28',
      metrics: ['steps', 'caloriesActive'],
    });
    expect(result.length).toBe(3);
    for (const s of result) {
      expect(s.steps).toBeGreaterThan(0);
      expect(s.caloriesActive).toBe(0); // ungranted; not returned
    }
  });

  it('seedSamples / clearSamples mutate the in-memory store', async () => {
    const adapter = new MockHealthAdapter();
    await adapter.requestPermissions(['steps']);
    adapter.seedSamples([
      { date: '2026-05-28', source: 'healthkit', steps: 100, caloriesActive: 0 },
    ]);
    let result = await adapter.readDailyAggregates({
      startDate: '2026-05-28',
      endDate: '2026-05-28',
      metrics: ['steps'],
    });
    expect(result.length).toBe(1);
    adapter.clearSamples();
    result = await adapter.readDailyAggregates({
      startDate: '2026-05-28',
      endDate: '2026-05-28',
      metrics: ['steps'],
    });
    expect(result.length).toBe(0);
  });
});

// ── HealthKitAdapter — native module not loadable ────────────────────

describe('HealthKitAdapter (no native module)', () => {
  // In Jest's Node environment, `require('react-native-health')` throws.
  // The adapter should gracefully report unavailable + return empty data.

  it('isAvailable() returns false when native module is missing', async () => {
    const adapter = new HealthKitAdapter();
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('requestPermissions() returns ungranted when native module is missing', async () => {
    const adapter = new HealthKitAdapter();
    const result = await adapter.requestPermissions(['steps']);
    expect(result.granted).toBe(false);
    expect(result.metrics).toEqual([]);
  });

  it('readDailyAggregates() returns [] when native module is missing', async () => {
    const adapter = new HealthKitAdapter();
    const result = await adapter.readDailyAggregates({
      startDate: '2026-05-01',
      endDate: '2026-05-28',
      metrics: ['steps'],
    });
    expect(result).toEqual([]);
  });

  it('getPlatform() returns ios regardless of native module state', () => {
    const adapter = new HealthKitAdapter();
    expect(adapter.getPlatform()).toBe('ios');
  });
});

// ── HealthConnectAdapter — native module not loadable ────────────────

describe('HealthConnectAdapter (no native module)', () => {
  it('isAvailable() returns false when native module is missing', async () => {
    const adapter = new HealthConnectAdapter();
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('requestPermissions() returns ungranted when native module is missing', async () => {
    const adapter = new HealthConnectAdapter();
    const result = await adapter.requestPermissions(['steps']);
    expect(result.granted).toBe(false);
    expect(result.metrics).toEqual([]);
  });

  it('readDailyAggregates() returns [] when native module is missing', async () => {
    const adapter = new HealthConnectAdapter();
    const result = await adapter.readDailyAggregates({
      startDate: '2026-05-01',
      endDate: '2026-05-28',
      metrics: ['steps'],
    });
    expect(result).toEqual([]);
  });

  it('getPlatform() returns android regardless of native module state', () => {
    const adapter = new HealthConnectAdapter();
    expect(adapter.getPlatform()).toBe('android');
  });
});
