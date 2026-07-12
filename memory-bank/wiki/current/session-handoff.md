---
type: current
name: "Session handoff — genoly-mobile"
updated: 2026-07-11b (Prod-URL resolution PR #49 OPEN — app.config.ts by build profile. OPERATOR: set CONVEX_PROD_BASE_URL + CONVEX_PROD_CLOUD_URL as EAS env vars (production scope) before `eas build --profile production`, or the build fails closed (intended). Cut from clean HEAD; uncommitted local-APK WIP (LAN URLs + convex.ts) still on main — reconcile with the removed placeholder keys when next touching app.json. See log.md [2026-07-11] prod-URL note. Prior: 2026-07-11 (Transport hardening PR #46 OPEN for review/merge — fitness FetchApiClient HTTPS guard (assertSecureBaseUrl; loopback/LAN exempt) + android.usesCleartextTraffic:false. Independent of the web security PRs; merge anytime. Deliberately did NOT touch member-client convex.ts requireCloudUrl (the deferred LAN-relaxation is the opposite direction — still the operator's call). See log.md [2026-07-11]. Prior: 2026-07-09 (V1.0.0 Pro gate + release automation backfilled; two-workstream run opened; prior: 2026-06-11)
status: active
---

# Session handoff

**For the next agent or session picking up this repo.**

## State right now

**2026-07-09 — TWO-WORKSTREAM RUN OPEN (state-audit + cascade session ran first).** This session backfilled three PRs that had landed 2026-06-29/06-30 without ever being cascaded into these files: `ae3f781` (PR #24, V1.0.0 mobile Pro-only plan gate — `lib/planChecks.ts` + `(gated)/paywall.tsx` + 4th `AuthGate` arm + version 1.0.0), `1f4caac` (PR #25, version-drift fix), `4412d3a` (PR #26, `scripts/release.mjs` release automation + CHANGELOG generator). Full detail in `log.md` 2026-07-09 entry. Also: the workspace root moved `/Users/snalluri/Personal/Code/Geno` → `/Users/shankar/Code/Geno` (2026-07-09 new-Mac restore) — reading-order paths below updated. Baseline verified: `npm run typecheck` 0 errors; `npm test` 189 passed / 12 skipped / 201 total (14 of 15 suites; 1 UI suite skipped, jest-expo 56 TurboModule gap, pre-existing). Uncommitted `package-lock.json` (3-line `version` field drift 0.1.0→1.0.0, harmless, left as-is).

**2026-07-09 run CLOSED — OPERATOR ACTIONS PENDING.** Eight PRs open, all agent-built + orchestrator-reviewed, NONE merged (permission layer holds merges for the operator). Merge queue, in order: fitness stack **#27 → #29 → #30 → #33** (Step-8 leaderboard salvage → Step-9 friends → Step-10 goals+history → Step-13 polish), then tree stack **#28 → #31 → #32 → #34** (Explore-default + Register table → Classic pedigree → Fan view → AuthGate hardening); the two stacks are independent of each other. Also pending: push the two local main commits (memory-bank cascades), review `vault/pro-gating-audit-2026-07-09.md` (all 8 surfaces gated; F1/F2 fixed in #34; F3 accepted by design) and the Workstream B research at web `vault/research/challenge-growth-standalone-model-2026-07-09.md` + EXEC-SUMMARY (uncommitted; recommends "Circles" domain + guest accounts — DO NOT build until reviewed), simulator/device visual pass (task #300; `vault/mobile-screenshots/` still empty), and worktree cleanup (`git worktree remove ../genoly-mobile-step8 ../genoly-mobile-treeA` after merges).

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

## What's next

1. **Step 8 salvage** — land `feat/step-8-leaderboard-salvage` (in flight, sibling worktree today). Reads from `apiClient.getLeaderboard({ date })` (currently stubbed).
2. **Steps 9, 10, 13** — friends, goals+history, polish. Queued for today's run per `mobile-sync-architecture.md` §15.
3. **Port 4 Pro-gated tree surfaces from web to mobile** — Explorer-as-default, Register table view, Classic pedigree, Fan-if-legible. Today's run, Workstream A.
4. **[Report only] Challenge-growth / standalone-user research** — Workstream B, today's run, no code.
5. **Theme module migration** — Lift inlined hex literals from screens into a `theme/colors.ts`.
6. **Workspace test runner gap** — Make Jest see tests in `packages/health-sync` + `packages/sync-queue`.


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
