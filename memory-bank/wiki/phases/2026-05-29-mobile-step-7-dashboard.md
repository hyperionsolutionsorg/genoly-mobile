---
type: phase
phase: mobile-step-7-dashboard
date: 2026-05-29
status: implementation-complete-pending-pr
commit: working-tree-on-main
owner: claude (interactive)
collaborator: shankar
tags: [mobile, dashboard, fitness, sync-queue, phase-1]
sources: ["[[2026-05-29-mobile-step-4-12-overnight]]"]
---

# Mobile Phase 1, Step 7 — Dashboard (today + last 7 days)

**One-line:** Replaced the placeholder fitness tab with the real Dashboard: today's big-number card (steps + active calories + distance), a horizontal-bar "Last 7 days" section, a one-tap-clear dead-letter banner, and a refresh button that runs `SyncQueue.drain()` then `apiClient.getDailyAggregates()`. Hook + screen + 23 new tests.

## Decisions made with Shankar this morning

| Decision | Choice | Rationale |
|---|---|---|
| Visual layout | Big today numbers + 7-day horizontal bars | "Recommended" option. Bars drawn with plain `<View>` widths — no chart library, no new native deps. |
| Sync on dashboard mount | Always drain + refetch on mount, plus manual Refresh button | Catches up offline work whenever user opens the screen. Pull-to-refresh deferred. |
| Dead-letter UI | Dashboard banner with inline "Clear" tap + native confirm | Shankar's specific concern: "becomes a noise and not nice to have in app". One-tap clear from the dashboard removes the noise risk. |

## What shipped (working tree on main, uncommitted)

| File | What it is |
|---|---|
| `apps/mobile/hooks/useDashboardData.ts` | NEW. Hook that computes "today" + "last 7 days" in **local TZ** (deliberately not UTC), runs drain+fetch on mount and on refresh, reads queue + dead-letter depth AFTER drain, exposes `clearDeadLetters()`. SyncQueue injectable for tests. |
| `apps/mobile/app/(tabs)/fitness.tsx` | MODIFIED (replaced stub). Header (title + last-synced + Refresh button), error banner with Retry, dead-letter banner with Clear, today's three big numbers in a single card, 7-day horizontal bars (today bar gets a darker blue accent), loading state, empty state, all per the mobile `DESIGN.md`. |
| `apps/mobile/__tests__/useDashboardData.test.ts` | NEW. 12 tests: range computation (2 incl. month boundary), drain-then-fetch order, sort, today lookup, depth reads, refresh cycle, drain failure non-fatal, fetch failure surfaces, clearDeadLetters wraps + re-reads. |
| `apps/mobile/__tests__/fitness.test.tsx` | NEW. 12 tests: loading state, empty state, today big numbers, dash placeholders, 7-day bars, refresh button, dead-letter banner show/hide + singular/plural copy + clear flow + cancel flow, error banner + retry. |

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit -p apps/mobile/tsconfig.json` | Exit 0 — clean |
| `npm test` from `apps/mobile/` | 7 suites, 54 tests passing (24 new this PR). Jest run ~2.2s. |
| Real-device smoke | DEFERRED — iOS sim + Android emulator pending Shankar |

## Notes for follow-up

- **No goal-progress overlay.** Today numbers are raw. Step 10 (Goals) will add a thin progress band on each big number.
- **No theme module yet.** Hex literals still inlined per the `DESIGN.md` §10 deferred item. Migration is one PR's worth of mechanical work when dark mode is decided.
- **Auto-purge of old dead-letters** is NOT implemented. The clearDeadLetters() flow is user-triggered. If the queue accumulates over months, the banner reappears on next refresh — Shankar's concern is addressed by the one-tap clear, not by silent expiry.
- **Workspace test runner gap still open.** The 32 package-level tests (`packages/health-sync` + `packages/sync-queue`) aren't run by this Jest invocation. Pre-existing concern from PR #7.

## See also

- `[[2026-05-29-mobile-step-4-12-overnight]]` — preceding bundle that provided SyncQueue + ApiClient methods this Dashboard consumes
- `DESIGN.md` (repo root) — the design system the screen anchors to
- `../genoly-family-web/docs/mobile-sync-architecture.md` §15 (the 13-step plan)
