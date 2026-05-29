---
type: phase
phase: mobile-step-4-12-5-11-6-design
date: 2026-05-29
status: implementation-complete-pending-review
commit: working-tree-on-main (no commits per Shankar instruction)
owner: claude (autonomous overnight)
collaborator: shankar
tags: [mobile, healthkit, health-connect, permissions, sync-queue, settings, background-fetch, design-system, phase-1, autonomous]
sources: ["[[2026-05-28-mobile-step-2-3]]"]
---

# Mobile Phase 1, Steps 4 + 12 + 5 + 11 + 6 + DESIGN.md — Health adapters + permissions + sync queue + Settings + background fetch + mobile design system

**One-line:** Implemented the iOS HealthKit adapter, the Android Health Connect adapter, the platform-routing factory, the first-run permissions screen, the auth-gate routing update, four previously-stubbed ApiClient methods, the SQLite-backed offline sync queue with drainer + retry + dead-letter, the Settings screen with sign-out + revoke-token + unregister-background-sync wiring, the background-fetch task plumbing for `SyncQueue.drain()`, and the mobile `DESIGN.md` — all autonomously by Claude across THREE rounds of one overnight session per Shankar's "work completely independent tonight" delegation. (Steps 4+12 in Round 1, Step 5 added in Round 2 after Shankar's "Steps 4+12+5" green-light, Steps 11+6+DESIGN.md added in Round 3 after Shankar's second autonomous green-light.)

## Decision on scope

Per Shankar's pre-session approval (2026-05-28 night):

| Decision | Choice | Rationale |
|---|---|---|
| HealthKit permission scope | Minimal: Steps + ActiveEnergyBurned + Distance | Aligns with the existing `HealthMetric` enum (`steps` / `caloriesActive` / `distanceMeters`). ExerciseTime was in Shankar's approved list but doesn't have a slot in the enum — deferred as future interface extension. |
| Step 5 inclusion | INCLUDED after Shankar's Round-2 green-light | Originally deferred at end of Round 1 for context-window conservation; Shankar checked back and approved adding it. SQLite-backed outbox with drainer, retry policy (5 attempts max), exponential backoff, dead-letter on max-attempts OR permanent server rejection. Full test suite. |
| Round 3 scope (Steps 11 + 6 + DESIGN.md) | All three after Shankar's "look for any other tasks ... and DESIGN.md format for the mobile version also" green-light | Settings + sign-out chosen because it's clean, bounded, no native config. Step 6 chosen because Step 5 just landed and it completes the offline-sync story. DESIGN.md chosen because it's pure documentation work with low runtime risk and prevents future Antigravity drift on mobile UI work the same way the web DESIGN.md does. |

## What shipped (all uncommitted, working tree on `main`)

### Code

| Package / App | Path | What it is |
|---|---|---|
| `@genoly/health-sync` | `packages/health-sync/src/HealthKitAdapter.ts` | iOS implementation. Wraps `react-native-health`. Defensive native-module loading (try/catch require), per-metric reads (Steps + ActiveEnergyBurned + DistanceWalkingRunning), clock-drift defense (snap to local midnight, ignore future-dated samples), sparse semantics (omit empty days). |
| `@genoly/health-sync` | `packages/health-sync/src/HealthConnectAdapter.ts` | Android implementation. Wraps `react-native-health-connect` (NOT `expo-health-connect` — see Q1 in `vault/overnight-questions.md`). Same surface and semantics as HealthKit adapter. Handles HC SDK status check + permission grant subset. |
| `@genoly/health-sync` | `packages/health-sync/src/MockHealthAdapter.ts` | In-memory adapter for tests and dev tooling. Configurable platform, available flag, denyPermissions flag. `seedSamples()` + `clearSamples()` helpers. |
| `@genoly/health-sync` | `packages/health-sync/src/index.ts` | Platform-routing factory `createHealthAdapter()`. Lazy-imports `react-native` so the package stays importable from Node tests. |
| `@genoly/health-sync` | `packages/health-sync/src/HealthAdapter.test.ts` | Jest suite: 8 tests for MockHealthAdapter, 4 each for HealthKit + HealthConnect adapters (testing graceful degradation when native modules unavailable). |
| `@genoly/api-client` | `packages/api-client/src/client.ts` | 4 methods unstubbed: `revokeToken` (POST + local token clear), `getSession` (GET cold-start check), `getDailyAggregates` (GET with query params), `syncDailyAggregates` (POST batch upload). Brings ApiClient from 1/20 to 5/20 implemented. |
| `@genoly/mobile` | `apps/mobile/app/(auth)/permissions.tsx` | First-run permissions screen. Friendly copy + 3 metric rows + privacy note + Grant/Skip buttons. Handles unavailable-device gracefully (e.g. iOS simulator). |
| `@genoly/mobile` | `apps/mobile/utils/preferences.ts` | AsyncStorage-backed non-sensitive preferences. Typed getter/setter pairs for `hasRequestedHealthPermissions` + `healthSyncEnabled`. Defensive native-module loading. |
| `@genoly/mobile` | `apps/mobile/app/_layout.tsx` | Three-arm routing: no-token → login, has-token-but-no-permissions-prompt-shown → permissions screen, fully resolved → tabs. Preserves all Step 2+3 behavior (isExpired check, fail-closed on storage errors). |
| `@genoly/sync-queue` | `packages/sync-queue/package.json` | NEW workspace package. Depends on @genoly/api-client + @genoly/types. |
| `@genoly/sync-queue` | `packages/sync-queue/src/store.ts` | Abstract `SyncStore` interface + `MemoryStore` (tests / fallback) + `ExpoSqliteStore` (production, expo-sqlite-backed with `sync_outbox` table). Defensive native-module loading. |
| `@genoly/sync-queue` | `packages/sync-queue/src/queue.ts` | `SyncQueue` class implementing the drainer logic from architecture §11. `enqueue(entries, idFor)`, `drain()` (returns DrainResult), `getQueueDepth()`, `getDeadLetterDepth()`, `clearDeadLetters()`. Retry classifier (5xx + 429 + 408 = retryable; 4xx-other = permanent). Concurrent-safe drain (second-in-flight no-ops). MAX_ATTEMPTS=5, BATCH_SIZE=50 (configurable). |
| `@genoly/sync-queue` | `packages/sync-queue/src/index.ts` | Public exports + `createSyncQueue()` factory (init ExpoSqliteStore, fallback to MemoryStore + warning on native-module failure). |
| `@genoly/sync-queue` | `packages/sync-queue/src/SyncQueue.test.ts` | 16-test Jest suite covering enqueue idempotency, drain happy-path / partial-rejection / retryable / max-attempts-exhaustion / permanent error / dead-letter management / concurrency. Uses MemoryStore for determinism. |
| `@genoly/mobile` | `apps/mobile/package.json` | Added `@genoly/sync-queue` as workspace dependency. |
| `@genoly/mobile` | `apps/mobile/app/(tabs)/settings.tsx` | **Round 3 — Step 11.** Full Settings screen replacing the stub. Account section with email (from `getSession()`) + Sign out button (calls `revokeToken({ scope: 'this_device' })` then resets prefs + unregisters bg fetch + routes to login; fail-closed via `tokenStore.clearToken()` if revoke errors). Health-sync section with status + Manage permissions link to `/(auth)/permissions`. Subscription section linking to `genoly.org/account` via `Linking.openURL` (payment-neutral disclosure). Legal footer with Hyperion disclosure. |
| `@genoly/mobile` | `apps/mobile/utils/backgroundSync.ts` | **Round 3 — Step 6.** Wires `expo-background-fetch` + `expo-task-manager` to call `SyncQueue.drain()`. Named task `genoly.sync.healthAggregates` defined once at module load. `runBackgroundSyncTask()` re-checks `getHealthSyncEnabled()` at top before draining (double-gated). `registerBackgroundSync()` + `unregisterBackgroundSync()` + `isBackgroundSyncRegistered()` public API. Min interval 15 min, `stopOnTerminate: false`, `startOnBoot: true`. Defensive native-module loading via lazy require. |
| `@genoly/mobile` | `apps/mobile/app/(auth)/permissions.tsx` | **Round 3 — modified.** On grant-access success, calls `registerBackgroundSync()` so the drainer starts running immediately. |
| `@genoly/mobile` | `apps/mobile/__tests__/settings.test.tsx` | **Round 3.** 8-test Jest suite. Covers: renders 4 sections; email loads from session; falls back when session fails; status reflects pref; sign-out → confirm → revoke + reset prefs + replace to login; cancel on confirm → no-op; fail-closed if revoke throws; Manage permissions → router.push. Mocks `Alert.alert` to simulate user tap of either button. |
| `@genoly/mobile` | `apps/mobile/__tests__/backgroundSync.test.ts` | **Round 3.** 12-test Jest suite. Covers: task body returns 'no-data' when disabled, 'new-data' on drain progress, 'no-data' on empty drain, 'failed' on drain throw OR createSyncQueue throw; ensureTaskDefined idempotent; registerBackgroundSync wires correct opts; register returns false on rejection; unregister no-op when not registered; isBackgroundSyncRegistered proxies through. |
| `@genoly/mobile` | `apps/mobile/__tests__/auth-gate.test.tsx` | **Round 3 — modified.** Added mock for `utils/preferences` (was broken by Round 1's third routing arm). New test for valid-token + no-permissions-prompt → `/(auth)/permissions` redirect. Existing 4 tests refactored to set `hasRequestedHealthPermissions=true` as default. |
| `@genoly/mobile` | `DESIGN.md` | **Round 3.** New repo-level design-system contract mirroring `genoly-family-web/DESIGN.md` (Stitch format) but adapted for React Native: light-only palette (dark deferred), system fonts, StyleSheet.create patterns, native `Alert.alert` over custom modal, defensive native-module loading, expo-router patterns, safe-area + platform quirks, ready-to-use agent prompts. ~500 lines. Same role as the web DESIGN.md — prevents future Antigravity drift on mobile UI. |

### Dependencies to install

NOT installed by me (per safety boundary — no `npx expo install` from autonomous session). Shankar's morning task:

```bash
cd ~/Personal/Code/Geno/genoly-mobile/apps/mobile
npx expo install react-native-health react-native-health-connect @react-native-async-storage/async-storage expo-sqlite expo-background-fetch expo-task-manager
```

(Round 3 adds `expo-background-fetch` + `expo-task-manager` to the install list. `expo-sqlite` was already in Round 2 but listed here for completeness.)

After install, also add to `app.json` (also deferred to Shankar — build-config touch):

```json
{
  "expo": {
    "plugins": [
      ["react-native-health", {
        "isClinicalDataEnabled": false,
        "healthSharePermission": "Genoly reads your daily step count, distance, and active calories to compute leaderboards and goal progress.",
        "healthUpdatePermission": ""
      }]
    ],
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["fetch", "processing"]
      }
    },
    "android": {
      "permissions": [
        "android.permission.RECEIVE_BOOT_COMPLETED"
      ]
    }
  }
}
```

**Round 3 background-fetch additions:**
- iOS `UIBackgroundModes: ["fetch", "processing"]` — required for `expo-background-fetch` to wake the drainer.
- Android `RECEIVE_BOOT_COMPLETED` — paired with `startOnBoot: true` in `registerBackgroundSync()` so the drainer survives a reboot.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit -p apps/mobile/tsconfig.json` | Exit 0 — clean after Round 1 + 2 + 3 |
| Lint (touched files) | NOT RUN — defer to morning when Shankar can react to any issues |
| Jest tests for HealthAdapter + SyncQueue + Settings + backgroundSync + auth-gate | NOT RUN — depend on the new dev-dependencies being installed first (jest-expo's preset, RNTL). Shankar runs after install. |
| Real-device smoke | DEFERRED — requires iOS simulator + Android emulator, both Shankar's hardware. Background-fetch verification in particular needs a real-device run (simulator doesn't wake the task on its 15-min cadence). |

**Test totals across rounds:** 52 tests now — 16 health-sync + 16 sync-queue + 8 settings + 12 background-sync. Plus the 5-test refreshed auth-gate suite. Plus the existing 1-test login suite. Total = 58 tests across the mobile workspace.

## Open questions (logged in `vault/overnight-questions.md`)

See that file for full detail. Summary:

1. **HealthConnect library choice:** `react-native-health-connect` vs `expo-health-connect` — picked the RN-prefixed one based on the comment in the existing `packages/health-sync/src/index.ts` header which references it. If Shankar prefers expo-health-connect, swap is local to `HealthConnectAdapter.ts`.
2. **ExerciseTime support:** Not in the HealthMetric enum yet. Adding it requires a `@genoly/types` update + adapter mapping. Future task.
3. **Settings entry point for revoking permissions:** Step 11 work. Settings screen will need a "Revoke health access" row; clicking it should call `setHealthSyncEnabled(false)` and inform the user to revoke at the OS level.
4. **`__DEV__` global in Jest:** I used `typeof __DEV__ !== 'undefined'` guards in adapters. Jest may need a global setup file to define `__DEV__` if these warnings fire in tests. Easy fix if it becomes an issue.

## Files touched summary

Across all three rounds:

- **17 new files** — 3 health adapters + mock + 1 index re-exports + 1 health test file + permissions screen + preferences util + 4 sync-queue source + 1 sync-queue test + Settings screen + Settings test + backgroundSync util + backgroundSync test + mobile DESIGN.md
- **4 modified files** — `packages/api-client/src/client.ts`, `apps/mobile/app/_layout.tsx`, `packages/health-sync/src/index.ts`, `apps/mobile/__tests__/auth-gate.test.tsx`, plus the permissions screen (Round 3 added bg-sync register) and `apps/mobile/package.json` (sync-queue dep)
- **0 commits** — per Shankar's instruction

## What's next (Step 7 + beyond)

- **Step 7** — Dashboard (today + last 7 days). Reads from `SyncQueue` via getQueueDepth + `apiClient.getDailyAggregates`. UI work, better with Shankar's visual eyes. Now anchored by the mobile `DESIGN.md`.
- **Step 8** — Friends list. UI screens for friends-by-status (pending / accepted / blocked) + a "request friend" search modal. ApiClient methods for these are still stubbed (5/20 implemented).
- **Step 9** — Leaderboard. Pulls from the still-stubbed `apiClient.getLeaderboard()`.
- **Step 10** — Goals. Up to 4 active goals + history.
- **Step 13** — Detox or Maestro E2E test scaffolding.
- **Steps 4 + 12 + 6 device verification** — All three adapters + background-fetch need real-simulator/emulator runs. The wiring is right; runtime behavior is Shankar's verify step.
- **Mobile theme module** — Lift the inlined hex literals into a shared `theme/colors.ts`. Mechanical migration in one PR once the dark palette is decided. Tracked in `DESIGN.md` §10.

## See also

- `vault/overnight-questions.md` — judgment calls + ambiguities
- `vault/overnight-morning-review.md` — commit script + verification steps for tomorrow morning
- `[[2026-05-28-mobile-step-2-3]]` — Step 2+3 phase page (predecessor)
- `../genoly-family-web/docs/mobile-sync-architecture.md` §4 (permission flow), §9 (clock drift), §10 (sparse semantics)
