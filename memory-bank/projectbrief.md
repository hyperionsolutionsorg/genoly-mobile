# Project Brief — genoly-mobile

**Status:** 🔵 PLANNING — architecture finalized 2026-05-03; Phase 0 init pending
**Last Updated:** 2026-05-03
**GitHub:** https://github.com/hyperionsolutionsorg/genoly-mobile (renamed from `fitness` 2026-05-03)

---

## What We're Building

ONE unified Genoly mobile app — Expo React Native, cross-platform (iOS + Android from a single TypeScript codebase). Bottom-tab navigation: Family Tree / Fitness / Notifications / Settings.

The fitness section is the first filled tab in v1: friends and family install the app, which quietly reads steps and calories from their phone (HealthKit on iOS, Health Connect on Android) and syncs hourly to the shared backend. Everyone sees each other's data on the web dashboard at `genoly.org` (fitness pages live in the `genoly-family-web` repo).

Future tabs (Family Tree, Notifications, Settings) will fill in over later phases as Genoly's web features are mirrored on mobile where appropriate.

## Structure

| Path | Purpose |
|---|---|
| `apps/mobile/` | Expo React Native app — single codebase ships both platforms |
| `packages/health-sync/` | Health-reading module. HealthKit + Health Connect adapters behind one interface. ALL health code lives here only — never in screen components. |
| `packages/types/` | Shared TypeScript types (HealthEntry, User, Goal, Device, Token, etc.) |
| `packages/api-client/` | HTTP client for the genoly-family-web backend |

(NO `apps/web/` — fitness web pages live in `../genoly-family-web/src/pages/fitness/`.)

## Target Users (v1)

Small friends-and-family group for the fitness section. Genoly itself targets families building private genealogy trees; the mobile app extends Genoly to phones. Numbers grow with Genoly platform adoption.

## Deployment

| Platform | How | Distribution |
|---|---|---|
| **Android** (FIRST priority) | EAS Build → signed APK | Direct download link on `fitness.genoly.org/download/android` (no Play Store needed initially) |
| **iOS** (SECOND priority, deferred) | EAS Build → `.ipa` → TestFlight | Requires Apple Developer Program ($99/yr) — defer until traction justifies. Free sideloading paths (AltStore/SideStore/Expo Go) don't support HealthKit native modules. |
| Web (fitness pages) | n/a — built and deployed from `genoly-family-web` | `genoly.org` / `fitness.genoly.org` |

## Out of Scope (v1)

- App Store + Play Store listings (Android-only direct APK; iOS deferred entirely)
- GPS, heart rate, sleep (daily aggregates of steps + calories only)
- In-app payments, pricing UI, upgrade prompts (mobile is FREE + payment-neutral; subscriptions live exclusively on web via Stripe)
- Family Tree mobile features (tabs are scaffolded but content lands later)

## Success Criteria (v1)

- Small friend group can install on Android, log in, and see each other's daily steps + calories
- Data syncs automatically from phone hourly via OS-throttled background fetch
- Leaderboard updates in near-real-time on the web dashboard (Convex reactive query)
- Per-device bearer token with 4-month hard expiry; single primary device per user
- Forkability invariant intact — `fitness_*` schema + `fitness_users` indirection means the entire fitness product (web + mobile) remains extractable to its own Convex deployment within ~1-2 weeks
