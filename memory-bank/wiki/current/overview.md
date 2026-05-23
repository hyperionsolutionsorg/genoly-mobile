---
type: current
name: "Overview — genoly-mobile"
updated: 2026-05-22
status: active
---

# Overview — the 30-second picture

`genoly-mobile` is the Expo mobile app + cross-platform packages for the Genoly Fitness product. Mobile is payment-neutral (no in-app purchases) — web (genoly.org/billing) is the sole subscription surface.

**Where things stand (2026-05-22):**

- **Phase 0 is COMPLETE** as of 2026-05-08. Signed APK runs on a real Android phone; CI auto-triggers EAS builds on every `main` push.
- **Phase 1 (mobile sync + leaderboard) is PLANNED but PAUSED.** Architecture is fully locked (`../genoly-family-web/docs/mobile-sync-architecture.md`, 17 sections, 13-step phasing). Step 1 (token store + ApiClient skeleton) is blocked on 5 decisions from Shankar — most are quick "confirm recommendation" calls, one (prod Convex URL) is substantive.
- **Server side (genoly-family-web/convex/fitness/) is COMPLETE.** 20 endpoints live on dev (`robust-oyster-899`). All curl smoke tests pass. Mobile just needs to consume them.
- **AI memory bank architecture migration** is underway today (workspace-wide) — adopting the Karpathy LLM Wiki pattern as a hybrid with our existing forkability + Rule #0 cascade requirements.

**Key cross-references:**

- Workspace: [`/Users/snalluri/Personal/Code/Geno/AGENTS.md`](../../../../AGENTS.md) (workspace operating manual) + [`master-context.md`](../../../../master-context.md) (cross-repo state)
- Repo operating manual: [`../../../AGENTS.md`](../../../AGENTS.md)
- Fork procedure: [`../../../FORK_PROCEDURE.md`](../../../FORK_PROCEDURE.md)
- Mobile sync architecture (lives in web repo): `../genoly-family-web/docs/mobile-sync-architecture.md`
- Fitness API contract (lives in web repo): `../genoly-family-web/docs/fitness-api-contract.md`
- Detailed state: [`active-context.md`](./active-context.md), [`progress.md`](./progress.md), [`session-handoff.md`](./session-handoff.md)
- History: [`../../log.md`](../../log.md)
- Index: [`../../index.md`](../../index.md)

**Tech stack snapshot:** Expo SDK 54 + React Native 0.81 + React 19 + Expo Router 6 + Hermes. Native modules: `expo-secure-store` (auth), `expo-sqlite` (offline queue), `expo-background-fetch` (sync), `react-native-health` (HealthKit), `expo-health-connect` (Health Connect). State: Zustand 5.x (planned). Forms: react-hook-form + zod. CI: EAS Build (Hobby tier).

**The four `wiki/current/` files** are cascade-redundant projections per Rule #0. They stay coherent because every state change updates all four in the same commit. Each is ≤200 lines — older content archives to `wiki/phases/` or `wiki/decisions/`.
