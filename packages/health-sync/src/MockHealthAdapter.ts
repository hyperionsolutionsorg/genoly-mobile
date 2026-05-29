/**
 * MockHealthAdapter — in-memory adapter for tests and dev tooling.
 *
 * Implements the HealthAdapter interface using a configurable in-memory
 * data set. Used by:
 *   - Jest tests in this package and downstream consumers
 *   - The `apps/mobile/scripts/test-health-adapter.ts` smoke script (TBD)
 *   - Storybook / Expo dev-client when running without HealthKit/Health
 *     Connect available
 *
 * Two construction modes:
 *
 *   new MockHealthAdapter()
 *     Starts empty, all reads return [].
 *
 *   new MockHealthAdapter({ samples: [...] })
 *     Pre-seeded with samples.
 *
 * Tests can also mutate the `samples` field directly, or call
 * `seedSamples()` / `clearSamples()` to update mid-test.
 */

import type { HealthAdapter, HealthAdapterPermissionState, HealthMetric, HealthSample } from './index';

export interface MockHealthAdapterOptions {
  /** Samples to seed the in-memory store with. */
  samples?: HealthSample[];
  /**
   * Override the platform string for the mock. Useful when testing
   * platform-specific behavior in a single Jest run.
   * Default: 'ios'.
   */
  platform?: 'ios' | 'android';
  /**
   * If false, isAvailable() returns false (simulating an unsupported
   * device). Default: true.
   */
  available?: boolean;
  /**
   * If true, requestPermissions() resolves to granted=false even when
   * called with valid metrics. Simulates a user denying the dialog.
   * Default: false.
   */
  denyPermissions?: boolean;
}

export class MockHealthAdapter implements HealthAdapter {
  public samples: HealthSample[];
  private platform: 'ios' | 'android';
  private available: boolean;
  private denyPermissions: boolean;
  private grantedMetrics: HealthMetric[] = [];

  constructor(options: MockHealthAdapterOptions = {}) {
    this.samples = [...(options.samples ?? [])];
    this.platform = options.platform ?? 'ios';
    this.available = options.available ?? true;
    this.denyPermissions = options.denyPermissions ?? false;
  }

  getPlatform(): 'ios' | 'android' {
    return this.platform;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async requestPermissions(metrics: HealthMetric[]): Promise<HealthAdapterPermissionState> {
    if (this.denyPermissions || !this.available) {
      return { granted: false, metrics: [] };
    }
    this.grantedMetrics = [...metrics];
    return { granted: true, metrics: [...metrics] };
  }

  async readDailyAggregates(opts: {
    startDate: string;
    endDate: string;
    metrics: HealthMetric[];
  }): Promise<HealthSample[]> {
    if (!this.available || this.grantedMetrics.length === 0) return [];

    // Filter samples within the inclusive date range AND project to only
    // the granted+requested metrics (callers requesting a metric we never
    // granted permission for see undefined for that field).
    const inRange = this.samples.filter(
      (s) => s.date >= opts.startDate && s.date <= opts.endDate,
    );

    const allowedMetrics = new Set(
      opts.metrics.filter((m) => this.grantedMetrics.includes(m)),
    );

    return inRange.map((s) => {
      const out: HealthSample = {
        date: s.date,
        source: s.source,
        steps: allowedMetrics.has('steps') ? s.steps : 0,
        caloriesActive: allowedMetrics.has('caloriesActive') ? s.caloriesActive : 0,
      };
      if (allowedMetrics.has('caloriesBasal') && s.caloriesBasal !== undefined) {
        out.caloriesBasal = s.caloriesBasal;
      }
      if (allowedMetrics.has('distanceMeters') && s.distanceMeters !== undefined) {
        out.distanceMeters = s.distanceMeters;
      }
      return out;
    });
  }

  // ── Test helpers ───────────────────────────────────────────────────

  seedSamples(samples: HealthSample[]): void {
    this.samples = [...samples];
  }

  clearSamples(): void {
    this.samples = [];
  }
}
