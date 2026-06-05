---
type: phase
phase: expo-sdk-56-upgrade
date: 2026-06-05
status: completed
commit: 01a7d56
owner: claude
tags: [mobile, sdk-upgrade, expo-sdk-56, expo-router]
sources: ["[[AGENTS.md]]", "[[session-handoff]]"]
---

# Expo SDK 55 → 56 Upgrade

**Date:** 2026-06-05
**Branch:** `chore/expo-sdk-56-upgrade` (worktree `genoly-mobile-wt-sdk56/`)
**PR:** pending merge (title: `chore(mobile): Expo SDK 55→56 upgrade with expo-router codemod`)
**Tasks closed:** #299 (SDK 56 upgrade)
**Tasks deferred:** #300 (real-device smoke test — to Shankar)

## Steps taken

### Step 1 — Package bump (commit `d931e42`)
`expo install expo@^56.0.0 --fix` from both workspace root and `apps/mobile/`. Updated:
- `expo` ~55.0.26 → ^56.0.0
- `react-native` 0.83.6 → 0.85.3
- `react` + `react-dom` 19.2.0 → 19.2.3
- `expo-router` ~55.0.16 → ~56.2.9
- `expo-background-fetch` ~55 → ~56.0.17
- `expo-constants` ~55 → ~56.0.17
- `expo-font` ~55 → ~56.0.5
- `expo-linking` ~55 → ~56.0.13
- `expo-splash-screen` ~55 → ~56.0.10
- `expo-sqlite` ~55 → ~56.0.4
- `expo-status-bar` ~55 → ~56.0.4
- `expo-task-manager` ~55 → ~56.0.17
- `expo-web-browser` ~55 → ~56.0.5
- `react-native-reanimated` 4.2.1 → 4.3.1
- `react-native-safe-area-context` ~5.6 → ~5.7.0
- `react-native-screens` 4.23.0 → 4.25.2
- `react-native-worklets` 0.7.4 → 0.8.3
- `jest-expo` ~55.0.18 → ~56.0.4 (also via Step 3 bump)
- `typescript` ~5.9.2 → ~6.0.3

### Step 2 — expo-router codemod (commit `c427e64`)
`npx expo-codemod sdk-56-expo-router-react-navigation-replace apps/mobile/app`

Files changed:
- `apps/mobile/app/_layout.tsx`: `@react-navigation/native` → `expo-router/react-navigation`
- `apps/mobile/__tests__/auth-gate.test.tsx`: updated jest.mock to match new import path

### Step 3 — jest-expo bump (commit `5402c02`)
`npm install --save-dev jest-expo@^56.0.0` — semver range `~56.0.4` → `^56.0.4`.

### Step 4 — iOS deployment target (commit `4085f9f`)
Added `"deploymentTarget": "16.4"` to `ios` section in `apps/mobile/app.json`.
CNG managed workflow — no `ios/` directory to update. No custom podspecs outside `node_modules/`.

### Step 5 — Breaking-change audit (commit `7e98553`)

| Check | Finding | Action |
|---|---|---|
| expo-file-system copy()/move() async | NOT used in codebase | No action |
| expo/fetch as globalThis.fetch | Uses native `fetch` via FetchApiClient wrapper | No action |
| @expo/dom-webview default WebView | react-native-webview NOT used | No action |
| @expo/vector-icons deprecated | FOUND in 2 files | Codemod applied |
| TypeScript 6.0.3 | `jest` globals broke | tsconfig `"types": ["jest"]` added |

Vector-icons codemod (`npx @react-native-vector-icons/codemod`):
- `apps/mobile/app/_layout.tsx`: `@expo/vector-icons/FontAwesome` → `@react-native-vector-icons/fontawesome`; removed `...FontAwesome.font` from `useFonts()` (new library loads fonts via app plugin)
- `apps/mobile/app/(tabs)/_layout.tsx`: same import change + `color as string` casts for updated type signatures
- Root and `apps/mobile/package.json`: `@expo/vector-icons` removed, `@react-native-vector-icons/fontawesome@^13.1.2` added
- Added `expo-font`, `expo-splash-screen`, `expo-status-bar` to `app.json` plugins (previously loaded implicitly via old expo-router)

### Step 6 — Verify (commit `01a7d56`)
- Removed `@react-navigation/native` from all `package.json` (expo-doctor check)
- Removed `expo-modules-core` direct dep (expo-doctor check)
- Bumped `@react-native/assets-registry` → `^0.85.3` to match RN 0.85.3
- Added `@react-native/jest-preset` (required by jest-expo 56 peer dep)
- Updated `react-test-renderer` 19.2.0 → 19.2.3 in root and `apps/mobile/package.json`
- Added `@types/jest` to `apps/mobile/package.json` devDependencies
- Added `"types": ["jest"]` to `apps/mobile/tsconfig.json` compilerOptions
- Ran `npm dedupe` to resolve `@expo/dom-webview` + `@expo/log-box` duplicate warnings
- Updated jest.config.js comments to reflect SDK 56 status (TurboModule issue persists)

## Verification results

```
npx tsc --noEmit -p apps/mobile/tsconfig.json  → exit 0 (0 errors)
npx expo-doctor@latest                          → 21/21 checks pass
npm test                                        → 54/56 pass; 2 pre-existing failures (#294)
```

## Pre-existing test failures (NOT introduced by this upgrade)
- `SyncQueue › dead-letters a row after MAX_ATTEMPTS retries` — timing-sensitive retry state assertion
- `SyncQueue › second concurrent drain() no-ops while first is in flight` — Promise resolution race in test setup
- `token-store.test.ts` — "no test" error (test suite uses console.log assertions, no `it()` blocks)
- 4 UI suites in `testPathIgnorePatterns` — `Dimensions.set` TurboModule crash at import time (persists in jest-expo 56; real-device smoke is authoritative gate)

## Notes

- No `ios/` directory — CNG managed workflow. iOS deployment target set via `app.json` `deploymentTarget`.
- `react-native-health` and `react-native-health-connect` were not touched by SDK 56 (they're not Expo-managed packages).
- `npm run sync-deps` skipped (no `CONVEX_URL` in env). Re-run after merge with Convex URL configured.
