# CONTEXT — genoly-mobile
<!-- AI: Read Zone 1 always. Load Zone 2 files based on your context capacity. -->
<!-- AGENT HANDOFF: If you are a NEW AI agent picking up this project cold,
     read /Users/snalluri/Personal/Code/Geno/master-context.md FIRST. That is
     the workspace-level entry point and routing dispatcher. Then read
     genoly-mobile/SESSION_HANDOFF.md for the current mobile state. Do NOT
     start from this file — start from master-context.md. -->


---

## ZONE 1 — COMPACT HEADER (always read, ~300 tokens)

**Repo:** genoly-mobile (renamed from `fitness` on 2026-05-03)
**GitHub:** https://github.com/hyperionsolutionsorg/genoly-mobile
**Product:** Genoly mobile — ONE unified Expo React Native app for the whole Genoly product. Bottom-tab navigation: Family Tree / Fitness / Notifications / Settings. Fitness is the first filled section (steps + calories dashboard for friends/family).
**Status:** 🔵 PLANNING — no app code yet; structure scaffolded.

**Cross-platform:** ONE TypeScript codebase ships both iOS and Android via Expo + EAS Build.

**Distribution v1:**
- **Android FIRST priority** — direct APK download (free, no Play Store needed initially)
- **iOS SECOND priority** — TestFlight requires Apple Developer Program ($99/yr); deferred until traction justifies signup. Free sideloading paths (AltStore/SideStore/Expo Go) don't work for HealthKit native modules.

**Structure:**
- `apps/mobile/` — Expo React Native app
- `packages/health-sync/` — health-reading module (HealthKit + Health Connect adapters)
- `packages/types/` — shared TypeScript types
- `packages/api-client/` — shared HTTP client for the genoly-family-web backend
- (NO `apps/web/` — fitness web pages live in `../genoly-family-web/src/pages/fitness/`)

**Backend:** This app talks to Genoly's shared Convex deployment at `robust-oyster-899` (dev) / `keen-owl-415` (prod). HTTP API endpoints under `/api/fitness/*` in `genoly-family-web/convex/http.ts`. Per-device bearer-token auth, 4-month hard expiry, Android sync via `expo-background-fetch` (hourly, OS-throttled).

**Identity:** `Genoly Projects <git@hyperionsolutions.org>` — set per-repo, never global.

**3 Non-Negotiable Rules:**
1. Git: `Genoly Projects <git@hyperionsolutions.org>` per-repo (no Anthropic co-author trailers)
2. Health-reading code lives in `packages/health-sync/` ONLY — never inside screen components
3. NO in-app purchases / pricing UI / upgrade prompts. Apps are free + payment-neutral; subscriptions live exclusively on web (Stripe). Apple anti-steering compliance is mandatory.

---

## ZONE 2 — LOAD MORE

| File | Load when | Size |
|------|-----------|------|
| `memory-bank/activeContext.md` | Starting any session | ~3 KB |
| `memory-bank/progress.md` | Checking what's next | ~3 KB |
| `memory-bank/techStack.md` | Touching config, infra, packages | ~2 KB |
| `memory-bank/systemPatterns.md` | Architecture or design decisions | ~1 KB |

**Docs:** `docs/` — local project documentation. Cross-repo docs (architecture, data model, deploy playbook) live in `../genoly-family-web/docs/`.
**Related:** `../genoly-family-web/CONTEXT.md` — the web + backend repo this app talks to.

---

## Model Loading Guide

| Model | Load |
|-------|------|
| 7B (mistral-small) | Zone 1 only |
| 24–32B (qwen, deepseek, gemma) | Zone 1 + activeContext + progress |
| 70B (llama3.3) | Zone 1 + all memory-bank files |
