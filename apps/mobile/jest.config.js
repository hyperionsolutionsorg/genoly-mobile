// jest.config.js
//
// Uses jest-expo's preset, which (in v54+) sets up the right transform
// + transformIgnorePatterns for Expo SDK 54's expo-modules-core and
// related packages. We do NOT override transformIgnorePatterns — past
// overrides written for older SDKs cause "Cannot use import statement
// outside a module" errors when the preset's regex would have correctly
// transformed expo-modules-core/* .ts files.
//
// setupFilesAfterEnv loads jest-native matchers AFTER the test framework
// is loaded but BEFORE tests run (despite the name — "after env" means
// after the Jest env is set up, not "after each test").
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  verbose: true,
};
