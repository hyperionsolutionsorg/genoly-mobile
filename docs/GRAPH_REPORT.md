# Genoly Mobile — Code Knowledge Graph Report

> **Maintained by Claude** as the mobile-side Phase 3 AI-memory-bank deliverable. Companion to `../genoly-family-web/docs/GRAPH_REPORT.md`.
> **Last regenerated:** 2026-07-09 — **FULL rewrite** replacing the 2026-06-09 version. That report described a Fitness-only app (Phase 1 Steps 1-7 + 11, 4-tab nav, `getSubscription` wrongly listed as wired). Since then the repo has shipped the **2026-06-11 member-app run** (PRs #16-#23: theme module + UI kit, Convex Auth member sessions, 5-tab nav, welcome wizard, member dashboard, tree essentials + person profiles + R2 photos, walking challenges, settings depth + `/support` KB), **V1.0.0** (Pro-only plan gate + paywall + release automation), and **today's Phase-1 closure + 4 tree surfaces** (leaderboard/friends/goals/goals-history pushed routes; `ApiClient` 16/20 implemented; `components/tree/` + `lib/tree/` — Explore, Register, Pedigree Classic, Fan — ported from the web). This report describes **what exists today**.
>
> **Why a Claude-written report and not `graphify extract`:** same local-LLM-stack constraint as the web repo — see `../genoly-family-web/docs/GRAPH_REPORT.md` header and `../genoly-family-web/memory-bank/wiki/decisions/graph-report-regen-2026-06-09.md`. The AST-only `graphify update .` self-refreshes `graphify-out/` via the repo's Claude Code / OpenCode hooks whenever files change (`AGENTS.md` §"Code knowledge graph report") — that structural graph is not duplicated here; this file is the curated narrative layer on top of it.
>
> **Companion docs (don't duplicate):** `AGENTS.md` (repo manual, hard rules), `../genoly-family-web/docs/mobile-sync-architecture.md` (the authoritative client-side design for the fitness side — token lifecycle, offline queue, retry, error matrix, permission flow, clock-drift, background fetch, subscription compliance), `../genoly-family-web/docs/fitness-api-contract.md` (the 20 server endpoints), `FORK_PROCEDURE.md`, `DESIGN.md` (RN design-system contract).

---

## 1. Project overview + phase status

`genoly-mobile` is the **Expo mobile app** for Genoly. It is now a genuine two-sided app, not just the Fitness companion the 2026-06-09 report described:

- **Member side** (family tree, dashboard, walking challenges, settings, support): talks to the same Convex backend as `genoly-family-web` via the **reactive Convex client** (`convex/react` + `@convex-dev/auth`), using hand-pinned function references in `apps/mobile/lib/genolyApi.ts` (no cross-repo import of the web's generated `_generated/api`).
- **Fitness side** (steps/calories/distance sync, friends, goals): talks to the co-hosted fitness HTTP API via `packages/api-client` (Bearer-token `fetch` client) — the original Phase 1 architecture, untouched by the member-app work (forkability decision 2026-06-11).

npm-workspaces monorepo: `apps/mobile` (the Expo app) + `packages/*` (cross-platform libraries).

**Current status:** Phase 1 (fitness sync + leaderboard) is **COMPLETE** — main at `e4ec701` per `memory-bank/log.md`'s 2026-07-09 merge entry. The member app (5-tab nav, auth, dashboard, tree, challenges, settings/support) shipped 2026-06-11. **V1.0.0** made the whole app **Pro-only**: `app.json` reports `version: "1.0.0"`. Four Pro tree-visualization surfaces (Explore/Register/Pedigree/Fan) landed the same day as this report's regeneration.

**Mobile payment neutrality (hard rule):** the app is FREE with NO in-app payments — web (`genoly.org/billing`, `genoly.org/pricing`) is the sole subscription surface. `GET /api/fitness/subscription` reports `isPaymentNeutral: true` as a tripwire; mobile UI must never render upgrade/payment surfaces. See `AGENTS.md` §3.1 and `app/(gated)/paywall.tsx` (§7 below).

**Forkability:** when fitness extracts to its own deployment (`FORK_PROCEDURE.md`), the fitness side changes minimally — the Convex HTTP base URL constant flips; `packages/*` are unchanged. Never hardcode the Genoly URL inside `packages/api-client/` — inject via `ApiClientConfig.baseUrl`. The member side (`lib/genolyApi.ts`) is Genoly-only by design and is explicitly kept out of scope for the fork.

---

## 2. Repository structure (actual, as of 2026-07-09)

```
genoly-mobile/
├── AGENTS.md / CLAUDE.md / CONTEXT.md / SESSION_HANDOFF.md
├── DESIGN.md                      # Mobile design-system contract (RN mirror of web's)
├── FORK_PROCEDURE.md              # 9-phase fitness-extraction playbook
├── eas.json / package.json        # EAS profiles; workspaces root
├── scripts/release.mjs (+ .test.mjs), scripts/sync-manifest.mjs   # V1.0.0 release automation
├── apps/mobile/
│   ├── app/                       # Expo Router file tree → §5
│   │   ├── _layout.tsx            # Root AuthGate: member session → Pro gate → permissions → tabs
│   │   ├── (auth)/                # login, signup, forgot-password, mfa-challenge, permissions
│   │   ├── (tabs)/                # 5-tab navigator: index(Home), tree, challenges, activity, settings
│   │   ├── (gated)/paywall.tsx    # Non-Pro landing screen (V1.0.0)
│   │   ├── welcome.tsx            # 5-step onboarding wizard (mirrors web /welcome)
│   │   ├── person/[personId]/     # index, edit, add-event, add-photo
│   │   ├── add-person.tsx, challenge/[challengeId].tsx, challenge-create.tsx
│   │   ├── leaderboard.tsx, friends.tsx, goals.tsx, goals-history.tsx   # pushed fitness routes
│   │   ├── support.tsx, support-article/[slug].tsx
│   │   └── modal.tsx / +not-found.tsx / +html.tsx   # Expo template leftovers (unused)
│   ├── components/
│   │   ├── tree/                  # Explore/Register/Pedigree/Fan surfaces → §6
│   │   └── ui/                    # Button, Card, Screen, Section, TextField, Banner, EmptyState,
│   │                               # Skeleton, Toast (C1 UI kit; index.ts barrel)
│   ├── theme/                     # light/dark/classic palettes, ThemeProvider/useTheme (C1)
│   ├── hooks/                     # useActiveTree, useMe, useRecordVisit, useSignedUrl,
│   │                               # useDashboardData, useFriendsData, useGoalsData, useLeaderboardData
│   ├── lib/
│   │   ├── genolyApi.ts           # member-side Convex function-reference facade → §4
│   │   ├── planChecks.ts          # Pro-tenant gate + downgrade-grace helpers → §7
│   │   ├── authSchemas.ts, dashboardFormat.ts, gameRegistry.ts,
│   │   │   challengeSync.ts, notifications.ts
│   │   └── tree/                  # pure geometry/layout ports for the tree surfaces → §6
│   ├── utils/                     # api client singleton, convex client, backgroundSync, preferences
│   ├── app.json                   # Expo config, version 1.0.0 → §8
│   ├── jest.config.js / jest.setup.js
│   └── __tests__/                 # Jest specs → §9
├── packages/
│   ├── api-client/                # FetchApiClient + TokenStore (→ §4)
│   ├── health-sync/                # HealthAdapter (HealthKit / Health Connect / Mock)
│   ├── sync-queue/                 # SQLite offline outbox + drain
│   └── types/                      # shared types (mirror fitness-api-contract.md)
├── vault/                          # audits, plans, research (mobile-audit.md, pro-gating-audit-2026-07-09.md, …)
└── memory-bank/                    # Karpathy LLM Wiki (index, log, wiki/{current,phases,decisions,tasks})
```

Note: an Android emulator running on this machine may generate a transient `apps/mobile/android/` directory — that's build scaffolding, not a tracked source directory; ignore it.

---

## 3. Navigation / information architecture

**Tabs (`apps/mobile/app/(tabs)/_layout.tsx`, 5-tab):** Home (`index.tsx`, member dashboard) → Tree (`tree.tsx`, exploration hub) → Challenges (`challenges.tsx`, walking challenges) → Activity (`activity.tsx`, the former "Fitness" tab — steps/calories/distance + Friends/Leaderboard entry point) → Settings (`settings.tsx`). The old Notifications tab is gone; notification preferences live in Settings.

**Pushed (non-tab) routes off `app/`:** `leaderboard.tsx`, `friends.tsx`, `goals.tsx`, `goals-history.tsx` (all off Activity), `challenge/[challengeId].tsx` + `challenge-create.tsx` (off Challenges), `person/[personId]/{index,edit,add-event,add-photo}.tsx` + `add-person.tsx` (off Tree), `support.tsx` + `support-article/[slug].tsx` (off Settings), `welcome.tsx` (onboarding, gated on `onboardingCompletedAt`), `(gated)/paywall.tsx` (non-Pro landing).

**Auth group (`(auth)/`):** `login.tsx`, `signup.tsx`, `forgot-password.tsx` (2-step OTP), `mfa-challenge.tsx` (TOTP/backup codes), `permissions.tsx` (first-run health-permission explainer).

---

## 4. The two-sided architecture

### Member side — Convex reactive client

`apps/mobile/app/_layout.tsx` wraps the app in `ConvexAuthProvider` (from `@convex-dev/auth/react`) using a `ConvexReactClient` singleton (`utils/convex.ts`, base URL `app.json extra.convexCloudUrl`) and a `SecureStore`-backed `TokenStorage` adapter.

`apps/mobile/lib/genolyApi.ts` (716 lines) is the **name-pinned facade**: since the web repo's generated `convex/_generated/api` can't be imported cross-repo, every server function is declared via `makeFunctionReference<'query'|'mutation'|'action', Args, Return>('file/path:exportName')` with hand-maintained types, one pin per web export. Sections cover: users (`users:me`), auth telemetry, MFA (`mfa:*`), email verification, onboarding (`onboarding:completeOnboardingFirstTree`), trees + persons (`trees:*`, `persons:*`, `families:*`), events (`events:*`), media/R2 photos (`media:*`, `r2:getUploadUrl`/`getDownloadUrl`), dashboard widgets (`rewards:getMyRewardsSummary`, `treeLeaderboards:getTreeLeaderboard`, `anniversaries:getUpcomingAnniversaries`, `games:*`, `gameCompletions:*`), Family Walking Challenges (`walkingChallenges:*` — create/join/leave/cancel/addParticipant/setMyVisibility/syncMySteps/listTreeChallenges/listMyActiveChallenges/getChallengeLeaderboard), support/KB (`kb:*`, `contactSubmissions:submitContact`), tree surfaces (`explorerGraph:explorerGraph`, `pedigree:getAncestorTree`), and tenant/plan access (`tenants:listMyTenants` + the `useHasProTenantAccess()` hook, §7).

**⚠️ Name-collision hazard (verified in code, not just documented):** the file pins `pedigree:getAncestorTree` (the NESTED father/mother-recursion shape used by Pedigree Classic + Fan) and explicitly warns that `explorerGraph:getAncestorTree` is a **different, Focus-only, Pro-gated, flat-Ahnentafel** query — never pin that one for the pedigree/fan surfaces. The warning is echoed in `components/tree/PedigreeClassic.tsx`, `FanView.tsx`, `lib/tree/explorerTypes.ts`, `app/(tabs)/tree.tsx`, and asserted by `__tests__/genolyApi.test.ts`'s name-pinning suite.

### Fitness side — HTTP bearer ApiClient (16/20 implemented)

`packages/api-client/src/client.ts`'s `FetchApiClient` implements the `ApiClient` interface from `src/index.ts` (mirrors `fitness-api-contract.md`'s 20 endpoints): native `fetch`, Bearer header, exponential backoff on GET only (3 attempts, honors `Retry-After` on 429), typed `ApiClientError`.

**Implemented (16):** §1 auth — `issueToken`, `revokeToken`, `getSession`; §2 daily sync — `getDailyAggregates`, `syncDailyAggregates`; §3 friends/leaderboard — `getFriends`, `getLeaderboard`, `requestFriend`, `acceptFriend`, `declineFriend`, `unfriend`, `blockFriend`; §4 goals — `getGoals`, `getGoalsHistory`, `upsertGoal`, `archiveGoal`.

**Stubs (4) — still throw `ApiClientError({code:'bad_request', message:'not_implemented'}, 400)`:** §5 devices — `getDevices`, `setPrimaryDevice`, `revokeDevice`; §6 `getSubscription`. Phase 1 didn't need devices or subscription, so these were deliberately left unwired. **Settings reads plan tier via `apiClient.getSession()`, not `getSubscription()`** — the 2026-06-09 report's claim that `getSubscription` was wired was stale/wrong (flagged in `vault/mobile-audit.md` §7 item 6); this report corrects it.

> Note on the count: `memory-bank/log.md`'s 2026-07-09 entries describe this as "15/20 implemented." A direct read of `client.ts` shows 4 stub methods, not 3, so the accurate figure is **16/20**. Flagging the discrepancy rather than silently propagating either number.

---

## 5. App layout highlights (Expo Router — `apps/mobile/app/`)

| Area | Key file(s) | Purpose |
|---|---|---|
| Root gate | `_layout.tsx` | `AuthGate` — see §7 for the full arm-by-arm breakdown. |
| Home | `(tabs)/index.tsx` | Member dashboard: streaks (🔥 contribution / 👋 visit), rewards summary, Today's Pick, top-3 weekly leaderboard, upcoming anniversaries, welcome-back banner, no-tree empty state → `/welcome`. |
| Tree | `(tabs)/tree.tsx` + `components/tree/*` | Exploration hub: multi-tree picker, `TreeViewPicker` mode strip (Explore/Register/Pedigree/Fan), person directory, add-person CTA. See §6. |
| Challenges | `(tabs)/challenges.tsx` + `challenge/[challengeId].tsx` + `challenge-create.tsx` | My-challenges-across-trees + tree active/past lists; create (team-goal vs race, 3 windows, invite-only); detail (live leaderboard, cooperative progress bar, Sync now, join/leave/cancel). |
| Activity | `(tabs)/activity.tsx` + `leaderboard.tsx`, `friends.tsx`, `goals.tsx`, `goals-history.tsx` | Fitness dashboard (today's big numbers + 7-day chart + dead-letter banner) plus the Phase-1-closure pushed routes for friends management, daily leaderboard, active goals (max 4 slots), and month-grouped goal history. |
| Settings | `(tabs)/settings.tsx` | Account, health-sync toggle + "Manage permissions", Appearance (theme picker), Notifications + DEV mock toggles, Security (live `getMfaStatus`), Privacy & data signposts, Subscription link-out to genoly.org, Support entry, Legal, sign-out (fail-closed: server revoke best-effort → clear token → reset prefs → unregister background drainer → `/login`). |
| Support | `support.tsx` + `support-article/[slug].tsx` | KB browse by category + debounced search + article view (markdown-lite) + contact form. |
| Person | `person/[personId]/{index,edit,add-event,add-photo}.tsx` | Avatar/life-dates/summary/immediate family/events/photo grid; edit; add event; add photo (`expo-image-picker` → presigned R2 PUT → `createMediaMetadata` + `linkMedia`). |
| Onboarding | `welcome.tsx` | 5-step wizard: welcome → name tree → add yourself (`completeOnboardingFirstTree`) → optional parent → pedigree style pick. |
| Paywall | `(gated)/paywall.tsx` | Non-Pro landing: "Upgrade your tree" / "Continue on web" → `genoly.org/pricing` / `genoly.org` in the system browser (Apple anti-steering — no in-app payment). |
| Template leftovers | `modal.tsx` / `+not-found.tsx` / `+html.tsx` | Expo boilerplate, unused. |

---

## 6. Tree-surfaces module cluster (new since 2026-06-09)

Four Pro-gated tree-visualization surfaces, RN rewrites of web components, all reached through the `(tabs)/tree.tsx` shell + `TreeViewPicker` mode strip (`explore` default, then `register`, `pedigree`, `fan`):

- **`components/tree/ExploreCanvas.tsx`** — the default view; RN rewrite of the web's `PerspectiveCanvas`. Read-only: tap re-anchors, long-press opens profile, "+N" pills mark collapsed kin. Default radius ±2 on mobile (svg render budget vs. web's ±3 + ReactFlow culling); server clamps at ±5.
- **`components/tree/RegisterTable.tsx`** — table view (name/relationship/lifespan + sort + search), absorbing the old person-directory + search UI. Rows outside the anchor's loaded neighborhood render "—" rather than being silently dropped (web parity).
- **`components/tree/PedigreeClassic.tsx`** — ancestor-only classic pedigree, simplified from the web's vintage aesthetic to plain themed boxes/lines (DESIGN.md tokens, Hermes-safe, no canvas text measurement). Rooted at the shared tree-shell anchor.
- **`components/tree/FanView.tsx`** — radial ancestor wheel; defaults to 4 generations, **hard-capped at 5** (legibility tested at 390pt width — 6-7 gens, which the web supports on desktop, is not legible on a phone).
- **`components/tree/TreeViewPicker.tsx`** — pure segmented-control mode switch; no per-surface lock icons because the app-level Pro gate (§7) means non-Pro users never reach this screen at all.
- **`components/tree/ZoomPanView.tsx`** — shared pan/pinch viewport (react-native-gesture-handler + react-native-reanimated) reused by Explore, Pedigree, and Fan, replacing the web's `@xyflow/react` (Explore) and `d3-zoom` (Pedigree) viewport owners.

**`lib/tree/`** holds the pure, dependency-light ports: `perspectiveScope.ts` + `perspectiveLayout.ts` (Explore's scope/layout passes), `relationshipCore.ts`, `classicLayout.ts` (d3-hierarchy `hierarchy()`+`tree()` + ancestor y-inversion), `fanGeometry.ts` (ported verbatim from the web), `listHelpers.ts` (Register's filter/sort/relationship-resolver), `registerUi.ts`, `explorerTypes.ts` (hand-maintained mirrors of web `convex/explorerGraph.ts` + `convex/pedigree.ts` payload shapes), `perspectiveTestKit.ts`.

New dependencies for this cluster: `react-native-svg` (15.15.4), `react-native-gesture-handler` (~2.31.1), `d3-hierarchy` (^3.1.2, used by `classicLayout.ts` and `fanGeometry.ts`). See §9 for the Jest ESM workaround these required.

---

## 7. The Pro gate chain (V1.0.0)

`lib/planChecks.ts` owns the gate logic so `_layout.tsx` stays focused on routing: `hasAnyProTenant()` / `filterProTenants()` operate on `TenantSummary[]`; `DOWNGRADE_GRACE_MS = 5 * 60 * 1000`; `computeDowngradeDeadline(detectedAtMs)` anchors an absolute epoch-ms deadline exactly once per downgrade event; `getGraceRemainingMs(deadlineMs, nowMs)` reschedules the eviction timer from that fixed deadline rather than a fresh window.

`lib/genolyApi.ts`'s `useHasProTenantAccess()` hook queries `tenants:listMyTenants` and returns `null` while loading, else `hasAnyProTenant(tenants)`.

`app/_layout.tsx`'s `AuthGate` arms, in order: (1) member session loading → hold splash; (2) no session + outside `(auth)` → `/(auth)/login`; (3) session valid but `hasProAccess === null` → **hold the splash, do not mount the app tree** (2026-07-09 audit finding F1: mounting here let a gated screen fire queries before Pro status was known); (4) session valid + health permissions never requested → `/(auth)/permissions`; (5) session valid + no Pro tenant → `/(gated)/paywall`; (6) otherwise render the app. A mid-session downgrade shows a 5-minute grace banner before the hard redirect, timed from the anchored deadline via a dedicated effect keyed only on `downgradeDeadline` (audit finding F2: keying on more inputs let unrelated re-renders, e.g. navigation, silently extend the grace window).

Per `vault/pro-gating-audit-2026-07-09.md`, all 8 gated surfaces verdict "non-Pro cannot reach via app" through this client-side gate; F3 (no server-side plan gate on `explorerGraph`/`pedigree`/the fitness HTTP API) is accepted by design for now — mobile Pro is a monetization gate on top of the web's Free/Starter entitlement model, with a mobile-namespaced wrapper-query hardening option documented for later.

---

## 8. Native config

**`apps/mobile/app.json`:** name `Genoly`, slug `genoly-mobile`, **version `1.0.0`** (V1.0.0 stamp), scheme `genoly`, bundle/package `org.hyperionsolutions.genoly`, Android `versionCode: 100`. `extra.convexBaseUrl = "https://robust-oyster-899.convex.site"` (fitness HTTP, dev), `extra.convexCloudUrl = "https://robust-oyster-899.convex.cloud"` (member Convex reactive client), `extra.convexProdBaseUrl = "keen-owl-415-placeholder"` (prod URL still pending operator decision). Plugins include `react-native-health`, `react-native-health-connect`, `expo-sqlite`, `expo-image`, `expo-image-picker`.

**`scripts/release.mjs`** (+ `release.test.mjs`) — V1.0.0 release automation / CHANGELOG generator; **`scripts/sync-manifest.mjs`** — manifest sync helper.

**`eas.json`:** profiles `development`/`preview`/`production`. Android wired; iOS deferred until Apple Developer Program.

---

## 9. Testing posture

Jest (`jest-expo` 56 preset). `jest.config.js` maps `d3-hierarchy` (ESM-only, `exports`-blocked) straight to its pre-bundled UMD build (`node_modules/d3-hierarchy/dist/d3-hierarchy.js`) since jest-expo can't transform it — needed by `lib/tree/classicLayout.ts` and `fanGeometry.ts`.

**Skipped** (`testPathIgnorePatterns` — jest-expo 56 doesn't fully mock the New-Architecture TurboModule chain (`Dimensions.set`, `PlatformConstantsIOS`, feature flags) that Expo Router screen-level imports need; these crash at import time before `describe.skip` can help): `__tests__/login.test.tsx`, `settings.test.tsx`, `auth-gate.test.tsx`, `activity.test.tsx`. Real-device/simulator smoke is the authoritative gate for these screens.

**Active:** all pure-logic and hook suites, including the tree-surfaces geometry/layout ports (`perspectiveScope`/`perspectiveLayout`/`relationshipCore` +74 tests; classic-pedigree layout; `fanGeometry` +23 tests), `genolyApi.test.ts`'s name-pinning suite (asserts the `pedigree:getAncestorTree` vs `explorerGraph:getAncestorTree` distinction, §4), `planChecks` (+8 tests for the F1/F2 hardening), package specs (`token-store`, `friends`, `goals`, `HealthAdapter`, `SyncQueue`).

Per the 2026-07-09 merge entry in `memory-bank/log.md`: `npm run typecheck` 0 errors; `npm test` 385 passed / 34 skipped / 419 total on the unified post-merge tree.

Commands: `npm run lint` · `npx tsc --noEmit` · `cd apps/mobile && npx expo start` · `eas build --platform android --profile preview`. Do not run installs/builds/tests as part of regenerating this doc — verified via source reading only.

---

## 10. Web boundary

Mobile consumes two independent surfaces of the same Convex backend: the reactive Convex API (member side, `convex/react` + `@convex-dev/auth`, cloud URL) and the fitness HTTP API (`convex/fitness/*` registered in `convex/http.ts`, `.convex.site` endpoint). **Contract sources of truth:** `../genoly-family-web/docs/mobile-sync-architecture.md` (client design) and `../genoly-family-web/docs/fitness-api-contract.md` (20 endpoints) for the fitness side; the web repo's `convex/` source (`users.ts`, `trees.ts`, `persons.ts`, `walkingChallenges.ts`, `explorerGraph.ts`, `pedigree.ts`, `tenants.ts`, etc.) for the member side, mirrored by hand into `lib/genolyApi.ts`.

**Fitness token lifecycle (unchanged from Phase 1):** `issueToken()` at login → `SecureTokenStore` → `getSession()` cold-start validation → `isExpired()` auto-clear → `revokeToken({scope})` at logout. 401 triggers the hard teardown sequence in `AGENTS.md` §3.6.

**Subscription tripwire:** `getSubscription()` — still a stub (§4) — is specified to report `isPaymentNeutral: true` once implemented; mobile UI must never render payment surfaces regardless.

---

## 11. packages/ (cross-platform libraries)

- **`packages/api-client`** — `ApiClient` interface + `FetchApiClient` (§4) + `TokenStore`/`SecureTokenStore`/`MemoryTokenStore`.
- **`packages/health-sync`** — `HealthAdapter` interface + `HealthKitAdapter` (iOS) / `HealthConnectAdapter` (Android) / `MockHealthAdapter` (web/tests), routed by `createHealthAdapter(options)`. Metrics: `steps`, `caloriesActive`, `distanceMeters`.
- **`packages/sync-queue`** — SQLite offline outbox: `queue.ts` drain loop (batches ≤50, ≤3 retries, dead-letter table), `store.ts` (`ExpoSqliteStore` + `MemoryStore`).
- **`packages/types`** — shared types (`HealthEntry`, `FitnessUser`, `FitnessDevice`, `Goal`/`ArchivedGoal`, `Leaderboard`, `ApiError`, …); source of truth is `fitness-api-contract.md`. Explicitly forbidden from importing outside itself (fork-boundary leaf).

---

## 12. Hard rules pointers

- **Payment neutrality:** §1 above; `AGENTS.md` §3.1; `getSubscription`'s `isPaymentNeutral: true` tripwire (currently unreachable — the method is a stub, §4).
- **Health data isolation / bearer storage:** tokens live only in `expo-secure-store` (`packages/api-client/src/token-store.ts`), never AsyncStorage, never logged; see `AGENTS.md` §3.6 for the 401 teardown sequence.
- **Forkability:** §1 above; `FORK_PROCEDURE.md`; `packages/types`'s no-external-import rule; the member-side/fitness-side split at `lib/genolyApi.ts` vs `packages/api-client`.
- **Member-side facade discipline:** `lib/genolyApi.ts`'s header explicitly forbids adding fitness references there — keep it "SMALL and member-side only."

---

## 13. Memory bank pointer

Don't reproduce narrative here — link by date in `memory-bank/`: catalog `index.md`; current state `wiki/current/*`; recent phases pages for the 2026-06-11 member-app run (C1-D1, H2, G) and the 2026-07-09 Phase-1-closure + tree-surfaces run. Authoritative merge/close entries: `memory-bank/log.md` `[2026-06-11] note | MOBILE E2E RUN CLOSED`, `[2026-07-09] note | two-workstream run CLOSED`, `[2026-07-09] merge | run merges landed — Phase 1 fitness CLOSED + 4 Pro tree surfaces live on main`. Audits: `vault/mobile-audit.md`, `vault/pro-gating-audit-2026-07-09.md`.

---

## 14. For AI tools

Read order: workspace `AGENTS.md` → `master-context.md` → this repo's `AGENTS.md` → **this file** → `memory-bank/index.md` → last 10 of `memory-bank/log.md` → `wiki/current/*`. For fitness-side implementation, also read `mobile-sync-architecture.md` + `fitness-api-contract.md`. For member-side implementation, read `lib/genolyApi.ts` in full before adding a new Convex pin (check for an existing one first — it's large and easy to duplicate). **Never grep `node_modules/`** or the transient `apps/mobile/android/` build directory — all real code is `apps/mobile/` + `packages/`. Regenerate this report when the devices/subscription stubs get wired, when a Phase-2 surface (rewards/games depth, chat, blog, analytics) lands, or the SDK upgrades again.

*Last regen marker: 2026-07-09 — full rewrite reflecting the 2026-06-11 member-app run, V1.0.0 Pro gate, Phase-1 fitness closure, and the four tree surfaces. Previous: 2026-06-09 (Phase 1 Steps 1-7/11, Fitness-only, SDK 56/RN 0.85.3).*
