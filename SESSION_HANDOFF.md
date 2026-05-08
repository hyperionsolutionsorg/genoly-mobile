# Session Handoff — genoly-mobile

> **Read `/Users/snalluri/Personal/Code/Geno/master-context.md` FIRST.** That's the workspace-level entry point. This file is the mobile-repo-specific handoff.

**Audience:** AI agent or human colleague working on the Genoly mobile app. Read this if you're touching anything in `genoly-mobile/`.

**Last updated:** 2026-05-07.

---

## 📋 Standing instruction to any AI agent

**Update the live state files whenever any of these triggers occur:**

| Trigger | Files to update (within this repo) |
|---|---|
| 🎯 **Progress made** — mobile task status changed | `memory-bank/progress.md` + `memory-bank/activeContext.md` + this file |
| 🏛 **Major decision made** — mobile architecture, convention, scope change | `memory-bank/systemPatterns.md` (if rule), `memory-bank/projectbrief.md` (if scope/stack), this file, `memory-bank/activeContext.md`. Plus `master-context.md` if cross-repo. |
| 💾 **Commit landed** | Mention commit hash + summary in this file and `memory-bank/activeContext.md`. If tied to a task in `progress.md`, note hash there. |
| 🆕 **New doc added (e.g., FORK_PROCEDURE iteration)** | This file's "Cross-references" section |

Full rule + cross-repo trigger matrix: `master-context.md` → "Standing Instruction to Any AI Agent". Don't skip the parallel update — drift breaks handoffs.

---

## What this repo is

**`genoly-mobile`** — ONE unified Expo React Native app for ALL Genoly mobile. Cross-platform (iOS + Android from a single TypeScript codebase). Bottom-tab navigation: Family Tree / Fitness / Notifications / Settings. **Fitness is the first filled section** in v1.

Renamed from `fitness` on 2026-05-03 (post architecture cleanup). The fitness web app does NOT live here — it's at `../genoly-family-web/src/pages/fitness/`. This repo holds:

```
genoly-mobile/
├── apps/mobile/             # Expo React Native app (NOT YET INITIALIZED — task #7)
├── packages/health-sync/    # HealthKit + Health Connect adapters (interface only)
├── packages/types/          # Shared TypeScript types
├── packages/api-client/     # HTTP client for genoly-family-web backend
├── memory-bank/             # AI memory files (Cline-style)
├── CONTEXT.md               # Zone 1 header
├── FORK_PROCEDURE.md        # 9-phase fitness extraction playbook
└── SESSION_HANDOFF.md       # this file
```

The mobile app talks to the **shared Convex deployment** at `robust-oyster-899` (dev) / `keen-owl-415` (prod) via HTTP under `/api/fitness/*`. Auth: per-device bearer tokens with 4-month hard expiry (SHA-256 hashed for storage).

For the architectural pattern (why Genoly + Fitness coexist, the forkability invariants), read `../genoly-family-web/docs/co-hosted-architecture.md`.

---

## Current state — what's done, what's next

### ✅ Completed

| What | When | Outcome |
|---|---|---|
| Repo scaffolding | 2026-05-02 | Monorepo structure (apps/, packages/) created |
| Auth design (per-device bearer tokens, 4-month expiry) | 2026-05-02 | Locked in; documented in fitness API contract |
| Repo rename + slim (`fitness` → `genoly-mobile`, removed `apps/web/`) | 2026-05-03 | commit `c5a0984` |
| Identity finalized in CONTEXT.md + memory-bank | 2026-05-03 | commit `dc7b233` |
| `FORK_PROCEDURE.md` written | 2026-05-05 | 9-phase extraction playbook (~10–15 working days estimated) |
| **Task #8 — package interface stubs** | 2026-05-08 | **commit pending user verification.** `packages/types/src/index.ts` (all shared types — literal unions, entity shapes, `isPaymentNeutral: true` tripwire, `ApiError`); `packages/health-sync/src/index.ts` (`HealthAdapter` interface); `packages/api-client/src/index.ts` (`ApiClient` interface mirroring all 20 endpoints from `fitness-api-contract.md`). Cross-package deps wired in package.json (apps/mobile pulls all three; health-sync and api-client pull `@genoly/types`). Verification command on user's laptop: `cd /Users/snalluri/Personal/Code/Geno/genoly-mobile && npm install && cd apps/mobile && npx tsc --noEmit`. Implementations (HealthKit, Health Connect, fetch client) land in Phase 1. |
| **Task #7 — initialize Expo app** | 2026-05-07 | **commit `6da2488`** (40 files, +10216/-20). `apps/mobile/` scaffolded via `create-expo-app --template tabs` (Expo SDK 54, RN 0.81, Expo Router 6, New Architecture, typed routes). 4-tab nav skeleton: Family (default route at `/`, file `app/(tabs)/index.tsx`) / Fitness / Notifications / Settings with FontAwesome icons (sitemap / heartbeat / bell / cog) and placeholder screens. npm workspaces wired at repo root with stubs for `packages/{health-sync, types, api-client}`. `metro.config.js` extends `watchFolders` to workspace root for fast refresh on packages/* edits. App name `Genoly`, slug `genoly-mobile`, scheme `genoly://`, bundle id `org.hyperionsolutions.genoly`. Smoke-tested via Expo Go tunnel mode on Android (4 tabs render with correct icons, placeholder content loads, light/dark follows system). Code review by `qwen2.5-coder:32b` came back clean (one `.gitignore` redundancy fixed pre-commit, one false positive about `expo-router/entry` dismissed). |

### 🔵 Phase 0 work — what's next (in dependency order)

| # | Task | Notes |
|---|---|---|
| — | **Local smoke test (handoff to user)** | `cd apps/mobile && npm install` (or from repo root: `npm install` to install workspaces). Then `npx expo start`, scan QR on Expo Go (Android phone). Confirm 4 tabs render with their icons and placeholder content. |
| 8 | **Stub packages** | `health-sync`, `types`, `api-client` — interface definitions only (`src/index.ts` per package), implementations land in Phase 1. Package.json stubs already in place from Task #7. |
| 10 | **EAS Build for Android** | Android-first per the distribution decision (iOS deferred until Apple Developer Program signup) |
| 9 | **GitHub Actions** | `build-android.yml` here; web deploy lives in `genoly-family-web` |
| 11 | **Verify Phase 0 baseline** | Clean TypeScript build (`npm run typecheck`) + EAS produces a working signed APK |

### 🟡 Phase 1 (after Phase 0 baseline)

- Wire `packages/health-sync` HealthKit + Health Connect adapter implementations
- Login screen calling the server's `/api/fitness/auth/issue-token` endpoint
- Background sync task scheduler via `expo-background-fetch` (hourly, OS-throttled)
- First sync of last 30 days of daily aggregates

### 🟢 Distribution (when ready)

- Android: signed APK at `fitness.genoly.org/download/android` (free direct download)
- iOS: deferred — TestFlight via Apple Developer Program ($99/yr)

---

## Mobile-specific conventions (non-negotiable)

These apply to anything in this repo. For the cross-cutting rules (domains, git identity, Anthropic trailers), see `master-context.md`.

1. **Cross-platform — single codebase ships both platforms.** No `if (Platform.OS === 'ios') { ... else ... }` peppered through screen components. Platform differences live behind interfaces in `packages/health-sync/`.
2. **Health-reading code lives in `packages/health-sync/` ONLY.** Never inside screen components. The adapter interface is platform-agnostic; HealthKit + Health Connect are implementation details.
3. **NO in-app purchases / pricing UI / upgrade prompts** — anywhere. Mobile is FREE and payment-neutral; subscriptions live exclusively on the web at `genoly.org/billing`. Apple anti-steering compliance is mandatory. The server enforces this by returning `{ tier, expiresAt, isPaymentNeutral: true }` from `GET /api/fitness/subscription`. Mobile must respect that contract — no "Tap to upgrade" buttons, no price display, no checkout deep-links.
4. **Token storage:** the bearer token is stored in `expo-secure-store` (hardware-backed keystore on both platforms). Never in `AsyncStorage`. Never logged.
5. **Background sync is OS-throttled.** Use `expo-background-fetch` with the platform's recommended minimum interval (~15 min Android, ~30 min iOS). Aggressive polling drains battery and gets the app deprioritized by the OS.
6. **Forkability:** the mobile app continues to work after fitness extracts (per `FORK_PROCEDURE.md` Phase 6 — minimal changes: just point at the new Convex deployment URL). Avoid hard-coding anything Genoly-specific in the fitness section.

---

## Bootstrap commands

### Claude Code (terminal)

```bash
cd /Users/snalluri/Personal/Code/Geno/genoly-mobile
claude
```

Then paste the AI agent prompt from `master-context.md`.

### Aider (terminal)

```bash
cd /Users/snalluri/Personal/Code/Geno/genoly-mobile
aider --model ollama/qwen3.6:35b \
  --read /Users/snalluri/Personal/Code/Geno/master-context.md \
  --read SESSION_HANDOFF.md \
  --read CONTEXT.md \
  --read memory-bank/activeContext.md \
  --read memory-bank/progress.md \
  --read FORK_PROCEDURE.md
```

### Cline / Continue.dev (VS Code)

Open the `genoly-mobile` folder in VS Code. First message:

> Start session. Read /Users/snalluri/Personal/Code/Geno/master-context.md, then SESSION_HANDOFF.md, then CONTEXT.md, then memory-bank/activeContext.md and memory-bank/progress.md. Summarize what's complete and what's next, then wait for instructions. Respect Rule #0 (parallel state-file updates) on every state change.

---

## Cross-references

- Workspace top-of-stack: `/Users/snalluri/Personal/Code/Geno/master-context.md` (read first)
- Architecture & design doc index (registry of every architecture/design doc): `../genoly-family-web/docs/architecture-index.md`
- Mobile repo entry: [`CONTEXT.md`](./CONTEXT.md)
- Fitness extraction playbook: [`FORK_PROCEDURE.md`](./FORK_PROCEDURE.md)
- Mobile memory-bank: [`memory-bank/`](./memory-bank/) — activeContext, progress, projectbrief, systemPatterns, techStack
- Cross-product architecture: `../genoly-family-web/docs/co-hosted-architecture.md`
- Server-side API contract this app calls: `../genoly-family-web/docs/fitness-api-contract.md`

---

## How to update this file

Per Rule #0 (live state files updated in parallel — see master-context.md), update this file when:

1. A mobile task moves status (started, completed, blocked).
2. A new mobile architectural decision lands.
3. A new mobile-specific convention is established.
4. The repo structure changes (new apps/ entry, new package, etc.).

Also update in parallel:
- `genoly-mobile/memory-bank/activeContext.md` (current focus)
- `genoly-mobile/memory-bank/progress.md` (task list)
- `master-context.md` if the change is workspace-level (e.g., new repo, new convention that applies cross-repo)
