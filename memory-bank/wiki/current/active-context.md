---
type: current
name: "Active context — genoly-mobile"
updated: 2026-05-22
status: active
---

# Active context

**What's being worked on right now.** Keep this file under 200 lines.

## Current focus

**Mobile-side implementation is PAUSED, blocked on 5 decisions from Shankar.** Architecture is locked, foundation is in place, but step 1 (token store + ApiClient skeleton) can't start until the decisions land.

**Today (2026-05-22):** participating in the workspace-wide Karpathy memory bank migration. This repo's `AGENTS.md`, `CLAUDE.md`, `memory-bank/wiki/` structure created.

## Recent events

- **2026-05-22** — AI memory bank Phase 1 foundation landed (`d4fbecc`). `AGENTS.md` + `CLAUDE.md` thin pointer created. Wiki structure being populated this session.
- **2026-05-15** — Mobile sync architecture doc landed in genoly-family-web (`docs/mobile-sync-architecture.md`, 750 lines, 17 sections) — locks the client-side design for fitness mobile. Pending: 5 decisions before implementation starts.
- **2026-05-15** — `FORK_PROCEDURE.md` updated to reflect Phase A forkability lint fix + http.ts exception + sanity-check requirement.
- **2026-05-08** — Phase 0 fully closed (signed APK runs on real Android phone; GitHub Actions auto-triggers EAS builds).

## Blockers / waiting on

**5 mobile-side decisions pending Shankar's input:**

1. **Production Convex URL** — is `keen-owl-415` the real prod URL or placeholder? Need real URL to bake into `app.json` `extra.convexProdBaseUrl`.
2. **App version source** — recommendation: `Constants.expoConfig.version` from `expo-constants` (vs. hardcoding). Trivial confirm.
3. **Singleton instantiation strategy** — recommendation: module-level singleton in `packages/api-client/src/index.ts` (vs. Provider/Context vs. Zustand action). Trivial confirm.
4. **Implement `issueToken` fully now or stub for Step 2?** — recommendation: implement now (lets us smoke-test the happy path before Step 2's login UI lands).
5. **Test script location** — recommendation: `apps/mobile/scripts/test-api-client.ts`, runnable via `ts-node` or `bun`. Verifies issueToken end-to-end against dev backend before any UI work.

Most are quick "yes recommendation" confirmations. Decision 1 (prod URL) is the only substantive question.

## Active tasks

- **AI memory bank Phase 1 migration** — IN PROGRESS this session.
- **Mobile-side step 1: token store + ApiClient skeleton** — BLOCKED on 5 decisions. After those resolve: ~1 day of work per `mobile-sync-architecture.md` §15.

## Architecture reference

The complete client-side architecture lives in [`../genoly-family-web/docs/mobile-sync-architecture.md`](../../../../../genoly-family-web/docs/mobile-sync-architecture.md). 17 sections covering token lifecycle, offline SQLite queue, retry policy, error matrix, permission flow, clock-drift defense, background fetch, subscription compliance, 13-step phasing.

Server contract: [`../genoly-family-web/docs/fitness-api-contract.md`](../../../../../genoly-family-web/docs/fitness-api-contract.md).

## Important cross-references

- **Workspace operating manual:** `/Users/snalluri/Personal/Code/Geno/AGENTS.md`
- **This repo's operating manual:** `/Users/snalluri/Personal/Code/Geno/genoly-mobile/AGENTS.md`
- **Cross-repo state snapshot:** `/Users/snalluri/Personal/Code/Geno/master-context.md`
- **Fork procedure:** `./FORK_PROCEDURE.md`
- **Web repo session handoff:** `../genoly-family-web/memory-bank/wiki/current/session-handoff.md`

## Current state of packages

| Package | State |
|---|---|
| `packages/api-client/` | Interface defined (20 methods, ApiClientError, ApiClientConfig). Implementation pending step 1. |
| `packages/health-sync/` | HealthAdapter interface defined. HealthKitAdapter / HealthConnectAdapter implementations pending step 4. |
| `packages/types/` | Mirrors `docs/fitness-api-contract.md` types. `isPaymentNeutral: true` tripwire confirmed in `SubscriptionStatus` type. |
| `apps/mobile/app/(tabs)/` | 4-tab scaffold with FontAwesome icons. All screens are placeholders. Login flow not wired. |
