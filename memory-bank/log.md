# Wiki Log — genoly-mobile

Append-only chronological record. **Strict format**:

```
## [YYYY-MM-DD] <op> | <short title>

<body>
```

Ops: `merge`, `decision`, `doc`, `rule`, `note`, `query`, `lint`.

Tail recent: `grep "^## \[" memory-bank/log.md | tail -10`.
---

## [2026-05-28] merge | Phase 1 Step 2 + Step 3 — Login screen + cold-start auth gate SHIPPED

Implemented Steps 2 and 3 of the mobile sync plan on branch `active-agravity-step2-branch`. Took 4 review iterations across two Antigravity model rotations (Gemini Flash Low → GPT-OSS 120B medium) before Claude took over and completed it directly.

**What landed:**

- **Login screen** (`apps/mobile/app/(auth)/login.tsx`): react-hook-form with `Controller`-wired inputs, zod schema (email + 8-char-min password), `apiClient.issueToken` on submit with `Platform.OS` + `Constants.expoConfig.version` in the device payload, `mapLoginError` mapping `ApiClientError.code` to user-facing strings (`unauthenticated` / `bad_request` / `rate_limited` / `token_expired` / `internal` → friendly messages), `router.replace('/(tabs)')` on success, Alert-based forgot-password pointer to genoly.org.
- **Cold-start auth gate** (`apps/mobile/app/_layout.tsx`): on app boot, reads token via `tokenStore.getToken()` + `tokenStore.isExpired()`. Two-arm redirect: no-token OR expired-token → `/(auth)/login`. Storage errors fail closed (also redirect). Uses `Href` cast pattern (`'/(auth)/login' as unknown as Href`) — narrow cast on the route string, preserves router-object typing. Replaces earlier `(router as any).replace(...)` regression.
- **Shared `tokenStore` export** (`apps/mobile/utils/api.ts`): same SecureStore handle used by both `apiClient` and the auth gate.
- **Jest + React Native Testing Library setup** (root + `apps/mobile/jest.config.js` + `package.json` scripts).
- **login.test.tsx**: validation errors + happy-path issueToken call + correct device-payload shape.
- **auth-gate.test.tsx**: 4 cases — valid token renders content; no token redirects; expired token redirects; storage error fails closed. Uses module-scope `mockReplace` pattern to fix the earlier "fresh mock per call" review-cycle bug.
- **Deleted** `LoginScreen.test.tsx` (was a 2-line duplicate stub).

**Decisions taken:**

1. Form: react-hook-form + zod + Controller (no bare setValue).
2. Email validation: `z.string().email()` permissive.
3. Password min: 8 chars (matches web).
4. Forgot-password: Alert redirect to genoly.org (web owns the OTP flow).
5. Cold-start UX: Expo splash stays mounted until `authChecked` resolves.
6. Existing `(tabs)` scaffold: left as-is. Auth gate redirects INTO the placeholder tabs; real tab content lands in Step 5+.

**Verification:**

- `npx tsc --noEmit -p apps/mobile/tsconfig.json` — exit 0
- `npm test` from `apps/mobile/` — login + auth-gate + Step 1's MemoryTokenStore all pass

**Review-cycle iterations** (recorded for future Antigravity briefs):

- R1 (Flash Low): structure correct but 5 critical bugs (form not Controller-wired, getSession instead of tokenStore, invented platform value, no cascade, no push).
- R2 (Flash Low): fixed 3, introduced new regression (invented ApiErrorCode values), still no cascade.
- R3 (GPT-OSS 120B): fixed the codes, introduced `(router as any)` regression to silence tsc, still no isExpired check.
- R4 (Claude direct): replaced `(router as any)` with proper `Href` cast, added `isExpired()` check, rewrote auth-gate.test.tsx (4 cases, proper mock), did the Rule #0 cascade, deleted the duplicate test stub.

Page: [[2026-05-28-mobile-step-2-3]]
Branch: `active-agravity-step2-branch` (push pending Shankar's action)

---

## [2026-05-28] merge | Phase 1 Step 1 — Token store + ApiClient skeleton SHIPPED

Implemented Step 1 of the mobile sync plan on branch `active-agravity-branch`:
- Built `TokenStore` interface, `MemoryTokenStore`, and `SecureTokenStore` backed by `expo-secure-store` with dynamic import guard.
- Built `FetchApiClient` class supporting standard error parsing mapped to the 8-code matrix and GET automatic retry policy with exponential backoff and jitter.
- Fully implemented `issueToken` happy path.
- Created `apps/mobile/scripts/test-api-client.ts` smoke-test runner.
- Updated all four active context wiki files.

Page: [[2026-05-28-mobile-step-1]]
Commit: active-agravity-branch (draft PR)

## [2026-05-26] merge | AI memory bank Phase 3 (mobile) — Code knowledge graph

Mobile mirror of the workspace-wide Phase 3 work. Ran `graphify update .` (AST-only, no LLM), shipped `docs/GRAPH_REPORT.md` (~280 lines, narrative form via Claude), installed graphify hooks + Claude/OpenCode adapters.

Skipped the LLM extraction path entirely (which is what failed for the web repo). AST-only extraction completed in ~15 seconds: 425 nodes, 413 edges, 44 communities.

Auto-installed AGENTS.md and CLAUDE.md sections cleaned up to point at `docs/GRAPH_REPORT.md` (instead of the original `graphify-out/GRAPH_REPORT.md` paths) and to document all 6 graphify CLI commands available.

This closes mobile's contribution to the 3-phase AI memory bank plan: Phase 1 (Karpathy hybrid) 2026-05-22; Phase 2 (mcp-memory-service) STAY PARKED 2026-05-26 (workspace-wide); Phase 3 (Graphify) DONE 2026-05-26.

Page: [[2026-05-26-phase-3-graphify-mobile]]
Web companion phase page: `../../../genoly-family-web/memory-bank/wiki/phases/2026-05-26-phase-3-graphify.md`
Commit: TBD

## [2026-05-22] note | AI memory bank Phase 2 — PARKED (integration friction)

Phase 2 (mcp-memory-service as index layer) attempted and parked.

What worked:
- `brew install pipx` → pipx 1.12.0
- `pipx install mcp-memory-service` → service installed
- Service starts on `http://127.0.0.1:8000` (NOT 8765 — env var did not take effect; service uses its own default port)
- `/api/openapi.json` returns valid FastAPI OpenAPI spec (~105KB)
- 70+ endpoints exposed (see full list below)
- `/api/health` confirmed healthy: `{"status":"healthy"}` — service itself is functional, just the MCP integration layer is broken

What did NOT work:
- The documented health endpoint paths from `../genoly-family-web/docs/external-ai-memory-bank-guide.md` Part 4 are wrong for this build — they're all under `/api/` prefix (e.g., `/api/health`, `/api/search`, `/api/memories`) not at root
- `/docs` and `/favicon.ico` return 404 (FastAPI Swagger UI disabled in this build)
- OpenCode/Kimi connects to `/mcp/` successfully but MCP queries return "Internal server error: unhashable type: 'dict' [retrying in 7s]" — response-shape mismatch between THIS mcp-memory-service version and OpenCode's MCP parser
- Kimi reports "Searched MCP memory — found only a malformed template entry, no real content" — either indexing of `/Users/snalluri/Personal/Code/Geno` didn't run, or response shape mangled the content

Endpoint inventory (for future debugging — found via curl /openapi.json):
- Health: /api/health, /api/health/detailed, /api/health/sync-status
- Memory ops: /api/memories, /api/memory-stats, /api/clear-caches
- Search: /api/search, /api/search/by-tag, /api/search/by-time, /api/search/similar/{content_hash}
- Tags & sessions: /api/tags, /api/sessions, /api/types
- Management: /api/manage/* (bulk-delete, cleanup-duplicates, untagged, etc.)
- Analytics: /api/analytics/* (overview, memory-growth, tag-usage, performance, etc.)
- Events: /api/events, /api/events/stats
- Sync: /api/sync/* (status, force, pause, resume)
- Backup: /api/backup/* (status, now, list)
- Quality: /api/quality/* (rate, evaluate, distribution, trends)
- Documents: /api/documents/* (upload, batch-upload, status, history)
- Consolidation: /api/consolidation/* (trigger, status, recommendations)
- Server: /api/server/* (status, version/check, restart, update)
- Config: /api/config/* (env, credentials)
- OAuth: /api/oauth/status
- Conflicts: /api/conflicts, /api/conflicts/resolve
- Harvest: /api/harvest
- MCP protocol: /mcp, /mcp/, /mcp/tools, /mcp/health
- Misc: /api-overview, /api/languages, /

Diagnosis: the mcp-memory-service implementation has diverged from the
spec described in `../genoly-family-web/docs/external-ai-memory-bank-guide.md`
Part 4 (actual endpoints prefixed with /api/, response shape on /mcp/
incompatible with OpenCode). The MCP ecosystem in 2026 is fragmented — different
implementations expose different endpoint layouts and response formats.

Decision: park Phase 2. Phase 1 (Karpathy structure + compact-state-files
+ AGENTS.md cross-tool entry) already delivers ~50% session-start
savings. Phase 2's marginal benefit (~20% additional via semantic
search) is not worth multi-hour debug of a fragmented ecosystem.

Reopen criteria:
- mcp-memory-service ecosystem stabilizes (look for major version 2.0
  or an officially-blessed OpenCode-compatible build)
- We hit token-cost pain again that Phase 1's compaction doesn't solve
- Specific killer feature emerges that requires semantic search

Service NOT uninstalled (pipx package remains for future reattempt).
Update `../genoly-family-web/docs/external-ai-memory-bank-guide.md` Part 4
with correct endpoint paths (e.g., `/api/health` instead of `/health`)
when Phase 2 is revisited.

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
