# Tech Stack — fitness

**Status:** 🔵 PLANNING
**Last Updated:** 2026-05-02

---

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Web frontend | Vite + React + TypeScript | Same as Genoly — familiar, Convex-native |
| Backend | Convex | Real-time, auth, scheduler |
| Mobile | Expo (React Native) | iOS + Android from one codebase |
| iOS health | react-native-health | Reads Apple HealthKit |
| Android health | react-native-health-connect | Reads Google Health Connect |
| Background sync | expo-background-fetch + expo-task-manager | Hourly sync |
| Mobile builds | EAS Build (Expo) | Cloud builds, free tier |
| Hosting (web) | Hostinger | Same as Genoly |
| CI/CD | GitHub Actions | Path-filtered per app |

## Monorepo Workspace Structure

```
fitness/
├── apps/
│   ├── web/                  Vite + React + Convex
│   └── mobile/               Expo React Native
├── packages/
│   ├── health-sync/          HealthKit + Health Connect readers + sync logic
│   ├── types/                Shared TypeScript interfaces
│   └── api-client/           Shared fetch/API helpers
├── .github/
│   └── workflows/
│       ├── deploy-web.yml    triggers on apps/web/** or packages/**
│       └── build-mobile.yml  triggers on apps/mobile/** or packages/**
├── CONTEXT.md
└── memory-bank/
```

## GitHub Actions — Path Filter Logic

| Files changed | Web deploys | Mobile builds |
|---------------|------------|---------------|
| `apps/web/**` | ✅ | ❌ |
| `apps/mobile/**` | ❌ | ✅ |
| `packages/**` | ✅ | ✅ |

## Convex Data Model (Planned)

```
users          — id, name, email, timezone, apiToken
health_entries — userId, date, steps, calories, source, syncedAt
friendships    — userId, friendId, status
goals          — userId, metric, target, period (daily/weekly)
competitions   — id, challengerId, challengedId, metric, startDate, endDate
```

## Key Platform Notes

- HealthKit requires **real iPhone** — simulator cannot read health data
- Health Connect requires Android 9+. Pre-installed on Android 14+, downloadable on older
- EAS Build free tier: 30 iOS builds/month, unlimited Android
- Background fetch on iOS: system decides frequency (~15 min minimum, target 60 min)
