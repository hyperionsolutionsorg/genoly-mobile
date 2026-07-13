---
type: current
name: "Session handoff — genoly-mobile"
updated: 2026-07-13 (Rule #0 catch-up cascade — reconciled against real merge history: main HEAD `93181cd`, NO open mobile PRs. Everything MERGED: the 2026-07-09 Phase-1/tree run #27–#40 (stale "8 PRs open" was wrong), security #46 (fitness HTTPS transport) + #49 (app.config.ts prod-URL fail-closed), and fixes #50 (HC permission delegate) / #51 (ExploreCanvas raster cap — ±4 crash) / #52 (expo-secure-store — the fitness bearer token was never persisted, so health never synced on any build). Pending: mobile EAS prod env vars before prod build; local-APK stash@{0} reconcile-don't-pop; physical-Samsung + iOS verification; fitness token-recovery follow-up. See log.md [2026-07-13] + `_work-summary-security-and-mobile-2026-07-13.md` §4. Prior: 2026-07-11b (prod-URL resolution #49; transport hardening #46 — both then OPEN, now merged). Prior: 2026-07-09 (V1.0.0 Pro gate + Phase-1/tree run). Prior: 2026-06-11 (mobile e2e run close))
status: active
---

# Session handoff

**For the next agent or session picking up this repo.**

## State right now

**2026-07-13 — RECONCILED. main HEAD `93181cd`; NO open mobile PRs; working tree clean.** Everything from the last several runs is MERGED — the earlier "8 PRs open / NONE merged" state in this file was stale.

- **2026-07-09 Phase-1/tree run — ALL MERGED** 2026-07-09/07-10 (#27–#40). Fitness Steps 8/9/10/13 (§15 Phase 1 COMPLETE, ApiClient 16/20 — 4 stubs: getDevices/setPrimaryDevice/revokeDevice + getSubscription) + four Pro-gated tree surfaces (Explore-default + Register table, Classic pedigree, Fan) + AuthGate hardening + device follow-ups (#36 minSdk 26, #37 icon/splash, #38 Pedigree removed / Fan capped 3 gens / branding, #39 iOS build, #40 HealthKit new-arch). Pro-gating audit `vault/pro-gating-audit-2026-07-09.md`: all surfaces gated; F1/F2 fixed (#34), F3 accepted by design.
- **Security (cross-repo run) — MERGED.** #46 fitness client HTTPS transport (`assertSecureBaseUrl`, loopback/LAN exempt) + `usesCleartextTraffic:false`; #49 `app.config.ts` resolves Convex URLs by `EAS_BUILD_PROFILE`, **fails closed** for production if env vars unset.
- **On-device fixes — MERGED.** #50 Health Connect permission delegate (Grant-access native crash); #51 `ExploreCanvas.tsx` raster cap (large tree at ±4 requested ~211MB → Android bitmap-limit crash; capped ~36MB, pinch-zoom recovers detail); #52 **`expo-secure-store`** added — it was never a dependency, so `SecureTokenStore` silently no-op'd and the fitness bearer token was never persisted → "No bearer token available", health never synced on ANY build. #51/#52 verified end-to-end on a release APK vs local Convex (`issue-token → 200`, `sync/daily → 200`, "Synced just now").

**Delivered:** `~/Desktop/genoly-local-convex.apk` = release APK carrying #51+#52, pointed at local self-hosted Convex over LAN (local config reverted from the tree). Cross-repo source of truth: `~/Code/Geno/_work-summary-security-and-mobile-2026-07-13.md`.

**2026-06-11 — MOBILE E2E RUN CLOSED.** Read `vault/handoff-mobile-e2e-2026-06-11.md` FIRST (PR list, decisions, walking-challenges recap, deployment-readiness status, P1 backlog, review-with-care list). Mobile main: tests 170 pass / tsc 0 errors; member app live against dev. Web companion PR #128 (`b73d2c6`).

**2026-06-11 — MOBILE E2E RUN IN FLIGHT (Claude autonomous, brief `_mobile-e2e-brief.md`).** Member-side parity + Family Walking Challenges. Phase A audit at `vault/mobile-audit.md` (read this first — it corrects several stale memory claims, incl. Step 8 being unmerged on `origin/feat/step-8-leaderboard` and `npm test` being 60/60 green). Phase B plan at `vault/mobile-improvement-plan.md`; decisions [[2026-06-11-member-side-convex-client]], [[2026-06-11-walking-challenges-schema-placement]], [[2026-06-11-mobile-styling-approach]]. Execution in waves C1→K; cascade after each merged PR. ✅ C1 foundation MERGED (PR #16 `7651701`): theme/ module (light/dark/classic), components/ui kit, 5-tab member nav, typecheck 0 errors, 90 tests green. ✅ C2 member auth MERGED (PR #17 `cf5b041`). ✅ C3 wizard (PR #18 `75bc9dc`) + C4 dashboard (PR #19 `d84b9fd`) MERGED — Phase C complete. NOTE for next agent: screens must consume theme tokens (no inlined hex); toast via components/ui Toast; fitness dashboard now lives at app/(tabs)/activity.tsx; member-side Convex calls go through lib/genolyApi.ts function references (pin names with tests); dual sessions = Convex Auth (member) + fitness bearer (health) — tear down BOTH on sign-out.

**2026-06-10 — Graphify Labs version bump + AGENTS.md graph-tooling cleanup (pre-commit; Shankar commits).** Workspace `graphifyy` CLI 0.8.20 → **0.8.36** (`pipx upgrade`; it was always the correct package — a brief's "wrong-package/typosquat/v2.1.0-via-uv" framing was incorrect and not acted on, verified against PyPI + README). Mobile `graphify-out/` regenerated via `graphify update .` (AST-only, **no key**): **841 nodes / 967 edges / 67 communities**, now force-directed `graph.html` (vis-network). Only committed change here is `genoly-mobile/AGENTS.md` §10.1 / graph-report section (corrected "D3"→vis-network, node count 425→841, pipx install cmd, `affected`/`watch`, structural-vs-narrative split). **Known intentional state for the next agent:** `graphify` AST extraction (`graphify update .`) needs NO key; bare `graphify .`/`graphify extract` need an LLM key (none set) and WILL error — expected. **Pre-existing, NOT a regression:** `npm run typecheck` reports 3 errors (missing `@react-native-vector-icons/fontawesome` — node_modules gap from the SDK-56 codemod — + `expo-router/react-navigation` + an ExternalLink typed-route); mobile has no `lint` script (use `npm run typecheck`). Also pre-existing-uncommitted before this session (not mine): `.gitignore` + `docs/GRAPH_REPORT.md` working-tree edits. Full story: web [[graph-report-regen-2026-06-09]] (2026-06-10 update).

**Main branch:** `4412d3a` as of 2026-07-09 (this session's baseline HEAD). All PRs through #26 merged.
**SDK baseline:** Expo SDK 56 + React Native 0.85.3 on main.
**Dep dashboard:** Synced 2026-06-05 (not re-synced this session).
**Jest state (2026-07-09):** 189 passed / 12 skipped / 201 total, 14 of 15 suites run, exit code 0. 1 UI suite skipped (expo-router TurboModule chain not mocked by jest-expo 56 — real-device gate; this is the successor to the "4 UI suites" figure quoted in older entries below — the count has shrunk as suites were unblocked).
**TypeScript (2026-07-09):** 0 errors (`npm run typecheck`).
**expo-doctor:** last checked 2026-06-05, 21/21 pass (not re-run this session).

**Code state by step:**
- Steps 1, 2, 3 — MERGED to main (PRs #3, #4).
- Steps 4, 5, 6, 11, 12 — MERGED to main (PR #5 + infra follow-ups PRs #6, #7).
- Step 7 (Dashboard) — MERGED (PR #8).
- Step 8 (Leaderboard) — BUILT 2026-07-09, PR #27 open (salvaged `e630ba3` + audit §2 fixups; pushed route off Activity "Friends" section).
- Step 9 (Friends) — BUILT 2026-07-09, PR #29 open (6 endpoints + friends screen; 204 No-Content fix in api-client `request()`).
- Step 10 (Goals + history) — BUILT 2026-07-09, PR #30 open (4 endpoints; 4 fixed goal slots; month-grouped history route).
- Step 13 (Polish) — BUILT 2026-07-09, PR #33 open (touch targets, pull-to-refresh, a11y; closes Phase 1 once merged).
- Tree surfaces (operator-scoped A2, not in §15) — PRs #28/#31/#32/#34 open: Explore default, Register table, Classic pedigree, Fan (GO, 4-gen default / 5 cap), AuthGate hardening.
- V1.0.0 Pro-only plan gate + version 1.0.0 — MERGED 2026-06-29 (PRs #24, #25).
- Release automation script + CHANGELOG generator — MERGED 2026-06-30 (PR #26).

## What's done (recent)

- ✅ **Release automation script + CHANGELOG generator MERGED** 2026-06-30 (PR #26, `4412d3a`). `scripts/release.mjs` + `docs/RELEASING.md`.
- ✅ **V1.0.0 Pro-only plan gate + version bump MERGED** 2026-06-29 (PR #24 `ae3f781` + PR #25 version-drift fix `1f4caac`). `lib/planChecks.ts` + `(gated)/paywall.tsx` + 4th `AuthGate` arm.
- ✅ **Mobile e2e run CLOSED** 2026-06-11. PRs #16-#23 + web #128. See `vault/handoff-mobile-e2e-2026-06-11.md`.
- ✅ **Mobile test debt cluster CLOSED** 2026-06-05. Branch `chore/mobile-test-debt-cluster`. #293 (ts-jest regression — already resolved by SDK 56), #295 (root .tsx compile — already resolved by SDK 56), #294 (3 pre-existing failures — all fixed). `npm test` 60/60 green, exit code 0. PR pending merge.
- ✅ **SDK 55 → 56 upgrade COMPLETE** 2026-06-05. PR #13+#14 merged. Task #299 CLOSED.
- ✅ SDK 55 verification + test regressions fixed + dep dashboard synced 2026-06-05. PR #12 merged.
- ✅ Phase 1 Steps 11 + 6 + mobile `DESIGN.md` complete 2026-05-29 overnight Round 3.
- ✅ Phase 1 Step 5 (`@genoly/sync-queue`) complete 2026-05-29 overnight Round 2.
- ✅ Phase 1 Steps 4 + 12 complete 2026-05-29 overnight Round 1.
- ✅ Phase 1 Step 2 + Step 3 implementation complete 2026-05-28 (on `active-agravity-step2-branch`, pending push + merge). See `[[2026-05-28-mobile-step-2-3]]`.
- ✅ Phase 1 Step 1 MERGED via PR #3 (squash `75d6e1a`) 2026-05-28.
- ✅ Phase 0 fully closed 2026-05-08 (signed APK on Android, EAS Build + GitHub Actions wired)
- ✅ Mobile sync architecture doc locked in `../genoly-family-web/docs/mobile-sync-architecture.md` (2026-05-15)
- ✅ FORK_PROCEDURE.md updated 2026-05-15 (Phase A forkability lint fix consequences)
- ✅ AI memory bank Phase 1 foundation (`d4fbecc`) — AGENTS.md + CLAUDE.md

## What's next (pending — consolidated 2026-07-13)

1. **Mobile EAS prod env vars** — set `CONVEX_PROD_BASE_URL` (`https://…convex.site`) + `CONVEX_PROD_CLOUD_URL` (`https://…convex.cloud`) as EAS env vars (production scope) BEFORE any `eas build --profile production`. Without them #49 makes the build fail at config-eval (intended). Dev/preview unaffected.
2. **Local-APK WIP — reconcile, DO NOT blind-pop.** `git stash@{0}` ("operator local-APK WIP … pre-sync 2026-07-11") holds LAN-URL `app.json` + `convex.ts` edits cut BEFORE #49. Per-build URLs now come from `app.config.ts`, so reconcile the LAN hack with the new resolution rather than restoring it. Full local-APK recipe (LAN URLs + expo-build-properties cleartext + convex.ts http-guard relax + authSchemas `.test` bypass, all reverted after build) is in `log.md` [2026-07-10]/[2026-07-11] + `scratchpad/build-apk.sh`.
3. **Device verification** — physical Samsung test of `~/Desktop/genoly-local-convex.apk`: grant Health Connect, confirm real step/calorie/distance sync (emulator has no HC provider → empty state only). **iOS not rebuilt** — the `expo-secure-store` fix (#52) applies to iOS too but wasn't built/tested.
4. **Fitness token recovery (robustness)** — per `mobile-sync-architecture.md §3`: re-mint on cold-start `/auth/me` 401 + a Settings "re-authenticate" action. Currently `issueToken` runs only at login/signup with a swallowed catch, so a one-time mint failure needs full sign-out/in to recover. Not blocking.
5. **Backlog (unchanged):** theme-module migration (lift inlined hex → `theme/colors.ts`); make Jest see `packages/health-sync` + `packages/sync-queue` tests; on-device SQLite at-rest encryption for `sync-queue` health aggregates (larger follow-up).
6. **Cross-repo (not mobile):** stale web PR #191 "polish: Phase 3b follow-up" — rebase-or-close decision needed.


## Reading order for the next agent

1. `/Users/shankar/Code/Geno/AGENTS.md` — workspace operating manual (moved from `/Users/snalluri/Personal/Code/Geno` 2026-07-09; old path is historical)
2. `/Users/shankar/Code/Geno/master-context.md` — cross-repo state
3. `./AGENTS.md` — this repo's operating manual
4. `./memory-bank/index.md` — content catalog
5. Last 10 entries of `./memory-bank/log.md`
6. `./memory-bank/wiki/current/active-context.md` — current focus + 5 pending decisions
7. `./memory-bank/wiki/current/progress.md` — task statuses
8. This file — for "what's next"
9. `./memory-bank/wiki/current/overview.md` — 30-second summary

For implementation work, also read:
- `../genoly-family-web/docs/mobile-sync-architecture.md` (client-side architecture)
- `../genoly-family-web/docs/fitness-api-contract.md` (the 20 server endpoints)
- `./FORK_PROCEDURE.md` (fork-impact assessment)

## Watchouts

- **Hard rule: NO in-app purchases.** Mobile is payment-neutral; subscription is web-only (App Store anti-steering compliance). See `AGENTS.md` §3.1.
- **Bearer token storage:** `expo-secure-store` only, NEVER AsyncStorage. See `AGENTS.md` §3.4.
- **Native modules:** Expo modules only, never bare workflow. See `AGENTS.md` §3.2.
- **Convex URL must be injected, not hardcoded.** Otherwise breaks forkability. See `AGENTS.md` §3.10.
