// jest.config.js
//
// Workspace-root config — runs jest for all packages (apps/mobile + packages/*).
//
// Uses jest-expo's preset, which sets up the right transform +
// transformIgnorePatterns for Expo SDK 56's expo-modules-core and
// related packages. We do NOT override transformIgnorePatterns or
// transform — past overrides caused "Cannot use import statement outside
// a module" errors when the preset's regex would have correctly
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
// setupFiles runs BEFORE the test framework is set up — needed for
// jest.mock() calls that intercept module-load-time imports like the
// NativeReactNativeFeatureFlags TurboModule that StyleSheet uses.
// setupFilesAfterEnv runs AFTER the framework is up — that's where
// matcher extensions belong.
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./apps/mobile/jest.setup.js'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  // Skipped 2026-06-04 during Expo SDK 54→55 upgrade, still skipped in
  // SDK 56. jest-expo 56's preset does not yet fully mock the New
  // Architecture TurboModule chain (Dimensions.set, PlatformConstantsIOS,
  // FeatureFlags) needed by expo-router's screen-level imports. These
  // suites crash at import time (before describe.skip can take effect).
  // Real-device smoke is the authoritative gate during this window.
  // Re-enable when expo-router provides a Jest-compatible stub for the
  // TurboModule Dimensions chain.
  //
  // Map tsconfig's `@/*` path alias to `apps/mobile/` so jest-expo's
  // babel transform can resolve it. (ts-jest reads tsconfig paths automatically;
  // babel requires explicit moduleNameMapper.)
  //
  // d3-hierarchy (added for the Pedigree Classic layout, apps/mobile/lib/
  // tree/classicLayout.ts) ships ESM-only from node_modules (`"type":
  // "module"`, no `main`/CJS build) — the base RN jest preset's
  // transformIgnorePatterns only allow-lists react-native packages, so a
  // plain `import ... from 'd3-hierarchy'` hits "Unexpected token 'export'"
  // under jest-expo's CJS test runtime. Rather than touch
  // transformIgnorePatterns (the comment above explains why that's fragile
  // here), map the bare specifier to the package's own prebuilt UMD bundle
  // (`dist/d3-hierarchy.js`, ships in the npm package, CJS-compatible) —
  // scoped, no preset changes.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/apps/mobile/$1',
    '^d3-hierarchy$': '<rootDir>/node_modules/d3-hierarchy/dist/d3-hierarchy.js',
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
