# Active Context — fitness

**Last Updated:** 2026-05-02
**Status:** 🔵 PLANNING — no code written yet

---

## Current State

Monorepo scaffolding created. No app code exists yet.
Old separate repos (fitness-web, fitness-mobile) deleted — replaced by this monorepo.

## Key Decisions Made

- Monorepo approach confirmed
- Stack: Vite + React + Convex (web) + Expo React Native (mobile)
- GitHub org: hyperionsolutionsorg
- Git identity: `Genoly Projects <git@hyperionsolutions.org>`
- Health sync logic lives in `packages/health-sync/` — never in app UI code
- Deployment: GitHub Actions with path filters (web and mobile deploy independently)
- Mobile builds via EAS Build (free tier covers 4 friends)

## Next Steps (when ready to start)

1. Initialize workspace tooling (decide: npm workspaces, pnpm, or Turborepo)
2. Init `apps/web` — `npm create vite@latest`
3. Init `apps/mobile` — `npx create-expo-app`
4. Create `packages/types` — shared TypeScript interfaces
5. Set up Convex in `apps/web`
6. Design data model (users, health_entries, goals, friendships)
7. Build REST endpoint for mobile to POST health data
8. Build dashboard UI
9. Build mobile health sync + background fetch

## Open Questions

- Workspace manager: npm workspaces (simple) or pnpm (faster)?
- Domain: fitness.genoly.org or standalone domain?
- Convex project name?
