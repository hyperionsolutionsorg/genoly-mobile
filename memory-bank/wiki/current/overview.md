---
type: current
name: "Overview — genoly-mobile"
updated: 2026-07-11 (Transport hardening PR #46 open — fitness client HTTPS enforcement + Android cleartext off; part of the cross-repo security run. See log.md [2026-07-11].)
status: active
---

# Overview — the 30-second picture

`genoly-mobile` is the Expo mobile app + cross-platform packages for the unified Genoly mobile experience: the **member-side family app** (Convex reactive client, shipped 2026-06-11) and the **fitness layer** (HTTP bearer contract — Phase 1 largely shipped, 5/20 ApiClient methods implemented). The app is now **v1.0.0 and Pro-gated**: mobile access requires membership in a Pro-plan tenant (enforced client-side by `lib/planChecks.ts` + a paywall screen), and mobile itself remains payment-neutral (no in-app purchases) — web (genoly.org/pricing) is the sole subscription surface.

**Where things stand (2026-07-09):**

- **V1.0.0 shipped 2026-06-29/06-30** (PRs #24, #25, #26): Pro-only plan gate (`lib/planChecks.ts` — `hasAnyProTenant`, `filterProTenants`, 5-min downgrade grace; `app/(gated)/paywall.tsx`; 4th `AuthGate` arm in `app/_layout.tsx`), version bumped to 1.0.0 across all four version-bearing files, and a release automation script (`scripts/release.mjs` — atomic version bump + CHANGELOG generator + git tag). This had never been cascaded into these state files until today's backfill (see `log.md` 2026-07-09 entry).
- **Two-workstream run CLOSED 2026-07-09 (same day).** Workstream A: Phase 1 fitness Steps 8/9/10/13 built (stacked PRs #27→#29→#30→#33) + four Pro-gated tree surfaces ported (Explore-as-default, Register table, Classic pedigree, Fan — stacked PRs #28→#31→#32→#34, incl. AuthGate hardening from the Pro-gating audit `vault/pro-gating-audit-2026-07-09.md`). All 8 PRs reviewed, NONE merged — operator merge queue in session-handoff.md. Once merged, ApiClient stands 16/20 (4 stubs: getDevices/setPrimaryDevice/revokeDevice + getSubscription) and Phase 1 closes. Workstream B: challenge-growth research written to web `vault/research/` (uncommitted, operator review; recommends tree-less "Circles" + sponsored guest accounts).
- **Workspace root moved** `/Users/snalluri/Personal/Code/Geno` → `/Users/shankar/Code/Geno` (2026-07-09 new-Mac restore).
- **Mobile e2e run CLOSED 2026-06-11** (Claude autonomous): member-side app shipped (auth/wizard/dashboard/tree/photos/settings/support) + Family Walking Challenges end-to-end (web PR #128 + mobile PRs #16-#23) + store-readiness docs. Handoff: `vault/handoff-mobile-e2e-2026-06-11.md`; P1 backlog in handoff §7.

**Where things stood before the run (2026-06-05):**

- **Phase 0 is COMPLETE** as of 2026-05-08. Signed APK runs on a real Android phone; CI auto-triggers EAS builds on every `main` push.
- **Phase 1 (mobile sync + leaderboard) is IN PROGRESS.** Steps 1, 2, 3, 4, 5, 6, 7, 11, 12 merged. Step 8 (Leaderboard) is next.
- **Expo SDK 55 → 56 upgrade COMPLETE** (2026-06-05) — branch `chore/expo-sdk-56-upgrade`, PR pending merge. expo-router codemod applied, vector-icons migrated to `@react-native-vector-icons/fontawesome`, iOS 16.4 deployment target set, TypeScript 6 compat. Task #299 CLOSED; task #300 (real-device smoke) deferred to Shankar.
- **Server side (genoly-family-web/convex/fitness/) is COMPLETE.** 20 endpoints live on dev (`robust-oyster-899`). All curl smoke tests pass. Mobile just needs to consume them.

**Key cross-references:**

- Workspace: [`/Users/shankar/Code/Geno/AGENTS.md`](../../../../AGENTS.md) (workspace operating manual; moved from `/Users/snalluri/Personal/Code/Geno` 2026-07-09) + [`master-context.md`](../../../../master-context.md) (cross-repo state)
- Repo operating manual: [`../../../AGENTS.md`](../../../AGENTS.md)
- Fork procedure: [`../../../FORK_PROCEDURE.md`](../../../FORK_PROCEDURE.md)
- Mobile sync architecture (lives in web repo): `../genoly-family-web/docs/mobile-sync-architecture.md`
- Fitness API contract (lives in web repo): `../genoly-family-web/docs/fitness-api-contract.md`
- Detailed state: [`active-context.md`](./active-context.md), [`progress.md`](./progress.md), [`session-handoff.md`](./session-handoff.md)
- History: [`../../log.md`](../../log.md)
- Index: [`../../index.md`](../../index.md)

**Tech stack snapshot:** Expo SDK 56 + React Native 0.85.3 + React 19.2.3 + Expo Router ~56.2.9 + Hermes. App version 1.0.0 (source of truth `apps/mobile/app.json`; kept in sync with `apps/mobile/package.json`, root `package.json`, and `apps/mobile/constants/version.ts` by `scripts/release.mjs`). Native modules: `expo-secure-store` (auth), `expo-sqlite` (offline queue), `expo-background-fetch` (sync), `react-native-health` (HealthKit), `react-native-health-connect` (Health Connect). State: Zustand 5.x (planned). Forms: react-hook-form + zod. CI: EAS Build (Hobby tier). Icons: `@react-native-vector-icons/fontawesome` (migrated from `@expo/vector-icons` in SDK 56).

**The four `wiki/current/` files** are cascade-redundant projections per Rule #0. They stay coherent because every state change updates all four in the same commit. Each is ≤200 lines — older content archives to `wiki/phases/` or `wiki/decisions/`.
