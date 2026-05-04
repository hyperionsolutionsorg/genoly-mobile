# Active Context — genoly-mobile

**Last Updated:** 2026-05-03
**Status:** 🔵 PLANNING — architecture migration COMPLETE, ready to start Phase 0 mobile work

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

## Phase 0 — What's Next

Migration housekeeping is done. The next session should pick up at the actual mobile design work, in the genoly-family-web repo first since the schema + API need to land before mobile can call them:

1. **Design fitness Convex schema** in `genoly-family-web/convex/schema.ts` — tables: `fitness_users` (indirection), `fitness_health_daily`, `fitness_friendships`, `fitness_goals`, `fitness_devices`, `fitness_tokens`
2. **Design mobile→server HTTP API contract** under `/api/fitness/*` in `genoly-family-web/convex/http.ts`
3. **Set up ESLint cross-boundary import rule** in genoly-family-web (blocks Genoly→fitness, restricts fitness→Genoly to allow-list)
4. **Write `FORK_PROCEDURE.md`** in this repo documenting fitness extraction strategy
5. **Initialize Expo app structure** in `apps/mobile/` with TypeScript template + bottom-tab nav skeleton
6. **Wire `packages/health-sync` interface** (HealthKit + Health Connect adapter shapes — implementation later)
7. **Configure EAS Build for Android** (iOS deferred)
