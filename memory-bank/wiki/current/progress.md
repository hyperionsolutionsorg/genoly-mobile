---
type: current
name: "Progress — genoly-mobile"
updated: 2026-06-10 (graphifyy 0.8.36 upgrade + AGENTS.md §10.1 cleanup; prior: 2026-06-05)
status: active
---

# Progress

> **2026-06-10 — Graphify Labs version bump + AGENTS.md graph-tooling cleanup (pre-commit; Shankar commits).** Workspace `graphifyy` CLI 0.8.20 → **0.8.36** (`pipx upgrade`; always the correct package — brief's typosquat/v2.1.0 framing was wrong, verified, not acted on). Mobile `graphify-out/` regenerated via `graphify update .` (AST-only, no key): **841 nodes / 67 communities**, force-directed `graph.html`. `genoly-mobile/AGENTS.md` §10.1 corrected (vis-network not "D3", node count 425→841, pipx install + `affected`/`watch`, structural-vs-narrative split). Mobile change is AGENTS.md only. ⚠️ `npm run typecheck` has 3 PRE-EXISTING errors (missing `@react-native-vector-icons` dep + Expo-Router typed-routes), unrelated. See web [[graph-report-regen-2026-06-09]] (2026-06-10 update).

## High-level status

| Phase | Status | Notes |
|---|---|---|
| **Phase 0 — Foundation** | ✅ COMPLETE 2026-05-08 | Expo Router init, package interface stubs, EAS Build for Android wired, GitHub Actions for auto-build, signed APK verified on real Android |
| **Phase 1 — Mobile sync + leaderboard** | 🟡 IN PROGRESS | 13-step implementation per `mobile-sync-architecture.md` §15. Step 1 SHIPPED. |
| **Phase 2 — Goals + competitions** | ⏳ NOT STARTED | Depends on Phase 1 |
| **Phase 3 — Distribution** | 🟡 PARTIAL | EAS Build pipeline + GitHub Actions ready. Public download link at `fitness.genoly.org/download/android` deferred until Phase 1 ships. iOS deferred until $99/yr Apple Developer Program signup. |

## Phase 0 commits (reference)

| Commit | Subject |
|---|---|
| `6da2488` | Expo Router init (apps/mobile scaffold) |
| `9657069` | Package interface stubs (api-client, health-sync, types) |
| `b0260446` (EAS) | First manual signed APK build — runs on real Android |
| `03e5a73` | GitHub Actions for build-android.yml |
| `89183f18` (EAS) | First CI-triggered EAS build |

## SDK upgrade commits (reference)

| Date | Commit | Subject |
|---|---|---|
| 2026-06-05 | PR #12 (commit `fa5cc27`) merged to main | chore(mobile): verify SDK 55 completeness, fix test regressions, sync dep dashboard |
| 2026-06-05 | PR #11 (commit `dfc73bb`) merged to main | chore(mobile): Expo SDK 54 → 55 upgrade |
| 2026-06-05 | `d931e42` (branch `chore/expo-sdk-56-upgrade`) | chore(mobile): bump to Expo SDK 56 — expo + sister packages |
| 2026-06-05 | `c427e64` | chore(mobile): apply expo-router SDK 56 codemod |
| 2026-06-05 | `5402c02` | chore(mobile): bump jest-expo to ^56 to match SDK major |
| 2026-06-05 | `4085f9f` | chore(mobile): bump iOS deployment target to 16.4 for SDK 56 |
| 2026-06-05 | `7e98553` | chore(mobile): SDK 56 breaking-change audit — vector-icons codemod, app.json plugins |
| 2026-06-05 | `01a7d56` | chore(mobile): SDK 56 verify — cleanup, TypeScript 6 compat, dedupe |

**SDK 56 upgrade task #299 CLOSED.** Task #300 (real-device smoke test) assigned to Shankar — see session-handoff.md.

**Test debt cluster:** #293 CLOSED (already resolved by SDK 56 upgrade — ts-jest not configured). #294 CLOSED (3 pre-existing failures fixed). #295 CLOSED (already resolved by SDK 56 upgrade — .tsx compilation working). `npm test` → 60/60 green, exit code 0.

## Phase 1 commits (reference)

| Date | Commit | Subject |
|---|---|---|
| 2026-05-29 | `f2463a8` (squash merge of PR #6, src commit `4fee913`) | chore(mobile): install native deps + app.json plugin config + post-merge state cascade — fixes CI failure on `10f6f03` |
| 2026-05-29 | `10f6f03` (squash merge of PR #5, src commit `51d5259`) | feat(mobile): Phase 1 Steps 4 + 12 + 5 + 11 + 6 + DESIGN.md — health adapters + permissions + sync queue + Settings + background fetch + mobile design system (Claude autonomous overnight, 3 rounds) |
| 2026-05-28 | `d2e3a35` (squash merge of PR #4) | feat(mobile): Phase 1 Step 2+3 — login screen + cold-start auth gate + Jest setup (4-round Antigravity → Claude completion) |
| 2026-05-28 | `75d6e1a` (squash merge of PR #3) | feat(mobile): Phase 1 Step 1 — token store + ApiClient skeleton + issueToken (Antigravity) |

## Phase 1 plan (13 steps from `../genoly-family-web/docs/mobile-sync-architecture.md` §15)

| # | Step | Owner | Status |
|---|---|---|---|
| 1 | Token store + ApiClient skeleton | Antigravity (Claude reviewed) | DONE 2026-05-28 — merged via PR #3, squash `75d6e1a` |
| 2 | Login screen (email + password) | Antigravity + Claude | DONE 2026-05-28 — merged via PR #4, squash `d2e3a35` |
| 3 | Session check on cold start | Antigravity + Claude | DONE 2026-05-28 — same PR as Step 2 |
| 4 | HealthKit adapter + permission flow | Claude (autonomous overnight Round 1) | DONE 2026-05-29 — merged via PR #5, squash `10f6f03` |
| 5 | SQLite sync queue + drainer | Claude (autonomous overnight Round 2) | DONE 2026-05-29 — `@genoly/sync-queue` package merged via PR #5, squash `10f6f03`. 16-test suite. |
| 6 | Background fetch wiring | Claude (autonomous overnight Round 3) | DONE 2026-05-29 — `apps/mobile/utils/backgroundSync.ts` wires `expo-background-fetch` + `expo-task-manager` to call `SyncQueue.drain()`. 12-test suite. Merged via PR #5 (`10f6f03`). Follow-up infra config (`UIBackgroundModes` + `RECEIVE_BOOT_COMPLETED`) merged via PR #6 (`f2463a8`). |
| 7 | Dashboard (today + last 7 days) | Claude (interactive) | IMPLEMENTATION COMPLETE 2026-05-29 — `apps/mobile/hooks/useDashboardData.ts` + `apps/mobile/app/(tabs)/fitness.tsx` (real Dashboard replacing stub). Big-number today card + 7-day horizontal bars + dead-letter banner + refresh button. 24-test suite. PR pending. See `[[2026-05-29-mobile-step-7-dashboard]]`. |
| 8 | Leaderboard screen | Claude | Depends on #7 |
| 9 | Friends list + actions | Claude | Depends on #8 |
| 10 | Goals + history screens | Claude | Depends on #7 |
| 11 | Settings + subscription read + logout | Claude (autonomous overnight Round 3) | DONE 2026-05-29 — `apps/mobile/app/(tabs)/settings.tsx` full Settings screen with sign-out flow (revokeToken + reset prefs + unregister bg-fetch + fail-closed if offline). 8-test suite. Merged via PR #5, squash `10f6f03`. |
| 12 | Health Connect adapter (Android parity) | Claude (autonomous overnight Round 1) | DONE 2026-05-29 — `HealthConnectAdapter` (Android, `react-native-health-connect`). Merged via PR #5, squash `10f6f03`. |
| 13 | Polish + manual test + submit | Claude | Depends on all |

Total estimated effort: ~10 working days for one engineer.

## Architecture decisions reference

| Decision | Owner | Source |
|---|---|---|
| Zustand 5.x for state | Locked | `mobile-sync-architecture.md` §1 |
| expo-secure-store only for auth | Locked | §1 |
| expo-sqlite for sync queue + caches | Locked | §1 |
| expo-background-fetch for scheduler | Locked | §1 |
| Native fetch + thin wrapper for HTTP | Locked | §1 |
| date-fns-tz for timezone math | Locked | §1 |
| Sentry deferred to Phase 1.5 | Locked | §1 |
| react-hook-form + zod for forms | Locked | §1 |
| Expo modules only, no bare workflow | Locked | §1 |
| 30-day initial historical pull | Locked | §1 |

## Applied Decisions (Step 1)

All 5 pending decisions delegated to Antigravity's judgment have been resolved:
1. **Production Convex URL**: Placeholder URL maintained in constants; dynamic injection to be kept flexible.
2. **App version source**: Handled via config injection using `Constants.expoConfig.version` in `apps/mobile`.
3. **Singleton instantiation**: Wired as module-level singleton in `packages/api-client/src/index.ts`.
4. **Implement issueToken now?**: Yes, fully implemented so happy path is verifiable.
5. **Test script location**: Wired in `apps/mobile/scripts/test-api-client.ts`.

