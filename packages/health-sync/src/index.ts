/**
 * @genoly/health-sync — adapter interfaces for reading daily health
 * aggregates from the device's native health store.
 *
 * Forkability rule (from genoly-mobile/memory-bank/systemPatterns.md):
 * ALL health-reading code lives in this package. Screen components must
 * never import HealthKit / Health Connect symbols directly — they only
 * see the platform-agnostic interfaces defined here.
 *
 * Phase 0 status: interfaces only. Implementations (HealthKitAdapter,
 * HealthConnectAdapter) land in Phase 1 alongside the corresponding
 * native module wiring.
 */

import type { HealthEntryUpload, Platform } from '@genoly/types';

/**
 * Subset of the daily-sync upload shape that mobile actually reads from
 * the native health store. The server adds `dateUtcStart` from the user's
 * timezone in the api-client layer, so adapters don't compute it.
 */
export type HealthSample = Pick<
  HealthEntryUpload,
  'date' | 'steps' | 'caloriesActive' | 'source'
> & {
  caloriesBasal?: number;
  distanceMeters?: number;
};

export type HealthMetric = 'steps' | 'caloriesActive' | 'caloriesBasal' | 'distanceMeters';

/**
 * Permission state returned from the platform's permission dialog flow.
 * `granted` is true only if the user granted at least one of the requested
 * metrics. `metrics` lists exactly which were granted (callers should
 * gracefully handle partial grants — e.g. user grants steps but denies
 * calories).
 */
export interface HealthAdapterPermissionState {
  granted: boolean;
  metrics: HealthMetric[];
}

/**
 * Platform-agnostic interface for reading daily health aggregates.
 * Implementations:
 *   - HealthKitAdapter (iOS)        → react-native-health under the hood
 *   - HealthConnectAdapter (Android) → react-native-health-connect
 *
 * Both adapters MUST return rolled-up DAILY aggregates only — never raw
 * event-level data (per the daily-aggregate principle in techStack.md).
 */
export interface HealthAdapter {
  /**
   * Returns the current platform name, used for FitnessDevice.platform
   * and for source tagging.
   */
  getPlatform(): Platform;

  /**
   * Whether the platform's health store is available on this device.
   * iOS simulators always return false; Android Health Connect requires
   * Android 9+ and may need installation on older devices.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Request user permission to read the named metrics. Idempotent —
   * calling twice does not re-prompt if already granted.
   */
  requestPermissions(metrics: HealthMetric[]): Promise<HealthAdapterPermissionState>;

  /**
   * Read daily aggregates for the inclusive `[startDate, endDate]` range.
   * Both bounds are ISO YYYY-MM-DD in the user's local timezone. The
   * adapter is responsible for translating to the platform's native
   * date/time API.
   *
   * Sparse semantics: if a date has no recorded data, the adapter MUST
   * omit the entry entirely (not return a zero-filled row). Callers fill
   * with zeros at the UI layer.
   *
   * The returned `source` field reflects the platform: 'healthkit' on
   * iOS, 'health_connect' on Android. 'manual' is reserved for entries
   * the user enters by hand (a future feature; not produced by adapters).
   */
  readDailyAggregates(opts: {
    startDate: string; // YYYY-MM-DD inclusive
    endDate: string; // YYYY-MM-DD inclusive
    metrics: HealthMetric[];
  }): Promise<HealthSample[]>;
}

/**
 * Construction-time options shared by all adapter implementations.
 * Phase 1 will add adapter-specific options (e.g., HealthKitAdapter may
 * accept a `unit` preference for energy: 'kcal' | 'kJ').
 */
export interface HealthAdapterOptions {
  /**
   * If true, the adapter logs sample counts (not values) at sync time.
   * Defaults to false in production builds; true in development.
   */
  debugLogging?: boolean;
}

// ── Concrete adapters ──────────────────────────────────────────────────

import { HealthKitAdapter } from './HealthKitAdapter';
import { HealthConnectAdapter } from './HealthConnectAdapter';
import { MockHealthAdapter } from './MockHealthAdapter';

export { HealthKitAdapter, HealthConnectAdapter, MockHealthAdapter };
export type { MockHealthAdapterOptions } from './MockHealthAdapter';

/**
 * Platform-routing factory. Returns the right HealthAdapter for the
 * current platform — HealthKitAdapter on iOS, HealthConnectAdapter on
 * Android, MockHealthAdapter (empty) elsewhere (web, tests).
 *
 * Use this in `apps/mobile/utils/healthSync.ts` (or equivalent) rather
 * than newing up specific adapters at call sites. That preserves the
 * forkability rule — only this file imports the platform-specific
 * adapter classes.
 *
 * NOTE: this function imports `react-native`'s Platform symbol lazily
 * (inside the function body) so the package can be imported from Node
 * test environments without the React Native runtime present. Jest tests
 * that don't go through this factory remain platform-pure.
 */
export function createHealthAdapter(options: HealthAdapterOptions = {}): HealthAdapter {
  let os: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- REASON: lazy require to keep this package usable in Node test environments.
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    os = Platform.OS;
  } catch {
    // No react-native (Node test env) — return the mock so callers can
    // still construct an adapter without crashing.
    return new MockHealthAdapter({ available: false });
  }

  if (os === 'ios') {
    return new HealthKitAdapter(options);
  }
  if (os === 'android') {
    return new HealthConnectAdapter(options);
  }
  // Web, Windows, macOS — no native health store. Return an unavailable mock.
  return new MockHealthAdapter({ available: false });
}
