/**
 * HealthConnectAdapter — Android implementation of the HealthAdapter
 * interface.
 *
 * Wraps `react-native-health-connect` (the de-facto RN Health Connect
 * binding) and exposes the same surface as HealthKitAdapter so callers
 * can program against `HealthAdapter` without special-casing Android.
 *
 * Library choice — the architecture doc mentioned `expo-health-connect`
 * but the existing health-sync package comments + production maturity
 * favor `react-native-health-connect`. Decision logged in
 * `vault/overnight-questions.md`. Easy to swap later if needed; the
 * surface area used here is small.
 *
 * Forkability constraint: this file is the ONLY place in the codebase
 * that may import from `react-native-health-connect`. Everything else
 * routes through the HealthAdapter interface.
 *
 * Native module loading: same defensive try/catch pattern as
 * HealthKitAdapter — the module load is wrapped so the package compiles
 * + tests run in Node and on iOS without crashing.
 */

import type { HealthAdapter, HealthAdapterOptions, HealthAdapterPermissionState, HealthMetric, HealthSample } from './index';

// react-native-health-connect SdkAvailabilityStatus.SDK_AVAILABLE. Inlined
// (not imported) to keep this file's only require() the lazy native-module
// load in loadNativeModule() — see the health-reading-isolation rule.
const SDK_AVAILABLE = 3;

// ── Native module loading ────────────────────────────────────────────

interface HCRecord {
  startTime: string; // ISO 8601
  endTime: string;
  count?: number;       // Steps records
  energy?: { inKilocalories: number };
  distance?: { inMeters: number };
}

interface RNHealthConnect {
  initialize(): Promise<boolean>;
  getSdkStatus(): Promise<number>;
  requestPermission(
    permissions: Array<{ accessType: 'read'; recordType: string }>,
  ): Promise<Array<{ accessType: 'read'; recordType: string }>>;
  readRecords(
    recordType: string,
    options: {
      timeRangeFilter: { operator: 'between'; startTime: string; endTime: string };
      ascendingOrder?: boolean;
    },
  ): Promise<{ records: HCRecord[] }>;
}

function loadNativeModule(): RNHealthConnect | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- REASON: native module must resolve synchronously.
    const mod = require('react-native-health-connect');
    return (mod?.default ?? mod) as RNHealthConnect;
  } catch {
    return null;
  }
}

// ── Metric-to-Health-Connect-record-type map ────────────────────────

// Health Connect uses class-style record-type names. These are the
// strings the library accepts in `permissions` and `readRecords`.
const METRIC_TO_HC_RECORD_TYPE: Record<HealthMetric, string> = {
  steps: 'Steps',
  caloriesActive: 'ActiveCaloriesBurned',
  caloriesBasal: 'BasalMetabolicRate',
  distanceMeters: 'Distance',
};

// ── Adapter implementation ───────────────────────────────────────────

export class HealthConnectAdapter implements HealthAdapter {
  private hc: RNHealthConnect | null;
  private debugLogging: boolean;
  private initialized: boolean = false;

  constructor(options: HealthAdapterOptions = {}) {
    this.hc = loadNativeModule();
    this.debugLogging = options.debugLogging ?? (typeof __DEV__ !== 'undefined' && __DEV__);
  }

  getPlatform(): 'android' {
    return 'android';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.hc) return false;
    try {
      const status = await this.hc.getSdkStatus();
      // react-native-health-connect SdkAvailabilityStatus (constants.ts):
      //   1 = SDK_UNAVAILABLE
      //   2 = SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
      //   3 = SDK_AVAILABLE
      // The prior code compared `=== 1` with a comment claiming 1=available —
      // exactly inverted, so isAvailable() returned false on EVERY device
      // that actually has Health Connect (device-confirmed on a Samsung with
      // real data, 2026-07-11). Available === 3.
      return status === SDK_AVAILABLE;
    } catch {
      return false;
    }
  }

  async requestPermissions(metrics: HealthMetric[]): Promise<HealthAdapterPermissionState> {
    if (!this.hc) return { granted: false, metrics: [] };

    if (metrics.length === 0) return { granted: false, metrics: [] };

    try {
      // 1. Initialize Health Connect (no-op if already initialized).
      const ok = await this.hc.initialize();
      if (!ok) {
        if (this.debugLogging) console.warn('[HealthConnectAdapter] initialize returned false');
        return { granted: false, metrics: [] };
      }

      // 2. Translate metrics to Health Connect permission objects.
      const permissions = metrics
        .map((m) => METRIC_TO_HC_RECORD_TYPE[m])
        .filter(Boolean)
        .map((recordType) => ({ accessType: 'read' as const, recordType }));

      // 3. Request — returns the subset of permissions actually granted.
      const grantedRaw = await this.hc.requestPermission(permissions);

      // 4. Translate granted record types back to our HealthMetric enum.
      const grantedMetrics: HealthMetric[] = [];
      for (const granted of grantedRaw) {
        const reverseEntry = Object.entries(METRIC_TO_HC_RECORD_TYPE).find(
          ([_, rt]) => rt === granted.recordType,
        );
        if (reverseEntry) grantedMetrics.push(reverseEntry[0] as HealthMetric);
      }

      this.initialized = grantedMetrics.length > 0;
      return { granted: this.initialized, metrics: grantedMetrics };
    } catch (err) {
      if (this.debugLogging) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[HealthConnectAdapter] requestPermissions error:', msg);
      }
      return { granted: false, metrics: [] };
    }
  }

  async readDailyAggregates(opts: {
    startDate: string;
    endDate: string;
    metrics: HealthMetric[];
  }): Promise<HealthSample[]> {
    if (!this.hc || !this.initialized) return [];

    const startTime = `${opts.startDate}T00:00:00.000Z`;
    const endTime = `${opts.endDate}T23:59:59.999Z`;

    const byDate = new Map<string, HealthSample>();
    const todayLocal = formatLocalDate(new Date());

    function recordSample(date: string, partial: Partial<HealthSample>) {
      if (date > todayLocal) return; // clock-drift defense
      const existing = byDate.get(date) ?? {
        date,
        source: 'health_connect' as const,
        steps: 0,
        caloriesActive: 0,
      };
      byDate.set(date, { ...existing, ...partial });
    }

    const tasks: Array<Promise<void>> = [];

    if (opts.metrics.includes('steps')) {
      tasks.push(this.readMetric('Steps', startTime, endTime, (records) => {
        // Health Connect Steps records can span partial days; aggregate
        // by start-of-record's local day.
        const byDay = new Map<string, number>();
        for (const r of records) {
          if (typeof r.count !== 'number') continue;
          const date = isoToLocalDate(r.startTime);
          byDay.set(date, (byDay.get(date) ?? 0) + r.count);
        }
        for (const [date, value] of byDay) {
          recordSample(date, { date, steps: Math.round(value) });
        }
      }));
    }

    if (opts.metrics.includes('caloriesActive')) {
      tasks.push(this.readMetric('ActiveCaloriesBurned', startTime, endTime, (records) => {
        const byDay = new Map<string, number>();
        for (const r of records) {
          const kcal = r.energy?.inKilocalories;
          if (typeof kcal !== 'number') continue;
          const date = isoToLocalDate(r.startTime);
          byDay.set(date, (byDay.get(date) ?? 0) + kcal);
        }
        for (const [date, value] of byDay) {
          recordSample(date, { date, caloriesActive: Math.round(value) });
        }
      }));
    }

    if (opts.metrics.includes('distanceMeters')) {
      tasks.push(this.readMetric('Distance', startTime, endTime, (records) => {
        const byDay = new Map<string, number>();
        for (const r of records) {
          const meters = r.distance?.inMeters;
          if (typeof meters !== 'number') continue;
          const date = isoToLocalDate(r.startTime);
          byDay.set(date, (byDay.get(date) ?? 0) + meters);
        }
        for (const [date, value] of byDay) {
          recordSample(date, { date, distanceMeters: Math.round(value) });
        }
      }));
    }

    await Promise.all(tasks);

    return Array.from(byDate.values()).filter(
      (s) => (s.steps ?? 0) > 0 || (s.caloriesActive ?? 0) > 0 || (s.distanceMeters ?? 0) > 0,
    );
  }

  // ── Internal helpers ───────────────────────────────────────────────

  private async readMetric(
    recordType: string,
    startTime: string,
    endTime: string,
    onRecords: (records: HCRecord[]) => void,
  ): Promise<void> {
    try {
      const result = await this.hc!.readRecords(recordType, {
        timeRangeFilter: { operator: 'between', startTime, endTime },
        ascendingOrder: true,
      });
      onRecords(result.records ?? []);
    } catch (err) {
      if (this.debugLogging) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[HealthConnectAdapter] read ${recordType} error:`, msg);
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoToLocalDate(iso: string): string {
  return formatLocalDate(new Date(iso));
}
