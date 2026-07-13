/**
 * HealthKitAdapter — iOS implementation of the HealthAdapter interface.
 *
 * Wraps `react-native-health` (the de-facto RN HealthKit binding) and
 * exposes the same platform-agnostic surface as HealthConnectAdapter so
 * screens and the sync queue don't have to special-case platforms.
 *
 * Forkability constraint (per packages/health-sync/src/index.ts header):
 * this is the ONLY file in the codebase that may import from
 * `react-native-health`. Everything else routes through the HealthAdapter
 * interface.
 *
 * Native module loading:
 *   - `require('react-native-health')` is wrapped in try/catch so the
 *     package compiles + tests run in Node (Jest) and in non-iOS Expo
 *     environments. Without the module, every method falls back to a
 *     "platform unavailable" state (isAvailable() returns false, reads
 *     return empty arrays, permissions return granted=false).
 *
 * Architecture references:
 *   - mobile-sync-architecture.md §4 — permission flow
 *   - mobile-sync-architecture.md §9 — clock-drift defense (we snap dates
 *     to local midnight and ignore future-dated samples)
 *   - mobile-sync-architecture.md §10 — sparse semantics (omit empty days,
 *     never zero-fill)
 */

import type { HealthAdapter, HealthAdapterOptions, HealthAdapterPermissionState, HealthMetric, HealthSample } from './index';

// ── Native module loading (defensive) ────────────────────────────────

// Minimal typed surface of `react-native-health`. Defined as a local
// interface rather than imported because the package may not be
// resolvable at test/SSR time.
interface RNHealthKit {
  initHealthKit(
    options: { permissions: { read: string[]; write: string[] } },
    callback: (error: string | null, result: unknown) => void,
  ): void;
  Constants: {
    Permissions: Record<string, string>;
  };
  getDailyStepCountSamples(
    options: { startDate: string; endDate: string; ascending?: boolean },
    callback: (err: string | null, results: Array<{ startDate: string; endDate: string; value: number }>) => void,
  ): void;
  getActiveEnergyBurned(
    options: { startDate: string; endDate: string; ascending?: boolean },
    callback: (err: string | null, results: Array<{ startDate: string; endDate: string; value: number }>) => void,
  ): void;
  getDailyDistanceWalkingRunningSamples(
    options: { startDate: string; endDate: string; ascending?: boolean; unit?: string },
    callback: (err: string | null, results: Array<{ startDate: string; endDate: string; value: number }>) => void,
  ): void;
}

function loadNativeModule(): RNHealthKit | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- REASON: native module must be resolved synchronously; dynamic import races with React Native's bridge init.
    const mod = require('react-native-health');
    // The default export may be the module itself OR live under `.default`
    // depending on the version. Try both.
    const jsModule = (mod?.default ?? mod) as RNHealthKit;

    // RN 0.85 bridgeless: the NativeModules interop proxy exposes native
    // methods as LAZY, NON-ENUMERABLE properties. react-native-health's
    // index.js does `Object.assign({}, AppleHealthKit, { Constants })`,
    // which copies own-enumerable props only — so under the new
    // architecture its export carries ONLY `Constants`; every method is
    // undefined ("undefined is not a function" at initHealthKit; diagnosed
    // on-device 2026-07-10). Direct property access on the proxy works
    // fine, so when the JS module lost its methods, delegate method lookups
    // to the NativeModules proxy and keep Constants from the pure-JS side.
    if (typeof jsModule?.initHealthKit !== 'function') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- REASON: same synchronous-resolution constraint as above.
      const native = require('react-native').NativeModules?.AppleHealthKit;
      if (native && typeof native.initHealthKit === 'function') {
        return new Proxy(native, {
          get(target, prop, receiver) {
            if (prop === 'Constants') return jsModule?.Constants;
            return Reflect.get(target, prop, receiver);
          },
        }) as RNHealthKit;
      }
    }
    return jsModule;
  } catch {
    return null;
  }
}

// ── Metric-to-HealthKit-identifier map ───────────────────────────────

// We map our internal HealthMetric enum to react-native-health's
// permission constant strings. The library re-exports HealthKit's
// HK*TypeIdentifier values via `Constants.Permissions`.
//
// Note: `caloriesBasal` (BasalEnergyBurned) is supported but not in
// tonight's permission scope (Shankar approved Steps + ActiveEnergy +
// Distance only — see 2026-05-28 Step 4 brief).
const METRIC_TO_HK_PERMISSION: Record<HealthMetric, string> = {
  steps: 'Steps',
  caloriesActive: 'ActiveEnergyBurned',
  caloriesBasal: 'BasalEnergyBurned',
  distanceMeters: 'DistanceWalkingRunning',
};

// ── Adapter implementation ───────────────────────────────────────────

export class HealthKitAdapter implements HealthAdapter {
  private hk: RNHealthKit | null;
  private debugLogging: boolean;
  /**
   * Whether initHealthKit has succeeded in THIS process. HealthKit
   * authorization persists at the OS level across app restarts, but the
   * library requires an initHealthKit() call per process before reads
   * work. The prior code only set this from requestPermissions() — and
   * since the factory returns a fresh instance per call site, every
   * reader saw `false` and silently got [] back. Reads now lazily
   * re-init (no re-prompt for already-determined permissions —
   * HealthKit only prompts for undetermined ones).
   */
  private initialized: boolean = false;

  constructor(options: HealthAdapterOptions = {}) {
    this.hk = loadNativeModule();
    this.debugLogging = options.debugLogging ?? (typeof __DEV__ !== 'undefined' && __DEV__);
  }

  getPlatform(): 'ios' {
    return 'ios';
  }

  async isAvailable(): Promise<boolean> {
    // HealthKit is unavailable on iPad (some models) and iOS simulator.
    // The native module returns an error from initHealthKit in those
    // cases — but probing here without permissions first would prompt
    // the user. Best signal we have without prompting: native module
    // resolved AND we're not in Node (which the require() catch handles).
    return this.hk !== null;
  }

  async requestPermissions(metrics: HealthMetric[]): Promise<HealthAdapterPermissionState> {
    if (!this.hk) {
      return { granted: false, metrics: [] };
    }

    const permissionStrings = metrics.map((m) => METRIC_TO_HK_PERMISSION[m]).filter(Boolean);

    if (permissionStrings.length === 0) {
      return { granted: false, metrics: [] };
    }

    // Translate to the constant identifiers the library actually uses.
    // Constants.Permissions is a dictionary of human-readable name → HK identifier.
    const readPermissions = permissionStrings
      .map((p) => this.hk?.Constants?.Permissions?.[p])
      .filter((p): p is string => typeof p === 'string');

    if (readPermissions.length === 0) {
      // The constants weren't loadable — likely because the native
      // module link is broken. Surface as not-granted rather than crash.
      if (this.debugLogging) {
        // No token values to leak here; safe to log.
        console.warn('[HealthKitAdapter] Constants.Permissions empty; treating as unavailable');
      }
      return { granted: false, metrics: [] };
    }

    return new Promise<HealthAdapterPermissionState>((resolve) => {
      this.hk!.initHealthKit(
        { permissions: { read: readPermissions, write: [] } },
        (error) => {
          if (error) {
            if (this.debugLogging) {
              console.warn('[HealthKitAdapter] initHealthKit error:', error);
            }
            resolve({ granted: false, metrics: [] });
            return;
          }
          this.initialized = true;
          // HealthKit's permission API is asymmetric — it tells you the
          // user saw the dialog but NOT which permissions they actually
          // granted (Apple's privacy-by-obscurity). The standard
          // workaround is to attempt a read and see if it succeeds. For
          // Phase 1 we trust the dialog response and treat all requested
          // metrics as granted; per-metric verification can land in
          // Phase 1.5 if needed.
          resolve({ granted: true, metrics });
        },
      );
    });
  }

  /**
   * Ensure initHealthKit has run in this process for the given metrics.
   * Safe to call repeatedly; iOS only shows the permission sheet for
   * permissions the user hasn't already resolved.
   */
  private async ensureInitialized(metrics: HealthMetric[]): Promise<boolean> {
    if (this.initialized) return true;
    if (!this.hk) return false;

    const readPermissions = metrics
      .map((m) => METRIC_TO_HK_PERMISSION[m])
      .filter(Boolean)
      .map((p) => this.hk?.Constants?.Permissions?.[p])
      .filter((p): p is string => typeof p === 'string');

    if (readPermissions.length === 0) return false;

    return new Promise<boolean>((resolve) => {
      this.hk!.initHealthKit({ permissions: { read: readPermissions, write: [] } }, (error) => {
        if (error) {
          if (this.debugLogging) {
            console.warn('[HealthKitAdapter] lazy initHealthKit error:', error);
          }
          resolve(false);
          return;
        }
        this.initialized = true;
        resolve(true);
      });
    });
  }

  /**
   * Best effort on iOS: open the Health app (read-authorization lives
   * under Health → Sharing → Apps). There is no deep link straight to
   * the app's sharing page.
   */
  async openHealthSettings(): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- REASON: lazy require keeps this module importable in Node tests.
      const { Linking } = require('react-native') as {
        Linking: { openURL(url: string): Promise<unknown> };
      };
      await Linking.openURL('x-apple-health://');
      return true;
    } catch {
      return false;
    }
  }

  async readDailyAggregates(opts: {
    startDate: string;
    endDate: string;
    metrics: HealthMetric[];
  }): Promise<HealthSample[]> {
    if (!(await this.ensureInitialized(opts.metrics))) {
      if (this.debugLogging) {
        console.warn('[HealthKitAdapter] not initialized and lazy init failed — returning empty');
      }
      return [];
    }

    // HealthKit accepts ISO 8601 timestamps. We convert YYYY-MM-DD bounds
    // to local-midnight ISO strings — the start at 00:00, the end at
    // 23:59:59.999 of the end day.
    const startIso = `${opts.startDate}T00:00:00.000`;
    const endIso = `${opts.endDate}T23:59:59.999`;

    // Per-metric reads, then merge by `date`. Each metric is a separate
    // HealthKit call because the library doesn't expose a combined-read
    // entry point.
    const byDate = new Map<string, HealthSample>();
    const todayLocal = formatLocalDate(new Date()); // for clock-drift filter

    function recordSample(date: string, partial: Partial<HealthSample>) {
      // Clock-drift defense: ignore samples with dates AFTER today (local).
      // This catches devices whose system clock jumped forward.
      if (date > todayLocal) return;
      const existing = byDate.get(date) ?? {
        date,
        source: 'healthkit' as const,
        steps: 0,
        caloriesActive: 0,
      };
      byDate.set(date, { ...existing, ...partial });
    }

    const tasks: Array<Promise<void>> = [];

    if (opts.metrics.includes('steps')) {
      tasks.push(
        new Promise<void>((resolve) => {
          this.hk!.getDailyStepCountSamples(
            { startDate: startIso, endDate: endIso, ascending: true },
            (err, results) => {
              if (err) {
                if (this.debugLogging) console.warn('[HealthKitAdapter] steps read error:', err);
                resolve();
                return;
              }
              for (const r of results ?? []) {
                const date = isoToLocalDate(r.startDate);
                recordSample(date, { date, steps: Math.round(r.value) });
              }
              resolve();
            },
          );
        }),
      );
    }

    if (opts.metrics.includes('caloriesActive')) {
      tasks.push(
        new Promise<void>((resolve) => {
          this.hk!.getActiveEnergyBurned(
            { startDate: startIso, endDate: endIso, ascending: true },
            (err, results) => {
              if (err) {
                if (this.debugLogging) console.warn('[HealthKitAdapter] caloriesActive read error:', err);
                resolve();
                return;
              }
              // HealthKit returns kcal by default for ActiveEnergyBurned.
              // Aggregate by local-day since the library returns per-sample
              // results not per-day buckets.
              const byDay = new Map<string, number>();
              for (const r of results ?? []) {
                const date = isoToLocalDate(r.startDate);
                byDay.set(date, (byDay.get(date) ?? 0) + r.value);
              }
              for (const [date, value] of byDay) {
                recordSample(date, { date, caloriesActive: Math.round(value) });
              }
              resolve();
            },
          );
        }),
      );
    }

    if (opts.metrics.includes('distanceMeters')) {
      tasks.push(
        new Promise<void>((resolve) => {
          this.hk!.getDailyDistanceWalkingRunningSamples(
            { startDate: startIso, endDate: endIso, ascending: true, unit: 'meter' },
            (err, results) => {
              if (err) {
                if (this.debugLogging) console.warn('[HealthKitAdapter] distance read error:', err);
                resolve();
                return;
              }
              for (const r of results ?? []) {
                const date = isoToLocalDate(r.startDate);
                recordSample(date, { date, distanceMeters: Math.round(r.value) });
              }
              resolve();
            },
          );
        }),
      );
    }

    await Promise.all(tasks);

    // Sparse semantics — only return entries with at least one non-zero metric.
    return Array.from(byDate.values()).filter(
      (s) => (s.steps ?? 0) > 0 || (s.caloriesActive ?? 0) > 0 || (s.distanceMeters ?? 0) > 0,
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Format a Date object as YYYY-MM-DD in the user's local timezone. */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a HealthKit ISO timestamp and return the local-date YYYY-MM-DD. */
function isoToLocalDate(iso: string): string {
  return formatLocalDate(new Date(iso));
}
