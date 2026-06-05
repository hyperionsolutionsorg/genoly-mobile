# genoly-mobile — Operating Manual

**Repo:** genoly-mobile (Expo mobile app + cross-platform packages)
**Operator:** Hyperion Solutions LLC
**Last updated:** 2026-05-29 (Phase 1 Steps 1-7 shipped since 2026-05-22 — schema below is still valid; `Last updated:` bumped per doc-hygiene audit 2026-05-29)
**Parent schema:** `/Users/snalluri/Personal/Code/Geno/AGENTS.md` (workspace-level rules)
**Companion file (MUST read before building UI):** [`./DESIGN.md`](./DESIGN.md) — the mobile design system contract (palette, typography, component stylings, native-vs-custom patterns, do's-and-don'ts). AI agents read this to generate UI that matches the existing visual language without inventing values. Mirror of the web `genoly-family-web/DESIGN.md` adapted for React Native.

This file is the repo-specific operating manual. Read it AFTER the workspace `AGENTS.md` and `master-context.md`. It owns: mobile-specific rules and patterns, page templates for `memory-bank/wiki/`, operations workflows, Expo/native guidance.

---

## 1. What this repo is

`genoly-mobile` is the mobile app repository. It contains:

| Area | Path | Notes |
|---|---|---|
| Mobile app (Expo Router) | `apps/mobile/` | iOS + Android via Expo SDK 54 / RN 0.81 |
| ApiClient package | `packages/api-client/` | TypeScript interface for the 20 fitness HTTP endpoints |
| HealthAdapter package | `packages/health-sync/` | HealthKit (iOS) + Health Connect (Android) wrapper |
| Types package | `packages/types/` | Shared types — mirrors `genoly-family-web/docs/fitness-api-contract.md` |
| Fork procedure | `FORK_PROCEDURE.md` | 9-phase playbook for extracting fitness to its own product |
| Memory bank | `memory-bank/` | Cascade state, wiki, logs (Karpathy-pattern adopted 2026-05-22) |

---

## 2. Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Mobile framework | Expo SDK 55 | New Architecture enabled |
| Native runtime | React Native 0.83.6 | Hermes engine |
| React | 19.1.0 | Same major as web |
| Router | Expo Router 6 | File-based routing |
| Package manager | npm workspaces | `apps/*`, `packages/*` |
| Native modules | Expo modules only | NO bare workflow |
| Health (iOS) | `react-native-health` (Expo config plugin) | HealthKit wrapper |
| Health (Android) | `expo-health-connect` | Health Connect wrapper |
| Auth storage | `expo-secure-store` | Hardware-backed keystore for bearer token |
| Local persistence | `expo-sqlite` | Offline sync queue |
| Background tasks | `expo-background-fetch` + `expo-task-manager` | OS-throttled sync |
| HTTP client | Native `fetch` + thin wrapper | No axios |
| Forms | `react-hook-form` + `zod` | Validation |
| State | Zustand 5.x (planned) | 7-slice layout per architecture doc |
| Telemetry | Sentry (Phase 1.5) | Deferred until volume justifies |
| CI/CD | EAS Build | Account `@hyperionsolutionsorg` (Hobby tier — free) |
| Linting | ESLint + typescript-eslint | Inherited from monorepo root config |

### Monorepo wiring
- Root `package.json` declares `workspaces: ["apps/*", "packages/*"]`
- Packages reference each other via `@genoly/*` and TypeScript paths
- No build step — source is referenced directly (Hermes runs TypeScript via Metro)

---

## 3. Repo-specific rules (in addition to workspace `AGENTS.md` §3)

### 3.1 Mobile payment neutrality (HARD RULE)
Mobile apps are FREE with NO in-app payments. Web (genoly.org/billing) is the sole subscription surface. This avoids Apple's 30% cut and App Store anti-steering risk.

**Server-side `GET /api/fitness/subscription` returns `isPaymentNeutral: true` as a literal tripwire.** Mobile UI MUST check this before rendering anything subscription-related and refuse to render upgrade/payment surfaces. The `useSubscription` hook (per `genoly-family-web/docs/mobile-sync-architecture.md` §11) THROWS if `isPaymentNeutral` is ever false — preferring a hard fail in dev over App Store rejection in prod.

**Allowed mobile UI on subscription:**
- Current tier badge ("Free", "Starter", "Pro")
- Renewal date for paid tiers
- Feature limits (storage used, friend count cap, etc.)
- A "Manage subscription" link that opens `https://genoly.org/billing` in the system browser

**Forbidden mobile UI on subscription:**
- Plan-comparison tables, pricing
- "Upgrade Now" buttons
- Payment forms, Apple Pay, Google Pay, IAP product surfaces
- Text steering users toward an external purchase ("Subscribe at our website" too pushy; use "Manage subscription" only)

### 3.2 Native module strategy
Expo modules only. No bare workflow. If a needed native capability has no Expo module, write an Expo config plugin (preferred) before considering ejecting.

### 3.3 Health-reading isolation
Code that reads HealthKit / Health Connect lives ONLY in `packages/health-sync/`. Screens never import HealthKit or Health Connect directly. The `HealthAdapter` interface (defined in `packages/health-sync/index.ts`) hides platform divergence.

### 3.4 Bearer token storage
Only `expo-secure-store` under key `fitness.bearerToken`. Never AsyncStorage, never SQLite, never plaintext logs. Three operations only: `getBearerToken`, `setBearerToken`, `clearBearerToken`. Wrap in `packages/api-client/src/tokenStore.ts`. Screens never touch secure store directly.

### 3.5 ApiClient retries
- GET requests: exponential backoff (0s, 1s, 3s with ±200ms jitter, max 3 attempts) on network errors and 5xx.
- 429 rate_limited: respect `Retry-After` header; otherwise 5s, 15s, 30s.
- POST/PUT/DELETE: NO auto-retry. The client cannot distinguish "request didn't arrive" from "response didn't arrive" with certainty; better to let the user retry explicitly than risk silent double-write.

### 3.6 Token-failure path (401)
Any 401 response (unauthenticated / token_revoked / token_expired) triggers a hard teardown:
1. Set global `isReauthenticating = true` so concurrent requests bail.
2. Cancel all in-flight AbortControllers.
3. Clear `fitness.bearerToken` from secure store.
4. Wipe the SQLite sync queue (pending rows belong to the old user).
5. Wipe Zustand persisted slices (except subscription's last-known cache for welcome-screen render).
6. Navigate to login screen.
7. Clear `isReauthenticating`.

### 3.7 Initial historical pull window
On first permission grant: 30 days of HealthKit/Health Connect data. Enough for the leaderboard to feel real on day one; bounded so we don't slam the API. Don't change without revisiting (see `mobile-sync-architecture.md` §16 Q1).

### 3.8 Background sync constraints
- `expo-background-fetch` with `minimumInterval: 15 * 60` (OS-enforced minimum)
- Each wake budget: <10 seconds total
- If wake overruns, next wake retries from where it left off (queue is durable, task is not)
- Killed-app behavior: iOS terminates user-swiped apps; document in Settings FAQ

### 3.9 Clock-drift defense
Mobile clocks are untrusted. Server `serverTime` from `POST /api/fitness/sync/daily` is authoritative. Compute `clientServerSkew = serverTime - Date.now()` on every successful sync. Use it for "today" boundary calculations, token expiry display, friend request timestamps.
- `|skew| > 1 hour` → warn banner in Settings
- `|skew| > 7 days` → refuse to sync; tell user to fix device clock

### 3.10 Forkability impact (mobile-side)
When fitness extracts to its own deployment (`FORK_PROCEDURE.md`), mobile changes minimally:
- Convex base URL constant flips
- Brand strings change (if new product brand)
- All packages work unchanged

ANTI-PATTERN: never hardcode the Genoly Convex URL inside `packages/api-client/`. URL must be injected via `ApiClientConfig.baseUrl` from app environment.

---

## 4. Architecture references

The full mobile-side client architecture is in `../genoly-family-web/docs/mobile-sync-architecture.md`. Key sections to read before implementing anything:

| Section | What it covers |
|---|---|
| §1 | 10 load-bearing tech decisions (Zustand, expo-secure-store, expo-sqlite, etc.) |
| §3 | Token lifecycle (when issue/revoke, multi-device, re-auth grace) |
| §4 | ApiClient implementation pattern (bearer, retries, error parsing, AbortSignal cancellation) |
| §5 | Offline SQLite queue schema + lifecycle |
| §6 | 8-code error handling matrix |
| §7 | Zustand 7-slice layout |
| §8 | Permission flow (in-app explainer before OS picker, partial permissions, denial recovery) |
| §9 | Clock-drift defense |
| §10 | expo-background-fetch wiring (10s wake budget) |
| §11 | Subscription compliance hard-rule (App Store anti-steering reasoning) |
| §15 | 13-step Phase 1 implementation phasing |

For server-side API contract: `../genoly-family-web/docs/fitness-api-contract.md`.

---

## 5. Memory bank structure

`memory-bank/` follows the Karpathy LLM Wiki pattern (adopted 2026-05-22). Same shape as web repo's:

```
memory-bank/
├── index.md                     # Content catalog
├── log.md                       # Append-only chronological record
├── projectbrief.md              # Mobile-specific project description
└── wiki/
    ├── current/                 # Cascade-redundant projections (≤200 lines each)
    │   ├── active-context.md
    │   ├── progress.md
    │   ├── session-handoff.md
    │   └── overview.md
    ├── phases/                  # One page per mobile phase
    ├── decisions/               # Mobile-side decisions
    └── tasks/                   # Multi-step in-flight tasks
```

### Legacy files (deprecation pointers)

5-line pointer files redirecting to new wiki/ locations:

- `memory-bank/activeContext.md` → `wiki/current/active-context.md`
- `memory-bank/progress.md` → `wiki/current/progress.md`
- `memory-bank/systemPatterns.md` → this `AGENTS.md`
- `SESSION_HANDOFF.md` (at repo root) → `memory-bank/wiki/current/session-handoff.md`

---

## 6. Page templates

Same shape as web repo (`../genoly-family-web/AGENTS.md` §7). Quick reference:

### Phase page
```yaml
---
type: phase
phase: mobile-step-1
date: YYYY-MM-DD
status: planned | in-progress | completed | abandoned
commit: <hash if merged>
owner: claude
tags: [mobile, phase-1]
sources: ["[[mobile-sync-architecture]]"]
---
```

### Decision page
```yaml
---
type: decision
name: "..."
date_decided: YYYY-MM-DD
status: active | superseded | retired
tags: [mobile, ...]
sources: ["[[...]]"]
---
```

### Task page
```yaml
---
type: task
name: "..."
status: planned | in-progress | blocked | completed
blocking_reason: "..."
owner: claude | kimi-k2.6 | shankar
sources: ["[[mobile-sync-architecture]]"]
---
```

---

## 7. Operations — cascade / query / lint

Same as web repo's (`../genoly-family-web/AGENTS.md` §8). Quick reference:

### Cascade (Rule #0 evolved)
1. Append one entry to `memory-bank/log.md`.
2. Update affected wiki page(s).
3. Update `wiki/current/active-context.md` (≤200 lines).
4. Update `wiki/current/progress.md`.
5. Update `wiki/current/session-handoff.md`.
6. Update `wiki/current/overview.md` if picture shifted.
7. Update `memory-bank/index.md` if new wiki page.
8. Update workspace `master-context.md` if cross-repo.
9. One commit. Push.

---

## 8. Mobile development quirks

### 8.1 Expo + Convex
- Convex URL injected via `app.json` `extra.convexBaseUrl` (dev) / `extra.convexProdBaseUrl` (prod)
- Read via `expo-constants` `Constants.expoConfig.extra.convexBaseUrl`
- App version from `Constants.expoConfig.version` (for telemetry)

### 8.2 EAS Build
- Account: `@hyperionsolutionsorg` (Hobby tier — free, current quota fits dev usage)
- Configured for Android only (current); iOS deferred until $99/yr Apple Developer Program signup
- CI auto-triggers EAS builds on `main` push (GitHub Actions in `.github/workflows/build-android.yml`)
- Signed APK published to artifacts; downloadable from EAS dashboard

### 8.3 Permissions (HealthKit + Health Connect)
- Always run in-app explainer BEFORE OS picker — Apple's picker is non-resumable; we get one chance.
- Partial-permission grants are legitimate — render zeros for unavailable metrics, no errors.
- Re-query permission state on every cold start; never trust cached value.

### 8.4 React Native testing
Currently sparse. Phase 1.5 will add Jest unit tests + Detox/Maestro E2E. Don't block Phase 1 ship on testing infrastructure.

---

## 9. AI tool quirks

### 9.1 Claude Code
Auto-discovers `CLAUDE.md` (thin pointer at repo root).

### 9.2 OpenCode (Kimi K2.6) — strict guardrails
Same as web repo. Branch-only operation. Explicit-path `git add`. Hash verification. Paste output, not "passed". Scope-limited. Claude reviews + merges.

### 9.3 Aider
CLI: `aider --read AGENTS.md --read memory-bank/wiki/current/active-context.md --read memory-bank/wiki/current/progress.md`.

---

## 10. Quick reference

### Session start
1. Workspace `/Users/snalluri/Personal/Code/Geno/AGENTS.md`
2. Workspace `master-context.md`
3. This file
4. `memory-bank/index.md`
5. Last 10 entries of `memory-bank/log.md`
6. `memory-bank/wiki/current/*`

### Commands
- Lint: `npm run lint` (inherits monorepo ESLint config)
- TypeScript check: `npx tsc --noEmit`
- Dev (Expo): `cd apps/mobile && npx expo start`
- Build (EAS): `cd apps/mobile && eas build --platform android --profile preview`

### Convex env (consumed by mobile)
- Dev: `https://robust-oyster-899.convex.site` (HTTP endpoint, not `.convex.cloud`)

---

*Repo-level schema for genoly-mobile. Maintained by Hyperion Solutions LLC. Read workspace `AGENTS.md` for cross-repo context.*

## Code knowledge graph report

This project has a code knowledge graph report at **`docs/GRAPH_REPORT.md`** — generated 2026-05-26 by Claude as the mobile-side Phase 3 deliverable. Companion to `../genoly-family-web/docs/GRAPH_REPORT.md` for the workspace.

It's a heavily forward-looking report — most of the mobile codebase is still Expo boilerplate awaiting Phase 1 implementation. The report describes BOTH what's here today AND the planned structure per `../genoly-family-web/docs/mobile-sync-architecture.md`.

**Rules for AI tools (Claude Code, OpenCode/Kimi, Cursor, etc.):**

- **Before grepping, find, fd, or rg for code-structure questions, read `docs/GRAPH_REPORT.md` first.** It maps everything that exists today (Expo boilerplate + memory bank + planning docs) plus the planned packages (`api-client`, `health-sync`, `types`) with file pointers.
- §3 (repo map) + §4 (current code) + §5 (planned packages) + §7 (5 blocking decisions) + §8 (hard rules) should answer 90% of "where does X go?" without searching.
- **Don't grep `node_modules/`** — it's 100% noise. All real code lives in `apps/mobile/` + `packages/`.
- The auto-installed `.claude/settings.json` and `.opencode/plugins/graphify.js` hooks check for `graphify-out/graph.json` and stay silent or active depending on its presence. `graphify update .` was run 2026-05-26 (425 nodes, 413 edges, 44 communities), so `graph.json` exists; the `query`/`path`/`explain` graphify CLI commands ARE viable from a local shell (not from a Cowork sandbox).

**Available graphify commands once you're in a local shell with graphify installed:**

- `graphify query "<question>"` — scoped BFS subgraph for a question, default 2000-token budget
- `graphify path "<A>" "<B>"` — shortest path between two nodes
- `graphify explain "<concept>"` — focused explanation of a node + neighbors
- `graphify update .` — re-extract AST after code changes (also runs automatically via post-commit hook)
- `open graphify-out/graph.html` — interactive D3 viewer (force-directed)
- `graphify tree && open graphify-out/GRAPH_TREE.html` — hierarchical collapsible-tree viewer

**When the report goes stale:** when Phase 1 actually ships (token store + ApiClient skeleton + real screens replace boilerplate placeholders). Regen via Claude OR — if `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` is set — `graphify extract . --backend <provider>`.
