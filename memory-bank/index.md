# Wiki Index — genoly-mobile

> The content catalog. Every page in `wiki/` is listed here with a one-line summary.
> Format: `- [[slug]] — one-line summary`

## Current state (cascade-redundant projections)

- [[active-context]] — current focus, recent events, active tasks
- [[progress]] — task statuses, Phase 1 13-step plan
- [[session-handoff]] — for the next agent: what's done, what's next, watchouts
- [[overview]] — 30-second high-level summary

## Phases (chronological, most-recent first)

> Run handoffs live in `vault/`: latest `vault/handoff-mobile-e2e-2026-06-11.md` (member app + walking challenges run, PRs #16-#23 + web #128).

- [[2026-06-11-mobile-e2e-plan]] — Mobile e2e run (member parity + walking challenges): Phase A audit + Phase B plan + execution waves C1→K. Companion vault docs: mobile-audit.md, mobile-improvement-plan.md.
- [[2026-06-05-expo-sdk-56-upgrade]] — Expo SDK 55 → 56 upgrade: expo-router codemod, vector-icons codemod, iOS 16.4 target, TypeScript 6 compat. 6 commits, PR pending. Task #299 closed.
- [[2026-05-29-mobile-step-7-dashboard]] — Phase 1, Step 7 (interactive session): Dashboard screen replacing the fitness-tab stub. New `useDashboardData` hook (drain+fetch on mount, local-TZ date math, queue/dead-letter depth reads). Today big-number card + 7-day horizontal bars + dead-letter banner with one-tap clear + manual Refresh button + error/empty/loading states. 24 new Jest tests; 54 total in suite. Merged via PR #8.
- [[2026-05-29-mobile-step-4-12-overnight]] — Phase 1, Steps 4 + 12 + 5 + 11 + 6 + mobile `DESIGN.md` (autonomous Claude overnight, THREE rounds): HealthKitAdapter (iOS) + HealthConnectAdapter (Android) + MockHealthAdapter + factory + first-run permissions screen + AsyncStorage preferences util + auth-gate three-arm routing + 4 ApiClient methods unstubbed + NEW `@genoly/sync-queue` package (SQLite outbox + drainer + retry + dead-letter) + full Settings tab with revoke-token sign-out + `utils/backgroundSync.ts` (expo-background-fetch + expo-task-manager → `SyncQueue.drain()`) + repo-root `DESIGN.md`. 52 new tests. MERGED via PR #5 (`10f6f03`) + infra setup via PR #6 (`f2463a8`). CI green.
- [[2026-05-28-mobile-step-2-3]] — Phase 1, Step 2 + Step 3: login screen (react-hook-form + zod + Controller-wired inputs + ApiClientError → friendly message mapping) AND cold-start auth gate (local tokenStore check, two-arm redirect on no-token OR expired-token, fail-closed on storage errors) + Jest + RNTL setup + 4-case auth-gate.test.tsx + login.test.tsx. Took 4 review iterations across Gemini Flash Low + GPT-OSS 120B + Claude direct.
- [[2026-05-28-mobile-step-1]] — Phase 1, Step 1: token store + ApiClient skeleton + issueToken happy path completed and verified. Merged via PR #3 (`75d6e1a`).
- [[2026-05-26-phase-3-graphify-mobile]] — AI memory bank Phase 3 (Graphify) — code knowledge graph: docs/GRAPH_REPORT.md + AST-extracted graph.json + hooks + adapters. Closes the 3-phase plan.
- [[2026-05-22-karpathy-adoption-mobile]] — AI memory bank Phase 1 migration (this repo's contribution)
- [[2026-05-08-phase-0-complete]] — Phase 0 closed: Expo init + package stubs + EAS Build + GitHub Actions

## Decisions (durable architectural choices)

- [[2026-06-11-member-side-convex-client]] — member side rides Convex reactive client + @convex-dev/auth (RN); fitness HTTP contract untouched; dual-session rules
- [[2026-06-11-walking-challenges-schema-placement]] — challenge tables Genoly-side, tree-scoped; zero fitness-contract changes; privacy invariants
- [[2026-06-11-mobile-styling-approach]] — theme module + UI kit on RN StyleSheet; Tamagui/NativeWind rejected
- [[mobile-payment-neutrality]] — no in-app purchases; web is sole subscription surface (App Store anti-steering)
- [[native-module-strategy]] — Expo modules only, no bare workflow
- [[bearer-token-storage]] — expo-secure-store only, never AsyncStorage
- [[karpathy-memory-bank-pattern]] — adopted 2026-05-22 — hybrid LLM Wiki pattern (workspace-wide decision)

## Tasks (multi-step in-flight work)

- [[mobile-phase-1-implementation]] — full 13-step plan from architecture doc

## Reference / external docs (linked but not in wiki/)

- Workspace operating manual: `/Users/snalluri/Personal/Code/Geno/AGENTS.md`
- Cross-repo state: `/Users/snalluri/Personal/Code/Geno/master-context.md`
- Mobile sync architecture (web repo): `../genoly-family-web/docs/mobile-sync-architecture.md`
- Fitness API contract (web repo): `../genoly-family-web/docs/fitness-api-contract.md`
- Fork procedure: [`../FORK_PROCEDURE.md`](../FORK_PROCEDURE.md) — 9-phase extraction playbook
- Project brief: [`./projectbrief.md`](./projectbrief.md) — stable repo description (if exists)

## How to update this file

- When you create a new page in `wiki/`, append a one-line entry here in the appropriate section.
- When you retire a page, remove its entry.
- This file is updated as part of the cascade — see `AGENTS.md` §7.
- Sort phases by date (most-recent first).
