# Project Brief — fitness

**Status:** 🔵 PLANNING
**Last Updated:** 2026-05-02
**GitHub:** hyperionsolutionsorg/fitness

---

## What We're Building

A monorepo containing a fitness tracking web dashboard and a companion mobile app. Friends and family install the mobile app, which quietly reads steps and calories from their phone and syncs to the web dashboard. Everyone sees each other's data, sets goals, and competes.

## Structure

| App/Package | Purpose |
|-------------|---------|
| `apps/web` | Vite + React + Convex dashboard — login, leaderboard, goals, charts |
| `apps/mobile` | Expo app — reads HealthKit/Health Connect, syncs to backend |
| `packages/health-sync` | Reusable health reading + sync logic. Future: plugs into Genoly mobile |
| `packages/types` | Shared TypeScript types (HealthEntry, User, Goal, etc.) |
| `packages/api-client` | Shared API calls used by both apps and packages |

## Target Users (v1)

4 friends. Grows to families. Eventually optional module in Genoly platform.

## Deployment

| App | How | Where |
|-----|-----|-------|
| `apps/web` | GitHub Actions → Hostinger | Same setup as Genoly |
| `apps/mobile` | GitHub Actions → EAS Build → TestFlight / APK | Expo cloud builds |

## Out of Scope (v1)

- App Store / Play Store (TestFlight + direct APK only)
- GPS, heart rate, sleep (steps + calories only)
- Payments, subscriptions
- Genoly integration (future)

## Success Criteria (v1)

- 4 friends can log in and see each other's daily steps + calories
- Data syncs automatically from phone every hour
- Leaderboard updates in real time
- Works on desktop + mobile browser
- iOS and Android both supported
