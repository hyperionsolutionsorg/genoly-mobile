# Mobile end-to-end run — start acknowledgment

**Date:** 2026-06-11
**Operator brief:** `/Users/snalluri/Personal/Code/Geno/_mobile-e2e-brief.md`
**Mode:** Autonomous, self-paced. Operator hands-off.
**Mission:** Complete the Genoly mobile companion app end-to-end on the member side only — full feature parity with the web's authenticated member experience, plus the Family Walking Challenges layer unique to mobile — locally tested and deployment-ready.

## Reading completed (brief §1)

- Workspace: `AGENTS.md`, `master-context.md`, `backup-notes.md`
- Mobile: `AGENTS.md`, `docs/GRAPH_REPORT.md` (2026-06-09 rewrite), `DESIGN.md`, `memory-bank/index.md` + `wiki/current/*` + log tail + phase pages, `FORK_PROCEDURE.md` (invariants + decision points)
- Web: `docs/fitness-api-contract.md` (verified server-side — see audit), `docs/co-hosted-architecture.md`, `docs/mobile-sync-architecture.md` (full), member-side route/feature inventory, June 10–11 decision pages + handoff flags

## Constraints acknowledged (read twice)

1. **Mobile payment neutrality** — no billing surfaces of any kind; `isPaymentNeutral` tripwire honored.
2. **Fitness forkability** — `docs/fitness-api-contract.md` is sacred; no direct Convex access to `fitness_*` tables from mobile; ESLint boundary respected.
3. **No admin surfaces** — member-only app; graceful "Admin tools live on web" banner for admins.
4. **Convex bandwidth posture (141% of Free cap)** — no `npm test` against live Convex; unit/component tests in-memory only; lazy/cached query patterns.
5. **No `eas submit`** — operator handles store submissions.
6. **No AI attribution** anywhere; Conventional Commits; explicit-path `git add`; zsh-safe.
7. **State-file cascade** after every shipped PR (4 current/* + log.md + index.md + master-context.md when cross-repo).
8. **Verify before destructive steps** — brief premises verified against repo reality first (done; see audit for two corrected premises).

## Phase A approach

1. Verify Phase 1 Steps 1–8 reality vs. memory claims (incl. the unmerged `origin/feat/step-8-leaderboard` branch).
2. Verify the 20-endpoint fitness contract server-side.
3. Walk every existing screen + config; document in `vault/mobile-audit.md`.
4. Resolve the load-bearing architecture question (how the member side talks to Convex) with evidence before Phase B.
5. No code changes during Phase A.

Findings land in `vault/mobile-audit.md`; the prioritized plan follows in `vault/mobile-improvement-plan.md` (Phase B).

— Claude (autonomous session, dispatched by the operator via Cowork)
