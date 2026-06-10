# Genoly Mobile — Code Knowledge Graph Report

> **Maintained by Claude** as the mobile-side Phase 3 AI-memory-bank deliverable. Companion to `../genoly-family-web/docs/GRAPH_REPORT.md`.
> **Last regenerated:** 2026-06-09 — **FULL rewrite** replacing the 2026-05-26 version. That report was heavily forward-looking ("Phase 1 not yet started — mostly Expo boilerplate, packages are `.gitkeep` placeholders"). The repo has since shipped **Phase 1 Steps 1-7 + 11**: real cold-start auth gate, login + health-permissions screens, the `api-client` / `health-sync` / `sync-queue` / `types` packages, a working Fitness dashboard, background sync, and Settings. This report describes **what exists today**; the planned-but-unbuilt surfaces (Friends/Goals/Leaderboard screens) are flagged as such.
>
> **Why a Claude-written report and not `graphify extract`:** same local-LLM-stack constraint as the web repo — see `../genoly-family-web/docs/GRAPH_REPORT.md` header and `../genoly-family-web/memory-bank/wiki/decisions/graph-report-regen-2026-06-09.md`. The AST-only `graphify update .` ran 2026-05-26 (425 nodes); full semantic extraction needs a cloud key.
>
> **Companion docs (don't duplicate):** `AGENTS.md` (repo manual, hard rules), `../genoly-family-web/docs/mobile-sync-architecture.md` (the authoritative client-side design — token lifecycle, offline queue, retry, error matrix, permission flow, clock-drift, background fetch, subscription compliance), `../genoly-family-web/docs/fitness-api-contract.md` (the 20 server endpoints), `FORK_PROCEDURE.md`.

---

## 1. Project overview

`genoly-mobile` is the **Expo mobile app** for the co-hosted **Fitness** product. It talks to the same Convex backend as `genoly-family-web` (dev HTTP endpoint `https://robust-oyster-899.convex.site`) over the 20-endpoint fitness HTTP API. npm-workspaces monorepo: `apps/mobile` (the Expo app) + `packages/*` (cross-platform libraries).

**Mobile payment neutrality (hard rule):** the app is FREE with NO in-app payments — web (`genoly.org/billing`) is the sole subscription surface. `GET /api/fitness/subscription` returns `isPaymentNeutral: true` as a tripwire; mobile UI must never render upgrade/payment surfaces. See `AGENTS.md` §3.1.

**Forkability:** when fitness extracts to its own deployment (`FORK_PROCEDURE.md`), mobile changes minimally — the Convex base URL constant flips; packages are unchanged. Never hardcode the Genoly URL inside `packages/api-client/` — inject via `ApiClientConfig.baseUrl`.

---

## 2. Tech stack (ACTUAL installed versions — `package.json`)

> ⚠️ `AGENTS.md` still carries stale mixed references (SDK 54/55). **Authoritative is `package.json`:**

| Layer | Version (installed) | Notes |
|---|---|---|
| Expo SDK | **56.0.0** | New Architecture enabled |
| React Native | **0.85.3** | Hermes |
| React | **19.2.x** | same major as web |
| Router | **expo-router 56.2.9** | file-based, `typedRoutes` experiment on |
| Package manager | npm workspaces | `apps/*`, `packages/*` |
| Health (iOS) | `react-native-health` (Expo config plugin) | HealthKit |
| Health (Android) | `react-native-health-connect` | Health Connect |
| Auth storage | `expo-secure-store` | hardware keystore for bearer token |
| Local persistence | `expo-sqlite` | offline sync queue |
| Background tasks | `expo-background-fetch` + `expo-task-manager` | 15-min OS-throttled |
| HTTP | native `fetch` + thin wrapper | no axios |
| Forms | `react-hook-form` + `zod` | login validation |
| Tests | Jest (`jest-expo` preset) + RNTL | `apps/mobile/jest.config.js` |
| CI/CD | EAS Build (`@hyperionsolutionsorg`, Hobby tier) | Android wired; iOS deferred |

---

## 3. Repository structure

```
genoly-mobile/
├── AGENTS.md / CLAUDE.md          # Operating manual + Claude Code pointer
├── DESIGN.md                      # Mobile design-system contract (RN mirror of web's)
├── FORK_PROCEDURE.md              # 9-phase fitness-extraction playbook
├── eas.json                       # EAS Build profiles (development / preview / production)
├── package.json                   # workspaces root; SDK 56 / RN 0.85.3 pins
├── apps/mobile/
│   ├── app/                       # Expo Router file tree → §4
│   │   ├── _layout.tsx            # Root auth gate (token → login / permissions / tabs)
│   │   ├── (auth)/login.tsx       # Email/password sign-in
│   │   ├── (auth)/permissions.tsx # First-run health permission request
│   │   ├── (tabs)/_layout.tsx     # 4-tab navigator
│   │   ├── (tabs)/index.tsx       # Family (Phase 2 placeholder)
│   │   ├── (tabs)/fitness.tsx     # Fitness dashboard (Step 7)
│   │   ├── (tabs)/notifications.tsx  # (Phase 2 placeholder)
│   │   ├── (tabs)/settings.tsx    # Account / sync toggle / logout (Step 11)
│   │   ├── modal.tsx / +not-found.tsx / +html.tsx
│   ├── app.json                   # Expo config → §6
│   ├── jest.config.js / jest.setup.js
│   ├── utils/                     # api singleton, backgroundSync, preferences
│   ├── hooks/                     # useDashboardData
│   └── __tests__/                 # Jest specs → §7
├── packages/
│   ├── api-client/                # FetchApiClient + TokenStore (→ §5)
│   ├── health-sync/               # HealthAdapter (HealthKit / Health Connect / Mock)
│   ├── sync-queue/                # SQLite offline outbox + drain
│   └── types/                     # shared types (mirror fitness-api-contract.md)
└── memory-bank/                   # Karpathy LLM Wiki (index, log, wiki/{current,phases,decisions,tasks})
```

---

## 4. App layout (Expo Router — `apps/mobile/app/`)

| File | Route | Purpose | Status |
|---|---|---|---|
| `_layout.tsx` | root | **Cold-start auth gate.** Reads `tokenStore.getToken()` + `isExpired()`; three-arm route: no/expired token → `(auth)/login`; valid token + `hasRequestedHealthPermissions=false` → `(auth)/permissions`; else → `(tabs)`. Splash stays mounted until resolved; fail-closed on storage errors. | ✓ |
| `(auth)/login.tsx` | `/(auth)/login` | Email/password form (`react-hook-form` + `zod`); `apiClient.issueToken()` on submit; `ApiClientError`→friendly message; forgot-password routes to genoly.org. | ✓ |
| `(auth)/permissions.tsx` | `/(auth)/permissions` | First-run in-app explainer + health permission request (steps, active calories, distance) via `createHealthAdapter().requestPermissions()`; "Grant"/"Maybe later". | ✓ |
| `(tabs)/_layout.tsx` | `/(tabs)` | 4-tab navigator (Family / Fitness / Notifications / Settings) w/ FontAwesome icons + colorScheme tint. | ✓ |
| `(tabs)/index.tsx` (Family) | `/` | "Phase 2 — coming later" placeholder. | stub |
| `(tabs)/fitness.tsx` | `/(tabs)/fitness` | **Fitness dashboard** — today's 3 big-number cards (steps/calories/distance) + 7-day chart + dead-letter banner + skeleton/refresh; powered by `useDashboardData`. | ✓ (Step 7) |
| `(tabs)/notifications.tsx` | `/(tabs)/notifications` | "Phase 2 — coming later" placeholder. | stub |
| `(tabs)/settings.tsx` | `/(tabs)/settings` | Account email, health-sync toggle, "Manage subscription" → genoly.org (payment-neutral), legal; logout calls `apiClient.revokeToken()`. | ✓ (Step 11) |
| `modal.tsx` / `+not-found.tsx` / `+html.tsx` | — | Expo template modal (unused) / 404 / web hydration helper. | boilerplate |

---

## 5. Services / packages

### `packages/api-client` (@genoly/api-client)
- `src/index.ts` — `ApiClient` interface (all 20 fitness endpoints) + `ApiClientConfig` + `createApiClient()` factory + `ApiClientError` (typed `code`).
- `src/client.ts` — **FetchApiClient** (~300 lines): native `fetch`, Bearer header, exponential backoff on GET (3 attempts, 1s→3s ±200ms jitter, honors `Retry-After` on 429), NO retry on POST/PUT/DELETE, 8-code error matrix. **Implemented.**
- `src/token-store.ts` — `TokenStore` interface + **SecureTokenStore** (expo-secure-store, key `genoly.auth.token`) + **MemoryTokenStore** (tests); `isExpired()` check. **Implemented.**
- `src/token-store.test.ts` — unit tests for both stores.

**Endpoints actively wired:** `issueToken` (login), `revokeToken` (logout), `getSession` (cold-start validation), `getDailyAggregates` + `syncDailyAggregates` (dashboard + queue drain), `getSubscription` (settings, read-only). **Declared but not yet called (Phase 1.5+):** friends (`getFriends`/`getLeaderboard`/request/accept/decline/unfriend/block), goals (`getGoals`/`upsertGoal`/`archiveGoal`/history), devices (`getDevices`/`setPrimaryDevice`/`revokeDevice`).

### `packages/health-sync` (@genoly/health-sync)
- `src/index.ts` — `HealthAdapter` interface + `HealthMetric` union + `createHealthAdapter(options)` factory (platform-routes iOS/Android/Mock).
- `src/HealthKitAdapter.ts` — iOS (wraps `react-native-health`). `src/HealthConnectAdapter.ts` — Android. `src/MockHealthAdapter.ts` — web/tests fallback. All **implemented**. Requested metrics: `steps`, `caloriesActive`, `distanceMeters`.
- `src/HealthAdapter.test.ts` — adapter interface tests.

### `packages/sync-queue` (@genoly/sync-queue)
- `src/index.ts` — `SyncQueue` + `createSyncQueue` + store interfaces + `BATCH_SIZE`/`MAX_ATTEMPTS`.
- `src/queue.ts` — drain loop (batches ≤50, ≤3 retries, dead-letter table for permanently-rejected rows).
- `src/store.ts` — `SyncStore` interface + **ExpoSqliteStore** (sqlite) + **MemoryStore** (tests). All **implemented**.
- `src/SyncQueue.test.ts` — queue + store tests.

### `packages/types` (@genoly/types)
- `src/index.ts` — shared types (HealthEntry, FitnessUser, FitnessDevice, Goal, Leaderboard, ApiError, …); source of truth is `../genoly-family-web/docs/fitness-api-contract.md`.

### `apps/mobile/utils` & `hooks`
- `utils/api.ts` — module-level singletons `apiClient` (FetchApiClient) + `tokenStore` (SecureTokenStore); reads base URL from `app.json` `extra.convexBaseUrl` + version from `Constants.expoConfig.version`. (Decision 1 — prod URL — still placeholder.)
- `utils/backgroundSync.ts` — defines + registers `GENOLY_BG_SYNC_TASK` for `expo-background-fetch` + `expo-task-manager` (15-min hint, one drain per wake, gated on `healthSyncEnabled`). (Step 6.)
- `utils/preferences.ts` — AsyncStorage wrapper (lazy-require for Node tests): `hasRequestedHealthPermissions` + `healthSyncEnabled` flags.
- `hooks/useDashboardData.ts` — Fitness dashboard data: drains the sync queue, fetches the 7-day range, computes today in local TZ; returns `{today, last7Days, queueDepth, deadLetterDepth, refreshing, initialLoading, error, refresh(), clearDeadLetters()}`.

---

## 6. Native config

**`apps/mobile/app.json`:** name `Genoly`, slug `genoly-mobile`, version `0.1.0`, scheme `genoly`, bundle/package `org.hyperionsolutions.genoly`, iOS deploymentTarget 16.4 + `UIBackgroundModes:[fetch,processing]`, Android `RECEIVE_BOOT_COMPLETED`, `typedRoutes` experiment on. **`extra.convexBaseUrl = "https://robust-oyster-899.convex.site"` (dev), `extra.convexProdBaseUrl = "keen-owl-415-placeholder"` (Decision 1 pending Shankar), `extra.eas.projectId` set.** Plugins: expo-font, expo-router, expo-splash-screen, expo-status-bar, `react-native-health` (w/ HealthKit usage strings + `isClinicalDataEnabled:false`), react-native-health-connect, expo-sqlite, expo-web-browser.

**`eas.json`:** profiles `development` (devClient, internal, apk, ios.simulator), `preview` (internal apk), `production` (autoIncrement, app-bundle). Android wired; iOS deferred until Apple Developer Program ($99/yr).

---

## 7. Tests

Jest (`jest-expo` preset; `jest.setup.js` mocks `NativeReactNativeFeatureFlags`; default RN env, not jsdom).

**Active:** `apps/mobile/__tests__/backgroundSync.test.ts`, `useDashboardData.test.ts`; package specs `packages/api-client/src/token-store.test.ts`, `packages/health-sync/src/HealthAdapter.test.ts`, `packages/sync-queue/src/SyncQueue.test.ts`.

**Skipped** (`testPathIgnorePatterns` — jest-expo 56 TurboModule mocking gaps; real-device smoke is the gate): `login.test.tsx`, `settings.test.tsx`, `auth-gate.test.tsx`, `fitness.test.tsx`.

Commands: `npm run lint` · `npx tsc --noEmit` · `cd apps/mobile && npx expo start` · `eas build --platform android --profile preview`.

---

## 8. Web boundary

Mobile consumes the fitness HTTP API hosted by `genoly-family-web` (`convex/fitness/*` registered in `convex/http.ts`). **Contract source of truth:** `../genoly-family-web/docs/fitness-api-contract.md` (20 endpoints). Dev base URL: `https://robust-oyster-899.convex.site` (note `.convex.site`, the HTTP endpoint, not `.convex.cloud`).

**Token lifecycle:** `issueToken()` at login → SecureTokenStore (hardware-backed) → `getSession()` cold-start validation → `isExpired()` auto-clear → `revokeToken({scope})` at logout. 401 triggers the hard teardown sequence in `AGENTS.md` §3.6 (cancel in-flight, clear token + SQLite queue, navigate to login).

**Subscription tripwire:** `getSubscription()` must report `isPaymentNeutral: true`; the planned `useSubscription` hook throws if ever false (hard-fail in dev > App Store rejection in prod).

---

## 9. Phase 1 status

| Step | Description | Status |
|---|---|---|
| 1 | Token store + auth gate | ✓ (SecureTokenStore + `_layout.tsx`) |
| 2 | `getSession()` cold-start validation | interface defined; not yet in the boot flow |
| 3-4 | Health permission request + adapter factory + permissions-screen gate | ✓ |
| 5 | Offline SQLite sync queue (outbox + dead-letter) | ✓ (`@genoly/sync-queue` + ExpoSqliteStore) |
| 6 | Background sync (expo-background-fetch + task-manager) | ✓ (`backgroundSync.ts`) |
| 7 | Fitness dashboard + foreground drain | ✓ (`fitness.tsx` + `useDashboardData`) |
| 11 | Settings (account, sync toggle, logout) | ✓ |
| 8-10 | Friends / Goals / Leaderboard screens | endpoints declared; screens are Phase-2 placeholders |

**Open decision:** Decision 1 (production Convex URL) still pending Shankar — `app.json extra.convexProdBaseUrl` carries the `keen-owl-415-placeholder` flag.

---

## 10. Memory bank pointer

Don't reproduce narrative here — link by date in `memory-bank/`: catalog `index.md`; current state `wiki/current/*`; recent phases `wiki/phases/2026-05-28-mobile-step-1.md`, `2026-05-28-mobile-step-2-3.md`, and the Step 4-7/11 + SDK-56 upgrade phase pages. Architecture source of truth stays `../genoly-family-web/docs/mobile-sync-architecture.md`.

---

## 11. For AI tools

Read order: workspace `AGENTS.md` → `master-context.md` → this repo's `AGENTS.md` → **this file** → `memory-bank/index.md` → last 10 of `memory-bank/log.md` → `wiki/current/*`. For implementation, also read `mobile-sync-architecture.md` (§§3-11) + `fitness-api-contract.md`. **Never grep `node_modules/`** — all real code is `apps/mobile/` + `packages/`. Regenerate this report when Phase 2 screens land or the SDK upgrades again.

*Last regen marker: 2026-06-09 — full rewrite reflecting Phase 1 Steps 1-7/11 shipped on Expo SDK 56 / RN 0.85.3. Previous: 2026-05-26 (forward-looking boilerplate-era report).*
