---
type: current
name: "Active context — genoly-mobile"
updated: 2026-05-28
status: active
---

# Active context

**What's being worked on right now.** Keep this file under 200 lines.

## Current focus

**Mobile Step 2 + Step 3 SHIPPED!** Login screen (react-hook-form + zod + apiClient.issueToken) AND cold-start auth gate (local tokenStore check, no server round-trip) are live on `active-agravity-step2-branch` and ready for review/merge. Plus first-class Jest + React Native Testing Library testing setup. **Step 4 (HealthKit adapter + permission flow) is next.**

**2026-05-28:** Step 1 merged via PR #3 (squash `75d6e1a`). Step 2+3 implementation completed across 4 review iterations (Gemini Flash Low → GPT-OSS 120B medium → Claude takeover). Code, tests, and Rule #0 cascade all done; awaiting Shankar's `git push` + draft PR.

## Recent events

- **2026-05-28** — **Mobile Step 2 + Step 3 IMPLEMENTATION COMPLETE.** Login screen + cold-start auth gate + Jest setup + auth-gate test suite (4 cases) + login test (validation + success + error). See `[[2026-05-28-mobile-step-2-3]]`. 4 review iterations summarized there.
- **2026-05-28** — **Mobile Step 1 MERGED via PR #3** (squash `75d6e1a` on main).
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
- ~~**Mobile-side step 1: token store + ApiClient skeleton**~~ DONE 2026-05-28. Merged via PR #3 (`75d6e1a`).
- ~~**Mobile-side step 2: login screen**~~ DONE 2026-05-28 (on `active-agravity-step2-branch`). See `[[2026-05-28-mobile-step-2-3]]`.
- ~~**Mobile-side step 3: cold-start session check**~~ DONE 2026-05-28 (same branch as Step 2). See `[[2026-05-28-mobile-step-2-3]]`.
- **Mobile-side step 4: HealthKit adapter + permission flow** — Next handoff. Depends on Step 2+3 PR merging first.


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
| `packages/api-client/` | Step 1 SHIPPED — `FetchApiClient` with `issueToken` happy path + 19 stubbed methods. Singleton wiring in `apps/mobile/utils/api.ts`. Now also exports a shared `tokenStore` used by both ApiClient + auth gate. |
| `packages/health-sync/` | HealthAdapter interface defined. HealthKitAdapter / HealthConnectAdapter implementations pending step 4. |
| `packages/types/` | Mirrors `docs/fitness-api-contract.md` types. `isPaymentNeutral: true` tripwire confirmed in `SubscriptionStatus` type. |
| `apps/mobile/app/_layout.tsx` | Step 3 SHIPPED — cold-start auth gate. Two-arm redirect (no-token OR expired-token → login). Fail-closed on storage errors. |
| `apps/mobile/app/(auth)/login.tsx` | Step 2 SHIPPED — login screen with react-hook-form + zod + Controller-wired inputs + ApiClientError → friendly message mapping. |
| `apps/mobile/app/(tabs)/` | 4-tab scaffold unchanged (per Decision 6). Auth gate now gates access; tabs themselves still placeholders. Real content in Step 5+. |
| `apps/mobile/__tests__/` | Jest + React Native Testing Library wired. login.test.tsx + auth-gate.test.tsx (4 cases) + token-store.test.ts. |
