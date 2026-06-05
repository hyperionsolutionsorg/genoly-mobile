---
type: current
name: "Session handoff — genoly-mobile"
updated: 2026-06-05
status: active
---

# Session handoff

**For the next agent or session picking up this repo.**

## State right now

**Main branch (origin):** `fa5cc27` — PR #12 merged SDK 55 verification. Branch `chore/expo-sdk-56-upgrade` in worktree `genoly-mobile-wt-sdk56/` has completed SDK 56 upgrade — **PR pending merge**.
**SDK baseline:** Expo SDK 56 + React Native 0.85.3 (in `chore/expo-sdk-56-upgrade`). Main is still SDK 55.
**Dep dashboard:** Synced 2026-06-05 (SDK 55 versions). After PR merge, re-run `npm run sync-deps` with Convex URL configured.
**Jest state:** 54/56 pass. 2 known failing suites (SyncQueue dead-letter + concurrency race, #294). 1 pre-existing "no test" error (token-store). 4 UI suites skipped (Dimensions.set TurboModule crash persists in jest-expo 56).
**TypeScript:** 0 errors (`npx tsc --noEmit -p apps/mobile/tsconfig.json`).
**expo-doctor:** 21/21 checks pass.

**Previous milestone:** Step 7 (Dashboard) IMPLEMENTATION COMPLETE in working tree on main, PR pending. 4 new files: `hooks/useDashboardData.ts`, replaced `(tabs)/fitness.tsx`, two test files. 24 new Jest tests; 54 total in suite. Real-device smoke pending.

**Code state by step:**
- Steps 1, 2, 3 — MERGED to main (PRs #3, #4).
- Steps 4, 5, 6, 11, 12 — MERGED to main (PR #5 + infra follow-ups PRs #6, #7).
- Step 7 (Dashboard) — IMPLEMENTATION COMPLETE in working tree, PR pending.
- Step 8 (Leaderboard) — next handoff target.

## What's done (recent)

- ✅ **SDK 55 → 56 upgrade COMPLETE** 2026-06-05. Branch `chore/expo-sdk-56-upgrade`, 6 commits. expo-router codemod, vector-icons codemod, iOS 16.4 target, @react-navigation/native removed, TypeScript 6 compat, expo-doctor 21/21. **PR pending merge**. Task #299 CLOSED.
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

0. **[Shankar] Merge the SDK 56 PR** — push `chore/expo-sdk-56-upgrade` to origin, open PR titled `chore(mobile): Expo SDK 55→56 upgrade with expo-router codemod`, merge.
1. **[Shankar] Task #300 — Real-device smoke test** — iOS simulator + Android emulator (EAS build). Background-fetch needs a real device (simulator doesn't wake on 15-min cadence). Dashboard drain-on-mount + Refresh can be smoke-tested in simulator.
2. **Step 8** — Leaderboard screen. Reads from `apiClient.getLeaderboard({ date })` (currently stubbed).
3. **Steps 9, 10, 13** per `mobile-sync-architecture.md` §15.
4. **Theme module migration** — Lift inlined hex literals from screens into a `theme/colors.ts`.
5. **Workspace test runner gap** — Make Jest see tests in `packages/health-sync` + `packages/sync-queue`.


## Reading order for the next agent

1. `/Users/snalluri/Personal/Code/Geno/AGENTS.md` — workspace operating manual
2. `/Users/snalluri/Personal/Code/Geno/master-context.md` — cross-repo state
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
