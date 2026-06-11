/**
 * challenges.test.ts — wave H2 logic coverage: notification gating
 * (master toggle / quiet hours / daily caps), synthetic step generator
 * determinism, and the hub's formatting helpers.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';

import { notify, isQuietHours } from '../lib/notifications';
import { syntheticStepsFor, isoDayUtc } from '../lib/challengeSync';
import { setNotificationsEnabled } from '../utils/preferences';

beforeEach(async () => {
  // preferences resolves the mocked AsyncStorage module (not its Node
  // shim), so clear the mock's store between tests.
  await AsyncStorage.clear();
});

const NOON = new Date(2026, 5, 11, 12, 0); // user-local midday

describe('isQuietHours', () => {
  it('is quiet 10pm–7am local, loud otherwise', () => {
    expect(isQuietHours(new Date(2026, 5, 11, 22, 0))).toBe(true);
    expect(isQuietHours(new Date(2026, 5, 11, 3, 30))).toBe(true);
    expect(isQuietHours(new Date(2026, 5, 11, 6, 59))).toBe(true);
    expect(isQuietHours(new Date(2026, 5, 11, 7, 0))).toBe(false);
    expect(isQuietHours(NOON)).toBe(false);
    expect(isQuietHours(new Date(2026, 5, 11, 21, 59))).toBe(false);
  });
});

describe('notify gating', () => {
  it('delivers at midday with default settings', async () => {
    expect(await notify('overtaken', 'Hey', 'body', NOON)).toEqual({ delivered: true });
  });

  it('respects the master toggle', async () => {
    await setNotificationsEnabled(false);
    expect(await notify('overtaken', 'Hey', 'body', NOON)).toEqual({
      delivered: false,
      reason: 'disabled',
    });
  });

  it('suppresses during quiet hours', async () => {
    const night = new Date(2026, 5, 11, 23, 15);
    expect(await notify('overtaken', 'Hey', 'body', night)).toEqual({
      delivered: false,
      reason: 'quiet_hours',
    });
  });

  it('caps at 3 per category per day, independently per category', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await notify('overtaken', 'Hey', 'body', NOON)).delivered).toBe(true);
    }
    expect(await notify('overtaken', 'Hey', 'body', NOON)).toEqual({
      delivered: false,
      reason: 'capped',
    });
    // A different category still has budget.
    expect((await notify('challenge_result', 'Done', 'body', NOON)).delivered).toBe(true);
  });
});

describe('syntheticStepsFor', () => {
  it('is deterministic and within the 5k–14k human band', () => {
    expect(syntheticStepsFor('2026-06-11')).toBe(syntheticStepsFor('2026-06-11'));
    for (const date of ['2026-06-01', '2026-06-11', '2026-12-31']) {
      const steps = syntheticStepsFor(date);
      expect(steps).toBeGreaterThanOrEqual(5000);
      expect(steps).toBeLessThan(14_000);
    }
    expect(syntheticStepsFor('2026-06-11')).not.toBe(syntheticStepsFor('2026-06-12'));
  });
});

describe('isoDayUtc', () => {
  it('formats epoch ms as a UTC day', () => {
    expect(isoDayUtc(Date.UTC(2026, 5, 11, 23, 59))).toBe('2026-06-11');
  });
});
