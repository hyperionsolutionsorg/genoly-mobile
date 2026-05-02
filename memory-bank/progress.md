# Progress — fitness

**Last Updated:** 2026-05-02

---

## Status: 🔵 PLANNING — nothing built yet

---

## Phase 0 — Monorepo Foundation

- [ ] Choose workspace manager (npm workspaces or pnpm)
- [ ] Initialize `apps/web` (Vite + React + TypeScript)
- [ ] Initialize `apps/mobile` (Expo React Native)
- [ ] Create `packages/types` with shared interfaces
- [ ] Create `packages/api-client` with shared fetch helpers
- [ ] Create `packages/health-sync` structure (empty, ready for Phase 1)
- [ ] Set up Convex in `apps/web`
- [ ] Set up GitHub Actions workflows (deploy-web.yml + build-mobile.yml)

## Phase 1 — Core Data + Sync

- [ ] Design Convex data model (users, health_entries, friendships, goals)
- [ ] Build HTTP endpoint: `POST /api/health-sync`
- [ ] Build `packages/health-sync`: HealthKit reader (iOS)
- [ ] Build `packages/health-sync`: Health Connect reader (Android)
- [ ] Build background sync (expo-background-fetch)
- [ ] Build permission request flow in mobile app

## Phase 2 — Web Dashboard

- [ ] Auth (login + signup)
- [ ] Personal dashboard: today's steps + calories
- [ ] Friends list + their data
- [ ] Real-time leaderboard (Convex reactive query)
- [ ] Historical charts (weekly/monthly)

## Phase 3 — Goals + Competitions

- [ ] Goal setting (daily/weekly targets)
- [ ] Progress toward goal
- [ ] Head-to-head challenges
- [ ] Notifications (optional)

## Phase 4 — Distribution

- [ ] iOS: EAS Build → TestFlight
- [ ] Android: EAS Build → APK download link
- [ ] Web: deploy to Hostinger
