/**
 * Regression guard for the Health Connect READ path (root cause of
 * "physical Android not grabbing health data", 2026-07-13).
 *
 * The adapter used to gate readDailyAggregates() on a per-instance
 * `initialized` flag that only requestPermissions() set. Since the
 * createHealthAdapter() factory returns a FRESH instance per call site,
 * every reader saw the flag false and silently got [] — even right
 * after the user granted permissions. These tests pin the fixed
 * semantics:
 *
 *   1. A fresh instance reads WITHOUT any prior requestPermissions()
 *      call, lazily calling initialize() itself (grants persist at the
 *      OS level; the client just needs per-process init).
 *   2. Reads consult getGrantedPermissions() and only fetch record
 *      types the OS says are granted.
 *   3. No grants → empty result (and getGrantedMetrics() reports []).
 *
 * Own file so this mock shape doesn't disturb the other suites.
 */

jest.mock('react-native-health-connect', () => ({
  getSdkStatus: jest.fn(),
  initialize: jest.fn(),
  requestPermission: jest.fn(),
  getGrantedPermissions: jest.fn(),
  readRecords: jest.fn(),
  openHealthConnectSettings: jest.fn(),
  aggregateGroupByPeriod: jest.fn(),
  aggregateGroupByDuration: jest.fn(),
}));

import {
  initialize,
  getGrantedPermissions,
  readRecords,
  requestPermission,
  openHealthConnectSettings,
  aggregateGroupByPeriod,
  aggregateGroupByDuration,
} from 'react-native-health-connect';
import { HealthConnectAdapter } from './HealthConnectAdapter';

const mockInitialize = initialize as unknown as jest.Mock;
const mockGetGranted = getGrantedPermissions as unknown as jest.Mock;
const mockReadRecords = readRecords as unknown as jest.Mock;
const mockRequestPermission = requestPermission as unknown as jest.Mock;
const mockOpenSettings = openHealthConnectSettings as unknown as jest.Mock;
const mockAggregate = aggregateGroupByPeriod as unknown as jest.Mock;
const mockAggregateDuration = aggregateGroupByDuration as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HealthConnectAdapter.readDailyAggregates() — fresh-instance reads', () => {
  it('reads without a prior requestPermissions() call on the same instance', async () => {
    mockInitialize.mockResolvedValue(true);
    mockGetGranted.mockResolvedValue([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'Distance' },
    ]);
    mockAggregate.mockImplementation(async ({ recordType }: { recordType: string }) => {
      if (recordType === 'Steps') {
        return [
          {
            startTime: '2026-07-12T00:00:00',
            endTime: '2026-07-13T00:00:00',
            result: { COUNT_TOTAL: 4321 },
          },
        ];
      }
      return [];
    });

    // Fresh instance — exactly what createHealthAdapter() hands callers.
    const adapter = new HealthConnectAdapter({ debugLogging: false });
    const samples = await adapter.readDailyAggregates({
      startDate: '2026-07-10',
      endDate: '2026-07-13',
      metrics: ['steps', 'caloriesActive', 'distanceMeters'],
    });

    expect(mockInitialize).toHaveBeenCalledTimes(1); // lazy per-process init
    expect(samples.length).toBe(1);
    expect(samples[0].steps).toBe(4321);
    expect(samples[0].source).toBe('health_connect');
  });

  it('initializes the client once per instance across repeated reads', async () => {
    mockInitialize.mockResolvedValue(true);
    mockGetGranted.mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    mockAggregate.mockResolvedValue([]);

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    await adapter.readDailyAggregates({ startDate: '2026-07-12', endDate: '2026-07-13', metrics: ['steps'] });
    await adapter.readDailyAggregates({ startDate: '2026-07-12', endDate: '2026-07-13', metrics: ['steps'] });

    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it('only aggregates record types the OS reports as granted', async () => {
    mockInitialize.mockResolvedValue(true);
    // Steps granted; calories + distance NOT granted.
    mockGetGranted.mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    mockAggregate.mockResolvedValue([]);

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    await adapter.readDailyAggregates({
      startDate: '2026-07-10',
      endDate: '2026-07-13',
      metrics: ['steps', 'caloriesActive', 'distanceMeters'],
    });

    const aggTypes = mockAggregate.mock.calls.map((c) => c[0].recordType);
    expect(aggTypes).toEqual(['Steps']);
    expect(mockReadRecords).not.toHaveBeenCalled();
  });

  it('queries LOCAL-midnight INSTANTS (parseable by the native Instant.parse)', async () => {
    // Two regression guards in one (both device-confirmed 2026-07-13):
    //  - `${date}T00:00:00.000Z` (UTC midnight) ended "today" hours early
    //    west of UTC (6:59:59 PM Central) → evening records dropped.
    //  - Naive local strings throw in the library's native
    //    Instant.parse() → the aggregate call rejects and the raw
    //    fallback's overlap double-counting OVERcounts.
    // Correct: real instants for local midnight; the native side converts
    // to device-local LocalDateTime for day-aligned period groups.
    mockInitialize.mockResolvedValue(true);
    mockGetGranted.mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    mockAggregate.mockResolvedValue([]);

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    await adapter.readDailyAggregates({
      startDate: '2026-07-10',
      endDate: '2026-07-13',
      metrics: ['steps'],
    });

    const { timeRangeFilter, timeRangeSlicer } = mockAggregate.mock.calls[0][0];
    // Instant strings (Z-suffixed ISO) representing LOCAL midnights —
    // computed the same way here so the assertion is timezone-agnostic.
    expect(timeRangeFilter.startTime).toBe(new Date('2026-07-10T00:00:00').toISOString());
    expect(timeRangeFilter.endTime).toBe(new Date('2026-07-14T00:00:00').toISOString()); // exclusive day after endDate
    // Must parse as a real instant — the native layer runs Instant.parse().
    expect(Number.isNaN(Date.parse(timeRangeFilter.startTime))).toBe(false);
    expect(timeRangeFilter.startTime.endsWith('Z')).toBe(true);
    expect(timeRangeSlicer).toEqual({ period: 'DAYS', length: 1 });
  });

  it('buckets groups by the LOCAL date of the returned group start (naive LocalDateTime strings)', async () => {
    // The native side returns LocalDateTime.toString() ("2026-07-12T00:00",
    // no offset) for period groups — JS parses that as LOCAL time, which
    // is exactly the local day the group represents.
    mockInitialize.mockResolvedValue(true);
    mockGetGranted.mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    mockAggregate.mockResolvedValue([
      { startTime: '2026-07-12T00:00', endTime: '2026-07-13T00:00', result: { COUNT_TOTAL: 2735 } },
    ]);

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    const samples = await adapter.readDailyAggregates({
      startDate: '2026-07-10',
      endDate: '2026-07-13',
      metrics: ['steps'],
    });

    expect(samples).toEqual([
      expect.objectContaining({ date: '2026-07-12', steps: 2735 }),
    ]);
  });

  it('falls back to raw readRecords (with real instants) when BOTH aggregate tiers throw', async () => {
    mockInitialize.mockResolvedValue(true);
    mockGetGranted.mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    mockAggregate.mockRejectedValue(new Error('aggregate unsupported'));
    mockAggregateDuration.mockRejectedValue(new Error('duration unsupported'));
    mockReadRecords.mockResolvedValue({
      records: [
        { startTime: '2026-07-12T14:00:00.000Z', endTime: '2026-07-12T15:00:00.000Z', count: 777 },
      ],
    });

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    const samples = await adapter.readDailyAggregates({
      startDate: '2026-07-10',
      endDate: '2026-07-13',
      metrics: ['steps'],
    });

    expect(mockReadRecords).toHaveBeenCalledTimes(1);
    const fallbackFilter = mockReadRecords.mock.calls[0][1].timeRangeFilter;
    // Fallback uses REAL instants spanning the full local days.
    expect(new Date(fallbackFilter.startTime).getTime()).toBe(
      new Date('2026-07-10T00:00:00').getTime(),
    );
    expect(samples.length).toBe(1);
    expect(samples[0].steps).toBe(777);
  });

  it('records read diagnostics across the tier chain (period, duration, raw)', async () => {
    // Mirrors the on-device r61 finding: the library rejects the period
    // request for ActiveCalories/Distance ("Either use TimeRangeFilter
    // with LocalDateTime or AggregateGroupByDurationRequest") but its
    // DURATION variant uses the correct Instant contract — so distance
    // is served by tier 2, and only a double failure reaches raw.
    mockInitialize.mockResolvedValue(true);
    mockGetGranted.mockResolvedValue([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'Distance' },
    ]);
    mockAggregate.mockImplementation(async ({ recordType }: { recordType: string }) => {
      if (recordType === 'Steps') {
        return [
          { startTime: '2026-07-12T00:00', endTime: '2026-07-13T00:00', result: { COUNT_TOTAL: 100 } },
        ];
      }
      throw new Error('Either use TimeRangeFilter with LocalDateTime or AggregateGroupByDurationRequest');
    });
    mockAggregateDuration.mockImplementation(async ({ recordType }: { recordType: string }) => {
      if (recordType === 'Distance') {
        return [
          {
            startTime: new Date('2026-07-12T00:00:00').toISOString(),
            endTime: new Date('2026-07-13T00:00:00').toISOString(),
            result: { DISTANCE: { inMeters: 2100 } },
          },
        ];
      }
      throw new Error('duration also failed');
    });
    mockReadRecords.mockResolvedValue({ records: [] });

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    const samples = await adapter.readDailyAggregates({
      startDate: '2026-07-10',
      endDate: '2026-07-13',
      metrics: ['steps', 'caloriesActive', 'distanceMeters'],
    });

    const diag = adapter.getReadDiagnostics();
    expect(diag?.metrics.steps).toMatchObject({ path: 'aggregate', days: 1 });
    expect(diag?.metrics.distanceMeters).toMatchObject({ path: 'aggregate-duration', days: 1 });
    expect(diag?.metrics.distanceMeters?.aggregateError).toContain('LocalDateTime');
    expect(diag?.metrics.caloriesActive).toMatchObject({ path: 'raw-fallback', days: 0 });
    expect(diag?.window.start.endsWith('Z')).toBe(true);

    const distanceSample = samples.find((s) => s.date === '2026-07-12');
    expect(distanceSample?.distanceMeters).toBe(2100);
  });

  it('returns [] when NO permissions are granted (never throws)', async () => {
    mockInitialize.mockResolvedValue(true);
    mockGetGranted.mockResolvedValue([]);

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    const samples = await adapter.readDailyAggregates({
      startDate: '2026-07-10',
      endDate: '2026-07-13',
      metrics: ['steps'],
    });

    expect(samples).toEqual([]);
    expect(mockReadRecords).not.toHaveBeenCalled();
    expect(mockAggregate).not.toHaveBeenCalled();
    expect(await adapter.getGrantedMetrics()).toEqual([]);
  });

  it('returns [] when the client fails to initialize', async () => {
    mockInitialize.mockResolvedValue(false);

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    const samples = await adapter.readDailyAggregates({
      startDate: '2026-07-10',
      endDate: '2026-07-13',
      metrics: ['steps'],
    });

    expect(samples).toEqual([]);
    expect(mockReadRecords).not.toHaveBeenCalled();
  });

  it('requestPermissions() short-circuits on pre-granted permissions WITHOUT launching the contract', async () => {
    // Health Connect rate-limits its permission dialog: after ~2 denials
    // the contract auto-resolves EMPTY with no UI. If the user granted
    // manually in HC settings (the recovery path), relaunching the
    // contract would falsely report "nothing granted".
    mockInitialize.mockResolvedValue(true);
    mockGetGranted.mockResolvedValue([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'Distance' },
    ]);

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    const result = await adapter.requestPermissions(['steps', 'caloriesActive', 'distanceMeters']);

    expect(result.granted).toBe(true);
    expect(result.metrics).toEqual(['steps', 'caloriesActive', 'distanceMeters']);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('requestPermissions() trusts the post-contract OS grant state over the contract return', async () => {
    // Rate-limited contract returns [] — but the user granted manually
    // while the app was backgrounded, so getGrantedPermissions has them.
    mockInitialize.mockResolvedValue(true);
    mockGetGranted
      .mockResolvedValueOnce([]) // pre-check: nothing yet
      .mockResolvedValueOnce([{ accessType: 'read', recordType: 'Steps' }]); // post-check
    mockRequestPermission.mockResolvedValue([]);

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    const result = await adapter.requestPermissions(['steps']);

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    expect(result.granted).toBe(true);
    expect(result.metrics).toEqual(['steps']);
  });

  it('requestPermissions() only requests the metrics that are still missing', async () => {
    mockInitialize.mockResolvedValue(true);
    mockGetGranted
      .mockResolvedValueOnce([{ accessType: 'read', recordType: 'Steps' }])
      .mockResolvedValueOnce([
        { accessType: 'read', recordType: 'Steps' },
        { accessType: 'read', recordType: 'Distance' },
      ]);
    mockRequestPermission.mockResolvedValue([]);

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    const result = await adapter.requestPermissions(['steps', 'distanceMeters']);

    expect(mockRequestPermission).toHaveBeenCalledWith([
      { accessType: 'read', recordType: 'Distance' },
    ]);
    expect(result.granted).toBe(true);
    expect(result.metrics).toEqual(['steps', 'distanceMeters']);
  });

  it('requestPermissions() reports not-granted when the contract resolves empty and no grants exist', async () => {
    mockInitialize.mockResolvedValue(true);
    mockGetGranted.mockResolvedValue([]);
    mockRequestPermission.mockResolvedValue([]);

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    const result = await adapter.requestPermissions(['steps']);

    expect(result).toEqual({ granted: false, metrics: [] });
  });

  it('openHealthSettings() opens the Health Connect settings surface', async () => {
    const adapter = new HealthConnectAdapter({ debugLogging: false });
    expect(await adapter.openHealthSettings()).toBe(true);
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('getGrantedMetrics() maps granted record types back to HealthMetric names', async () => {
    mockInitialize.mockResolvedValue(true);
    mockGetGranted.mockResolvedValue([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'Distance' },
      { accessType: 'write', recordType: 'ActiveCaloriesBurned' }, // write ≠ read grant
    ]);

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    expect(await adapter.getGrantedMetrics()).toEqual(['steps', 'distanceMeters']);
  });
});
