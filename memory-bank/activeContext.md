# Active Context — fitness

**Last Updated:** 2026-05-03
**Status:** 🔵 PLANNING — architecture finalized, beginning Phase 0

---

## Repository Strategy (decided 2026-05-03)

This repo (`hyperionsolutionsorg/fitness`) will be **renamed to `hyperionsolutionsorg/genoly-mobile`** and slimmed to mobile + shared packages only. All fitness web code moves into `genoly-family-web/src/pages/fitness/`.

| Repo | Role |
|---|---|
| `genoly-family-web` | All web (Genoly + fitness pages co-hosted). Single Convex deployment. |
| `genoly-mobile` (renamed from `fitness`) | One unified Expo React Native app for ALL Genoly mobile (fitness is the first filled section). Cross-platform: same codebase ships iOS + Android. |
| ~~`genoly-family-web-docs`~~ | **To be deleted** — consolidate into `genoly-family-web/docs/`. Duplicate memory-bank caused drift. |

Local cleanup needed BEFORE rename push:
- Delete `apps/web/` from this repo (web migrates to genoly-family-web)
- Confirm `apps/mobile/` + `packages/{health-sync,types,api-client}` stay
- Update `package.json` workspace globs accordingly
- Update README, CONTEXT.md, .clinerules to reflect mobile-only scope

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
  - `FORK_PROCEDURE.md` documents step-by-step extraction
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

## Phase 0 — Active Work Queue

1. Consolidate `genoly-family-web-docs` → `genoly-family-web/docs/`, delete standalone repo
2. Strip `apps/web/` from this repo
3. Rename GitHub repo `fitness` → `genoly-mobile`
4. Update local clone paths and remotes
5. Design fitness Convex schema (`fitness_users` indirection + `fitness_health_daily`, `fitness_friendships`, `fitness_goals`, `fitness_devices`, `fitness_tokens`)
6. Design mobile→server API contract (HTTP routes under `/api/fitness/*` in `genoly-family-web/convex/http.ts`)
7. Set up ESLint cross-boundary import rule in genoly-family-web
8. Write `FORK_PROCEDURE.md`
9. Initialize Expo app structure in `apps/mobile/`
10. Configure EAS Build for Android (iOS deferred)
