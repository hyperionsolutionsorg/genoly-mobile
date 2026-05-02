# CONTEXT — fitness (monorepo)
<!-- AI: Read Zone 1 always. Load Zone 2 files based on your context capacity. -->

---

## ZONE 1 — COMPACT HEADER (always read, ~300 tokens)

**Repo:** fitness (monorepo)
**GitHub:** hyperionsolutionsorg/fitness
**Product:** Fitness Tracker — steps + calories dashboard for friends/family
**Status:** 🔵 PLANNING — no code yet

**Structure:**
- `apps/web/` — Vite + React + TypeScript + Convex (dashboard, leaderboard)
- `apps/mobile/` — Expo React Native (reads HealthKit/Health Connect, syncs data)
- `packages/health-sync/` — reusable health module (will plug into Genoly mobile later)
- `packages/types/` — shared TypeScript types
- `packages/api-client/` — shared API calls

**Key design rule:** Health sync logic lives in `packages/health-sync/` only.
Never mix health reading code with app UI screens.

**Identity:** `Genoly Projects <git@hyperionsolutions.org>` — set per-repo, never global.

**3 Rules:**
1. Git: `Genoly Projects <git@hyperionsolutions.org>`
2. No Co-Authored-By Claude/Anthropic trailers in commits
3. `packages/` changes trigger BOTH web and mobile CI — be deliberate

---

## ZONE 2 — LOAD MORE

| File | Load when | Size |
|------|-----------|------|
| `memory-bank/activeContext.md` | Starting any session | ~1 KB |
| `memory-bank/progress.md` | Working on features | ~1 KB |
| `memory-bank/techStack.md` | Touching config, infra, packages | ~2 KB |
| `memory-bank/systemPatterns.md` | Architecture or design decisions | ~1 KB |

**Docs:** `docs/` — all project documentation
**Related:** `../genoly-family-web/CONTEXT.md` — future integration target

## Model Loading Guide

| Model | Load |
|-------|------|
| 7B (mistral-small) | Zone 1 only |
| 24–32B (qwen, deepseek, gemma) | Zone 1 + activeContext + progress |
| 70B (llama3.3) | Zone 1 + all memory-bank files |
