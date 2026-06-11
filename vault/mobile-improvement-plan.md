# Mobile end-to-end improvement plan — Phase B (2026-06-11)

**Input:** `vault/mobile-audit.md` (Phase A). **Mission:** member-side parity + Family Walking Challenges, deployment-ready.
**Decisions locked (see decision pages):** member side rides the Convex reactive client + Convex Auth ([[2026-06-11-member-side-convex-client]]); walking-challenge tables live Genoly-side, fitness contract untouched ([[2026-06-11-walking-challenges-schema-placement]]); styling = first-party theme module on RN StyleSheet, no Tamagui/NativeWind ([[2026-06-11-mobile-styling-approach]]).

## Priorities

**P0 — blocks "deployment ready"**
1. Foundation: fix 3 typecheck errors, remove Expo template leftovers, `theme/` module (colors/typography/spacing per DESIGN.md), shared UI kit (Screen, Section, Button, TextField, Card, Banner, Toast, EmptyState), navigation IA rework (tabs: Home / Tree / Challenges / Activity / Settings).
2. Member auth: Convex Auth RN session (secure-store TokenStorage), signup w/ legal acceptance + RFC-6761-blocked TLDs (server already enforces), forgot/reset, email verification, MFA challenge, dual-session sign-out teardown (Convex Auth + fitness bearer), admin-on-mobile banner, demo banner.
3. Welcome wizard (5-step, `onboardingCompletedAt`).
4. Member dashboard: streaks (🔥/👋), achievements widget, today's pick, rewards summary, top-3 leaderboard (reads `treeLeaderboardCache` — zero extra bandwidth), anniversaries, welcome-back banner.
5. Tree essentials: tree picker (lastVisitedTree pattern via AsyncStorage), members list, person profile view/edit, add person, add event, photo capture/upload + tagging, relationship management, pedigree picker.
6. Settings depth: profile, theme (light/dark/classic-serif), notifications prefs, security (MFA enable/disable + backup codes), privacy & data (GDPR export incl. health data, deletion), connected health sources, logout.
7. **Family Walking Challenges** (the pillar): Genoly-side schema + 7 functions, mobile hub/create/detail/join, activity dashboard, sync-status, mock-health dev toggle, notification scaffolding (local, quiet hours, caps; push deferred), web `/tree/:slug/challenges` surface + leaderboard cross-link.
8. Deployment readiness: store metadata drafts, privacy nutrition/data-safety notes, `docs/store-submission-checklist.md`, EAS profile verify, one dev build per platform (Android verifiable now; iOS build config verified, actual signing blocked on Apple Developer Program — operator).

**P1 — key UX**
9. Pedigree chart (Classic + Heritage horizontal-scroll first; Bubble touch variant; Matrix deferred unless it translates).
10. Rewards page (15 achievements / 5 quests / 2 streaks), achievement/quest/streak modals, leaderboard screens (member tree leaderboard + fitness step-8 cherry-pick into Activity).
11. Games: arcade pair first (Connections + Timeline Tap — fully client-side, deterministic daily seed, zero bandwidth) then family games as data allows; `recordDailyCompletion` idempotent credit.
12. Tree chat (with camera attachments), blog reader, analytics + Family Health Score (cached pattern), atlas 2D (Sheet/Timeline/Constellation; 3D Globe deferred to web — decision page).
13. Support: KB search + article view + contact form.

**P2 — polish**
14. Reanimated celebrations + expo-haptics, reduced-motion respect, VoiceOver/TalkBack sweep, skeletons everywhere, bundle/startup audit.

**P3 — defer (documented)**
3D Globe atlas; Matrix pedigree (if it doesn't translate); blog authoring; step-equivalent inputs; push delivery (scaffold only); Sentry.

## Execution order (brief §9 phases → PR waves)

- **C1** Foundation PR (debt + theme + UI kit + nav shell) → **C2** Member auth + sessions → **C3** Welcome wizard → **C4** Dashboard.
- **D** Tree exploration (D1 picker+members, D2 person view/edit/add+events, D3 photos, D4 pedigree, D5 chat/blog-reader, D6 analytics/atlas-2D).
- **F** Engagement (F1 rewards, F2 leaderboards incl. step-8 salvage, F3 games).
- **G** Settings + Support.
- **H** Walking challenges (H1 backend+web surface in web repo, H2 mobile UI, H3 notifications scaffold + mock toggle).
- **I** Polish/a11y/perf → **J** Deployment readiness → **K** Handoff.

C/D/E/F/G can interleave; H1 can start any time (independent backend). Every PR: tests (Jest+RNTL, in-memory only), typecheck clean, cascade, decision pages for non-trivial choices, no AI attribution.

## Bandwidth diet rules for member-side Convex usage (141% cap)

- Prefer existing cached tables (`treeLeaderboardCache`, analytics cache) over fresh fan-outs.
- One subscription per screen where possible; paginate lists; no polling loops.
- Arcade/daily-seed games stay fully client-side (zero server reads beyond the once-daily completion mutation).
- Challenge leaderboards read denormalized `challengeParticipants.currentSteps` (one indexed range read), never fan out across health data.
- NO Jest/Playwright suites against live Convex; live verification via one-off scripts only.

## Asks of the operator (non-blocking, parked)

- Decision 1 (prod Convex URL placeholder) still pending — unchanged, untouched.
- Apple Developer Program required before any iOS signing/TestFlight.
- Push certificates (APNs/FCM) before push delivery turns on — scaffold ships dark.
