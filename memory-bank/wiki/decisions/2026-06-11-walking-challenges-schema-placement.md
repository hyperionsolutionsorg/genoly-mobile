---
type: decision
name: "Walking-challenge tables live on the Genoly side; the fitness API contract is untouched"
date_decided: 2026-06-11
status: active
tags: [mobile, walking-challenges, forkability, schema, tenant-firewall]
sources: ["co-hosted-architecture.md", "fitness-api-contract.md", "[[2026-06-11-member-side-convex-client]]"]
---

# Walking challenges are a Genoly (tree-scoped) feature

**Definition:** `walkingChallenges` + `challengeParticipants` are Genoly tables in `genoly-family-web/convex/schema.ts` (NOT `fitness_*`), with functions in `convex/walkingChallenges.ts` (NOT `convex/fitness/`). Mobile reports step counts into joined challenges via a Genoly mutation (`walkingChallenges.syncMySteps`), sourced from the device's HealthKit/Health Connect reads it already performs. `docs/fitness-api-contract.md` gets **zero changes**.

## Why

1. **Challenges are per-tree.** The tenant firewall applies (`requireTreeViewer` + member double-gating). `co-hosted-architecture.md` anti-patterns are explicit: *"fitness is intentionally user-scoped, not tenant-scoped… never store the tenant id on a fitness table."* A `treeId` column on a fitness table would poison the fork.
2. **The fork must not take family features with it.** If fitness extracts tomorrow, family walking challenges must keep working for Genoly members. Genoly code may not import `convex/fitness/` (ESLint zone 2), so challenge leaderboards cannot read `fitness_health_daily` anyway.
3. **The brief anticipated this.** §6.3: "these may even need to live OUTSIDE fitness/ if they cross the contract boundary; investigate." Investigated — they must.

## Schema (additive)

- `walkingChallenges`: `treeId`, `createdByUserId`, `name`, `type` (cooperative|individual), `windowType` (daily|weekly|monthly), `startAt`, `endAt`, `goal` (number|null), `inviteOnly`, `status` (active|completed|cancelled), `isTestData?`. Indexes: `by_treeId`, `by_treeId_status`.
- `challengeParticipants`: `challengeId`, `treeId` (denormalized for firewall checks), `userId`, `joinedAt`, `currentSteps`, `stepsByDay` (bounded array for the window), `lastSyncedAt`, `leftAt?`, `hideActivity?`, `isTestData?`. Indexes: `by_challengeId`, `by_userId_status`-ish (`by_userId`), `by_challengeId_userId`.
- Step data is **denormalized onto the participant row** by the mobile sync mutation — challenge leaderboard reads are one indexed range read, never a fan-out across health data (141% bandwidth cap respected).

## Functions (Genoly-side, public, auth + tenant-gated)

`create`, `join`, `leave`, `cancel` (creator or tree admin), `listTreeChallenges`, `listMyActiveChallenges`, `getChallengeLeaderboard`, `syncMySteps` (idempotent per (participant, day); validates membership + joined state; clamps to window; server timestamps authoritative).

## Privacy invariants

- Steps NEVER flow anywhere without explicit per-challenge opt-in (join).
- Leaving stops future syncs; prior contributions remain (cooperative totals stay honest).
- `hideActivity` hides a member from leaderboard rows while keeping personal stats.
- Challenge data joins the GDPR export; web members without the app see steps 0 + "Get the app" CTA.

## Rejected alternatives

- **Extend `convex/fitness/` + the API contract** (the brief's default sketch) — violates tenant anti-pattern, couples family features to the fork, requires a contract version bump for no gain.
- **Compute leaderboards from `fitness_health_daily` at read time** — crosses the ESLint boundary, fans out reads, and breaks at fork time.

## Cross-references

- [[2026-06-11-member-side-convex-client]] — why mobile can call Genoly mutations directly.
- Web-side surface decision to follow when H1 lands (dedicated `/tree/:slug/challenges` page vs 5th leaderboard board).
