# apps/mobile/ — Mobile app operating notes

> Read `../../AGENTS.md` (workspace) → `../../memory-bank/index.md` →
> `../../memory-bank/wiki/current/*` first. This file adds mobile-specific
> gotchas that are easy to get wrong.

## Expo SDK version policy

**Never bump `expo` directly in package.json.**
Use `npx expo install --fix` — it pins all sister packages
(`expo-router`, `expo-splash-screen`, `expo-font`, etc.) to the
versions Expo has tested against that SDK. A direct `expo` bump leaves
sister packages at stale versions and causes silent runtime failures.

After any SDK major: run `npx expo-doctor` and fix every warning before
pushing. expo-doctor catches peer-dep mismatches that `npm install`
won't flag.

## jest-expo + React Native version coupling

`jest-expo` major **must match** the Expo SDK major. Mismatching (e.g.
jest-expo 53 with Expo SDK 55) causes `SyntaxError: Cannot use import
statement` from expo-modules-core at test time.

Current versions (SDK 55 baseline, chore/expo-sdk-55):
- `expo`: ^55.0.26
- `react-native`: 0.83.6 (set by `npx expo install --fix` — do not pin manually)
- `jest-expo`: ~55.0.18 (root devDependencies)
- `react-test-renderer`: 19.2.0 (must match React version)

## Skipped test suites (re-enable after jest-expo 56)

Four suites are excluded via `testPathIgnorePatterns` in `jest.config.js`
because RN 0.83's TurboModule chain (`Dimensions → PlatformConstantsIOS
→ NativeReactNativeFeatureFlags`) fires at import time — before
jest-expo 55's preset can mock it:

```
__tests__/login.test.tsx
__tests__/settings.test.tsx
__tests__/auth-gate.test.tsx
__tests__/fitness.test.tsx
```

`describe.skip` wrappers + comments are in the files as documentation.
When upgrading to jest-expo 56: remove from `testPathIgnorePatterns`,
remove `describe.skip` wrappers, run `npm test`, re-enable if green.

## Native module rules

`react-native-health` (HealthKit/iOS) and `react-native-health-connect`
(Health Connect/Android) are **NOT standard Expo modules**.

The Android package is `react-native-health-connect` — the architecture
doc originally mentioned `expo-health-connect` but production maturity
favoured `react-native-health-connect`. Decision logged in
`vault/overnight-questions.md`; see `packages/health-sync/src/HealthConnectAdapter.ts:9-11`.

Before any React Native major bump:
1. Check `react-native-health` peer-deps manually (it lags RN by 1-2 majors).
2. Check `react-native-health-connect` compatibility matrix.
3. These are the only packages that may require `--legacy-peer-deps` on
   install even outside a major upgrade window.

Health-reading code lives **only** in `packages/health-sync/`.
Screens never import HealthKit or Health Connect directly.

## Mobile payment neutrality (HARD RULE)

No in-app purchases. No pricing tables. No "Upgrade" buttons.
Allowed: tier badge, renewal date, feature limits, link to genoly.org/billing.

The server contract (`GET /api/fitness/subscription`) returns
`isPaymentNeutral: true` as a tripwire. Any code that surfaces
subscription UI **must** check this field and hard-fail if it is ever
`false` — a silent pass risks App Store rejection.
(`useSubscription` hook spec: `docs/mobile-sync-architecture.md §11` —
not yet implemented; build it when subscription UI lands.)

## npm install flag

Always use `--legacy-peer-deps` during Expo SDK major transitions.
The RN ecosystem's peer-dep declarations lag actual compatibility by
1-2 weeks after each release.
