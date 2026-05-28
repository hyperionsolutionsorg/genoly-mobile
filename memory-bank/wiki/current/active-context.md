---
type: current
name: "Active context — genoly-mobile"
updated: 2026-05-26
status: active
---

# Active context

**What's being worked on right now.** Keep this file under 200 lines.

## Current focus

**Mobile-side implementation Step 1 has shipped!** Token store + ApiClient skeleton happy path is live on `active-agravity-branch` and ready for review. Step 2 (login screen UI) is the next upcoming target.

**2026-05-28:** Step 1 implementation completed, tested via standalone local smoke-test runner, and branch isolated.

## Recent events

- **2026-05-28** — **Mobile-side Step 1 Completed** — Built SecureTokenStore and MemoryTokenStore with `expo-secure-store` backend, FetchApiClient skeleton with GET retry semantics, and integrated `issueToken`.
- **2026-05-26** — **AI memory bank Phase 3 (mobile)** — `docs/GRAPH_REPORT.md` + graphify AST extraction + hooks + adapter integrations. See `[[2026-05-26-phase-3-graphify-mobile]]`. Web companion phase shipped same day in `../genoly-family-web` at commit `0e3c402`.
- **2026-05-22** — AI memory bank Phase 1 foundation landed (`d4fbecc`). `AGENTS.md` + `CLAUDE.md` thin pointer created. Wiki structure being populated this session.
- **2026-05-15** — Mobile sync architecture doc landed in genoly-family-web (`docs/mobile-sync-architecture.md`, 750 lines, 17 sections) — locks the client-side design for fitness mobile.
- **2026-05-15** — `FORK_PROCEDURE.md` updated to reflect Phase A forkability lint fix + http.ts exception + sanity-check requirement.
- **2026-05-08** — Phase 0 fully closed (signed APK runs on real Android phone; GitHub Actions auto-triggers EAS builds).

## Applied decisions

1. **Production Convex URL**: Maintain base URL flexible, and stop & ask Shankar when production build timing arrives.
2. **App version source**: `Constants.expoConfig.version` injected in mobile wrapper.
3. **Singleton instantiation**: Module-level singleton in `packages/api-client/src/index.ts`.
4. **Implement issueToken fully now**: Done, verified end-to-end happy path.
5. **Test script location**: `apps/mobile/scripts/test-api-client.ts` configured.

## Active tasks

- ~~**AI memory bank Phase 1 migration**~~ DONE 2026-05-22 (`d4fbecc`).
- ~~**AI memory bank Phase 3 (Graphify) — mobile**~~ DONE 2026-05-26. See `[[2026-05-26-phase-3-graphify-mobile]]`.
- ~~**Mobile-side step 1: token store + ApiClient skeleton**~~ DONE 2026-05-28.
- **Mobile-side step 2: login screen** — Ready to start after Step 1 PR review.


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
