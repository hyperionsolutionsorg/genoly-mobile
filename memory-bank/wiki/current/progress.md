---
type: current
name: "Progress — genoly-mobile"
updated: 2026-05-22
status: active
---

# Progress

## High-level status

| Phase | Status | Notes |
|---|---|---|
| **Phase 0 — Foundation** | ✅ COMPLETE 2026-05-08 | Expo Router init, package interface stubs, EAS Build for Android wired, GitHub Actions for auto-build, signed APK verified on real Android |
| **Phase 1 — Mobile sync + leaderboard** | ⏳ PLANNED | 13-step implementation per `mobile-sync-architecture.md` §15. Step 1 blocked on 5 decisions. |
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

## Phase 1 plan (13 steps from `../genoly-family-web/docs/mobile-sync-architecture.md` §15)

| # | Step | Owner | Status |
|---|---|---|---|
| 1 | Token store + ApiClient skeleton | Claude | BLOCKED on 5 decisions |
| 2 | Login screen (email + password) | Claude | Depends on #1 |
| 3 | Session check on cold start | Claude | Depends on #1 |
| 4 | HealthKit adapter + permission flow | Claude | Depends on #3 |
| 5 | SQLite sync queue + drainer | Claude | Depends on #1 |
| 6 | Background fetch wiring | Claude | Depends on #5 |
| 7 | Dashboard (today + last 7 days) | Claude | Depends on #5 |
| 8 | Leaderboard screen | Claude | Depends on #7 |
| 9 | Friends list + actions | Claude | Depends on #8 |
| 10 | Goals + history screens | Claude | Depends on #7 |
| 11 | Settings + subscription read + logout | Claude | Depends on #10 |
| 12 | Health Connect adapter (Android parity) | Claude | Depends on #4 |
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

## Pending Shankar decisions (5)

| # | Decision | Recommendation |
|---|---|---|
| 1 | Production Convex URL | Need real URL (or TODO marker if not yet provisioned) |
| 2 | App version source | `Constants.expoConfig.version` |
| 3 | Singleton instantiation | Module-level in `packages/api-client/src/index.ts` |
| 4 | Implement issueToken now? | Yes — enables smoke-test before login UI |
| 5 | Test script location | `apps/mobile/scripts/test-api-client.ts` |
