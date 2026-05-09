# Active Context — genoly-mobile

**Last Updated:** 2026-05-08
**Status:** 🟢 Phase 0 mobile substantially complete — Expo Router tabs scaffolded (Task #7), package interface stubs landed (Task #8), EAS Build pipeline producing signed APK that runs on Android (Task #10), Phase 0 baseline verified (Task #11). Only Task #9 (GitHub Actions) remains for Phase 0 closure.

---

## Repository Strategy (✅ COMPLETE 2026-05-03)

This repo is now `hyperionsolutionsorg/genoly-mobile` (renamed from `fitness`) — slimmed to mobile + shared packages only. All fitness web code lives in `genoly-family-web/src/pages/fitness/`.

| Repo | Role | State |
|---|---|---|
| `genoly-family-web` | All web (Genoly + fitness pages co-hosted) + all docs + canonical memory-bank. Single Convex deployment. | ✅ Phase 2 ~99% complete; awaiting fitness section work |
| `genoly-mobile` (this repo) | One unified Expo React Native app for ALL Genoly mobile. Cross-platform: same TS codebase ships iOS + Android. Fitness is the first filled section. | ✅ Renamed + slimmed; Phase 0 init pending |
| ~~`genoly-family-web-docs`~~ | Archived as `OLD_genoly-family-web-docs` on github.com — read-only history. Content lives in `genoly-family-web/docs/` and `genoly-family-web/memory-bank/`. | ✅ Retired |

Migration cleanup done:
- ✅ `apps/web/` removed (commit c5a0984)
- ✅ Local folder + GitHub repo renamed `fitness` → `genoly-mobile`
- ✅ Local remote URL updated to `https://github.com/hyperionsolutionsorg/genoly-mobile.git`
- ✅ README, CONTEXT.md, memory-bank updated to reflect mobile-only scope

---

## All Key Decisions Made

### Architecture
- **Web stack:** Vite + React + TypeScript + Convex — fitness pages live inside `genoly-family-web` (Path A: embedded integration, shared Layout + theme + auth)
- **Mobile stack:** Expo React Native — ONE unified Genoly app (cross-platform, single codebase for iOS + Android), fitness is the first section. Bottom-tab navigation: Family Tree, Fitness, Notifications, Settings.
- **Distribution v1:**
  - **Android FIRST priority** — direct APK download link (free, no Play Store required)
  - **iOS SECOND priority** — TestFlight needs Apple Developer Program ($99/yr); free alternatives (AltStore/SideStore/Expo Go) don't work for HealthKit native modules. Defer until traction justifies the $99.

### Backend / Data
- **Shared Convex deployment** with Genoly (`robust-oyster-899` dev / `keen-owl-415` prod) — saves on cost, easier integration
- **Forkability constraint** (locked in): fitness must remain extractable to its own Convex deployment + repo within ~1-2 weeks of bounded migration work. Enforced by:
  - All fitness tables prefixed `fitness_*`
  - **Identity indirection** — NO `fitness_*` table directly references `users._id`. All identity links go through `fitness_users.genolyUserId`.
  - **Code isolation** — fitness backend code lives in `genoly-family-web/convex/fitness/`. ESLint rule blocks Genoly→fitness imports and restricts fitness→Genoly imports to a small allow-list.
  - `FORK_PROCEDURE.md` (to be written) documents step-by-step extraction
- **Daily aggregates only** — steps + calories per (user, date), upsert idempotent

### Auth
- **Web:** mirror Genoly's Convex Auth + Password + ZeptoMail OTP reset pattern (clone `convex/auth.ts`, `passwordResetProvider.ts`, `lib/emailTemplates.ts`)
- **Mobile:** per-device bearer tokens with **4-month hard expiry**. Single primary device for active health collection; secondary devices stored as inactive. Token scoped `health:write` only. Password reset on web invalidates all tokens.

### Subscription Model (locked in 2026-05-03)
- **Mobile apps are FREE with NO in-app payments.** Both iOS and Android.
- **Web is sole subscription surface** — Stripe checkout + Customer Portal in `genoly-family-web` only. Avoids Apple's 30% cut.
- Mobile shows neutral copy only: "Manage subscription on our website". No CTAs, no pricing, no upgrade prompts (Apple anti-steering compliance).
- Subscription state read-only on mobile via `{ tier, expiresAt }` query.

### Sync Pattern
- **Hourly background fetch** via `expo-background-fetch` (OS-throttled — no constant battery drain)
- Initial onboarding sync: pull last 1 month of daily aggregates
- Module separation: ALL health reading code in `packages/health-sync/` only — never in screen components

---

## What landed 2026-05-08 — Task #10 (EAS Build for Android) + Task #11 (Phase 0 baseline verify), commit pending

EAS Build pipeline configured and verified end-to-end. Concrete artifacts:

- **Expo account** `@hyperionsolutionsorg` created on Hobby (free) tier — no payment info collected, 30 Android builds/month quota plenty for Genoly's projected cadence.
- **EAS project** `@hyperionsolutionsorg/genoly-mobile` registered (project ID `a059fba2-1ef7-431c-9870-6325603f3ada`). Visible at https://expo.dev/accounts/hyperionsolutionsorg/projects/genoly-mobile.
- **`apps/mobile/app.json`** modified: added `"owner": "hyperionsolutionsorg"` and `expo.extra.eas.projectId` (auto-added by `eas init`).
- **`apps/mobile/eas.json`** created with three build profiles:
  - `development` — `expo-dev-client` builds for native module debugging (used in Phase 1 when wiring HealthKit/Health Connect)
  - `preview` — **Genoly's primary distribution profile** — APK output, internal distribution, sideloadable via direct download. This is the workhorse.
  - `production` — AAB output for future Play Store submission (deferred per project rules until $25 one-time fee is justified)
- **Android keystore** auto-generated by EAS, stored cloud-side (no local `.jks` to manage; Expo backs it up). This is the signing identity for every future Android build of `@hyperionsolutionsorg/genoly-mobile`.
- **First preview APK** built: `b0260446-e70b-4832-8ee6-567a5731545c`. Installed on a real Android phone via Camera app QR-scan → Chrome → sideload (after enabling "Install from unknown sources" once for Chrome). Smoke test passed: all four tabs (Family / Fitness / Notifications / Settings) render with their FontAwesome 5 icons (sitemap / heartbeat / bell / cog), navigation works, no error overlay, app name "Genoly" with the default template icon (icon replacement is a future polish task).

**Phase 0 baseline (Task #11) is met:** `npx tsc --noEmit` clean from `apps/mobile/` (verified after Task #8), and EAS produces a working signed APK that runs on a real Android device with the expected UI (verified just now).

**EAS account specifics for the audit trail:** Hobby tier, signed up via GitHub OAuth from `git@hyperionsolutions.org`, no payment info on file. Session authenticated via `eas login -b` (browser OAuth flow). Long-term recommendation: add a personal access token to `~/.zshrc` as `EXPO_TOKEN=<token>` for non-interactive use in CI (Task #9).

## What landed 2026-05-08 (Task #8 — package interface stubs, commit `9657069`, pushed to origin)

Three TypeScript-interface-only packages wired to the API contract:

- `packages/types/src/index.ts` — the leaf of the type dependency graph. All literal unions, entity shapes (HealthEntry, FitnessUser, FitnessDevice, FriendBrief, Goal, etc.), the `SubscriptionStatus` with `isPaymentNeutral: true` tripwire, and the `ApiError` shape. No imports — pure types. Aligned 1:1 with `genoly-family-web/docs/fitness-api-contract.md` so server impl + mobile client share the same contract.
- `packages/health-sync/src/index.ts` — `HealthAdapter` interface (`getPlatform`, `isAvailable`, `requestPermissions`, `readDailyAggregates`). Imports from `@genoly/types` only. Forkability rule preserved: this package is the sole home of health-reading code; screens never import HealthKit / Health Connect symbols directly.
- `packages/api-client/src/index.ts` — `ApiClient` interface mirroring all 20 endpoints (auth × 3, sync × 2, friends × 6, goals × 4, devices × 3, subscription × 1, leaderboard × 1) plus `ApiClientConfig` and a typed `ApiClientError` thrown class.

Cross-package deps wired in package.json (apps/mobile pulls all three; health-sync and api-client pull @genoly/types). npm workspaces handles resolution via the existing root-level symlinks under `node_modules/@genoly/`.

Verified end-to-end: `npm install` clean (716 packages audited), `npx tsc --noEmit` from `apps/mobile/` clean, code review tooling exhaustively tested across local Ollama models (findings recorded in the comparison-data note below — no real defects found, but no model-driven combo on this hardware could reliably complete a contract-cross-reference review). Commit `9657069` (40 files were touched in Task #7's commit `6da2488`; Task #8 added 11 files / +586 / -11 — see `git show 9657069 --stat`). Bundles in the post-commit Rule #0 hash trail recorded for `6da2488` (Task #7 init) and `72187d8` (web doc-org adds) per yesterday's commits.

### Code review tooling — comparison data (recorded for Phase 1 planning)

| Tool + Model | Settings | Outcome |
|---|---|---|
| Aider + qwen2.5-coder:32b | `--read FILE`, no repo-map, narrow file set | ✅ Clean review in ~45 s (yesterday's Task #7) — best fit for code review on this hardware |
| Aider + qwen2.5-coder:32b | Same settings, plus the 700-line API contract doc | ❌ Generation loop — context bloat from cross-reference task pushed model into degenerate state |
| Aider + qwen2.5-coder:32b | `@`-mentions in user message (no `/read`) | ❌ Hallucinated SEARCH/REPLACE patches — would have corrupted real files if accepted; pressing `N` to all "Create new file?" prompts averted disaster |
| Aider + gemma4:31b | review tier | ❌ >30 min timeout on large context |
| Cline + gemma4:31b | compact prompt + 5 min timeout | ❌ Tool-call read-loop, 1 hour, no review output |
| Cline + qwen2.5-coder:32b | compact prompt + 5 min timeout | ❌ Outputs raw JSON tool-calls as text instead of native Cline tool calls |

**Operating envelope for local-Ollama code review on this M4 Pro:**
- Aider only — Cline cannot drive its tool-call protocol with any tested local model.
- `qwen2.5-coder:32b` is the only viable model for code review (gemma4:31b is too slow on large contexts).
- Total context must stay under ~3000 lines combined — large markdown cross-references push the model into degenerate states.
- Use `--read` flags in the shell invocation, never `@`-mentions in user messages (Aider's parser doesn't auto-load `@`-paths).

For Phase 1 (mutation handler reviews involving schema + contract + handler + tests), local models alone won't be sufficient. Plan to either (a) split reviews into multiple narrow passes under the envelope above, or (b) use Claude/GPT-4 class API for the cross-reference review steps.

## What landed 2026-05-07 (Task #7 — initialize Expo app, commit `6da2488`)

`apps/mobile/` scaffolded via `npx create-expo-app@latest --template tabs --no-install` and customized. Smoke-tested via Expo Go tunnel mode on Android. Code review by `qwen2.5-coder:32b` came back clean (one minor `.gitignore` cleanup applied pre-commit). Companion commit on web side: `genoly-family-web@72187d8` (doc-org adds + 277b446 hash trail).

- **Expo SDK 54** with React Native 0.81.5, React 19.1, TypeScript 5.9, Expo Router 6.
- **New Architecture enabled** (`newArchEnabled: true` in `app.json`) — Fabric / TurboModules.
- **Typed routes experiment on** — file-system → URL mapping is type-checked at build time.
- **Bundle id** `org.hyperionsolutions.genoly` (Android `package` + iOS `bundleIdentifier`).
- **Deep-link scheme** `genoly://` — Family tab is at `/` (so `genoly://` deep-links straight to it, matching Expo Router's standard tabs convention where the first tab uses `index.tsx`). Other tabs at `/fitness`, `/notifications`, `/settings`. Nested routes for tree/person detail (Phase 2) will live under e.g. `app/(tabs)/tree/[treeSlug]/person/[personSlug].tsx`, deep-linkable as `genoly://tree/<treeSlug>/person/<personSlug>`.
- **App name** `Genoly` / **slug** `genoly-mobile`.
- **Bottom tabs** in `apps/mobile/app/(tabs)/`: `family.tsx` (default), `fitness.tsx`, `notifications.tsx`, `settings.tsx`. FontAwesome 5 icons: sitemap, heartbeat, bell, cog.
- **Placeholder screens** show the phase the screen is waiting on; Settings includes the legal attribution and the "manage subscription on the website" copy (Apple anti-steering compliance).
- **npm workspaces** wired at `genoly-mobile/package.json` root with `apps/*` + `packages/*`; stub `package.json` files added to each of `packages/{health-sync, types, api-client}`.
- **`metro.config.js`** in `apps/mobile/` configures Metro to watch the workspace root and resolve hoisted deps (per Expo's monorepo guide).

**Not yet done in this scaffold (deliberately deferred):**

- `npm install` — user runs this on their laptop after pulling. Sandbox uses `--no-install`.
- Smoke test — user runs `npx expo start` and tests on Expo Go (Android phone) or an emulator.
- Pruning of unused template artifacts — `components/EditScreenInfo.tsx`, `ExternalLink.tsx`, `StyledText.tsx`, `app/modal.tsx` are no longer referenced by our 4 tabs but were left in place to avoid noisy deletes in the init commit. Clean up in a later commit if desired.
- The original `apps/mobile/.gitkeep` and `packages/*/.gitkeep` placeholders remain alongside the new content. Harmless but redundant — `rm` them when convenient.

## Phase 0 — what's next

1. **Task #8** — Wire `packages/health-sync` interface (HealthKit + Health Connect adapter shapes) plus `packages/types` and `packages/api-client` shapes. Interface definitions only; implementation in Phase 1.
2. **Task #10** — Configure EAS Build for Android (iOS deferred until Apple Developer Program signup is justified).
3. **Task #9** — GitHub Actions: `build-android.yml` here, web deploy lives in `genoly-family-web`.
4. **Task #11** — Verify Phase 0 baseline: clean TypeScript build (`npm run typecheck`) + EAS Build produces a working signed APK.

Earlier Phase 0 prerequisites that landed in `genoly-family-web` (2026-05-05): fitness schema, API contract, ESLint forkability rule, FORK_PROCEDURE.md, co-hosted-architecture.md.
