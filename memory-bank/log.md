# Wiki Log — genoly-mobile

Append-only chronological record. **Strict format**:

```
## [YYYY-MM-DD] <op> | <short title>

<body>
```

Ops: `merge`, `decision`, `doc`, `rule`, `note`, `query`, `lint`.

Tail recent: `grep "^## \[" memory-bank/log.md | tail -10`.

---

## [2026-05-22] rule | AI memory bank Phase 1 migration — Karpathy hybrid adopted

This repo's contribution to the workspace-wide Karpathy LLM Wiki pattern adoption (per `../genoly-family-web/docs/external-ai-memory-bank-guide.md`).

Foundation files landed (commit `d4fbecc`):
- `AGENTS.md` (NEW — 10 sections on Expo SDK 54 / RN 0.81 stack, payment neutrality hard-rule, native module strategy, health-reading isolation, bearer token storage, ApiClient retries, 401 token-failure path, initial pull window, background sync constraints, clock-drift defense, forkability impact)
- `CLAUDE.md` (NEW thin pointer)

`memory-bank/wiki/` structure created with `current/`, `phases/`, `decisions/`, `tasks/` subdirectories.

Current state migrated into `wiki/current/`:
- `active-context.md` — current focus + 5 pending Shankar decisions
- `progress.md` — Phase 0 done; Phase 1 13-step plan; pending decisions table
- `session-handoff.md` — for next agent
- `overview.md` — 30-second summary

Index + log created.

Companion commit in `genoly-family-web` (`27af400`) for that repo's foundation.

Page: [[2026-05-22-karpathy-adoption-mobile]]
Decision: [[karpathy-memory-bank-pattern]]

## [2026-05-15] doc | FORK_PROCEDURE.md updated

Updated to reflect the Phase A forkability ESLint rule repair in genoly-family-web:
- Phase 0 invariants now includes a deliberate-violation sanity check (because the rule had been silently broken since inception)
- Phase 6 allow-list table adds `convex/auth.ts` (fitness's `authNode.ts` imports `signIn`)
- Phase 8 (Cutover) cleanup mentions removing the per-file ESLint override for `http.ts` once fitness is fully extracted

Commit `f4f6335`.

## [2026-05-08] merge | Phase 0 — Foundation framework CLOSED

Phase 0 complete with five tasks landed:
- #7 Expo Router init (`6da2488`)
- #8 Package interface stubs (`9657069`) — api-client, health-sync, types
- #10 EAS Build (manual APK `b0260446` runs on real Android phone)
- #11 Baseline verify
- #9 CI (`03e5a73` — GitHub Actions auto-triggered first EAS build `89183f18`)

Mobile builds automatically on `main` push. EAS account `@hyperionsolutionsorg` on Hobby tier (free).

Page: [[2026-05-08-phase-0-complete]]

---

*Earlier history: see legacy `memory-bank/activeContext.md` and `memory-bank/progress.md` (being phased out). For authoritative chronological record: `git log`.*
