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
}));

import {
  initialize,
  getGrantedPermissions,
  readRecords,
  requestPermission,
  openHealthConnectSettings,
} from 'react-native-health-connect';
import { HealthConnectAdapter } from './HealthConnectAdapter';

const mockInitialize = initialize as unknown as jest.Mock;
const mockGetGranted = getGrantedPermissions as unknown as jest.Mock;
const mockReadRecords = readRecords as unknown as jest.Mock;
const mockRequestPermission = requestPermission as unknown as jest.Mock;
const mockOpenSettings = openHealthConnectSettings as unknown as jest.Mock;

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
    mockReadRecords.mockImplementation(async (recordType: string) => {
      if (recordType === 'Steps') {
        return {
          records: [
            { startTime: '2026-07-12T08:00:00.000Z', endTime: '2026-07-12T09:00:00.000Z', count: 4321 },
          ],
        };
      }
      return { records: [] };
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
    mockReadRecords.mockResolvedValue({ records: [] });

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    await adapter.readDailyAggregates({ startDate: '2026-07-12', endDate: '2026-07-13', metrics: ['steps'] });
    await adapter.readDailyAggregates({ startDate: '2026-07-12', endDate: '2026-07-13', metrics: ['steps'] });

    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it('only reads record types the OS reports as granted', async () => {
    mockInitialize.mockResolvedValue(true);
    // Steps granted; calories + distance NOT granted.
    mockGetGranted.mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    mockReadRecords.mockResolvedValue({ records: [] });

    const adapter = new HealthConnectAdapter({ debugLogging: false });
    await adapter.readDailyAggregates({
      startDate: '2026-07-10',
      endDate: '2026-07-13',
      metrics: ['steps', 'caloriesActive', 'distanceMeters'],
    });

    const readTypes = mockReadRecords.mock.calls.map((c) => c[0]);
    expect(readTypes).toEqual(['Steps']);
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
