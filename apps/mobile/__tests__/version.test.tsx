/**
 * Version constant tests — ensures constants/version.ts stays in sync
 * with the marketing version declared in app.json.
 */

import appJson from '../app.json';
import { VERSION, BUILD_NUMBER } from '../constants/version';

describe('version constants', () => {
  it('VERSION matches app.json expo.version', () => {
    expect(VERSION).toBe(appJson.expo.version);
  });

  it('BUILD_NUMBER is a non-empty string', () => {
    expect(typeof BUILD_NUMBER).toBe('string');
    expect(BUILD_NUMBER.length).toBeGreaterThan(0);
  });

  it('VERSION follows semver major.minor.patch format', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
