---
type: phase
phase: mobile-e2e-plan
date: 2026-06-11
status: in-flight
owner: claude
tags: [mobile, e2e, member-parity, walking-challenges, autonomous]
sources: ["[[2026-06-11-member-side-convex-client]]", "[[2026-06-11-walking-challenges-schema-placement]]", "[[2026-06-11-mobile-styling-approach]]"]
---

# Mobile end-to-end run — Phase A audit + Phase B plan

**One-line:** Autonomous run (brief `_mobile-e2e-brief.md`) to take genoly-mobile from "fitness companion with a placeholder Family tab" to the full member-side Genoly app + Family Walking Challenges, deployment-ready.

## Phase A findings (full detail: `vault/mobile-audit.md`)

- Phase 1 Steps 1–7, 11, 12 verified merged; **Step 8 Leaderboard sits unmerged on `origin/feat/step-8-leaderboard`** (pre-SDK-56; disposition: cherry-pick + fixups when the new nav lands).
- Fitness contract verified **20/20 implemented server-side, zero drift**; challenges are greenfield ("v2 open question" in the contract).
- `npm test` 60/60 green (brief's jest-debt premise was stale); 3 pre-existing typecheck errors confirmed (P0 fix).
- ApiClient: 5 of 20 methods implemented on main.
- Brief premise corrections logged in audit §7 (notably: `@genoly/api-client` is the fitness HTTP client, not a Convex client; bundle id is `org.hyperionsolutions.genoly`).

## Phase B decisions

1. **Member side = Convex reactive client + Convex Auth (RN TokenStorage)**; fitness HTTP contract untouched. [[2026-06-11-member-side-convex-client]]
2. **Walking challenges = Genoly-side tree-scoped tables** (`walkingChallenges`, `challengeParticipants` with denormalized `currentSteps`); zero fitness-contract changes. [[2026-06-11-walking-challenges-schema-placement]]
3. **Styling = theme module + UI kit on RN StyleSheet** (no Tamagui/NativeWind); dark + classic palettes locked as part of foundation. [[2026-06-11-mobile-styling-approach]]

## Execution waves (plan: `vault/mobile-improvement-plan.md`)

C1 foundation (typecheck debt + theme + UI kit + nav shell) → C2 member auth → C3 welcome wizard → C4 member dashboard → D tree exploration (6 PRs) → F engagement (rewards/leaderboards/games) → G settings+support → H walking challenges (web backend + mobile UI + notifications scaffold) → I polish/a11y/perf → J deployment readiness → K handoff.

Constraints held throughout: payment neutrality, no admin surfaces, fitness forkability, bandwidth diet (no live-Convex test suites), no eas submit, no AI attribution, cascade per PR.
