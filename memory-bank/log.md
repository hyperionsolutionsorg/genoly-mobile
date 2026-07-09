# Wiki Log — genoly-mobile

Append-only chronological record. **Strict format**:

```
## [YYYY-MM-DD] <op> | <short title>

<body>
```

Ops: `merge`, `decision`, `doc`, `rule`, `note`, `query`, `lint`.

Tail recent: `grep "^## \[" memory-bank/log.md | tail -10`.
---

## [2026-07-09] note | memory-bank refresh — V1.0.0 gate + release automation backfilled

Three PRs landed 2026-06-29/06-30 but were never cascaded into `wiki/current/` — the last cascade there is still dated 2026-06-11 (mobile e2e run close, `d78fe0e`). This entry backfills them plus opens today's dispatch.

**#24 `ae3f781` — V1.0.0: mobile Pro-only plan gate + version bump.** `apps/mobile/lib/planChecks.ts` (new) owns the gate logic: `hasAnyProTenant()` / `filterProTenants()` over a `TenantSummary[]`, plus `DOWNGRADE_GRACE_MS = 5 * 60 * 1000`. `apps/mobile/lib/genolyApi.ts` gains `listMyTenants` (mirrors web `convex/tenants.ts:listMyTenants`) and the `useHasProTenantAccess()` hook (returns `null` while loading, else `hasAnyProTenant(tenants)`). `app/_layout.tsx`'s `AuthGate` grew a 4th arm: session valid + no Pro tenant → `/(gated)/paywall` (new screen: "Upgrade your tree" / "Continue on web" — both open genoly.org in the system browser, no IAP, per payment-neutrality). Downgrade is reactive: a `hadProRef` tracks prior Pro status; losing it mid-session shows a red banner for `DOWNGRADE_GRACE_MS` before the hard redirect. Version bumped to 1.0.0 (iOS buildNumber 1, Android versionCode 100), surfaced in Settings → About via new `constants/version.ts`. `docs/CHANGELOG.md` initialized. Tests: `paywall-gate.test.tsx` (14 assertions) + `version.test.tsx`.

**#25 `1f4caac` — fix: version-drift.** #24 bumped `constants/version.ts` to "1.0.0" but left `apps/mobile/app.json` (the App Store/Play Store source of truth), `apps/mobile/package.json`, and the root `package.json` at "0.1.0". CI being disabled meant `version.test.tsx`'s parity assertion (`VERSION === appJson.expo.version`) didn't catch it at merge time. Fixed by bumping all three lagging files; `ios.buildNumber`/`android.versionCode` untouched (separate store-submission ritual). No code changes.

**#26 `4412d3a` — release automation + CHANGELOG generator.** New `scripts/release.mjs` (root, zero deps): pre-flight drift check across the four version-bearing files (closes the exact failure mode #25 had to hotfix) → atomic SemVer bump across all four → CHANGELOG section generated from conventional commits since last tag → commit `chore: release v<new>` → annotated tag → prints push command (no auto-push). `ios.buildNumber`/`android.versionCode` intentionally left alone. New npm scripts `release:patch`/`minor`/`major`/`prerelease` + `test:scripts` (dedicated `jest.scripts.config.cjs` — root jest-expo preset is wrong for plain-ESM scripts). `scripts/release.test.mjs` — 45 Jest cases. `docs/RELEASING.md` added. Closes #401 (mobile half).

**Workspace path change.** The workspace root moved from `/Users/snalluri/Personal/Code/Geno` to `/Users/shankar/Code/Geno` (2026-07-09 new-Mac restore). The old path is historical; cross-references in `wiki/current/*` are being repointed to the new path as part of this cascade.

**Today's dispatch (2026-07-09) — two-workstream run opened.** Workstream A: finish Phase 1 fitness (Step 8 leaderboard salvage — branch `feat/step-8-leaderboard-salvage`, sourced from `origin/feat/step-8-leaderboard` at `e630ba3`, pre-SDK-56, in flight now in a sibling worktree; then Step 9 friends, Step 10 goals+history, Step 13 polish) plus porting four Pro-gated tree surfaces from web to mobile (Explorer-as-default, Register table view, Classic pedigree, Fan-if-legible). Workstream B: challenge-growth / standalone-user research — report only, no code.

**Baseline verified this session:** `npm run typecheck` — 0 errors. `npm test` — 189 passed / 12 skipped / 201 total, 14 of 15 suites run (1 UI suite skipped — jest-expo 56 TurboModule chain, pre-existing, not a regression). Uncommitted `package-lock.json` (3-line diff, `"version": "0.1.0"` → `"1.0.0"` in 3 places) is lockfile metadata drift left over from #25/#26's `package.json` edits never being run through `npm install` — harmless (no dependency changes), left uncommitted intentionally.
## [2026-07-09] merge | Step 8 leaderboard salvage — cherry-picked into Activity tab, no new tab

Cherry-picked `e630ba3` (`origin/feat/step-8-leaderboard`, predates SDK 56 + the
member-app 5-tab redesign) per `vault/mobile-audit.md` §2 and
`vault/handoff-mobile-e2e-2026-06-11.md` §7 item 2.

**Conflicts resolved:**
- `apps/mobile/app/(tabs)/_layout.tsx` — rejected the branch's 5th tab; today's
  IA is fixed at 5 tabs (Home/Tree/Challenges/Activity/Settings). No entry added here.
- `memory-bank/log.md` — this entry replaces the branch's stale 2026-05-29 note
  (which described pre-fixup file locations no longer accurate).

**IA decision:** the leaderboard is a pushed screen (`apps/mobile/app/leaderboard.tsx`,
mirrors the existing `challenge/[challengeId].tsx` / `person/[personId]` top-level-route
pattern) reached via a "Friends leaderboard" row on the Activity tab — not a tab.
It inherits the same auth + Pro gate as every other top-level route (`_layout.tsx`
`AuthGate` redirects any non-`(auth)`/`(gated)` segment to the paywall when
`useHasProTenantAccess()` is false).

**Mechanical fixups applied** (per audit §2): `@expo/vector-icons` →
`@react-native-vector-icons/fontawesome`, restyled off inlined hex onto
theme tokens (`useTheme`/`useThemedStyles`), reused `Banner`/`EmptyState` from
`components/ui` instead of hand-rolled markup, adapted both test files to the
current jest-expo 56 setup and mock conventions (`../utils/api`, hook mock).
`getLeaderboard({ date })` in `packages/api-client/src/client.ts` cherry-picked cleanly
(no conflict).

---

## [2026-06-10] decision | graphifyy 0.8.36 upgrade + AGENTS.md graph-tooling cleanup

Workspace-wide `graphifyy` CLI (code knowledge graph; binary `graphify`) bumped
0.8.20 → **0.8.36** via `pipx upgrade`. A migration brief framed this as a
typosquat fix — uninstall a "wrong graphify", install a separate "Graphify Labs
v2.1.0+" via `uv`. **Verification (PyPI, upstream README, `pipx list`) showed the
premise was false:** `graphifyy` was already installed and IS the correct package
(Graphify Labs / safishamsi, AST-only, MIT); there is no v2.x (latest 0.8.36). So
it was just stale. The destructive uninstall/reinstall was NOT run.

Mobile-side actions:
- Regenerated `graphify-out/` via `graphify update .` (AST-only, **no key**):
  **841 nodes / 967 edges / 67 communities**. Now emits force-directed `graph.html`
  (vis-network, dark theme) — the older versions emitted a `GRAPH_TREE.html` D3 tree.
- `genoly-mobile/AGENTS.md` §10.1 / "Code knowledge graph report" updated: corrected
  the `graph.html` label (vis-network force-directed, not "D3"), node count 425 → 841,
  added pipx install cmd + `graphify affected` + `graphify watch`, split structural
  (`graphify-out/`) from curated-narrative (`docs/GRAPH_REPORT.md`). Mobile committed
  change is AGENTS.md only.

Verification: `npm run typecheck` has **3 PRE-EXISTING errors** (missing
`@react-native-vector-icons/fontawesome` dep — node_modules gap from the SDK-56
codemod — + `expo-router/react-navigation` + an ExternalLink typed-route). NOT caused
by this change; mobile has no `lint` script. Full cross-repo story in
genoly-family-web `decisions/graph-report-regen-2026-06-09.md` (2026-06-10 append).
Shankar commits (no AI attribution).

---

## [2026-06-05] merge | SDK 56 upgrade + expo-router codemod

Branch: `chore/expo-sdk-56-upgrade` (worktree `genoly-mobile-wt-sdk56/`). Upgraded Expo SDK 55 → 56. PR pending.

**Commits:**
- `d931e42` — bump to Expo SDK 56 — expo + sister packages (RN 0.83.6 → 0.85.3, React 19.2.0 → 19.2.3, expo-router 55 → 56.2.9, 15 other packages)
- `c427e64` — apply expo-router SDK 56 codemod — `@react-navigation/native` → `expo-router/react-navigation` in `_layout.tsx` + test mock updated
- `5402c02` — bump jest-expo to ^56 to match SDK major (semver range change `~56.0.4` → `^56.0.4`)
- `4085f9f` — bump iOS deployment target to 16.4 for SDK 56 (via `app.json` `deploymentTarget`)
- `7e98553` — breaking-change audit: `@expo/vector-icons` codemod (→ `@react-native-vector-icons/fontawesome`), add `expo-font`/`expo-splash-screen`/`expo-status-bar` to `app.json` plugins, test mock updates
- `01a7d56` — SDK 56 verify: remove `@react-navigation/native` + `expo-modules-core` direct deps (expo-doctor), fix `react-test-renderer@19.2.3`, add `@types/jest` to tsconfig, vector-icons type fixes (`color as string` cast, remove `FontAwesome.font`), npm dedupe for `@expo/dom-webview`/`@expo/log-box` duplicates, install `@react-native/jest-preset`

**Breaking-change audit findings:**
- **expo-file-system copy()/move()**: NOT used in codebase — no action needed.
- **expo/fetch**: Codebase uses native `fetch` via `FetchApiClient` wrapper — no non-standard fetch patterns found.
- **@expo/dom-webview default WebView**: `react-native-webview` is NOT used — no action needed.
- **@expo/vector-icons deprecated**: FOUND in 2 files. Codemod applied: `@expo/vector-icons/FontAwesome` → `@react-native-vector-icons/fontawesome`. `FontAwesome.font` removed (new library handles fonts via app plugin). `color as string` cast added to satisfy updated types.
- **TypeScript 6.0.3 upgrade**: Required adding `"types": ["jest"]` to `apps/mobile/tsconfig.json` and `@types/jest` to devDependencies. All source-file types clean.

**expo-doctor:** 21/21 checks pass (all clean).

**Test state:** 56 tests, 54 pass, 2 pre-existing failures (SyncQueue MAX_ATTEMPTS + concurrency race, tracked #294). 4 UI suites still in testPathIgnorePatterns (Dimensions.set TurboModule issue persists in jest-expo 56; real-device smoke is authoritative gate).

**Task #299 CLOSED** — SDK 56 upgrade complete. **Task #300** (real-device smoke test) deferred to Shankar.

---

## [2026-06-05] merge | Expo SDK 54 → 55 upgrade — completed, dashboard synced, SDK 56 deferred

Branch: `chore/expo-sdk-55-upgrade`. PR #11 had already bumped expo from SDK 54 → 55 at the root level, but apps/mobile/package.json still carried SDK 54-era package versions (expo-constants@18.x, expo-router@6.x, react-native@0.81.5, etc.), causing duplicate native modules. This session closed out that gap and fixed related test regressions.

**Changes landed:**
- `apps/mobile/package.json` — all expo packages updated to SDK 55 unified versions via `expo install --fix` (expo-constants@~55.0.16, expo-router@~55.0.16, react-native@0.83.6, etc.)
- Root `jest.config.js` — replaced broken jsdom+ts-jest config with correct jest-expo preset (no jsdom, no ts-jest override, `setupFiles`, `moduleNameMapper` for `@/` paths, `testPathIgnorePatterns` for 4 still-skipped suites)
- `apps/mobile/jest.setup.js` — added `jest.mock('react-native-health', () => null)` to restore "module not loadable" behavior under jest-expo's babel transform
- `apps/mobile/components/ExternalLink.tsx` — removed unused `@ts-expect-error` (SDK 55 fixed the external-URL type)
- `apps/mobile/components/Themed.tsx`, `app/(tabs)/_layout.tsx` — fixed `ColorSchemeName 'unspecified'` narrowing (RN 0.83 added this value)
- Root `package.json` — added `@react-native/assets-registry@^0.83.6` (needed for jest-expo 55 module resolution; nested inside react-native's own deps, not hoisted)
- `scripts/sync-manifest.mjs` — created (ported from genoly-family-web, REPO="mobile"), reads apps/mobile/package.json and posts to Convex dependency dashboard
- `AGENTS.md` tech stack — SDK 54 / RN 0.81 → SDK 55 / RN 0.83.6

**Test state:** 54/56 passing. 2 pre-existing SyncQueue failures (MAX_ATTEMPTS retry test + concurrency race), 1 pre-existing token-store "no test" suite. 4 UI suites still in testPathIgnorePatterns.

**expo-doctor (from apps/mobile):** 2 accepted warnings — `@expo/fingerprint` duplicate (in react-native-health's own node_modules, can't fix without forking) + react-native-health untested on New Architecture (pre-existing).

**Dependency dashboard:** `npm run sync-deps` ran successfully — 38 packages from apps/mobile synced to Convex (34 replaced). Dashboard HIGH count should now reflect SDK 55 versions.

**SDK 56 evaluation:** DEFERRED (#299). Blocker: SDK 56 expo-router dropped direct `@react-navigation/native` compatibility — migration to expo-router navigation APIs required. Also RN 0.83.6 → 0.85.3 jump. Not a simple package bump; needs its own PR.

---

## [2026-05-29] doc | Doc hygiene from markdown audit — CONTEXT.md retired, AGENTS.md DESIGN.md companion line

Two-file doc-hygiene pass driven by `Genoly/Genoly-Vault/_scratch/markdown-audit-2026-05-29.md`:

1. **`CONTEXT.md` retired** — converted from the pre-Karpathy "Zone 1/Zone 2" framing (which falsely claimed mobile was in "PLANNING — no app code yet" — that hasn't been true since Phase 0 closed 2026-05-08) into a 5-line redirect pointer following the same pattern `SESSION_HANDOFF.md` already uses. Pointer references AGENTS.md, the wiki/current/ files, DESIGN.md, FORK_PROCEDURE.md, and the architecture docs. The file is kept (not deleted) because `start-session.sh` and `.clinerules` still reference it for backwards compat — modernizing those scripts to read AGENTS.md directly is a separate future task.
2. **`AGENTS.md` minor updates** — bumped `Last updated: 2026-05-22` → `2026-05-29` with a one-line note that the schema is still valid; added "Companion file (MUST read before building UI): `./DESIGN.md`" line mirroring web AGENTS.md's pattern (this gap was the audit's #2 recommendation).

Companion change in genoly-family-web: same CONTEXT.md retirement + DESIGN.md "Lessons from Antigravity drift" section. See web `memory-bank/log.md`.

Companion change in workspace: `ai-memory-bank-guide.md` decision-page link upgraded from plain text to markdown link with explicit reopen-criteria callout.

Pages: `Genoly/Genoly-Vault/_scratch/markdown-audit-2026-05-29.md` (the audit report).

---

## [2026-05-29] note | Phase 1 Step 7 (Dashboard) IMPLEMENTATION COMPLETE in working tree

New files:
- `apps/mobile/hooks/useDashboardData.ts` — drain+fetch hook with local-TZ date math, queue/dead-letter counters, manual refresh
- `apps/mobile/app/(tabs)/fitness.tsx` — replaced stub with full Dashboard (today big numbers + 7-day horizontal bars + one-tap-clear dead-letter banner + Refresh button + error banner with Retry + empty + loading states), per the mobile `DESIGN.md`
- `apps/mobile/__tests__/useDashboardData.test.ts` — 12 hook tests
- `apps/mobile/__tests__/fitness.test.tsx` — 12 screen tests

Decisions Shankar approved this session:
1. Visual: big today numbers + 7-day horizontal bars (no chart library; bars are plain `<View>` widths)
2. Sync: drain+refetch on every mount + a manual Refresh button (pull-to-refresh deferred)
3. Dead-letter UI: dashboard banner with one-tap Clear (resolves his "becomes noise" concern via immediate clear rather than silent auto-purge)

Verification:
- `npx tsc --noEmit -p apps/mobile/tsconfig.json` — exit 0
- `npm test` — 7 suites, 54 tests passing (24 new), ~2.2s

Pending: open PR, real-device smoke (iOS sim + Android emulator).

Pages: `[[2026-05-29-mobile-step-7-dashboard]]`.

---

## [2026-05-29] merge | Jest suite green + post-PR-#6 cascade MERGED via PR #7 (`df7d22c`)

Bundle: `jest-expo@~54.0.0` upgrade (was `^53.0.2`, broke against Expo SDK 54's expo-modules-core layout), removed custom `transformIgnorePatterns` override in `apps/mobile/jest.config.js` (preset's defaults are correct for SDK 54), split the chained `login.test.tsx` test in two (RHF's reValidateMode 'onChange' tick lives outside `act()`, so chaining "press empty → fill → press valid" lands the second press mid-revalidate), and dropped the `act(async () => render(...))` wrap in the auth-gate fail-closed test (react-test-renderer 19 errors with "Can't access .root on unmounted test renderer" when the rejected getToken() unmounts during act).

Also bundled the post-PR-#6 state cascade (flipping "infra commit in progress" wording to "merged at f2463a8" across master-context + 6 mobile state files).

Result: 30 tests, all passing, ~2.5s.

Pages: `[[2026-05-29-mobile-step-4-12-overnight]]` (overnight bundle merged).

---

## [2026-05-29] merge | Infra setup MERGED via PR #6 (`f2463a8`) — CI green

Squash merge of `chore/infra-setup-post-overnight` (source commit `4fee913`) onto main as `f2463a8`. 10 files changed, 431 insertions, 34 deletions. Branch deleted both locally and on origin.

CI on the merge commit: **Trigger EAS Android build ran in 1m 2s — Success.** Fixes the `npm ci` failure on `10f6f03` (out-of-sync `package-lock.json`). EAS Android build triggered async in the cloud.

What landed: native deps installed via `npx expo install` (regenerated `package-lock.json` to include @genoly/sync-queue workspace package + 6 native modules), `app.json` updated with `react-native-health` plugin config (`healthSharePermission`), iOS `infoPlist.UIBackgroundModes = ["fetch", "processing"]`, Android `permissions += RECEIVE_BOOT_COMPLETED`, plus the post-PR-#5 state cascade.

Pages: `[[2026-05-29-mobile-step-4-12-overnight]]` (status: merged).

---

## [2026-05-29] merge | Phase 1 Steps 4 + 12 + 5 + 11 + 6 + mobile DESIGN.md MERGED via PR #5 (`10f6f03`)

Squash merge of `feat/step-4-12-5-11-6-overnight` (source commit `51d5259`) onto main as `10f6f03`. 30 files changed, 4559 insertions, 65 deletions. Branch deleted.

Companion infra-setup commit in progress in working tree on main: native modules installed via `npx expo install react-native-health react-native-health-connect @react-native-async-storage/async-storage expo-sqlite expo-background-fetch expo-task-manager` (regenerates package-lock.json + fixes the `npm ci` CI failure on `10f6f03`). app.json updated with iOS `UIBackgroundModes: ["fetch", "processing"]`, Android `RECEIVE_BOOT_COMPLETED`, and `react-native-health` plugin config (healthSharePermission). Plus this post-merge state cascade.

CI on `10f6f03` failed (`npm ci` strict mode tripped because package-lock.json was out of sync with the new `@genoly/sync-queue` workspace package). Will resolve once the infra-setup PR lands.

Pages: `[[2026-05-29-mobile-step-4-12-overnight]]` (now status: merged).

---

## [2026-05-29] note | Phase 1 Steps 4 + 12 + 5 + 11 + 6 + mobile DESIGN.md — Round 3 added Settings + bg fetch + design system (autonomous, uncommitted, now superseded by merge entry above)

Three rounds of one overnight Claude session per Shankar's "work completely independent for tonight" delegation. Round 1 shipped Steps 4 + 12. Round 2 shipped Step 5 after Shankar checked back with "Steps 4+12+5" green-light. Round 3 shipped Steps 11 + 6 + the new mobile `DESIGN.md` after Shankar's second autonomous green-light ("look for any other tasks ... and DESIGN.md format for the mobile version also").

**Round 3 additions:**

- **Step 11 — Settings + sign-out.** `apps/mobile/app/(tabs)/settings.tsx` replaces the stub with a full screen. Account section with email (best-effort `getSession()`) + Sign out button. Health-sync section with status + Manage permissions link to `/(auth)/permissions`. Subscription section with Linking.openURL to `genoly.org/account` (payment-neutral, no in-app upsell). Legal footer. Sign-out flow: native `Alert.alert` confirm (destructive style) → `apiClient.revokeToken({ scope: 'this_device' })` → reset permission prefs → `unregisterBackgroundSync()` → `router.replace('/(auth)/login')`. Fail-closed: `tokenStore.clearToken()` fallback if revokeToken throws. 8-test Jest suite.

- **Step 6 — Background fetch wiring.** `apps/mobile/utils/backgroundSync.ts` wires `expo-background-fetch` + `expo-task-manager` to a named task `genoly.sync.healthAggregates`. `runBackgroundSyncTask()` re-checks `getHealthSyncEnabled()` at top (double-gated against intent + registration). Drains ONCE per wake (no inner loop — iOS 30s budget). Maps drain result to BackgroundFetchResult enum. `register*()` / `unregister*()` / `isBackgroundSyncRegistered()` public API. Min interval 15 min, `stopOnTerminate: false`, `startOnBoot: true`. Wired: permissions.tsx grant → register; settings.tsx sign-out → unregister. 12-test Jest suite. Defensive native-module loading via lazy require.

- **Mobile DESIGN.md.** New `DESIGN.md` at repo root mirroring `genoly-family-web/DESIGN.md` (Stitch format) but adapted for React Native: light-only palette (dark deferred to Phase 1.5), system fonts, StyleSheet.create patterns, native `Alert.alert` over custom modal, defensive native-module loading, expo-router Href cast pattern, safe-area + iOS/Android platform quirks, ready-to-use agent prompts. ~500 lines. Same role as the web DESIGN.md: prevents future Antigravity drift on mobile UI.

- **Auth-gate test refresh.** `apps/mobile/__tests__/auth-gate.test.tsx` was broken by Round 1's third routing arm (preferences module added to _layout.tsx without a mock in the test). Round 3 added the preferences mock + a new test case covering the "valid token + no permissions prompt → /(auth)/permissions" arm. Existing 4 tests refactored to set `hasRequestedHealthPermissions=true` as default. Now 5 tests total.

**Round 3 verification:**
- `npx tsc --noEmit -p apps/mobile/tsconfig.json` — exit 0 ✓

**Combined Round 1 + 2 + 3 file count:**
- 17 new files (3 health adapters + mock + factory + adapter test + permissions screen + preferences util + 4 sync-queue files + sync-queue test + Settings screen + Settings test + backgroundSync util + backgroundSync test + repo-root DESIGN.md)
- 13 modified files (api-client/src/client.ts, mobile/app/_layout.tsx, mobile/app/(auth)/permissions.tsx, health-sync/src/index.ts, mobile/__tests__/auth-gate.test.tsx, mobile/package.json, plus the 6 cascade files + the workspace master-context.md)
- Plus state-file cascade across this log + index.md + 4 wiki/current files + workspace master-context.md

Tests: 52 new (16 health-sync + 16 sync-queue + 8 settings + 12 background-sync). With refreshed auth-gate (5) + login (1) = 58 total Jest tests in the workspace.

Pages: `wiki/phases/2026-05-29-mobile-step-4-12-overnight.md` (covers all six steps despite the name), `vault/overnight-questions.md` (10 judgment-call items), `vault/overnight-morning-review.md` (commit script + verification steps).

---

## [2026-05-29] note | Phase 1 Steps 4 + 12 + 5 — Health adapters + sync queue IMPLEMENTATION COMPLETE (Rounds 1+2, superseded by Round 3 entry above)

Two rounds of one overnight Claude session per Shankar's "work completely independent for tonight" delegation. Round 1 shipped Steps 4 + 12. Round 2 shipped Step 5 after Shankar checked back with "Steps 4+12+5" green-light.

**Round 2 addition — Step 5 (SQLite sync queue + drainer):**

New `@genoly/sync-queue` workspace package:
- `packages/sync-queue/src/store.ts` — abstract `SyncStore` interface + `MemoryStore` (tests) + `ExpoSqliteStore` (production with `sync_outbox` schema, expo-sqlite-backed, defensive native-module loading)
- `packages/sync-queue/src/queue.ts` — `SyncQueue` class implementing the drainer logic per architecture §11. `enqueue(entries, idFor)`, `drain()`, `getQueueDepth()`, `getDeadLetterDepth()`, `clearDeadLetters()`. Retry classifier: 5xx + 429 + 408 = retryable, 4xx-other = permanent. MAX_ATTEMPTS=5, BATCH_SIZE=50 (configurable). Concurrent-safe drain.
- `packages/sync-queue/src/index.ts` — public exports + `createSyncQueue()` factory with ExpoSqlite-or-Memory fallback
- `packages/sync-queue/src/SyncQueue.test.ts` — 16 tests: enqueue idempotency, drain happy-path / partial-rejection / retryable error / max-attempts-exhaustion / permanent error / rate_limited treated as retryable / dead-letter management / concurrent drain no-op

`apps/mobile/package.json` updated to add `@genoly/sync-queue` as workspace dep.

**Round 2 verification:**
- `npx tsc --noEmit -p apps/mobile/tsconfig.json` — exit 0 ✓

**Combined Round 1 + Round 2 file count:**
- 14 new files (3 health adapters + mock + factory + adapter test + permissions screen + preferences util + 4 sync-queue files + sync-queue test)
- 4 modified files (`api-client/src/client.ts`, `mobile/app/_layout.tsx`, `health-sync/src/index.ts`, `mobile/package.json`)
- Plus state-file cascade

Pages: `wiki/phases/2026-05-29-mobile-step-4-12-overnight.md` (covers all three steps despite the name), `vault/overnight-questions.md`, `vault/overnight-morning-review.md`.

---

## [2026-05-29] note | Phase 1 Steps 4 + 12 — Round 1 (now superseded by combined Round 1+2 entry above)

Claude autonomous overnight run per Shankar's "work completely independent for tonight" delegation (2026-05-28 night). **Working tree on `main`, no commits, no pushes — per Shankar's explicit instruction "we are not going to commit anything till tomorrow morning."**

**Code:**
- `HealthKitAdapter` (iOS, `react-native-health` wrapper, defensive native-module loading, per-metric reads with clock-drift defense + sparse semantics)
- `HealthConnectAdapter` (Android, `react-native-health-connect` wrapper, same surface as HealthKit; library choice logged in vault/overnight-questions.md Q1)
- `MockHealthAdapter` (in-memory, configurable platform/availability/permission-grant, used in tests)
- `createHealthAdapter()` factory in `packages/health-sync/src/index.ts` — lazy `require('react-native')` so the package stays Node-importable for tests
- `apps/mobile/app/(auth)/permissions.tsx` — first-run permission request screen, Grant/Skip, friendly metric explainers + privacy note
- `apps/mobile/utils/preferences.ts` — AsyncStorage-backed flag store for `hasRequestedHealthPermissions` + `healthSyncEnabled`, defensive native-module loading with in-memory shim for Node tests
- `apps/mobile/app/_layout.tsx` — three-arm routing (no-token → login, no-permissions → permissions, fully-resolved → tabs)
- `packages/api-client/src/client.ts` — 4 methods unstubbed: `revokeToken` (POST + clear local token), `getSession` (cold-start check), `getDailyAggregates` (query-params GET), `syncDailyAggregates` (drainer-style POST). ApiClient now at 5/20 methods implemented.

**Tests:** `packages/health-sync/src/HealthAdapter.test.ts` — 16 tests across MockHealthAdapter (8) + HealthKitAdapter graceful-degradation (4) + HealthConnectAdapter graceful-degradation (4). Tests verify adapter logic without native modules; real-device validation deferred to Shankar's morning smoke test.

**Verification:**
- `npx tsc --noEmit -p apps/mobile/tsconfig.json` — exit 0 ✓
- Jest run requires installing the new dev deps first (jest-expo + RNTL); Shankar's morning task per the commit script.

**Decisions taken autonomously** (overridable per `vault/overnight-questions.md`):
- Android library = `react-native-health-connect` (NOT `expo-health-connect`)
- Permission scope = Steps + ActiveEnergyBurned + Distance (Shankar's approved scope minus ExerciseTime which isn't in the HealthMetric enum yet)
- Step 5 stretch goal DEFERRED — conservative call on scope to ensure Steps 4+12 are rock-solid

**Files:** 9 new + 3 modified. Pages: `wiki/phases/2026-05-29-mobile-step-4-12-overnight.md`, `vault/overnight-questions.md`, `vault/overnight-morning-review.md`. Workspace `master-context.md` update pending Shankar's review.

---

## [2026-05-28] merge | Phase 1 Step 2 + Step 3 — Login screen + cold-start auth gate SHIPPED

Implemented Steps 2 and 3 of the mobile sync plan on branch `active-agravity-step2-branch`. Took 4 review iterations across two Antigravity model rotations (Gemini Flash Low → GPT-OSS 120B medium) before Claude took over and completed it directly.

**What landed:**

- **Login screen** (`apps/mobile/app/(auth)/login.tsx`): react-hook-form with `Controller`-wired inputs, zod schema (email + 8-char-min password), `apiClient.issueToken` on submit with `Platform.OS` + `Constants.expoConfig.version` in the device payload, `mapLoginError` mapping `ApiClientError.code` to user-facing strings (`unauthenticated` / `bad_request` / `rate_limited` / `token_expired` / `internal` → friendly messages), `router.replace('/(tabs)')` on success, Alert-based forgot-password pointer to genoly.org.
- **Cold-start auth gate** (`apps/mobile/app/_layout.tsx`): on app boot, reads token via `tokenStore.getToken()` + `tokenStore.isExpired()`. Two-arm redirect: no-token OR expired-token → `/(auth)/login`. Storage errors fail closed (also redirect). Uses `Href` cast pattern (`'/(auth)/login' as unknown as Href`) — narrow cast on the route string, preserves router-object typing. Replaces earlier `(router as any).replace(...)` regression.
- **Shared `tokenStore` export** (`apps/mobile/utils/api.ts`): same SecureStore handle used by both `apiClient` and the auth gate.
- **Jest + React Native Testing Library setup** (root + `apps/mobile/jest.config.js` + `package.json` scripts).
- **login.test.tsx**: validation errors + happy-path issueToken call + correct device-payload shape.
- **auth-gate.test.tsx**: 4 cases — valid token renders content; no token redirects; expired token redirects; storage error fails closed. Uses module-scope `mockReplace` pattern to fix the earlier "fresh mock per call" review-cycle bug.
- **Deleted** `LoginScreen.test.tsx` (was a 2-line duplicate stub).

**Decisions taken:**

1. Form: react-hook-form + zod + Controller (no bare setValue).
2. Email validation: `z.string().email()` permissive.
3. Password min: 8 chars (matches web).
4. Forgot-password: Alert redirect to genoly.org (web owns the OTP flow).
5. Cold-start UX: Expo splash stays mounted until `authChecked` resolves.
6. Existing `(tabs)` scaffold: left as-is. Auth gate redirects INTO the placeholder tabs; real tab content lands in Step 5+.

**Verification:**

- `npx tsc --noEmit -p apps/mobile/tsconfig.json` — exit 0
- `npm test` from `apps/mobile/` — login + auth-gate + Step 1's MemoryTokenStore all pass

**Review-cycle iterations** (recorded for future Antigravity briefs):

- R1 (Flash Low): structure correct but 5 critical bugs (form not Controller-wired, getSession instead of tokenStore, invented platform value, no cascade, no push).
- R2 (Flash Low): fixed 3, introduced new regression (invented ApiErrorCode values), still no cascade.
- R3 (GPT-OSS 120B): fixed the codes, introduced `(router as any)` regression to silence tsc, still no isExpired check.
- R4 (Claude direct): replaced `(router as any)` with proper `Href` cast, added `isExpired()` check, rewrote auth-gate.test.tsx (4 cases, proper mock), did the Rule #0 cascade, deleted the duplicate test stub.

Page: [[2026-05-28-mobile-step-2-3]]
Branch: `active-agravity-step2-branch` (push pending Shankar's action)

---

## [2026-05-28] merge | Phase 1 Step 1 — Token store + ApiClient skeleton SHIPPED

Implemented Step 1 of the mobile sync plan on branch `active-agravity-branch`:
- Built `TokenStore` interface, `MemoryTokenStore`, and `SecureTokenStore` backed by `expo-secure-store` with dynamic import guard.
- Built `FetchApiClient` class supporting standard error parsing mapped to the 8-code matrix and GET automatic retry policy with exponential backoff and jitter.
- Fully implemented `issueToken` happy path.
- Created `apps/mobile/scripts/test-api-client.ts` smoke-test runner.
- Updated all four active context wiki files.

Page: [[2026-05-28-mobile-step-1]]
Commit: active-agravity-branch (draft PR)

## [2026-05-26] merge | AI memory bank Phase 3 (mobile) — Code knowledge graph

Mobile mirror of the workspace-wide Phase 3 work. Ran `graphify update .` (AST-only, no LLM), shipped `docs/GRAPH_REPORT.md` (~280 lines, narrative form via Claude), installed graphify hooks + Claude/OpenCode adapters.

Skipped the LLM extraction path entirely (which is what failed for the web repo). AST-only extraction completed in ~15 seconds: 425 nodes, 413 edges, 44 communities.

Auto-installed AGENTS.md and CLAUDE.md sections cleaned up to point at `docs/GRAPH_REPORT.md` (instead of the original `graphify-out/GRAPH_REPORT.md` paths) and to document all 6 graphify CLI commands available.

This closes mobile's contribution to the 3-phase AI memory bank plan: Phase 1 (Karpathy hybrid) 2026-05-22; Phase 2 (mcp-memory-service) STAY PARKED 2026-05-26 (workspace-wide); Phase 3 (Graphify) DONE 2026-05-26.

Page: [[2026-05-26-phase-3-graphify-mobile]]
Web companion phase page: `../../../genoly-family-web/memory-bank/wiki/phases/2026-05-26-phase-3-graphify.md`
Commit: TBD

## [2026-05-22] note | AI memory bank Phase 2 — PARKED (integration friction)

Phase 2 (mcp-memory-service as index layer) attempted and parked.

What worked:
- `brew install pipx` → pipx 1.12.0
- `pipx install mcp-memory-service` → service installed
- Service starts on `http://127.0.0.1:8000` (NOT 8765 — env var did not take effect; service uses its own default port)
- `/api/openapi.json` returns valid FastAPI OpenAPI spec (~105KB)
- 70+ endpoints exposed (see full list below)
- `/api/health` confirmed healthy: `{"status":"healthy"}` — service itself is functional, just the MCP integration layer is broken

What did NOT work:
- The documented health endpoint paths from `../genoly-family-web/docs/external-ai-memory-bank-guide.md` Part 4 are wrong for this build — they're all under `/api/` prefix (e.g., `/api/health`, `/api/search`, `/api/memories`) not at root
- `/docs` and `/favicon.ico` return 404 (FastAPI Swagger UI disabled in this build)
- OpenCode/Kimi connects to `/mcp/` successfully but MCP queries return "Internal server error: unhashable type: 'dict' [retrying in 7s]" — response-shape mismatch between THIS mcp-memory-service version and OpenCode's MCP parser
- Kimi reports "Searched MCP memory — found only a malformed template entry, no real content" — either indexing of `/Users/snalluri/Personal/Code/Geno` didn't run, or response shape mangled the content

Endpoint inventory (for future debugging — found via curl /openapi.json):
- Health: /api/health, /api/health/detailed, /api/health/sync-status
- Memory ops: /api/memories, /api/memory-stats, /api/clear-caches
- Search: /api/search, /api/search/by-tag, /api/search/by-time, /api/search/similar/{content_hash}
- Tags & sessions: /api/tags, /api/sessions, /api/types
- Management: /api/manage/* (bulk-delete, cleanup-duplicates, untagged, etc.)
- Analytics: /api/analytics/* (overview, memory-growth, tag-usage, performance, etc.)
- Events: /api/events, /api/events/stats
- Sync: /api/sync/* (status, force, pause, resume)
- Backup: /api/backup/* (status, now, list)
- Quality: /api/quality/* (rate, evaluate, distribution, trends)
- Documents: /api/documents/* (upload, batch-upload, status, history)
- Consolidation: /api/consolidation/* (trigger, status, recommendations)
- Server: /api/server/* (status, version/check, restart, update)
- Config: /api/config/* (env, credentials)
- OAuth: /api/oauth/status
- Conflicts: /api/conflicts, /api/conflicts/resolve
- Harvest: /api/harvest
- MCP protocol: /mcp, /mcp/, /mcp/tools, /mcp/health
- Misc: /api-overview, /api/languages, /

Diagnosis: the mcp-memory-service implementation has diverged from the
spec described in `../genoly-family-web/docs/external-ai-memory-bank-guide.md`
Part 4 (actual endpoints prefixed with /api/, response shape on /mcp/
incompatible with OpenCode). The MCP ecosystem in 2026 is fragmented — different
implementations expose different endpoint layouts and response formats.

Decision: park Phase 2. Phase 1 (Karpathy structure + compact-state-files
+ AGENTS.md cross-tool entry) already delivers ~50% session-start
savings. Phase 2's marginal benefit (~20% additional via semantic
search) is not worth multi-hour debug of a fragmented ecosystem.

Reopen criteria:
- mcp-memory-service ecosystem stabilizes (look for major version 2.0
  or an officially-blessed OpenCode-compatible build)
- We hit token-cost pain again that Phase 1's compaction doesn't solve
- Specific killer feature emerges that requires semantic search

Service NOT uninstalled (pipx package remains for future reattempt).
Update `../genoly-family-web/docs/external-ai-memory-bank-guide.md` Part 4
with correct endpoint paths (e.g., `/api/health` instead of `/health`)
when Phase 2 is revisited.

## [2026-05-22] rule | AI memory bank Phase 1 migration — Karpathy hybrid adopted

This repo's contribution to the workspace-wide Karpathy LLM Wiki pattern adoption (per `../genoly-family-web/docs/external-ai-memory-bank-guide.md`).

Foundation files landed (commit `d4fbecc`):
- `AGENTS.md` (NEW — 10 sections on Expo SDK 54 / RN 0.81 stack, payment neutrality hard-rule, native module strategy, health-reading isolation, bearer token storage, ApiClient retries, 401 token-failure path, initial pull window, background sync constraints, clock-drift defense, forkability impact)
- `CLAUDE.md` (NEW thin pointer)

`memory-bank/wiki/` structure created with `current/`, `phases/`, `decisions/`, `tasks/` subdirectories.

Current state migrated into `wiki/current/`:
- `active-context.md` — current focus + 5 pending Shankar decisions
- `progress.md` — Phase 0 done; Phase 1 13-step plan; pending decisions table
- `session-handoff.md` — for next agent
- `overview.md` — 30-second summary

Index + log created.

Companion commit in `genoly-family-web` (`27af400`) for that repo's foundation.

Page: [[2026-05-22-karpathy-adoption-mobile]]
Decision: [[karpathy-memory-bank-pattern]]

## [2026-05-15] doc | FORK_PROCEDURE.md updated

Updated to reflect the Phase A forkability ESLint rule repair in genoly-family-web:
- Phase 0 invariants now includes a deliberate-violation sanity check (because the rule had been silently broken since inception)
- Phase 6 allow-list table adds `convex/auth.ts` (fitness's `authNode.ts` imports `signIn`)
- Phase 8 (Cutover) cleanup mentions removing the per-file ESLint override for `http.ts` once fitness is fully extracted

Commit `f4f6335`.

## [2026-05-08] merge | Phase 0 — Foundation framework CLOSED

Phase 0 complete with five tasks landed:
- #7 Expo Router init (`6da2488`)
- #8 Package interface stubs (`9657069`) — api-client, health-sync, types
- #10 EAS Build (manual APK `b0260446` runs on real Android phone)
- #11 Baseline verify
- #9 CI (`03e5a73` — GitHub Actions auto-triggered first EAS build `89183f18`)

Mobile builds automatically on `main` push. EAS account `@hyperionsolutionsorg` on Hobby tier (free).

Page: [[2026-05-08-phase-0-complete]]

## [2026-06-05] merge | Mobile test debt cluster — #293, #294, #295 CLOSED

Branch `chore/mobile-test-debt-cluster` (worktree `genoly-mobile-wt-test-debt/`).

**Investigation findings:**
- **#293** (ts-jest 29.4 tsconfig discovery regression): ALREADY RESOLVED by SDK 56 upgrade. ts-jest is installed but not configured as a transformer — rebuilt `jest.config.js` uses `preset: 'jest-expo'` (babel). No code changes needed.
- **#295** (workspace-root npm test fails .tsx compile): ALREADY RESOLVED by SDK 56 upgrade. Multiple `.ts`/`.tsx` suites compile and pass cleanly under the new root config. No code changes needed.
- **#294** (3 pre-existing Jest failures): Still open — all 3 fixed in this PR.

**Fixes landed:**

1. `packages/api-client/src/token-store.test.ts` — rewritten from vanilla `async function runTests()` (no Jest primitives → "no tests found") to proper `describe`/`it`/`expect` suite. 4 tests now pass.

2. `packages/sync-queue/src/queue.ts` — `handleError()` was double-counting attempts. `MemoryStore.fetchBatch()` returns object references; `recordAttempt()` mutates them in-place. Code then added 1 to the already-incremented value → premature dead-lettering after 2 attempts instead of `maxAttempts`. Fix: capture `attemptsBefore` Map before calling `recordAttempt()`.

3. `packages/sync-queue/src/SyncQueue.test.ts` — concurrency test called `resolveServer!({...})` before `drain1` had advanced past `fetchBatch` (microtask boundary). Fix: add `await Promise.resolve()` to flush the microtask queue before calling the resolver.

4. `apps/mobile/components/__tests__/StyledText-test.js` — snapshot test used `renderer.create()` outside `act()`. React 19's async scheduler tried to flush updates after the Jest environment was torn down → `ReferenceError: import after environment torn down` → exit code 1. Fix: wrap in `await act(async () => {...})` and update snapshot from `null` to the actual rendered `<Text>` tree.

5. `packages/sync-queue/src/SyncQueue.test.ts` — `makeEntry()` was missing `dateUtcStart` (required by `HealthEntryUpload` since it was added to the type). Added `dateUtcStart: 0`.

**Result:** `npm test` — 60/60 tests pass, exit code 0. All 6 suites green. 4 previously skipped UI suites remain skipped (expo-router TurboModule chain not mocked by jest-expo 56).

---

*Earlier history: see legacy `memory-bank/activeContext.md` and `memory-bank/progress.md` (being phased out). For authoritative chronological record: `git log`.*

## [2026-06-11] doc | Mobile e2e run — Phase A audit + Phase B plan (autonomous)

Autonomous mobile end-to-end run dispatched via `_mobile-e2e-brief.md` (member-side parity + Family Walking Challenges, deployment-ready).

**Phase A (discovery, no code changes):** verified Phase 1 reality — Steps 1-7, 11, 12 merged; Step 8 Leaderboard UNMERGED on `origin/feat/step-8-leaderboard` (`e630ba3`, pre-SDK-56; disposition: cherry-pick + fixups when new nav lands). Fitness contract verified 20/20 endpoints implemented server-side, zero drift; challenges greenfield. `npm test` 60/60 green (brief's jest-debt premise stale — closed by PR #15). 3 pre-existing typecheck errors confirmed (P0). ApiClient 5/20 methods implemented. Full audit: `vault/mobile-audit.md`; acknowledgment: `vault/mobile-e2e-start-2026-06-11.md`.

**Phase B (plan + decisions):** `vault/mobile-improvement-plan.md` + phase page [[2026-06-11-mobile-e2e-plan]]. Three decisions locked:
1. [[2026-06-11-member-side-convex-client]] — member side rides Convex reactive client + @convex-dev/auth (RN TokenStorage on expo-secure-store); fitness HTTP contract untouched; dual-session teardown rules.
2. [[2026-06-11-walking-challenges-schema-placement]] — challenge tables are Genoly-side tree-scoped (`walkingChallenges`, `challengeParticipants` w/ denormalized currentSteps); zero fitness-contract changes; privacy invariants (opt-in only, leave-anytime, hideActivity, GDPR export).
3. [[2026-06-11-mobile-styling-approach]] — theme module + UI kit on RN StyleSheet; Tamagui/NativeWind rejected; dark + classic palettes to be locked in foundation PR.

Execution waves: C1 foundation → C2 auth → C3 wizard → C4 dashboard → D tree ×6 → F engagement → G settings/support → H walking challenges → I polish → J deployment → K handoff.

## [2026-06-11] merge | C1 foundation — theme module + UI kit + member-app navigation (PR #16, `7651701`)

First execution wave of the mobile e2e run. theme/ module (light/dark/classic semantic palettes mirroring web index.css tokens incl. dark on-primary rule; classic serif swap; ThemeProvider/useTheme/useThemedStyles; persisted preference + Settings Appearance picker). components/ui kit (Button/Screen/Section/Card/TextField/Banner/EmptyState/Toast/Skeleton — toast mirrors web 2026-06-10 layer rules). Navigation reworked to member-app 5 tabs (Home / Tree / Challenges / Activity / Settings); fitness dashboard relocated to Activity; Notifications tab retired. All screens migrated off inlined hex; login/permissions inputs gained a11y labels. 3 pre-existing typecheck errors CLEARED (stale node_modules synced — expo-router 56.2.9 + vector-icons restored; unused ExternalLink deleted). Expo template leftovers removed. Tests 60 → 90 pass (theme contrast guards + UI kit behavior); tsc 0 errors.

## [2026-06-11] merge | C2 member auth — Convex Auth session + signup/reset/MFA (PR #17, `cf5b041`)

Member-side auth foundation per [[2026-06-11-member-side-convex-client]]. ConvexAuthProvider on RN (expo-secure-store TokenStorage adapter), ConvexReactClient singleton via new `extra.convexCloudUrl` (prod cloud placeholder added; `convexProdBaseUrl` untouched). Auth gate reworked: member session primary, permissions arm preserved. Dual sign-in (member + best-effort fitness bearer) and dual sign-out teardown. New screens: signup (server-enforced legal acceptance), forgot-password (2-step OTP), mfa-challenge (TOTP/backup + 72h lost-authenticator recovery). lib/genolyApi.ts typed function-reference facade w/ name-pinning tests; lib/authSchemas.ts zod + warm error mapping. Home gains greeting + demo/admin banners + email-verify nudge (verify link opens web; deep links deferred to wave J). Tests 113 pass; tsc 0 errors.

## [2026-06-11] merge | C3 welcome wizard — 5-step onboarding mirror (PR #18, `75bc9dc`)

app/welcome.tsx mirrors web /welcome: welcome → name tree → add yourself (completeOnboardingFirstTree atomic commit) → optional parent (createPerson + addChildToPerson) → pedigree style pick; Finish/Skip stamp onboardingCompletedAt; short path for already-membered users. Home gates to /welcome while unstamped (demo exempt). preferences gained pedigreeTheme / lastVisitedTreeSlug / visit-day gate. genolyApi facade extended with the full C4 dashboard surface + name-pinning tests (21 pins). 131 tests pass; tsc 0 errors.

## [2026-06-11] merge | C4 member dashboard (PR #19, `d84b9fd`)

Home is now the real member dashboard: streaks tile (🔥/👋), rewards summary w/ top-quest progress, Today's Pick (client-side day-of-year rotation, web parity, zero server reads), Top 3 this week (treeLeaderboardCache), anniversaries (14-day window), welcome-back banner (visit ≥ 3), no-tree empty state → wizard. New hooks useActiveTree (lastVisitedTree mirror) + useRecordVisit (once-per-UTC-day visit credit). lib/gameRegistry mirrors the web two-axis model. Tests 139 pass; tsc 0 errors. Phase C (auth + onboarding + dashboard) COMPLETE.

## [2026-06-11] merge | D1 tree essentials (PR #20, `0bfca9d`)

Tree tab = exploration hub (multi-tree picker chips + lastVisitedTree persistence, debounced one-shot search, person directory, add-person CTA). Person profile route (app/person/[personId]/) with avatar/life dates/summary/immediate family (relationship graph)/events/photo grid; edit person; add event (createEventForPerson parity); add photo (expo-image-picker → presigned R2 PUT → createMediaMetadata + linkMedia, optional avatar); add person w/ optional parent-child link. useSignedUrl hook (one-shot getDownloadUrl + 10-min TTL cache). Deps added: expo-image, expo-image-picker, expo-haptics. Tests 153 pass; tsc clean.

## [2026-06-11] merge | H2 walking challenges mobile (PR #21, `3e7457d`)

The unique-to-mobile pillar, on the Genoly-side backend (web PR #128 `b73d2c6`; fitness contract untouched). Challenges hub (my challenges across trees + tree active/past + join/create), create screen (team-goal vs race, 3 windows, invite-only), detail screen (live leaderboard, cooperative progress bar, Sync now, join/leave, creator cancel, hide-my-activity). lib/challengeSync (health-store window reads → idempotent syncMySteps; 15-min throttle; DEV deterministic mock source). lib/notifications scaffold (real gating: master toggle + quiet hours 22-07 + 3/day/category caps; __DEV__ log transport until push credentials); Settings gains Notifications + DEV mock toggles. Tests 170 pass; tsc clean.

## [2026-06-11] merge | G settings depth + support (PR #22, `8033d3b`)

/support on mobile: KB browse (category groups) + debounced one-shot search + article view (markdown-lite, no new dep) + contact form into contactSubmissions. Settings depth: profile name edit (users:updateProfile), Security section (live getMfaStatus + backup codes remaining; enroll on web), Privacy & data signposts (export/deletion on web; demo variant), Support entry. Tests 170 pass; tsc clean.

## [2026-06-11] note | MOBILE E2E RUN CLOSED — handoff at vault/handoff-mobile-e2e-2026-06-11.md

Run summary: 8 mobile PRs (#16-#23) + 1 web PR (#128) merged same day. Member-side app shipped: theme module (3 palettes, WCAG-tested) + UI kit + 5-tab nav (C1); Convex Auth member sessions w/ signup/reset/MFA + dual-session teardown (C2); welcome wizard (C3); member dashboard (C4); tree hub + person profiles/edit/add + events + R2 photo upload (D1); Family Walking Challenges end-to-end — Genoly-side backend + web /challenges page + mobile hub/create/detail + health-store step sync + notification scaffold + DEV mock toggle (H); settings depth + /support KB (G); store-submission checklist + metadata drafts (J). Mobile tests 60 → 170 pass, tsc 3 → 0 errors; web convex-tests 226/226; zero live-Convex suite runs (one schema deploy). P1 backlog (pedigree/rewards/games/chat/blog/analytics + step-8 salvage + device screenshot pass) documented in handoff §7. Operator review list in handoff §8.

## [2026-07-09] note | two-workstream run CLOSED — 8 PRs open (unmerged), gating audit, research report

Orchestrated run (brief `_mobile-phase1-and-challenge-growth-brief.md`) closed same day. All merges + pushes await operator (session permission layer blocks agent merges/pushes to main — deliberate).

**Workstream A — two stacked PR chains, all reviewed, none merged:**
- Fitness stack (Phase 1 closure): #27 Step-8 leaderboard salvage (from `e630ba3` + audit §2 fixups; pushed route off Activity "Friends" section, no 6th tab) → #29 Step-9 friends (6 endpoints + friends screen; fixed 204 No-Content crash in api-client `request()`) → #30 Step-10 goals+history (4 endpoints; 4 fixed goal slots; month-grouped history route) → #33 Step-13 polish (touch targets, pull-to-refresh ×3, a11y, loading-flash; zero hex found; no haptics anywhere by design). ApiClient now 15/20 implemented (devices/subscription remain stubs — Phase 1 doesn't need them).
- Tree stack (Pro tree surfaces): #28 Tree tab shell + Explore-as-DEFAULT (perspective canvas, react-native-svg + ZoomPanView) + Register TABLE view (absorbs directory+search) + pure-lib ports (perspectiveScope/Layout, relationshipCore; +74 tests) → #31 Classic pedigree (d3-hierarchy layout port; jest ESM mapper fix) → #32 Fan view GO (default 4 gens, hard cap 5, pinch-zoom; fanGeometry ported verbatim +23 tests) → #34 AuthGate hardening (audit F1 render-hold + F2 anchored grace deadline; +8 tests).
- Merge order: #27→#29→#30→#33, then #28→#31→#32→#34 (stacks independent of each other). Final head verified by orchestrator: tsc 0 errors; fan-stack 307 pass/12 skip, fitness-stack 267 pass/34 skip (all skips = jest-expo 56 screen-suite pattern).

**Pro-gating audit (§A3 acceptance criterion):** `vault/pro-gating-audit-2026-07-09.md` — all 8 surfaces verdict "non-Pro cannot reach via app" (root AuthGate → paywall). F1/F2 client findings remediated same day (PR #34); F3 (no server-side plan gate on explorerGraph/pedigree/fitness-HTTP) accepted by design — web Free/Starter entitlement, mobile Pro is a monetization gate; web-safe hardening option documented (mobile-namespaced wrapper queries on `mobileApp` feature key).

**Workstream B (research, NO code):** `genoly-family-web/vault/research/challenge-growth-standalone-model-2026-07-09.md` + `challenge-growth-EXEC-SUMMARY-2026-07-09.md` (uncommitted, operator review). Recommends tree-less "Circles" domain beside untouched walkingChallenges; guests = flagged Genoly users accounts (NOT null-genolyUserId fitness_users — breaks forkability); invite depth 1; cost capped on inviting Pro tenant. Flags two adminInvites.ts security gaps (Math.random codes, revocation authz). Top operator decisions: Pro-gate semantics change (free install + guest view), guest identity model, cost-cap knobs.

**Operator to-do:** merge queue above; push this local cascade + `bfa2b01`; simulator/device pass (all screens coded with loading/empty/error + a11y; visual verification pending — vault/mobile-screenshots/ still empty; task #300); review research + audit note. jest-expo 56 screen suites remain skipped (pre-existing). package-lock.json 3-line version-metadata drift still uncommitted (harmless).

## [2026-07-09] merge | run merges landed — Phase 1 fitness CLOSED + 4 Pro tree surfaces live on main

All 8 run PRs squash-merged to main in order (operator-authorized): fitness #27 → #35 (re-files #29, auto-closed by GitHub on base-branch deletion) → #30 → #33; tree #28 → #31 → #32 → #34. Main at `e4ec701`. Post-merge verify on the unified tree (both stacks together for the first time): `npm run typecheck` 0 errors; `npm test` 385 passed / 34 skipped / 419 total (skips = jest-expo 56 screen-suite pattern, pre-existing). **Phase 1 (mobile sync + leaderboard) is COMPLETE per §15 — ApiClient 15/20 implemented (devices/subscription stubs are post-Phase-1).** Worktrees removed; all run feature branches deleted (local + remote). `origin/feat/step-8-leaderboard` (`e630ba3`, the 2026-05 original) left for operator deletion — fully salvaged and superseded. package-lock.json drift resolved by the merged lockfile (stash dropped). Remaining operator items: simulator/device pass (task #300), research-report review (web vault), APNs/FCM + prod URLs unchanged.

## [2026-07-09] doc | GRAPH_REPORT.md regenerated — post-Phase-1 + tree-surfaces narrative

Full rewrite of `docs/GRAPH_REPORT.md` (previous regen: 2026-06-09, Fitness-only/4-tab era). Now covers the 2026-06-11 member-app run, V1.0.0's Pro-only gate + paywall, and today's Phase-1 closure + 4 tree surfaces (Explore/Register/Pedigree/Fan + `lib/tree/` pure ports).

Corrected the stale claim flagged in `vault/mobile-audit.md` §7 item 6: `getSubscription` is NOT wired — it still throws `not_implemented`; Settings reads plan tier via `getSession()`. Also noted a numeric discrepancy: `client.ts` has 4 stub methods (`getDevices`, `setPrimaryDevice`, `revokeDevice`, `getSubscription`), making the accurate count 16/20 implemented, not the 15/20 this log's 2026-07-09 entries state.

## [2026-07-09] note | graphify: mobile structural graph regenerated + AGENTS.md corrected

The mobile `graphify-out/` did NOT survive the new-Mac restore (gitignored, and this repo has NO `.husky` auto-refresh hook — `.git/hooks` empty; only genoly-family-web has `.husky/post-merge`). So `graphify query` was non-functional in genoly-mobile all session. Regenerated with `graphify update .` (0.9.11, AST-only, no key): **1738 nodes / 3322 edges / 103 communities** (stale AGENTS claim was 841). Validated a NL query resolves the paywall-gate chain with file:line pointers. Corrected AGENTS.md §"Code knowledge graph report": version 0.8.36→0.9.11, node count, and the false "graph exists / post-commit hook auto-refreshes" claims → now states the graph must be regenerated manually here and flags restoring a tracked `.husky/post-merge` hook as a follow-up. Also this session: regenerated `docs/GRAPH_REPORT.md` (`6e7c3a9`) and corrected the ApiClient count 15/20→16/20 across state files (`5aade9f`) after verifying 4 stubs in `client.ts`.
