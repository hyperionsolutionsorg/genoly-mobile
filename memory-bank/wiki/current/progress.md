---
type: current
name: "Progress — genoly-mobile"
updated: 2026-05-28
status: active
---

# Progress

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

## Phase 1 commits (reference)

| Date | Commit | Subject |
|---|---|---|
| 2026-05-28 | (pending push) | feat(mobile): Phase 1 Step 2+3 — login screen + cold-start auth gate + Jest setup |
| 2026-05-28 | `75d6e1a` (squash merge of PR #3) | feat(mobile): Phase 1 Step 1 — token store + ApiClient skeleton + issueToken (Antigravity) |

## Phase 1 plan (13 steps from `../genoly-family-web/docs/mobile-sync-architecture.md` §15)

| # | Step | Owner | Status |
|---|---|---|---|
| 1 | Token store + ApiClient skeleton | Antigravity (Claude reviewed) | DONE 2026-05-28 — merged via PR #3, squash `75d6e1a` |
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

## Applied Decisions (Step 1)

All 5 pending decisions delegated to Antigravity's judgment have been resolved:
1. **Production Convex URL**: Placeholder URL maintained in constants; dynamic injection to be kept flexible.
2. **App version source**: Handled via config injection using `Constants.expoConfig.version` in `apps/mobile`.
3. **Singleton instantiation**: Wired as module-level singleton in `packages/api-client/src/index.ts`.
4. **Implement issueToken now?**: Yes, fully implemented so happy path is verifiable.
5. **Test script location**: Wired in `apps/mobile/scripts/test-api-client.ts`.

