# Progress — genoly-mobile

**Last Updated:** 2026-05-03

---

## Status: 🔵 PLANNING — architecture migration COMPLETE; ready to start Phase 0 mobile work

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

### Mobile (in genoly-mobile, this repo)
- [ ] Initialize Expo app in `apps/mobile/` with TypeScript template
- [ ] Bottom-tab navigation skeleton: Family / Fitness / Notifications / Settings
- [ ] Wire `packages/health-sync` interface (HealthKit + Health Connect adapters)
- [ ] Login screen (calls server's mobile token endpoint)
- [ ] Background sync task scheduler

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
