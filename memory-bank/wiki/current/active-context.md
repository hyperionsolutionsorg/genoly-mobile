---
type: current
name: "Active context — genoly-mobile"
updated: 2026-07-09 (state cascade backfill: V1.0.0 Pro gate + release automation; two-workstream run opened; prior: 2026-06-11 mobile e2e run close)
status: active
---

# Active context

**What's being worked on right now.** Keep this file under 200 lines.

## Current focus

**2026-07-09 — TWO-WORKSTREAM RUN OPEN.** This session also backfilled three PRs that landed 2026-06-29/06-30 but were never cascaded (last cascade here was 2026-06-11): **V1.0.0** (`ae3f781`, PR #24) shipped the mobile **Pro-only plan gate** — `apps/mobile/lib/planChecks.ts` (`hasAnyProTenant`, `filterProTenants`, `DOWNGRADE_GRACE_MS` = 5 min) + `useHasProTenantAccess()` hook in `lib/genolyApi.ts` + a 4th `AuthGate` arm in `app/_layout.tsx` (no Pro tenant → `/(gated)/paywall`, reactive downgrade with a 5-min grace banner) + new `app/(gated)/paywall.tsx` screen (Upgrade-on-web / Continue-on-web, no IAP) + version bump to 1.0.0. `1f4caac` (PR #25) fixed version drift (app.json + both package.json files left at 0.1.0). `4412d3a` (PR #26) added `scripts/release.mjs` (atomic 4-file version bump + CHANGELOG generator + git tag) + `docs/RELEASING.md`. Full detail: `log.md` 2026-07-09 entry. Workspace root also moved `/Users/snalluri/Personal/Code/Geno` → `/Users/shankar/Code/Geno` (new-Mac restore) — cross-references below updated.

**Today's dispatch:** Workstream A — finish Phase 1 fitness: **Step 8 leaderboard salvage IN FLIGHT** (branch `feat/step-8-leaderboard-salvage`, sourced from `origin/feat/step-8-leaderboard` `e630ba3`, pre-SDK-56, running in a sibling worktree) → Step 9 friends, Step 10 goals+history, Step 13 polish queued for today. Also porting four Pro-gated tree surfaces from web to mobile: Explorer-as-default, Register table view, Classic pedigree, Fan-if-legible. Workstream B — challenge-growth / standalone-user research (report only, no code), running in parallel.

**Baseline this session:** `npm run typecheck` 0 errors. `npm test` 189 passed / 12 skipped / 201 total (14 of 15 suites; 1 UI suite skipped — jest-expo 56 TurboModule gap, pre-existing). Uncommitted `package-lock.json` 3-line diff (`version` field 0.1.0→1.0.0 in 3 places, lockfile metadata drift from #25/#26, harmless) left uncommitted.

## Previous focus

**2026-06-11 — MOBILE E2E RUN IN FLIGHT (Claude autonomous, brief `_mobile-e2e-brief.md`).** Mission: member-side parity with web + Family Walking Challenges, deployment-ready. Phase A audit done (`vault/mobile-audit.md`): Steps 1-7/11/12 merged verified; **Step 8 Leaderboard unmerged on `origin/feat/step-8-leaderboard`** (cherry-pick + fixups later); fitness contract 20/20 server-side verified; 60/60 jest green; 3 typecheck errors = P0. Phase B plan: `vault/mobile-improvement-plan.md`. Decisions locked: [[2026-06-11-member-side-convex-client]] (member side = Convex reactive client + @convex-dev/auth RN; fitness HTTP contract untouched), [[2026-06-11-walking-challenges-schema-placement]] (challenge tables Genoly-side, tree-scoped, zero contract changes), [[2026-06-11-mobile-styling-approach]] (theme module on StyleSheet; no Tamagui/NativeWind). C1 foundation MERGED (PR #16 `7651701`): theme module (3 palettes) + UI kit + 5-tab member nav (Home/Tree/Challenges/Activity/Settings); typecheck debt cleared (0 errors); tests 90 pass. ✅ C2 member auth MERGED (PR #17 `cf5b041`): ConvexAuthProvider on RN + dual sessions + signup/forgot/MFA screens + identity banners on Home. ✅ C3 welcome wizard MERGED (PR #18 `75bc9dc`). ✅ C4 member dashboard MERGED (PR #19 `d84b9fd`) — Phase C complete. ✅ D1 tree essentials MERGED (PR #20 `0bfca9d`): tree hub + person profiles/edit/add + events + R2 photo upload. ✅ H walking challenges SHIPPED both sides (web PR #128 `b73d2c6` + mobile PR #21 `3e7457d`): Genoly-side schema/functions, web /tree/:slug/challenges page, mobile hub/create/detail + step sync + notifications scaffold + DEV mock toggle. ✅ G settings depth + support MERGED (PR #22 `8033d3b`). ✅ J deployment readiness MERGED (PR #23 `d35ed98`). ✅ K handoff WRITTEN — **RUN CLOSED**; read `vault/handoff-mobile-e2e-2026-06-11.md` first. Next session: P1 backlog per handoff §7 (pedigree, rewards page, games, chat, blog reader, analytics, step-8 salvage, device screenshot pass). Constraints: payment neutrality, no admin surfaces, forkability, bandwidth diet (no live-Convex suites), no eas submit, no AI attribution.

## Earlier focus

**2026-06-10 — Graphify Labs version bump + AGENTS.md graph-tooling cleanup (pre-commit; Shankar commits).** Workspace-wide `graphifyy` CLI bumped 0.8.20 → **0.8.36** (`pipx upgrade`; it was always the correct package — a brief's "wrong-package/typosquat/v2.1.0-via-uv" framing was incorrect and not acted on). Regenerated mobile `graphify-out/` via `graphify update .` (AST-only, no key): **841 nodes / 967 edges / 67 communities**, now emitting the force-directed `graph.html` (vis-network, dark theme). Updated `genoly-mobile/AGENTS.md` §10.1 / "Code knowledge graph report": corrected the `graph.html` label (it's vis-network force-directed, not "D3"), refreshed the node count (425 → 841), added the pipx install cmd + `graphify affected` + `graphify watch`, and split structural (`graphify-out/`) vs curated-narrative (`docs/GRAPH_REPORT.md`). **Mobile change is AGENTS.md only.** ⚠️ `npm run typecheck` has **3 PRE-EXISTING errors** (missing `@react-native-vector-icons/fontawesome` — node_modules gap from the SDK-56 codemod below — + `expo-router/react-navigation` + an ExternalLink typed-route), unrelated to this work. Full story in web's [[graph-report-regen-2026-06-09]] (2026-06-10 update).

**2026-06-05: Mobile test debt cluster COMPLETE. PR pending on `chore/mobile-test-debt-cluster`. #293 + #294 + #295 all closed. `npm test` → 60/60 green, exit code 0.**

**Previous focus: Expo SDK 55 → 56 upgrade COMPLETE. PR #13+#14 merged. Task #299 CLOSED. Task #300 (real-device smoke) deferred to Shankar.**

SDK 56 upgrade complete in worktree on `chore/expo-sdk-56-upgrade`. Key changes:
- `expo` 55 → 56, `react-native` 0.83.6 → 0.85.3, `react` 19.2.0 → 19.2.3
- `expo-router` ~55 → ~56.2.9 (forked from `@react-navigation/native` in SDK 56)
- `@expo/vector-icons` → `@react-native-vector-icons/fontawesome` (codemod applied)
- `@react-navigation/native` removed; `expo-modules-core` removed (not direct dep)
- `apps/mobile/app/_layout.tsx` — codemod: `@react-navigation/native` → `expo-router/react-navigation`; `FontAwesome.font` removed
- `apps/mobile/app/(tabs)/_layout.tsx` — `color as string` cast for updated types
- `apps/mobile/app.json` — `deploymentTarget: "16.4"` + `expo-font`/`expo-splash-screen`/`expo-status-bar` plugins
- `apps/mobile/tsconfig.json` — `"types": ["jest"]` for TypeScript 6.0.3
- `apps/mobile/package.json` — `@types/jest`, `@react-native/jest-preset`, `react-test-renderer@19.2.3`

**expo-doctor**: 21/21 pass. **TypeScript**: 0 errors. **Tests**: 60/60 pass, exit code 0. #293 + #294 + #295 CLOSED.

**Previous milestone:** SDK 55 upgrade MERGED 2026-06-05 via PR #12. Step 7 (Dashboard) MERGED via PR #8.

All Phase 1 steps 1-7, 11, 12 are MERGED. Step 8 (Leaderboard) is next. See `[[2026-05-29-mobile-step-4-12-overnight]]`, `[[2026-05-29-mobile-step-7-dashboard]]` for detail.

## Recent events

- **2026-06-05 (Claude autonomous)** — **Mobile test debt cluster CLOSED.** #293/#294/#295. `npm test` 60/60 green. token-store.test.ts rewritten as proper Jest suite; queue.ts handleError double-increment fixed; SyncQueue concurrency test microtask flush added; StyledText-test.js wrapped in act() + snapshot updated from null to real tree. PR on `chore/mobile-test-debt-cluster`.
- **2026-06-05 (Claude autonomous)** — **SDK 55 → 56 upgrade COMPLETE.** Expo SDK 55 → 56. 6 commits on `chore/expo-sdk-56-upgrade`. expo-router codemod, vector-icons codemod, iOS 16.4 target, @react-navigation/native removed, TypeScript 6 compat. expo-doctor 21/21 pass. PR pending merge. Task #299 CLOSED; #300 (real-device smoke) deferred to Shankar. See `[[2026-06-05-expo-sdk-56-upgrade]]`.
- **2026-06-05 (Claude interactive)** — **SDK 55 upgrade verified + dep dashboard synced.** PR #12 merged. SDK 56 evaluated, deferred to #299.
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
- ~~**Mobile-side step 7: Dashboard (today + last 7 days)**~~ IMPLEMENTATION COMPLETE 2026-05-29 (interactive session). See `[[2026-05-29-mobile-step-7-dashboard]]`. PR pending.
- ~~**V1.0.0 Pro-only plan gate**~~ DONE 2026-06-29 — merged `ae3f781` (PR #24) + `1f4caac` version-drift fix (PR #25). See `log.md` 2026-07-09 backfill entry.
- ~~**Release automation script + CHANGELOG generator**~~ DONE 2026-06-30 — merged `4412d3a` (PR #26). `scripts/release.mjs` + `docs/RELEASING.md`.
- **Mobile-side step 8: Leaderboard screen** — IN FLIGHT 2026-07-09 on branch `feat/step-8-leaderboard-salvage` (sourced from `origin/feat/step-8-leaderboard` `e630ba3`, pre-SDK-56; salvage + fixups, running in a sibling worktree).
- **Mobile-side step 9: Friends list + actions** — queued for today's run, depends on Step 8.
- **Mobile-side step 10: Goals + history screens** — queued for today's run, depends on Step 7 (already merged).
- **Mobile-side step 13: Polish + manual test + submit** — queued for today's run, depends on all.
- **Port four Pro-gated tree surfaces from web to mobile** — Explorer-as-default, Register table view, Classic pedigree, Fan-if-legible. Today's run, Workstream A.
- **Workstream B: challenge-growth / standalone-user research** — report only, no code. Today's run, in parallel.


## Architecture reference

The complete client-side architecture lives in [`../genoly-family-web/docs/mobile-sync-architecture.md`](../../../../../genoly-family-web/docs/mobile-sync-architecture.md). 17 sections covering token lifecycle, offline SQLite queue, retry policy, error matrix, permission flow, clock-drift defense, background fetch, subscription compliance, 13-step phasing.

Server contract: [`../genoly-family-web/docs/fitness-api-contract.md`](../../../../../genoly-family-web/docs/fitness-api-contract.md).

## Important cross-references

- **Workspace operating manual:** `/Users/shankar/Code/Geno/AGENTS.md` (moved from `/Users/snalluri/Personal/Code/Geno` 2026-07-09 new-Mac restore; old path is historical)
- **This repo's operating manual:** `/Users/shankar/Code/Geno/genoly-mobile/AGENTS.md`
- **Cross-repo state snapshot:** `/Users/shankar/Code/Geno/master-context.md`
- **Fork procedure:** `./FORK_PROCEDURE.md`
- **Web repo session handoff:** `../genoly-family-web/memory-bank/wiki/current/session-handoff.md`

## Current state of packages

| Package | State |
|---|---|
| `packages/api-client/` | 5/20 `ApiClient` methods implemented (issueToken, revokeToken, getSession, getDailyAggregates, syncDailyAggregates); the other 15 (friends/leaderboard, goals, devices, subscription) throw `not_implemented`. Singleton wiring in `apps/mobile/utils/api.ts`. Also exports a shared `tokenStore` used by both ApiClient + auth gate. |
| `packages/health-sync/` | HealthAdapter interface defined. HealthKitAdapter / HealthConnectAdapter implementations shipped step 4/12. |
| `packages/types/` | Mirrors `docs/fitness-api-contract.md` types. `isPaymentNeutral: true` tripwire confirmed in `SubscriptionStatus` type. |
| `apps/mobile/lib/planChecks.ts` | V1.0.0 (PR #24) — Pro-only plan gate logic: `hasAnyProTenant()`, `filterProTenants()`, `DOWNGRADE_GRACE_MS` (5 min). |
| `apps/mobile/app/(gated)/paywall.tsx` | V1.0.0 (PR #24) — shown when the session is valid but has no Pro tenant. Upgrade/Continue-on-web CTAs open genoly.org, no IAP. |
| `apps/mobile/app/_layout.tsx` | `AuthGate` now 4 arms: no-session → login; unresolved health permissions → permissions; no Pro tenant → `/(gated)/paywall` (reactive downgrade w/ 5-min grace banner); else render app. |
| `apps/mobile/app/(auth)/login.tsx` | Step 2 SHIPPED — login screen with react-hook-form + zod + Controller-wired inputs + ApiClientError → friendly message mapping. |
| `apps/mobile/app/(tabs)/` | 5-tab member nav (Home/Tree/Challenges/Activity/Settings, C1 rework). Auth gate now also gates on Pro-tenant status. |
| `apps/mobile/__tests__/` | Jest + React Native Testing Library wired. 189 tests pass, 12 skipped, 201 total (1 UI suite skipped — jest-expo 56 TurboModule gap). |
| `scripts/release.mjs` | PR #26 — atomic 4-file version bump + CHANGELOG generator + git tag; does not auto-push. |
