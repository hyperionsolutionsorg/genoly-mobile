/**
 * preferences.test.ts — typed AsyncStorage preference pairs (C3 additions:
 * pedigree theme, last-visited tree, visit-streak day gate; C1: app theme).
 * Runs against the in-memory shim (Node test environment).
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  getThemePreference,
  setThemePreference,
  getPedigreeTheme,
  setPedigreeTheme,
  getLastVisitedTreeSlug,
  setLastVisitedTreeSlug,
  getVisitRecordedDayUTC,
  setVisitRecordedDayUTC,
  __resetPreferencesShim,
} from '../utils/preferences';

beforeEach(() => {
  __resetPreferencesShim();
});

describe('theme preference', () => {
  it('defaults to system and round-trips valid values', async () => {
    expect(await getThemePreference()).toBe('system');
    await setThemePreference('classic');
    expect(await getThemePreference()).toBe('classic');
  });
});

describe('pedigree theme', () => {
  it('defaults to classic and round-trips', async () => {
    expect(await getPedigreeTheme()).toBe('classic');
    await setPedigreeTheme('matrix');
    expect(await getPedigreeTheme()).toBe('matrix');
  });
});

describe('last visited tree', () => {
  it('defaults to null and round-trips slugs', async () => {
    expect(await getLastVisitedTreeSlug()).toBeNull();
    await setLastVisitedTreeSlug('bennett-family');
    expect(await getLastVisitedTreeSlug()).toBe('bennett-family');
  });
});

describe('visit-recorded day gate', () => {
  it('round-trips the UTC day string', async () => {
    expect(await getVisitRecordedDayUTC()).toBeNull();
    await setVisitRecordedDayUTC('2026-06-11');
    expect(await getVisitRecordedDayUTC()).toBe('2026-06-11');
  });
});
