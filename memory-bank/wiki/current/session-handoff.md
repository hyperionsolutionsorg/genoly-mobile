---
type: current
name: "Session handoff — genoly-mobile"
updated: 2026-05-22
status: active
---

# Session handoff

**For the next agent or session picking up this repo.**

## State right now

**Main branch:** `d4fbecc` — Karpathy hybrid Phase 1 foundation (AGENTS.md + CLAUDE.md). Origin synced.
**Active branch:** `active-agravity-branch` contains the complete Phase 1, Step 1 implementation (token store, ApiClient skeleton, and issueToken end-to-end smoke test).

**Working tree:** clean, ready for review.

**Code:** Step 1 completed and verified.

## What's done (recent)

- ✅ Phase 1, Step 1 fully implemented and verified on `active-agravity-branch` 2026-05-28
- ✅ Phase 0 fully closed 2026-05-08 (signed APK on Android, EAS Build + GitHub Actions wired)
- ✅ Mobile sync architecture doc locked in `../genoly-family-web/docs/mobile-sync-architecture.md` (2026-05-15)
- ✅ FORK_PROCEDURE.md updated 2026-05-15 (Phase A forkability lint fix consequences)
- ✅ AI memory bank Phase 1 foundation (`d4fbecc`) — AGENTS.md + CLAUDE.md

## What's next

1. **Review and Merge Step 1 PR** (open as Draft).
2. **Mobile-side Step 2: login screen** (email + password form using `react-hook-form` + `zod`, calling `issueToken`, saving, and navigating).
3. **Steps 3-13** per `mobile-sync-architecture.md` §15.


## Reading order for the next agent

1. `/Users/snalluri/Personal/Code/Geno/AGENTS.md` — workspace operating manual
2. `/Users/snalluri/Personal/Code/Geno/master-context.md` — cross-repo state
3. `./AGENTS.md` — this repo's operating manual
4. `./memory-bank/index.md` — content catalog
5. Last 10 entries of `./memory-bank/log.md`
6. `./memory-bank/wiki/current/active-context.md` — current focus + 5 pending decisions
7. `./memory-bank/wiki/current/progress.md` — task statuses
8. This file — for "what's next"
9. `./memory-bank/wiki/current/overview.md` — 30-second summary

For implementation work, also read:
- `../genoly-family-web/docs/mobile-sync-architecture.md` (client-side architecture)
- `../genoly-family-web/docs/fitness-api-contract.md` (the 20 server endpoints)
- `./FORK_PROCEDURE.md` (fork-impact assessment)

## Watchouts

- **Hard rule: NO in-app purchases.** Mobile is payment-neutral; subscription is web-only (App Store anti-steering compliance). See `AGENTS.md` §3.1.
- **Bearer token storage:** `expo-secure-store` only, NEVER AsyncStorage. See `AGENTS.md` §3.4.
- **Native modules:** Expo modules only, never bare workflow. See `AGENTS.md` §3.2.
- **Convex URL must be injected, not hardcoded.** Otherwise breaks forkability. See `AGENTS.md` §3.10.
