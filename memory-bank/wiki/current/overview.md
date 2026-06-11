---
type: current
name: "Overview — genoly-mobile"
updated: 2026-06-11
status: active
---

# Overview — the 30-second picture

`genoly-mobile` is the Expo mobile app + cross-platform packages for the unified Genoly mobile experience: the **member-side family app** (Convex reactive client — in build-out as of 2026-06-11) and the **fitness layer** (HTTP bearer contract — Phase 1 largely shipped). Mobile is payment-neutral (no in-app purchases) — web (genoly.org/billing) is the sole subscription surface.

**Where things stand (2026-06-11):**

- **Mobile e2e run IN FLIGHT** (Claude autonomous): member-side parity + Family Walking Challenges + deployment readiness. Plan: `vault/mobile-improvement-plan.md`; audit: `vault/mobile-audit.md`; phase page [[2026-06-11-mobile-e2e-plan]].

**Where things stood before the run (2026-06-05):**

- **Phase 0 is COMPLETE** as of 2026-05-08. Signed APK runs on a real Android phone; CI auto-triggers EAS builds on every `main` push.
- **Phase 1 (mobile sync + leaderboard) is IN PROGRESS.** Steps 1, 2, 3, 4, 5, 6, 7, 11, 12 merged. Step 8 (Leaderboard) is next.
- **Expo SDK 55 → 56 upgrade COMPLETE** (2026-06-05) — branch `chore/expo-sdk-56-upgrade`, PR pending merge. expo-router codemod applied, vector-icons migrated to `@react-native-vector-icons/fontawesome`, iOS 16.4 deployment target set, TypeScript 6 compat. Task #299 CLOSED; task #300 (real-device smoke) deferred to Shankar.
- **Server side (genoly-family-web/convex/fitness/) is COMPLETE.** 20 endpoints live on dev (`robust-oyster-899`). All curl smoke tests pass. Mobile just needs to consume them.

**Key cross-references:**

- Workspace: [`/Users/snalluri/Personal/Code/Geno/AGENTS.md`](../../../../AGENTS.md) (workspace operating manual) + [`master-context.md`](../../../../master-context.md) (cross-repo state)
- Repo operating manual: [`../../../AGENTS.md`](../../../AGENTS.md)
- Fork procedure: [`../../../FORK_PROCEDURE.md`](../../../FORK_PROCEDURE.md)
- Mobile sync architecture (lives in web repo): `../genoly-family-web/docs/mobile-sync-architecture.md`
- Fitness API contract (lives in web repo): `../genoly-family-web/docs/fitness-api-contract.md`
- Detailed state: [`active-context.md`](./active-context.md), [`progress.md`](./progress.md), [`session-handoff.md`](./session-handoff.md)
- History: [`../../log.md`](../../log.md)
- Index: [`../../index.md`](../../index.md)

**Tech stack snapshot:** Expo SDK 56 + React Native 0.85.3 + React 19.2.3 + Expo Router ~56.2.9 + Hermes. Native modules: `expo-secure-store` (auth), `expo-sqlite` (offline queue), `expo-background-fetch` (sync), `react-native-health` (HealthKit), `react-native-health-connect` (Health Connect). State: Zustand 5.x (planned). Forms: react-hook-form + zod. CI: EAS Build (Hobby tier). Icons: `@react-native-vector-icons/fontawesome` (migrated from `@expo/vector-icons` in SDK 56).

**The four `wiki/current/` files** are cascade-redundant projections per Rule #0. They stay coherent because every state change updates all four in the same commit. Each is ≤200 lines — older content archives to `wiki/phases/` or `wiki/decisions/`.
