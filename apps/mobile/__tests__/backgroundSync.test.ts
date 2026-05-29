/**
 * backgroundSync.test.ts — Step 6 background-fetch wiring.
 *
 * Coverage:
 *   1. Task body returns 'no-data' when healthSyncEnabled is false
 *   2. Task body returns 'new-data' when drain() reports accepted > 0
 *   3. Task body returns 'no-data' when drain() reports all zeros
 *   4. Task body returns 'failed' when drain() throws
 *   5. registerBackgroundSync() defines the task + registers with BackgroundFetch
 *   6. unregisterBackgroundSync() unregisters if currently registered
 *   7. registerBackgroundSync() returns false if native modules unavailable
 *
 * Tests do NOT exercise the actual TaskManager wiring — we test the task
 * BODY (`runBackgroundSyncTask`) and the register/unregister wrappers
 * against mocks. The mapping from outcome string → BackgroundFetchResult
 * enum is mechanical and verified by reading the source.
 */

// ── Mocks (declared BEFORE requiring the SUT) ────────────────────────

jest.mock('../utils/api', () => ({
  apiClient: {
    syncDailyAggregates: jest.fn(),
  },
}));

jest.mock('../utils/preferences', () => ({
  getHealthSyncEnabled: jest.fn(),
}));

// SyncQueue factory mock — we test the task body's outcome mapping, not
// the queue itself (that has its own 16-test suite in packages/sync-queue/).
jest.mock('@genoly/sync-queue', () => ({
  createSyncQueue: jest.fn(),
}));

// TaskManager + BackgroundFetch mocks. We use jest.doMock so the tests
// can swap mod behavior per-case.
const mockDefineTask = jest.fn();
const mockIsTaskRegisteredAsync = jest.fn();
const mockUnregisterTaskAsync_TM = jest.fn();
const mockRegisterTaskAsync = jest.fn();
const mockUnregisterTaskAsync_BF = jest.fn();
const mockGetStatusAsync = jest.fn();

jest.mock('expo-task-manager', () => ({
  defineTask: mockDefineTask,
  isTaskRegisteredAsync: mockIsTaskRegisteredAsync,
  unregisterTaskAsync: mockUnregisterTaskAsync_TM,
}));

jest.mock('expo-background-fetch', () => ({
  BackgroundFetchResult: { NewData: 1, NoData: 2, Failed: 3 },
  registerTaskAsync: mockRegisterTaskAsync,
  unregisterTaskAsync: mockUnregisterTaskAsync_BF,
  getStatusAsync: mockGetStatusAsync,
}));

// Import SUT AFTER mocks.
import {
  runBackgroundSyncTask,
  ensureTaskDefined,
  registerBackgroundSync,
  unregisterBackgroundSync,
  isBackgroundSyncRegistered,
  __resetBackgroundSyncForTests,
  GENOLY_BG_SYNC_TASK,
  BG_SYNC_MIN_INTERVAL_SEC,
} from '../utils/backgroundSync';
import { getHealthSyncEnabled } from '../utils/preferences';
import { createSyncQueue } from '@genoly/sync-queue';

// ── Test helpers ──────────────────────────────────────────────────────

function mockQueueDrain(result: {
  accepted: number;
  rejectedPermanent?: number;
  retriesExhausted?: number;
  retryablePending?: number;
}) {
  (createSyncQueue as jest.Mock).mockResolvedValue({
    drain: jest.fn().mockResolvedValue({
      accepted: result.accepted,
      rejectedPermanent: result.rejectedPermanent ?? 0,
      retriesExhausted: result.retriesExhausted ?? 0,
      retryablePending: result.retryablePending ?? 0,
      serverTime: Date.now(),
    }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('backgroundSync — task body (runBackgroundSyncTask)', () => {
  beforeEach(() => {
    (getHealthSyncEnabled as jest.Mock).mockReset();
    (createSyncQueue as jest.Mock).mockReset();
    __resetBackgroundSyncForTests();
  });

  it('returns "no-data" when health sync is disabled', async () => {
    (getHealthSyncEnabled as jest.Mock).mockResolvedValue(false);

    const result = await runBackgroundSyncTask();

    expect(result).toBe('no-data');
    expect(createSyncQueue).not.toHaveBeenCalled();
  });

  it('returns "new-data" when drain accepts at least one row', async () => {
    (getHealthSyncEnabled as jest.Mock).mockResolvedValue(true);
    mockQueueDrain({ accepted: 3 });

    const result = await runBackgroundSyncTask();

    expect(result).toBe('new-data');
  });

  it('returns "new-data" when drain reports rejectedPermanent > 0 (still progress)', async () => {
    (getHealthSyncEnabled as jest.Mock).mockResolvedValue(true);
    mockQueueDrain({ accepted: 0, rejectedPermanent: 2 });

    const result = await runBackgroundSyncTask();

    expect(result).toBe('new-data');
  });

  it('returns "new-data" when drain reports only retryablePending (still touched rows)', async () => {
    (getHealthSyncEnabled as jest.Mock).mockResolvedValue(true);
    mockQueueDrain({ accepted: 0, retryablePending: 5 });

    const result = await runBackgroundSyncTask();

    expect(result).toBe('new-data');
  });

  it('returns "no-data" when drain reports all zeros (queue was empty)', async () => {
    (getHealthSyncEnabled as jest.Mock).mockResolvedValue(true);
    mockQueueDrain({ accepted: 0 });

    const result = await runBackgroundSyncTask();

    expect(result).toBe('no-data');
  });

  it('returns "failed" when drain throws', async () => {
    (getHealthSyncEnabled as jest.Mock).mockResolvedValue(true);
    (createSyncQueue as jest.Mock).mockResolvedValue({
      drain: jest.fn().mockRejectedValue(new Error('boom')),
    });

    const result = await runBackgroundSyncTask();

    expect(result).toBe('failed');
  });

  it('returns "failed" when createSyncQueue itself throws', async () => {
    (getHealthSyncEnabled as jest.Mock).mockResolvedValue(true);
    (createSyncQueue as jest.Mock).mockRejectedValue(new Error('sqlite init failed'));

    const result = await runBackgroundSyncTask();

    expect(result).toBe('failed');
  });
});

describe('backgroundSync — register / unregister', () => {
  beforeEach(() => {
    mockDefineTask.mockReset();
    mockIsTaskRegisteredAsync.mockReset();
    mockUnregisterTaskAsync_TM.mockReset();
    mockRegisterTaskAsync.mockReset();
    mockUnregisterTaskAsync_BF.mockReset();
    __resetBackgroundSyncForTests();
  });

  it('ensureTaskDefined defines the task on first call and is idempotent', () => {
    expect(ensureTaskDefined()).toBe(true);
    expect(mockDefineTask).toHaveBeenCalledTimes(1);
    expect(mockDefineTask).toHaveBeenCalledWith(GENOLY_BG_SYNC_TASK, expect.any(Function));

    // Second call should NOT redefine.
    expect(ensureTaskDefined()).toBe(true);
    expect(mockDefineTask).toHaveBeenCalledTimes(1);
  });

  it('registerBackgroundSync defines + registers with min interval + flags', async () => {
    mockRegisterTaskAsync.mockResolvedValue(undefined);

    const ok = await registerBackgroundSync();

    expect(ok).toBe(true);
    expect(mockDefineTask).toHaveBeenCalledWith(GENOLY_BG_SYNC_TASK, expect.any(Function));
    expect(mockRegisterTaskAsync).toHaveBeenCalledWith(GENOLY_BG_SYNC_TASK, {
      minimumInterval: BG_SYNC_MIN_INTERVAL_SEC,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  });

  it('registerBackgroundSync returns false when registerTaskAsync rejects', async () => {
    mockRegisterTaskAsync.mockRejectedValue(new Error('permission denied'));

    const ok = await registerBackgroundSync();

    expect(ok).toBe(false);
  });

  it('unregisterBackgroundSync unregisters when the task is currently registered', async () => {
    mockIsTaskRegisteredAsync.mockResolvedValue(true);
    mockUnregisterTaskAsync_BF.mockResolvedValue(undefined);

    const ok = await unregisterBackgroundSync();

    expect(ok).toBe(true);
    expect(mockIsTaskRegisteredAsync).toHaveBeenCalledWith(GENOLY_BG_SYNC_TASK);
    expect(mockUnregisterTaskAsync_BF).toHaveBeenCalledWith(GENOLY_BG_SYNC_TASK);
  });

  it('unregisterBackgroundSync is a no-op when task is not registered', async () => {
    mockIsTaskRegisteredAsync.mockResolvedValue(false);

    const ok = await unregisterBackgroundSync();

    expect(ok).toBe(true);
    expect(mockUnregisterTaskAsync_BF).not.toHaveBeenCalled();
  });

  it('isBackgroundSyncRegistered proxies to TaskManager.isTaskRegisteredAsync', async () => {
    mockIsTaskRegisteredAsync.mockResolvedValue(true);

    expect(await isBackgroundSyncRegistered()).toBe(true);

    mockIsTaskRegisteredAsync.mockResolvedValue(false);
    __resetBackgroundSyncForTests();
    expect(await isBackgroundSyncRegistered()).toBe(false);
  });
});
