---
type: current
name: "Active context — genoly-mobile"
updated: 2026-05-29-overnight
status: active
---

# Active context

**What's being worked on right now.** Keep this file under 200 lines.

## Current focus

**Steps 4 + 12 + 5 + 11 + 6 + DESIGN.md MERGED 2026-05-29 via PR #5, squash commit `10f6f03` on main.** Follow-up infra commit in progress: native modules installed via `npx expo install` + app.json plugin config + iOS UIBackgroundModes + Android RECEIVE_BOOT_COMPLETED — fixes the CI failure on `10f6f03` (out-of-sync package-lock.json). Plus the post-merge state cascade.

What landed across the rounds:
- **Round 1 (Steps 4 + 12):** `HealthKitAdapter` (iOS, `react-native-health`), `HealthConnectAdapter` (Android, `react-native-health-connect`), `MockHealthAdapter`, `createHealthAdapter()` factory, first-run permissions screen (`/(auth)/permissions`), auth-gate three-arm routing, `apps/mobile/utils/preferences.ts`, 4 ApiClient methods unstubbed (`revokeToken`, `getSession`, `getDailyAggregates`, `syncDailyAggregates`).
- **Round 2 (Step 5):** NEW `@genoly/sync-queue` package — SQLite-backed outbox + drainer + retry classifier + dead-letter, 16-test Jest suite.
- **Round 3 (Steps 11 + 6 + DESIGN.md):** Full Settings screen with revoke-token sign-out (`apps/mobile/app/(tabs)/settings.tsx`). Background-fetch task wiring (`apps/mobile/utils/backgroundSync.ts`) calling `SyncQueue.drain()`. Auth-gate test fixed (Round 1 broke it by adding the permissions arm). New mobile `DESIGN.md` at repo root.

**Total: 52 tests** (16 health-sync + 16 sync-queue + 8 settings + 12 background-sync) — plus refreshed auth-gate (5 tests) + existing login (1) = 58 across the workspace. `npx tsc --noEmit -p apps/mobile/tsconfig.json` exits 0 after all three rounds.

See `[[2026-05-29-mobile-step-4-12-overnight]]` for full detail, `vault/overnight-morning-review.md` for the commit script + verification steps, and `vault/overnight-questions.md` for 10 judgment-call items for morning review.

**Mobile Step 2 + Step 3 SHIPPED!** Login screen (react-hook-form + zod + apiClient.issueToken) AND cold-start auth gate (local tokenStore check, no server round-trip) are merged via PR #4 (`d2e3a35`). Plus first-class Jest + React Native Testing Library testing setup.

**2026-05-28:** Step 1 merged via PR #3 (squash `75d6e1a`). Step 2+3 implementation completed across 4 review iterations (Gemini Flash Low → GPT-OSS 120B medium → Claude takeover). Code, tests, and Rule #0 cascade all done; awaiting Shankar's `git push` + draft PR.

## Recent events

- **2026-05-29 overnight Round 3 (Claude autonomous)** — **Steps 11 + 6 + mobile DESIGN.md IMPLEMENTATION COMPLETE.** Settings screen with sign-out (revokeToken + reset prefs + unregister bg-fetch + fail-closed), background-fetch task wiring (`apps/mobile/utils/backgroundSync.ts` calling `SyncQueue.drain()`), auth-gate test refresh (was broken by Round 1's permissions arm), mobile `DESIGN.md` at repo root mirroring web DESIGN.md format. 20 new tests (8 settings + 12 backgroundSync). NO COMMITS — still working tree on main, awaiting Shankar's morning review.
- **2026-05-29 overnight Round 2 (Claude autonomous)** — **Step 5 (`@genoly/sync-queue`) added after Shankar's "Steps 4+12+5" green-light.** SQLite-backed outbox + drainer + retry + dead-letter + 16-test suite.
- **2026-05-29 overnight Round 1 (Claude autonomous)** — **Steps 4 + 12 IMPLEMENTATION COMPLETE.** HealthKit + Health Connect adapters + permissions screen + 4 ApiClient methods + Jest test suite. See `[[2026-05-29-mobile-step-4-12-overnight]]`.
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
- ~~**Mobile-side step 4: HealthKit adapter + permission flow**~~ DONE 2026-05-29 (overnight Round 1). See `[[2026-05-29-mobile-step-4-12-overnight]]`.
- ~~**Mobile-side step 12: Health Connect adapter**~~ DONE 2026-05-29 (overnight Round 1).
- ~~**Mobile-side step 5: SQLite sync queue**~~ DONE 2026-05-29 (overnight Round 2).
- ~~**Mobile-side step 11: Settings + logout**~~ DONE 2026-05-29 (overnight Round 3).
- ~~**Mobile-side step 6: background fetch wiring**~~ DONE 2026-05-29 (overnight Round 3).
- ~~**Mobile `DESIGN.md`**~~ DONE 2026-05-29 (overnight Round 3).
- **Mobile-side step 7: Dashboard (today + last 7 days)** — Next handoff. UI work; anchored by the new `DESIGN.md`.


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
