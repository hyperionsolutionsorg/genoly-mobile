// jest.config.js
//
// Workspace-root config — runs jest for all packages (apps/mobile + packages/*).
//
// Uses jest-expo's preset, which sets up the right transform +
// transformIgnorePatterns for Expo SDK 55's expo-modules-core and
// related packages. We do NOT override transformIgnorePatterns or
// transform — past overrides caused "Cannot use import statement outside
// a module" errors when the preset's regex would have correctly
// transformed expo-modules-core/* .ts files.
//
// IMPORTANT: do NOT set testEnvironment: 'jsdom'. RN 0.83's New
// Architecture imports TurboModules at StyleSheet import time, and
// jest-expo's preset provides those native-module mocks only in its
// default environment. Forcing 'jsdom' bypasses the mocks and breaks
// any test that imports a screen using StyleSheet (i.e. all of them).
// Confirmed during the SDK 54→55 upgrade — removing the jsdom override
// is what made tests compile again.
//
// setupFiles runs BEFORE the test framework is set up — needed for
// jest.mock() calls that intercept module-load-time imports like the
// NativeReactNativeFeatureFlags TurboModule that StyleSheet uses.
// setupFilesAfterEnv runs AFTER the framework is up — that's where
// matcher extensions belong.
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./apps/mobile/jest.setup.js'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  // Skipped 2026-06-04 during Expo SDK 54→55 upgrade.
  // jest-expo 55's preset doesn't yet mock RN 0.83's new TurboModule
  // chain (Dimensions, PlatformConstantsIOS, FeatureFlags). These
  // suites crash at import time (before describe.skip can take effect).
  // Re-enable after upgrading to jest-expo 56 (planned in SDK 56 step 2).
  // Map tsconfig's `@/*` path alias to `apps/mobile/` so jest-expo's
  // babel transform can resolve it. (ts-jest read tsconfig paths automatically;
  // babel requires explicit moduleNameMapper.)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/apps/mobile/$1',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '__tests__/login.test.tsx',
    '__tests__/settings.test.tsx',
    '__tests__/auth-gate.test.tsx',
    '__tests__/fitness.test.tsx',
  ],
  verbose: true,
};
