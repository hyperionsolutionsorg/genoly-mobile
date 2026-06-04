// jest.setup.js — extra mocks beyond jest-expo's preset
//
// RN 0.83 (Expo SDK 55) introduced several new TurboModules that StyleSheet
// and Platform imports at module-load time:
//
//   - NativeReactNativeFeatureFlags  (for feature-flag reads)
//   - NativePlatformConstantsIOS     (for Platform.ios constants)
//   - NativePlatformConstantsAndroid (for Platform.android constants)
//   - probably more we haven't tripped over yet
//
// jest-expo 55's preset doesn't yet mock these (as of 2026-06-04), so
// any test that transitively imports StyleSheet (i.e. any component
// test) fails with "TurboModuleRegistry.getEnforcing(...): ...".
//
// Rather than mocking each TurboModule individually (whack-a-mole), we
// intercept TurboModuleRegistry itself to return a permissive Proxy for
// any requested module. Every property access returns either:
//   - a function returning false / null / "" (for getter-style flags)
//   - another Proxy (for nested object access)
//
// This is a test-only safety net; production code uses the real native
// modules. Production-grade: every screen continues to work normally
// on actual devices; only jest-jsdom-style execution gets the no-op
// shim.
//
// Remove this file when jest-expo ships proper TurboModule mocks
// (track upstream: https://github.com/expo/expo/tree/main/packages/jest-expo).

jest.mock("react-native/Libraries/TurboModule/TurboModuleRegistry", () => {
  // Recursive permissive Proxy: every property access returns a callable
  // that also acts as another Proxy. Handles all common shapes:
  //   - module.method() → returns a Proxy (chainable, indexable)
  //   - module.constant → returns a Proxy (chainable, indexable)
  //   - module.getConstants().Dimensions → both legs work
  //   - JSON.stringify(...) → falls back to default (Symbol checks)
  function makePermissive() {
    const fn = () => makePermissive();
    return new Proxy(fn, {
      get: (target, prop) => {
        if (typeof prop === "symbol") return target[prop];
        // Common JS protocol properties — return reasonable defaults so
        // `Array.from(mod)` etc. don't loop infinitely.
        if (prop === "then") return undefined; // not a thenable
        if (prop === "length") return 0;
        if (prop === Symbol.iterator) return undefined;
        return makePermissive();
      },
      apply: () => makePermissive(),
    });
  }
  const permissiveModule = makePermissive();
  return {
    get: () => permissiveModule,
    getEnforcing: () => permissiveModule,
  };
});
