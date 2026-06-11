# Mobile repo audit — Phase A (2026-06-11)

**Scope:** Verified state of `genoly-mobile` against memory claims + brief premises, before any code changes. Companion to `vault/mobile-e2e-start-2026-06-11.md`.
**Main at audit time:** `2b80447`. Working tree clean.

---

## 1. Phase 1 step-by-step reality check

| Step | Claimed | Verified reality |
|---|---|---|
| 1 Token store + ApiClient skeleton | Merged PR #3 | ✅ `packages/api-client/src/token-store.ts` (SecureTokenStore, key `genoly.auth.token`) + `client.ts` FetchApiClient |
| 2 Login screen | Merged PR #4 | ✅ `apps/mobile/app/(auth)/login.tsx` — RHF + zod + ApiClientError mapping |
| 3 Cold-start auth gate | Merged PR #4 | ✅ `apps/mobile/app/_layout.tsx` — three-arm routing (login / permissions / tabs), fail-closed |
| 4 HealthKit adapter | Merged PR #5 | ✅ `packages/health-sync/src/HealthKitAdapter.ts` |
| 5 SQLite sync queue | Merged PR #5 | ✅ `packages/sync-queue` (ExpoSqliteStore + MemoryStore, drain ≤50/batch, ≤3 retries, dead-letter) |
| 6 Background fetch | Merged PR #5/#6 | ✅ `apps/mobile/utils/backgroundSync.ts` (`genoly.sync.healthAggregates`, 15-min hint) |
| 7 Dashboard | Merged PR #8 | ✅ `(tabs)/fitness.tsx` + `hooks/useDashboardData.ts` (today cards + 7-day bars + dead-letter banner) |
| 8 Leaderboard | **NOT merged** | ⚠️ Lives only on `origin/feat/step-8-leaderboard` (`e630ba3`), branched pre-SDK-55/56. See §2. |
| 11 Settings | Merged PR #5 | ✅ `(tabs)/settings.tsx` (account, sync toggle, payment-neutral subscription link, sign-out teardown) |
| 12 Health Connect adapter | Merged PR #5 | ✅ `HealthConnectAdapter.ts` + graceful SDK-unavailable fallback |
| 9 Friends / 10 Goals / 13 Polish+submit | Not started | ✅ confirmed not started (client methods throw `not_implemented`) |

**ApiClient implementation status (20 methods):** implemented = `issueToken`, `revokeToken`, `getSession`, `getDailyAggregates`, `syncDailyAggregates` (5). All 15 others throw `not_implemented` on main (`getLeaderboard` is implemented on the step-8 branch only). Note: mobile `docs/GRAPH_REPORT.md` §5 claims `getSubscription` is wired — **stale**; Settings reads subscription tier via `getSession`.

## 2. Step 8 branch investigation (merge vs rebuild)

`e630ba3` adds: `(tabs)/leaderboard.tsx` (355 lines), `hooks/useLeaderboardData.ts` (mirrors `useDashboardData`), 13 tests, `getLeaderboard()` client implementation, 5th tab in `(tabs)/_layout.tsx`.

Quality: high — follows main's hook/screen/test patterns and DESIGN.md palette. But it predates the SDK 54→55→56 migration: it imports `@expo/vector-icons` (now `@react-native-vector-icons/fontawesome`), conflicts with main's `_layout.tsx` (type assertions, colorScheme ternary), and predates the SDK-56 jest config.

**Disposition: cherry-pick + mechanical fixups** (~5 small edits), not a raw merge and not a rebuild. However — the tab layout itself is being redesigned for the member app (§6), so the right moment is when the new navigation lands, slotting the fitness leaderboard screen into wherever fitness lives in the new IA. Decision recorded in Phase B plan.

## 3. Fitness API contract — server-side verification

**20/20 endpoints implemented and routed** in `genoly-family-web/convex/http.ts` → `convex/fitness/{auth,sync,friends,goals,devices,subscription}.ts`. Zero signature drift against `docs/fitness-api-contract.md`. Error envelope, 8-code matrix, bearer SHA-256 hot path (`by_tokenHash`) all match.

- Rate limiting: specified in the contract, **not yet implemented server-side** (known TBD, not a mobile blocker).
- **Challenges:** explicitly listed under the contract's "Open questions for v2" — no challenge endpoints or tables exist. The walking-challenges backend is greenfield.
- Fitness tables (6): `fitness_users` (bridge `genolyUserId`), `fitness_health_daily` (the step source of truth, `by_fitnessUserId_date`), `fitness_friendships`, `fitness_goals`, `fitness_devices`, `fitness_tokens`.

## 4. Local quality gates (verified by running them)

- `npm test` (root): **60/60 pass, exit 0** — brief §2.6's "3 pre-existing Jest failures (#294)" and "root jest config broken (#295)" are **stale premises**: closed 2026-06-05 via PR #15 (`93f6b9a`). 4 UI suites remain intentionally skipped (jest-expo 56 TurboModule gap).
- `npm run typecheck`: **3 pre-existing errors confirmed exactly as memory states** — missing `@react-native-vector-icons/fontawesome` module, missing `expo-router/react-navigation` types, `ExternalLink.tsx` typed-route mismatch. These WILL block my work (every PR needs clean tsc) → fix early in execution (P0).
- No `lint` script exists at mobile root (web has one; mobile uses typecheck as gate).
- expo-doctor last known 21/21 (2026-06-05 claim; re-verify when deps change).

## 5. Existing screen walk

| Screen | State |
|---|---|
| Root `_layout.tsx` | Auth gate works (token → login/permissions/tabs). Splash held until resolved. Fail-closed. |
| `(auth)/login.tsx` | Solid form; 6-code error mapping; **inputs missing accessibility labels**; forgot-password is an Alert pointing at genoly.org (needs real flow per brief §5.1). |
| `(auth)/permissions.tsx` | Good explainer (3 metric rows + privacy note); registers bg sync on grant. |
| `(tabs)/index.tsx` (Family) | "Phase 2 — coming later" **placeholder** — this is the member-app surface this mission builds. |
| `(tabs)/fitness.tsx` | Real dashboard; loading/error/empty/dead-letter states all handled; a11y labels present. |
| `(tabs)/notifications.tsx` | Placeholder. |
| `(tabs)/settings.tsx` | Real; fitness-scoped only (no profile/theme/notifications/security/privacy yet). |
| `modal.tsx`, `EditScreenInfo.tsx`, `ExternalLink.tsx`, `StyledText.tsx`, `Themed.tsx` | Expo template leftovers — cleanup candidates. |

Assets: `icon.png`/`splash-icon.png`/`adaptive-icon.png` (1024×1024) appear to be real Genoly branding, not template defaults. eas.json has development/preview/production profiles; `submit.production` empty (correct — operator-only). `app.json`: bundle id `org.hyperionsolutions.genoly` (brief's guess `com.genoly.app` is wrong — keep actual), `extra.convexBaseUrl` dev set, `extra.convexProdBaseUrl` placeholder (Decision 1 still pending Shankar — do not touch).

## 6. The load-bearing architecture finding

The brief calls for full member-side parity (trees, persons, photos, chat, games, rewards, settings) and §4 lists "Convex client (existing `@genoly/api-client` package)". **Premise correction:** `@genoly/api-client` is the fitness HTTP bearer-token client, not a Convex client. Building ~100 member-side HTTP endpoints to mirror the web would be wrong and would bloat the sacred fitness contract.

The intended design already exists in `genoly-family-web/docs/co-hosted-architecture.md`'s stack diagram: the unified mobile app has a **Family side on "Convex reactive"** (WebSocket, same as web) and a **Fitness side on "HTTP API bearer"**. So:

- **Member side** → `convex` React client + `@convex-dev/auth` (verified: `ConvexAuthProvider` accepts a pluggable `TokenStorage` — official React Native support; expo-secure-store adapter). Password sign-in/sign-up/reset flows are non-redirect and work from RN. Member features call the same public Convex queries/mutations the web uses (tenant firewall enforced server-side already).
- **Fitness side** → unchanged: existing 20-endpoint HTTP contract. Forkability untouched.
- **Walking challenges** → tree-scoped (tenant-scoped) feature ⇒ per co-hosted-architecture's anti-patterns ("never store the tenant id on a fitness table"), challenge tables live on the **Genoly side** (`convex/walkingChallenges.ts` or similar), NOT in `convex/fitness/`. Mobile feeds step counts to joined challenges via a Genoly mutation using data it already reads from HealthKit/Health Connect. **The fitness API contract needs zero changes** — the strongest possible compliance with the forkability constraint. (Brief §6.3 anticipated this: "may even need to live OUTSIDE fitness/ — investigate." Investigated: they must.)

Two auth sessions will coexist on device (Convex Auth JWT for member side; fitness bearer token for health sync). Sign-out must tear down both. Detailed design → Phase B decision page.

## 7. Brief premise corrections (per `feedback_verify_cowork_briefs`)

1. §2.6 jest debt (#294/#295) — already fixed on main (60/60 green). Only the 3 typecheck errors remain real.
2. §4 "Convex client (existing @genoly/api-client)" — that package is the fitness HTTP client; the member side needs the actual `convex` + `@convex-dev/auth` packages (new deps, justified + free + MIT).
3. §8.1 bundle id — actual is `org.hyperionsolutions.genoly`, not `com.genoly.app`. Keep actual.
4. §1 path "genoly-mobile/docs/mobile-sync-architecture.md" — doc lives in the web repo (`genoly-family-web/docs/`).
5. Master-context's mobile row ("Step 4 next") is stale; real state is Steps 1–7, 11, 12 merged; Step 8 on unmerged branch.
6. mobile `docs/GRAPH_REPORT.md` §5 wrongly lists `getSubscription` as wired (it throws).

## 8. Web-side imperatives the mobile app must honor (from June 10–11 decisions)

- Invite links use `?invite=` — `?code=` is reserved by Convex Auth and breaks session rehydration.
- Deep-link auth redirects preserve `next` (relative only); client-side role gates render access-denied, never crash.
- Toast feedback layer (no bare alert() spam on web; mobile equivalent: lightweight toast, native Alert only for confirmations per mobile DESIGN.md).
- Games: two-axis model (category Family/Arcade × playStyle quick/puzzle/sprint); arcade daily games are fully client-side with a shared deterministic daily seed (zero bandwidth — great for mobile); `recordDailyCompletion` (idempotent) credits the contribution streak + achievement #15; social stats on result panels.
- Rewards: 15 achievements (not 14 — #15 "Connection Maker" landed 2026-06-11), 5 quests, 2 streaks (🔥 contribution + 👋 visit).
- Demo: canonical demo identity pinned by Convex `_id` in siteSettings; demo users detected via `convex/lib/demoUsers.ts` SSOT emails; demo users can never hold site roles.
- Support: canonical `/support`, 38 KB articles live server-side (mobile §5.7 can consume them now).
- Bandwidth: lazy-load, cache, no fan-out; `siteStatsCache`/`treeLeaderboardCache` precedents.

## 9. Gap inventory vs. brief §5 (summary; prioritization in Phase B plan)

- **Auth/Onboarding:** login exists (fitness-token only). Missing: member Convex Auth session, signup + legal acceptance, forgot/reset, email verification, MFA challenge, 5-step welcome wizard, account recovery.
- **Dashboard:** fitness dashboard exists; member dashboard (streaks, achievements, today's pick, rewards summary, top-3 leaderboard, anniversaries, welcome-back) missing.
- **Tree exploration / Person+Events+Photos / Engagement / Settings depth / Support / Demo banner:** all missing (Family tab is a placeholder).
- **Walking challenges:** greenfield on both sides (schema, API, mobile UI, web leaderboard surface).
- **Deployment readiness:** assets exist; store metadata, submission checklist, push scaffolding missing; iOS EAS profile present but iOS untested (no Apple Developer Program yet).
- **Debt to clear first:** 3 typecheck errors; template-file cleanup; theme module (`theme/colors.ts`) before building ~30 new screens on inlined hex.
