# Wiki Index — genoly-mobile

> The content catalog. Every page in `wiki/` is listed here with a one-line summary.
> Format: `- [[slug]] — one-line summary`

## Current state (cascade-redundant projections)

- [[active-context]] — current focus, recent events, blockers (5 pending Shankar decisions)
- [[progress]] — task statuses, Phase 1 13-step plan
- [[session-handoff]] — for the next agent: what's done, what's next, watchouts
- [[overview]] — 30-second high-level summary

## Phases (chronological, most-recent first)

- [[2026-05-26-phase-3-graphify-mobile]] — AI memory bank Phase 3 (Graphify) — code knowledge graph: docs/GRAPH_REPORT.md + AST-extracted graph.json + hooks + adapters. Closes the 3-phase plan.
- [[2026-05-22-karpathy-adoption-mobile]] — AI memory bank Phase 1 migration (this repo's contribution)
- [[2026-05-08-phase-0-complete]] — Phase 0 closed: Expo init + package stubs + EAS Build + GitHub Actions

## Decisions (durable architectural choices)

- [[mobile-payment-neutrality]] — no in-app purchases; web is sole subscription surface (App Store anti-steering)
- [[native-module-strategy]] — Expo modules only, no bare workflow
- [[bearer-token-storage]] — expo-secure-store only, never AsyncStorage
- [[karpathy-memory-bank-pattern]] — adopted 2026-05-22 — hybrid LLM Wiki pattern (workspace-wide decision)

## Tasks (multi-step in-flight work)

- [[mobile-step-1-token-store]] — token store + ApiClient skeleton (BLOCKED on 5 decisions)
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
