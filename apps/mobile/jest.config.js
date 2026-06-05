// jest.config.js
//
// Uses jest-expo's preset, which sets up the right transform +
// transformIgnorePatterns for Expo SDK 56's expo-modules-core and
// related packages. We do NOT override transformIgnorePatterns — past
// overrides written for older SDKs cause "Cannot use import statement
// outside a module" errors when the preset's regex would have correctly
// transformed expo-modules-core/* .ts files.
//
// IMPORTANT: do NOT set testEnvironment: 'jsdom'. RN 0.85's New
// Architecture imports TurboModules at StyleSheet import time, and
// jest-expo's preset provides those native-module mocks only in its
// default environment. Forcing 'jsdom' bypasses the mocks and breaks
// any test that imports a screen using StyleSheet (i.e. all of them).
// Confirmed during the SDK 54→55 upgrade — removing the jsdom override
// is what made tests compile again.
//
// setupFilesAfterEnv loads jest-native matchers AFTER the test framework
// is loaded but BEFORE tests run (despite the name — "after env" means
// after the Jest env is set up, not "after each test").
module.exports = {
  preset: 'jest-expo',
  // setupFiles runs BEFORE the test framework is set up — needed for
  // jest.mock() calls that intercept module-load-time imports like the
  // NativeReactNativeFeatureFlags TurboModule that StyleSheet uses.
  // setupFilesAfterEnv runs AFTER the framework is up — that's where
  // matcher extensions belong.
  setupFiles: ['./jest.setup.js'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  // Skipped 2026-06-04 during Expo SDK 54→55 upgrade, still skipped in
  // SDK 56. jest-expo 56's preset does not yet fully mock the New
  // Architecture TurboModule chain (Dimensions.set, PlatformConstantsIOS,
  // FeatureFlags) needed by expo-router's screen-level imports. These
  // suites crash at import time (before describe.skip can take effect).
  // Real-device smoke is the authoritative gate during this window.
  testPathIgnorePatterns: [
    '/node_modules/',
    '__tests__/login.test.tsx',
    '__tests__/settings.test.tsx',
    '__tests__/auth-gate.test.tsx',
    '__tests__/fitness.test.tsx',
  ],
  verbose: true,
};
