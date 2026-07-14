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

import type {
  HealthAdapter,
  HealthAdapterOptions,
  HealthAdapterPermissionState,
  HealthMetric,
  HealthReadDiagnostics,
  HealthSample,
} from './index';

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
  getGrantedPermissions(): Promise<Array<{ accessType: string; recordType: string }>>;
  openHealthConnectSettings(): void;
  readRecords(
    recordType: string,
    options: {
      timeRangeFilter: { operator: 'between'; startTime: string; endTime: string };
      ascendingOrder?: boolean;
    },
  ): Promise<{ records: HCRecord[] }>;
  aggregateGroupByPeriod(request: {
    recordType: string;
    timeRangeFilter: { operator: 'between'; startTime: string; endTime: string };
    timeRangeSlicer: { period: 'DAYS'; length: number };
  }): Promise<HCAggregateGroup[]>;
  aggregateGroupByDuration(request: {
    recordType: string;
    timeRangeFilter: { operator: 'between'; startTime: string; endTime: string };
    timeRangeSlicer: { duration: 'DAYS'; length: number };
  }): Promise<HCAggregateGroup[]>;
}

interface HCAggregateGroup {
  startTime: string;
  endTime: string;
  result: {
    COUNT_TOTAL?: number; // Steps
    ACTIVE_CALORIES_TOTAL?: { inKilocalories: number };
    DISTANCE?: { inMeters: number };
  };
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
  /**
   * Whether the Health Connect CLIENT has been initialized in THIS
   * process. This is NOT permission state — grants persist at the OS
   * level across app restarts and are queried per-read via
   * getGrantedPermissions(). The client, by contrast, must be
   * initialize()d once per process before any read/request call.
   *
   * The prior code treated this flag as "permissions were granted via
   * THIS instance" and gated readDailyAggregates() on it — but the
   * factory returns a fresh instance per call site, so the flag was
   * false for every reader and all reads silently returned []. Reads
   * now lazily initialize instead (root-caused 2026-07-13).
   */
  private initialized: boolean = false;
  private lastReadDiagnostics: HealthReadDiagnostics | null = null;

  constructor(options: HealthAdapterOptions = {}) {
    this.hc = loadNativeModule();
    this.debugLogging = options.debugLogging ?? (typeof __DEV__ !== 'undefined' && __DEV__);
  }

  getReadDiagnostics(): HealthReadDiagnostics | null {
    return this.lastReadDiagnostics;
  }

  /** Initialize the Health Connect client once per process. */
  private async ensureInitialized(): Promise<boolean> {
    if (!this.hc) return false;
    if (this.initialized) return true;
    try {
      const ok = await this.hc.initialize();
      if (!ok && this.debugLogging) {
        console.warn('[HealthConnectAdapter] initialize returned false');
      }
      this.initialized = ok;
      return ok;
    } catch (err) {
      if (this.debugLogging) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[HealthConnectAdapter] initialize error:', msg);
      }
      return false;
    }
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
      const ok = await this.ensureInitialized();
      if (!ok) {
        return { granted: false, metrics: [] };
      }

      // 2. Check what the OS already reports as granted. Health Connect
      // rate-limits its permission contract (after ~2 denials it
      // auto-resolves EMPTY without showing any UI), so if the user
      // granted manually in Health Connect settings — the recovery path
      // we point them to — launching the contract again would report
      // "nothing granted" even though everything is. Grants are the
      // source of truth; the contract is only for what's missing.
      const preGranted = (await this.getGrantedMetrics()) ?? [];
      const missing = metrics.filter((m) => !preGranted.includes(m));
      if (missing.length === 0) {
        return { granted: true, metrics: metrics.filter((m) => preGranted.includes(m)) };
      }

      // 3. Translate the still-missing metrics to permission objects and
      // request them.
      const permissions = missing
        .map((m) => METRIC_TO_HC_RECORD_TYPE[m])
        .filter(Boolean)
        .map((recordType) => ({ accessType: 'read' as const, recordType }));

      await this.hc.requestPermission(permissions);

      // 4. Re-read the OS grant state rather than trusting the contract's
      // return value (it reports [] when rate-limited even if grants
      // exist).
      const postGranted = (await this.getGrantedMetrics()) ?? [];
      const grantedMetrics = metrics.filter((m) => postGranted.includes(m));

      return { granted: grantedMetrics.length > 0, metrics: grantedMetrics };
    } catch (err) {
      if (this.debugLogging) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[HealthConnectAdapter] requestPermissions error:', msg);
      }
      return { granted: false, metrics: [] };
    }
  }

  /**
   * Open the system Health Connect settings screen — the manual-grant
   * recovery path once the permission contract has hit Health Connect's
   * ask-rate-limit (it then auto-resolves empty with no UI).
   */
  async openHealthSettings(): Promise<boolean> {
    if (!this.hc) return false;
    try {
      this.hc.openHealthConnectSettings();
      return true;
    } catch (err) {
      if (this.debugLogging) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[HealthConnectAdapter] openHealthConnectSettings error:', msg);
      }
      return false;
    }
  }

  /**
   * Map raw permission objects (from requestPermission /
   * getGrantedPermissions) back to our HealthMetric enum, read-access
   * entries only.
   */
  private toGrantedMetrics(raw: Array<{ accessType: string; recordType: string }>): HealthMetric[] {
    const grantedMetrics: HealthMetric[] = [];
    for (const granted of raw) {
      if (granted.accessType !== 'read') continue;
      const reverseEntry = Object.entries(METRIC_TO_HC_RECORD_TYPE).find(
        ([_, rt]) => rt === granted.recordType,
      );
      if (reverseEntry) grantedMetrics.push(reverseEntry[0] as HealthMetric);
    }
    return grantedMetrics;
  }

  /**
   * Metrics the OS reports as currently granted for read. Grants persist
   * across app restarts, so this — not any in-process flag — is the
   * source of truth for "can we read?".
   */
  async getGrantedMetrics(): Promise<HealthMetric[] | null> {
    if (!(await this.ensureInitialized())) return [];
    try {
      const granted = await this.hc!.getGrantedPermissions();
      return this.toGrantedMetrics(granted);
    } catch (err) {
      if (this.debugLogging) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[HealthConnectAdapter] getGrantedPermissions error:', msg);
      }
      return [];
    }
  }

  async readDailyAggregates(opts: {
    startDate: string;
    endDate: string;
    metrics: HealthMetric[];
  }): Promise<HealthSample[]> {
    if (!(await this.ensureInitialized())) return [];

    // Only read record types the OS says we hold a grant for — reading
    // an ungranted type throws a SecurityException per call, which the
    // per-metric catch would silently swallow into an empty result.
    const grantedMetrics = await this.getGrantedMetrics();
    const readableMetrics = opts.metrics.filter((m) => grantedMetrics?.includes(m));
    if (readableMetrics.length === 0) {
      if (this.debugLogging) {
        console.warn(
          `[HealthConnectAdapter] no granted permissions for requested metrics (${opts.metrics.join(', ')}) — returning empty`,
        );
      }
      return [];
    }

    // LOCAL day boundaries, expressed as INSTANTS. Two prior failure
    // modes, both device-confirmed on the operator's Samsung 2026-07-13:
    //  1. `${localDate}T00:00:00.000Z` (UTC midnight) — west of UTC that
    //     window ends before the local day does (6:59:59 PM Central),
    //     silently dropping every evening record (undercount).
    //  2. Naive local strings ("...T00:00:00", no offset) — the library's
    //     native layer runs Instant.parse() on BOTH filter variants
    //     (HealthConnectUtils.kt getTimeRangeFilter/getTimeRangeFilterLocal),
    //     so a naive string throws DateTimeParseException, the aggregate
    //     call rejects, and the raw fallback's overlap double-counting
    //     produced an OVERcount.
    // Correct contract: real instants for local midnight. For the
    // aggregate API the native side converts them to device-local
    // LocalDateTime, so period groups align exactly to local days.
    const endExclusive = new Date(`${opts.endDate}T00:00:00`);
    endExclusive.setDate(endExclusive.getDate() + 1);
    const startInstant = new Date(`${opts.startDate}T00:00:00`).toISOString();
    const endInstantExclusive = endExclusive.toISOString();
    const endInstant = new Date(endExclusive.getTime() - 1).toISOString();

    const byDate = new Map<string, HealthSample>();
    const todayLocal = formatLocalDate(new Date());

    const diag: HealthReadDiagnostics = {
      window: { start: startInstant, end: endInstantExclusive },
      metrics: {},
    };
    this.lastReadDiagnostics = diag;

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

    // Primary path: Health Connect's own aggregation, which DEDUPLICATES
    // overlapping records across sources (raw-record summing
    // double-counts) and matches what the source apps display. THREE
    // tiers, because react-native-health-connect builds the
    // period-aggregate request INCONSISTENTLY per record type (Steps
    // passes a LocalDateTime filter as the SDK requires; ActiveCalories/
    // Distance pass an Instant filter, which the SDK rejects with
    // "Either use TimeRangeFilter with LocalDateTime or
    // AggregateGroupByDurationRequest" — device-confirmed via the r61
    // diagnostics, 2026-07-13):
    //   1. aggregateGroupByPeriod  — calendar local days (DST-proof)
    //   2. aggregateGroupByDuration — 24h buckets anchored at local
    //      midnight (Instant filter is the CORRECT contract here; only
    //      drifts on the two DST-change days a year)
    //   3. raw readRecords summing — last resort, may double-count
    //      overlapping records.
    const applyGroups = (
      groups: HCAggregateGroup[],
      extract: (result: HCAggregateGroup['result']) => number | undefined,
      apply: (date: string, value: number) => void,
    ): number => {
      let days = 0;
      for (const group of groups) {
        const value = extract(group.result ?? {});
        if (typeof value !== 'number' || value <= 0) continue;
        days++;
        apply(isoToLocalDate(group.startTime), Math.round(value));
      }
      return days;
    };

    const aggregateDaily = async (
      metric: HealthMetric,
      recordType: string,
      extract: (result: HCAggregateGroup['result']) => number | undefined,
      apply: (date: string, value: number) => void,
    ): Promise<void> => {
      const timeRangeFilter = {
        operator: 'between' as const,
        startTime: startInstant,
        endTime: endInstantExclusive,
      };
      try {
        const groups = await this.hc!.aggregateGroupByPeriod({
          recordType,
          timeRangeFilter,
          timeRangeSlicer: { period: 'DAYS', length: 1 },
        });
        diag.metrics[metric] = { path: 'aggregate', days: applyGroups(groups, extract, apply) };
      } catch (periodErr) {
        const groups = await this.hc!.aggregateGroupByDuration({
          recordType,
          timeRangeFilter,
          timeRangeSlicer: { duration: 'DAYS', length: 1 },
        });
        diag.metrics[metric] = {
          path: 'aggregate-duration',
          days: applyGroups(groups, extract, apply),
          aggregateError: periodErr instanceof Error ? periodErr.message : String(periodErr),
        };
      }
    };

    /** Record the last-resort outcome (both aggregate tiers threw). */
    const noteFallback = (metric: HealthMetric, err: unknown, days: number) => {
      diag.metrics[metric] = {
        path: 'raw-fallback',
        days,
        aggregateError: err instanceof Error ? err.message : String(err),
      };
    };

    const tasks: Array<Promise<void>> = [];

    if (readableMetrics.includes('steps')) {
      tasks.push(
        aggregateDaily(
          'steps',
          'Steps',
          (r) => r.COUNT_TOTAL,
          (date, value) => recordSample(date, { date, steps: value }),
        ).catch((err) =>
          this.readMetric('Steps', startInstant, endInstant, (records) => {
            // Fallback: sum raw records by start-of-record's local day.
            const byDay = new Map<string, number>();
            for (const r of records) {
              if (typeof r.count !== 'number') continue;
              const date = isoToLocalDate(r.startTime);
              byDay.set(date, (byDay.get(date) ?? 0) + r.count);
            }
            for (const [date, value] of byDay) {
              recordSample(date, { date, steps: Math.round(value) });
            }
            noteFallback('steps', err, byDay.size);
          }),
        ),
      );
    }

    if (readableMetrics.includes('caloriesActive')) {
      tasks.push(
        aggregateDaily(
          'caloriesActive',
          'ActiveCaloriesBurned',
          (r) => r.ACTIVE_CALORIES_TOTAL?.inKilocalories,
          (date, value) => recordSample(date, { date, caloriesActive: value }),
        ).catch((err) =>
          this.readMetric('ActiveCaloriesBurned', startInstant, endInstant, (records) => {
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
            noteFallback('caloriesActive', err, byDay.size);
          }),
        ),
      );
    }

    if (readableMetrics.includes('distanceMeters')) {
      tasks.push(
        aggregateDaily(
          'distanceMeters',
          'Distance',
          (r) => r.DISTANCE?.inMeters,
          (date, value) => recordSample(date, { date, distanceMeters: value }),
        ).catch((err) =>
          this.readMetric('Distance', startInstant, endInstant, (records) => {
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
            noteFallback('distanceMeters', err, byDay.size);
          }),
        ),
      );
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
