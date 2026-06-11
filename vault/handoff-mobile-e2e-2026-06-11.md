# Handoff — mobile end-to-end run (2026-06-11)

**One-line outcome:** Mission substantially accomplished — the mobile app went from "fitness companion with a placeholder Family tab" to a working **member-side Genoly app** (auth, onboarding, dashboard, tree + people + photos, settings, support) **plus the Family Walking Challenges pillar shipped end-to-end across both repos**, with deployment-readiness docs in place. The P1 experience backlog (pedigree chart, rewards page, games, chat, blog reader, analytics, step-8 salvage) is scoped and documented below for the next session.

**Operator brief:** `_mobile-e2e-brief.md` (workspace root). Plan: `vault/mobile-improvement-plan.md`. Audit: `vault/mobile-audit.md`.

---

## 1. PRs merged (all squash-merged to main, all cascaded)

### genoly-mobile (8)
| PR | SHA | What |
|---|---|---|
| — | `033814d` | Phase A audit + Phase B plan + 3 decision pages (docs, direct to main) |
| #16 | `7651701` | **C1 foundation** — theme module (light/dark/classic, WCAG-AA-tested), `components/ui` kit (Button/Screen/Section/Card/TextField/Banner/EmptyState/Toast/Skeleton), 5-tab member nav (Home/Tree/Challenges/Activity/Settings), screens off inlined hex, 3 pre-existing typecheck errors cleared, template leftovers removed |
| #17 | `cf5b041` | **C2 member auth** — Convex Auth on RN (secure-store TokenStorage), dual sessions (member + fitness bearer) with dual teardown, signup w/ server-enforced legal acceptance, 2-step OTP password reset, MFA challenge + 72h lost-authenticator recovery, demo/admin/verify-email banners, `lib/genolyApi.ts` typed function-reference facade w/ name-pinning tests |
| #18 | `75bc9dc` | **C3 welcome wizard** — 5-step `/welcome` mirror (atomic first-tree commit, optional parent, pedigree-style pick), Home gates on `onboardingCompletedAt` |
| #19 | `d84b9fd` | **C4 member dashboard** — streaks 🔥/👋, rewards summary, Today's Pick (deterministic client rotation), Top 3 this week (cache read), anniversaries, welcome-back banner, `useActiveTree` + `useRecordVisit` |
| #20 | `0bfca9d` | **D1 tree essentials** — tree hub (picker chips, debounced one-shot search, person directory), person profile (family graph, events, photo grid), edit person, add event, add photo (presigned R2 PUT direct — bytes never transit Convex), add person w/ parent/child link, `useSignedUrl` TTL cache |
| #21 | `3e7457d` | **H2 walking challenges (mobile)** — hub/create/detail screens, live leaderboard, team progress, step sync from HealthKit/Health Connect (15-min throttle, idempotent), DEV mock-health toggle, notification scaffold (real gating, log transport) |
| #22 | `8033d3b` | **G settings + support** — `/support` KB (38 articles: browse/search/article/contact form), profile name edit, Security (live MFA status), Privacy & data signposts |
| #23 | `d35ed98` | **J deployment readiness** — `docs/store-submission-checklist.md` + `vault/store-metadata.md`, AGENTS.md staleness fixes |

### genoly-family-web (1)
| PR | SHA | What |
|---|---|---|
| [#128](https://github.com/hyperionsolutionsorg/genoly-family-web/pull/128) | `b73d2c6` | **H1 walking challenges backend + web surface** — `walkingChallenges` + `challengeParticipants` tables (Genoly-side, tree-scoped), `convex/walkingChallenges.ts` (10 functions, tenant-firewalled), `/tree/:slug/challenges` page + nav pill + leaderboard footer link + "Get the app" CTA, 16 convex-tests, Playwright spec ships unrun, PENDING_TASKS §16. Schema deployed to dev. |

## 2. Decision pages (read these to understand the architecture)

- mobile `memory-bank/wiki/decisions/2026-06-11-member-side-convex-client.md` — member side rides the Convex reactive client + Convex Auth; fitness HTTP contract untouched; dual-session rules.
- mobile `…/2026-06-11-walking-challenges-schema-placement.md` — challenge tables are Genoly-side (fitness stays user-scoped/tenant-free); steps denormalized on participant rows; privacy invariants.
- mobile `…/2026-06-11-mobile-styling-approach.md` — theme module on RN StyleSheet; Tamagui/NativeWind rejected.
- web `memory-bank/wiki/decisions/2026-06-11-walking-challenges-web-integration.md` — dedicated page, not a 5th cached board.

## 3. Walking challenges recap (the new pillar)

Schema: tree-scoped `walkingChallenges` (type cooperative|individual, window daily/weekly/monthly, lazy completion — no cron) + `challengeParticipants` (denormalized `currentSteps` + bounded `stepsByDay`). API: 10 Genoly-side Convex functions — **zero fitness-contract changes** (the contract listed challenges as "v2 open question"; it still does, deliberately). Mobile: hub/create/detail + `lib/challengeSync.ts` (health-store window reads → idempotent `syncMySteps`, 15-min throttle, forced via Sync now) + privacy controls (opt-in join, leave-keeps-contributions, hide-my-activity). Web: `/tree/:slug/challenges` with join/leave/create + Get-the-app CTA. Notifications: scaffold with real gating (master toggle, quiet hours 22:00–07:00, 3/day/category) and a `__DEV__` log transport — flips to expo-notifications when the operator provisions APNs/FCM (`docs/store-submission-checklist.md §3`).

## 4. Verification state

- Mobile: `npm test` **170 pass / 0 fail** (12 intentionally skipped in the pre-existing jest-expo-56-gated screen suites), `npm run typecheck` **0 errors** (was 3 at run start). No test touches live Convex.
- Web: in-memory convex-test suite **226/226** (incl. 16 new); `npm run lint` + `tsc` (app + convex) clean; `tests/e2e/tree-challenges.spec.ts` ships **unrun** per §2.5.1.
- CI: Android preview-build workflow green on every merge (#16–#23); the workflow dispatches EAS builds (account `@hyperionsolutionsorg`).
- Bandwidth posture held: zero live-Convex test-suite runs; one `npx convex dev --once` schema deploy (required for the new tables); member-side reads are cached/indexed/one-shot by design.

## 5. Local testing instructions (operator)

```bash
cd ~/Personal/Code/Geno/genoly-mobile
npm install                       # sync node_modules (this fixed 2 of the 3 old tsc errors)
npm test                          # 170 green, in-memory only
cd apps/mobile && npx expo start  # press i (iOS sim) / a (Android emu) / scan QR for Expo Go
```
- Sign in with your dev-account credentials (dev deployment `robust-oyster-899`); signup also works end-to-end (legal acceptance recorded server-side).
- Simulators have no health store: Settings → **Developer → Use mock health data** (DEV builds only) serves deterministic synthetic steps so the full challenge loop is testable (create → join → Sync now → leaderboard moves).
- The Activity tab (fitness dashboard) and health permissions flow are unchanged from Phase 1 behavior-wise.

## 6. Deployment-readiness checklist status

| Item | Status |
|---|---|
| App icon / splash / adaptive icon | ✅ present (1024², real branding) |
| Bundle ids | ✅ `org.hyperionsolutions.genoly` (brief's `com.genoly.app` guess corrected in audit) |
| EAS profiles dev/preview/production | ✅ present; Android CI-verified; iOS build untested (no Apple Developer Program yet) |
| Store metadata | ✅ drafted — `vault/store-metadata.md` |
| Privacy/health declarations | ✅ drafted to match actual behavior |
| Submission runbook | ✅ `docs/store-submission-checklist.md` |
| Prod Convex URLs | ⛔ operator decision — `extra.convexProdBaseUrl` + new `extra.convexProdCloudUrl` are placeholders (unchanged policy) |
| Push notifications | ⛔ scaffold only by design (no credentials) |
| `eas submit` | ⛔ operator-only by policy |

## 7. Open items / deferred (the P1+ backlog for the next session)

1. **Pedigree chart on mobile** (Classic/Heritage horizontal-scroll first; Matrix may not translate — investigate; `getPedigreeData`/`getPersonPickerData` signatures already mapped in `lib/genolyApi` notes).
2. **Rewards page + modals** (15 achievements / 5 quests / streak modal), **member leaderboard screens**, and the **fitness Step-8 leaderboard salvage** — cherry-pick `origin/feat/step-8-leaderboard` (`e630ba3`) into the Activity tab with the 5 mechanical fixups listed in `vault/mobile-audit.md §2`.
3. **Games on mobile** — arcade pair first (fully client-side daily seed = zero bandwidth; `recordDailyCompletion` ref already pinned); Today's Pick CTA currently toasts "play on web".
4. **Tree chat, blog reader, analytics, atlas 2D** (3D Globe stays web — deferral per brief §5.3).
5. **Email-verification deep links** (`genoly://` scheme exists; verify link currently opens web — wire universal links at store time).
6. **GDPR export inclusion of challenge data** — web PENDING_TASKS §16 (also: reset-sweep manifests for the two new tables, store-link swap, unrun spec).
7. **Visual device pass + screenshots** — `vault/mobile-screenshots/` is EMPTY: this session had no simulator access, so brief §7.2's screenshot sweep (SE/16 Pro/Pixel 9/iPad) is the first task for a session on the operator's machine. All screens have loading/empty/error states and a11y labels coded; visual confirmation pending.
8. **Settings parity tail**: notification per-category toggles (currently one master), timezone picker, avatar upload for the USER profile (person photos work; user avatar pending), MFA enrollment on mobile (status shown; enroll stays web).
9. **jest-expo 56 screen suites** still skipped (TurboModule gap — pre-existing); revisit on the next jest-expo release.

## 8. Review-with-care list (operator)

- **`lib/genolyApi.ts` name-pinning**: mobile references web Convex functions by string. The test suite pins all 50+ names, but **renaming a web function now has a mobile consumer** — grep `genolyApi.ts` before refactoring web exports. Consider a shared package post-launch.
- **Web `TreeChallenges.tsx`** was built by a sub-agent to my spec (lint/tsc/route verified, patterns mirrored from TreeLeaderboard) — worth your usual eyeball on copy + theming, ideally on the live dev deployment.
- **Dual sessions**: sign-out tears down both (Convex Auth + fitness bearer + queue + prefs + bg task). A fitness-token failure no longer blocks member usage — Activity degrades gracefully. Watch for edge cases on real devices.
- **`app.json`** gained `extra.convexCloudUrl` (dev) + `extra.convexProdCloudUrl` (placeholder) + expo-image/picker plugins — `convexProdBaseUrl` untouched.
- **Challenge anti-cheat** is honest-family-grade: per-day clamp 200k steps, window clamping, server timestamps. Fine for families; revisit if challenges ever go public.
- The old fitness login flow was REPLACED by the dual sign-in — existing installs (just you) must sign in once more after updating.

## 9. Continuity bridge state

- graphify-out/: auto-refreshed by post-commit hooks all session (both repos).
- memory-bank: log entries per merge (both repos), 4 decision pages, phase page `2026-06-11-mobile-e2e-plan`, all `wiki/current/*` cascaded, indexes updated.
- master-context.md: updated with this run's summary (final cascade commit).
- This file + `vault/mobile-audit.md` + `vault/mobile-improvement-plan.md` are the narrative.
