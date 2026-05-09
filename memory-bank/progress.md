# Progress — genoly-mobile

**Last Updated:** 2026-05-07

---

## Status: 🟢 **Phase 0 mobile FULLY CLOSED** — all five Phase 0 tasks landed (#7 init, #8 package stubs, #10 EAS Build, #11 baseline verify, #9 CI). Mobile is now ready for Phase 1: HealthKit + Health Connect adapter implementations in `packages/health-sync/`, fetch-client implementation in `packages/api-client/`, login screen + bearer-token storage via `expo-secure-store`, background sync via `expo-background-fetch`. Phase 1 work primarily lives in `genoly-family-web/convex/fitness/` (mutation handlers per the API contract — tasks #18, #19, #20 — and the matching `convex/http.ts` route registrations).

---

## ✅ Decisions Complete

- [x] Web framework → **Vite + React + TypeScript** (consistent with Genoly)
- [x] Backend → **Convex** (shared with Genoly's deployment)
- [x] Mobile framework → **Expo React Native** (cross-platform: iOS + Android from one codebase)
- [x] Web architecture → **Path A embedded** — fitness pages live inside `genoly-family-web/src/pages/fitness/`
- [x] Mobile architecture → **ONE unified Genoly app**, fitness is first section, bottom-tab navigation
- [x] Repo strategy:
  - `fitness` repo to be **renamed `genoly-mobile`**, web folder removed, mobile + packages only
  - `genoly-family-web-docs` to be **deleted** (consolidate into `genoly-family-web/docs/`)
  - `genoly-family-web` keeps current name, hosts fitness web pages
- [x] Auth web → mirror Genoly's Convex Auth + Password + ZeptoMail OTP pattern
- [x] Auth mobile → per-device bearer tokens, 4-month hard expiry, single primary device
- [x] Database → shared Convex deployment with `fitness_*` table prefix + `fitness_users` indirection layer (forkability)
- [x] Subscription model → web-only Stripe; mobile apps free + payment-neutral
- [x] Distribution v1 → **Android-first** (direct APK), iOS second priority (after $99 Apple Developer Program is justified)
- [x] Data model principle → daily aggregates only, upsert by (userId, date)
- [x] Module separation → health-sync code stays in `packages/health-sync/` only
- [x] Sync pattern → hourly OS-throttled background fetch via `expo-background-fetch`

---

## ✅ Phase 0 prerequisites — Repo cleanup (DONE 2026-05-03)

- [x] Archive `genoly-family-web-docs` (renamed to `OLD_genoly-family-web-docs` on github.com); content consolidated into `genoly-family-web/docs/` and `genoly-family-web/memory-bank/`
- [x] Strip `apps/web/` from this repo (commit c5a0984)
- [x] Rename GitHub `fitness` → `genoly-mobile`
- [x] Update local remote URL to `https://github.com/hyperionsolutionsorg/genoly-mobile.git`
- [x] Update local folder name + all CONTEXT.md / memory-bank files to reflect mobile-only scope

## 🔴 Phase 0 — Foundation (active)

### Schema + API
- [ ] Design Convex `fitness_*` schema (users, health_daily, friendships, goals, devices, tokens) — added to `genoly-family-web/convex/schema.ts`
- [ ] Design mobile→server HTTP API in `genoly-family-web/convex/http.ts` under `/api/fitness/*`
- [ ] Set up ESLint cross-boundary import rule in `genoly-family-web`
- [ ] Write `FORK_PROCEDURE.md` documenting fitness extraction strategy

### Web (in genoly-family-web)
- [ ] Add fitness pages: `src/pages/fitness/{Dashboard,Friends,Leaderboard,Settings}.tsx`
- [ ] Add `convex/fitness/` directory for fitness queries/mutations
- [ ] Add fitness routes to App router

### Mobile (in genoly-mobile, this repo) — Phase 0 substantially complete

Cumulative results: Tasks 7, 8, 10, 11 done; Task 9 remaining.


- [x] Initialize Expo app in `apps/mobile/` with TypeScript template (Task #7, 2026-05-07, **commit `6da2488`**) — Expo Router 6 tabs template, SDK 54, RN 0.81, New Architecture enabled, typed routes experiment on. Bundle id `org.hyperionsolutions.genoly`, deep-link scheme `genoly://`. Family tab is at `app/(tabs)/index.tsx` (URL `/`), three more tabs at `/fitness`, `/notifications`, `/settings`.
- [x] Bottom-tab navigation skeleton: Family / Fitness / Notifications / Settings (Task #7, commit `6da2488`) — file-based routes in `apps/mobile/app/(tabs)/`, FontAwesome icons (sitemap / heartbeat / bell / cog), placeholder screens with phase notes. Smoke-tested via Expo Go tunnel mode on Android.
- [x] npm workspaces wired at repo root (Task #7 follow-up, commit `6da2488`) — root `package.json` with `apps/*` + `packages/*` workspaces, stub `package.json` in each of `packages/{health-sync,types,api-client}`, `metro.config.js` extends `watchFolders` to workspace root for fast refresh on packages/* edits (verified via `expo-doctor` 17/17).
- [x] **Task #8** — Wire interface definitions in all three workspace packages. Landed 2026-05-08, **commit `9657069`** (11 files, +586/-11), pushed to origin. Implementation (HealthKit, Health Connect, fetch client) lands in Phase 1.
  - `packages/types/src/index.ts` — all shared types: literal unions (`Platform`, `HealthSource`, `SubscriptionTier`, `FriendshipStatus`, `DeviceStatus`, `GoalPeriod`, `GoalMetric`, `TokenScope`); `HealthEntry` + `HealthEntryUpload`; `FitnessUser`, `FitnessDevice`, `FitnessTokenIssue`; `FriendBrief`, `FriendsByStatus`, `LeaderboardRow`, `Leaderboard`; `Goal`, `ArchivedGoal`; `SubscriptionStatus` (with `isPaymentNeutral: true` literal tripwire); `SessionState`; `ApiError` + `ApiErrorResponse`. Aligned 1:1 with `genoly-family-web/docs/fitness-api-contract.md`.
  - `packages/health-sync/src/index.ts` — `HealthAdapter` interface (`getPlatform`, `isAvailable`, `requestPermissions`, `readDailyAggregates`); `HealthSample`, `HealthMetric`, `HealthAdapterPermissionState`, `HealthAdapterOptions`. Imports from `@genoly/types` only.
  - `packages/api-client/src/index.ts` — `ApiClient` interface mirroring all 20 endpoints from the contract; `ApiClientConfig`; `ApiClientError` thrown class. Imports from `@genoly/types` only.
  - Cross-package wiring: `apps/mobile/package.json` declares `@genoly/{types,health-sync,api-client}` as deps; `health-sync` and `api-client` each declare `@genoly/types` as a dep. npm workspaces resolves via symlinks at the repo-root `node_modules/@genoly/`.
- [x] **Task #10** — EAS Build for Android. eas.json with three profiles (`development` / `preview` / `production`); preview profile produces a sideloadable APK via internal distribution. First build: `b0260446-e70b-4832-8ee6-567a5731545c` on EAS Hobby tier (free). Android keystore auto-managed by Expo (cloud-stored, no local `.jks` file). Bundle id `org.hyperionsolutions.genoly`. Verified by installing on a real Android phone via Chrome QR-scan + sideload — all four tabs (Family, Fitness, Notifications, Settings) render with their FontAwesome 5 icons (sitemap, heartbeat, bell, cog), navigation works, no error overlay. EAS project: `@hyperionsolutionsorg/genoly-mobile` (project ID `a059fba2-1ef7-431c-9870-6325603f3ada`). 2026-05-08.
- [x] **Task #11** — Verify Phase 0 baseline. Met: `npx tsc --noEmit` clean from `apps/mobile/` (verified after Task #8), and EAS produced a working signed APK that runs on a real Android device with the expected UI (verified after Task #10). 2026-05-08.
- [x] **Task #9** — GitHub Actions for `build-android.yml` (commit `03e5a73`, 2026-05-08). `.github/workflows/build-android.yml` triggers on push to main with path filter on `apps/mobile/**` + `packages/**` + the workflow itself, plus `workflow_dispatch` for manual runs with profile choice. Concurrency cancels in-progress builds for same branch on rapid pushes. Calls `eas build --platform android --profile preview --non-interactive --no-wait` so the GitHub Actions job exits in ~3 min while EAS continues the cloud build. Auth via `EXPO_TOKEN` secret (token generated at expo.dev/settings/access-tokens, added under repo Settings → Secrets → Actions). Verified end-to-end: the workflow commit's own push triggered an automated build (EAS build `89183f18-3024-4785-8b97-d1d524303828`) that ran successfully without manual intervention. **Phase 0 mobile is now fully closed.**
- [ ] Login screen (calls server's mobile token endpoint) — Phase 1
- [ ] Background sync task scheduler — Phase 1

### CI/CD
- [ ] GitHub Actions for `genoly-family-web`: deploy-web with path filter on `convex/fitness/**` + `src/pages/fitness/**`
- [ ] GitHub Actions for `genoly-mobile`: build-android (EAS Build) — iOS deferred
- [ ] EAS Build config for Android v1

## 🟡 Phase 1 — Core Data + Sync

- [ ] Implement Convex `fitness_*` queries + mutations
- [ ] Implement `POST /api/fitness/sync` endpoint with token auth
- [ ] HealthKit reader (iOS) — when iOS work begins
- [ ] Health Connect reader (Android)
- [ ] Background sync (expo-background-fetch — hourly)
- [ ] Permission request flow in mobile app

## 🟡 Phase 2 — Web Dashboard

- [ ] Personal dashboard: today's steps + calories
- [ ] Friends list + their data
- [ ] Real-time leaderboard (Convex reactive query)
- [ ] Historical charts (weekly/monthly)

## 🟡 Phase 3 — Goals + Competitions

- [ ] Goal setting (daily/weekly targets)
- [ ] Head-to-head challenges
- [ ] Notifications (preference-gated)

## 🟡 Phase 4 — Distribution

- [ ] Android: APK download link at fitness.genoly.org/download/android
- [ ] iOS (deferred): EAS Build → TestFlight (after $99 Apple Developer Program signup)
- [ ] Web: deploy via existing genoly-family-web pipeline
