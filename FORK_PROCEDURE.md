# FORK_PROCEDURE.md — Extracting the Fitness Product

**Audience:** Future engineer (or AI agent) executing the architectural decision to spin off the fitness product from Genoly into its own standalone product (separate Convex deployment, separate web repo, optional separate brand).

**Last verified:** 2026-05-15 (design phase — not yet executed).

**Estimated effort:** 10–15 working days for a single dedicated engineer. Some phases parallelize down to ~7 calendar days with two engineers.

---

## Purpose

The fitness product co-hosts on Genoly's Convex deployment as of 2026-05-03. This is a deliberate cost / integration trade-off, NOT permanent. The architecture preserves the option to extract fitness at any future point — typically because of one of:

- **Sale / divestiture** — fitness sold to another company or spun off as a separate LLC
- **Strategic pivot** — Genoly de-prioritizes fitness, or fitness becomes the bigger product and demands its own infrastructure
- **Compliance / scaling** — fitness needs different SLAs, regions, or data residency than genealogy

This document is the extraction runbook. Read all phases before starting; some have prerequisites the previous phase doesn't make obvious.

---

## Pre-fork architectural invariants (must be true before forking)

Verify these before kicking off — they should already hold by design, but check:

- [ ] No `fitness_*` table in `genoly-family-web/convex/schema.ts` directly references `users._id`. The ONLY exception is `fitness_users.genolyUserId`, which is the bridge column we drop during the fork. Verify with: `grep 'v.id("users")' genoly-family-web/convex/schema.ts | grep -i fitness` — should return only the `genolyUserId` line.
- [ ] All fitness backend code lives under `genoly-family-web/convex/fitness/`. Verify: `ls genoly-family-web/convex/fitness/`.
- [ ] All fitness web pages live under `genoly-family-web/src/pages/fitness/` and `src/components/fitness/` (if used). Verify: `ls genoly-family-web/src/pages/fitness/`.
- [ ] The ESLint forkability boundary rule is active and passes: `cd genoly-family-web && npm run lint` against `convex/fitness/` shows no `import/no-restricted-paths` violations. (If it fails, fix the violations before forking — they indicate Genoly→fitness or fitness→non-allow-list imports that will break extraction.) **Sanity check the rule itself is alive:** introduce a deliberate violation (e.g., add `import { foo } from "../tenants"` to any `convex/fitness/*.ts` file) and run `npm run lint` — you MUST see an `import/no-restricted-paths` error. If you don't, the rule is silently broken and the "0 violations" reading above is meaningless. (This trap bit us during task #21 Phase A 2026-05-15: `except` paths were authored relative to the config file rather than relative to `from`, so the rule had been silently false-positive-free for weeks. Pattern lives in `eslint.config.js` zone 1 comment.)
- [ ] The allow-list of Genoly files that fitness imports (defined in `eslint.config.js` zone 1 `except` array) matches the list in this document's §"Backend — allow-list of Genoly files to copy" section. If the ESLint allow-list has grown, update this doc first.
- [ ] `convex/http.ts` is the ONLY Genoly file that JS-imports from `convex/fitness/`. It is the HTTP routing bridge — Convex's `HttpRouter` requires real function references, unlike `crons.ts` and `users.ts` which use `internal.fitness.*` through the api object. The file is exempted from the Zone 2 forkability rule via a per-file ESLint override. Verify: `grep -l 'from "./fitness' convex/*.ts` should return ONLY `convex/http.ts`.

If any of these fail, **do not start the fork**. Fix the invariants first.

---

## Decision points to resolve before starting

Make these decisions explicitly before phase 1; they shape the entire procedure:

1. **New product name and brand.** "Genoly Fitness", or a fully separate brand like "StepUp" or "Strider"? This affects email templates, domains, app store listings.
2. **New Convex deployment region.** Match Genoly's, or different (e.g., closer to fitness's user base)?
3. **New web host.** Hostinger again, or alternative (Vercel, Cloudflare Pages, etc.)?
4. **Subscription handling.** Does the new product launch with paid tiers from day one? If yes: new Stripe account, transfer customers, prorate refunds. If no: launch free, monetize later.
5. **Mobile app split.** Keep one Genoly mobile app with both family-tree + fitness sections (and the fitness section just talks to the new backend)? Or split into two mobile apps? **Default: keep unified** — much less App Store work. The mobile app stays in `genoly-mobile/`; only its Convex URL changes for the fitness section.
6. **Old data fate.** After fork, do you delete the fitness_* rows from Genoly's deployment, or keep them as an archive for legal/business reasons (with a hard ACL preventing reads)?

Document the answers at the top of your fork plan PR before proceeding.

---

## Phase 1 — Provision new infrastructure (1–2 days)

Goal: stand up empty backend + web infra for the new fitness product. No data, no code yet.

### Steps

- [ ] **Create new Convex deployment** for the standalone product. Note the new deployment URL (e.g., `https://standalone-fitness-123.convex.cloud`). Copy the dev + prod deployment names somewhere safe.
- [ ] **Create new GitHub repo** for the fitness web app. Suggested name: `hyperionsolutionsorg/genoly-fitness-web` (or whatever new brand). Initialize with the same `vite + react + ts + convex` skeleton as `genoly-family-web`.
- [ ] **Create new R2 bucket** for fitness media (avatars, future workout photos). Suggested name: `genoly-fitness-storage` or per the new brand.
- [ ] **Create new ZeptoMail sender domain** (e.g., `noreply@fitness.example.com`) and complete SPF/DKIM/DMARC verification. Reuse the existing ZeptoMail account or set up a new one if branding requires.
- [ ] **Create new Stripe account** (if billing transferred). Skip if launching free.
- [ ] **Reserve domain** if new brand. If keeping `fitness.genoly.org` as the URL, just point DNS at the new web host when ready.
- [ ] **Provision new web hosting** (Hostinger, Vercel, Cloudflare Pages — match decision from §"Decision points").

### Verification

- New Convex deployment dashboard accessible.
- Test push to new GitHub repo from a sample skeleton commit succeeds.
- Test email sent via new ZeptoMail sender lands in inbox without spam.

---

## Phase 2 — Schema setup in new deployment (2–3 days)

Goal: define the fitness schema in the new Convex deployment, dropping the bridge column and adding what's needed for standalone identity.

### Schema rewriting

Copy `genoly-family-web/convex/schema.ts` to the new repo's `convex/schema.ts`, then surgery:

1. **Strip all non-fitness tables.** Delete every table NOT prefixed `fitness_` from the new schema. Also delete the `users`, `authTables` spread, `tenants`, `subscriptions`, `invoices`, etc.
2. **Drop the `fitness_` prefix.** Rename `fitness_users` → `users`, `fitness_health_daily` → `health_daily`, etc. Reasons: (a) the prefix existed only for co-hosting disambiguation; (b) cleaner schema for the new standalone product. If you prefer to keep the prefix for code-archaeology continuity, that's also fine — just be consistent.
3. **Drop the bridge column.** In the new `users` table (formerly `fitness_users`), remove the `genolyUserId` field. The denormalized `email`, `displayName`, `timezone`, `avatarPhotoKey` stay — they become the canonical user record.
4. **Add password storage.** Spread `authTables` from `@convex-dev/auth/server` and add `authUserId: v.optional(v.string())` to `users` to integrate with Convex Auth's Password provider. The new product needs its own auth system; we're recreating Genoly's pattern here.
5. **Update foreign keys.** Every `v.id("fitness_users")` becomes `v.id("users")`. Every index name `by_fitnessUserId_*` becomes `by_userId_*` for consistency.
6. **Add subscription tables (if monetizing).** Copy Genoly's `subscriptions`, `invoices`, `promoCodes` table definitions if billing is in scope. Otherwise skip.

### Verification

- [ ] `npx convex dev` against new deployment succeeds without schema errors.
- [ ] `_generated/dataModel.d.ts` regenerated; TypeScript types correct.
- [ ] Index list matches expectations: `npx convex run --no-push schemaPrint` (or inspect dashboard).

---

## Phase 3 — Data export from Genoly's deployment (1 day)

Goal: pull every `fitness_*` row from Genoly's prod deployment into a transferable JSON dump.

### Steps

- [ ] **Snapshot the prod deployment first.** `npx convex export --prod` against `genoly-family-web` produces a tarball of the entire DB. Keep this as the "before fork" baseline for rollback.
- [ ] **Write a data-export script** in `genoly-family-web` (`convex/migrations/exportFitness.ts`) that paginates through each `fitness_*` table and writes JSONL files to local disk. Pseudocode:
  ```typescript
  // For each table, scan with internal action, write to filesystem
  // tables: fitness_users, fitness_health_daily, fitness_friendships,
  //         fitness_goals, fitness_devices, fitness_tokens
  // output: ./fork-export/{tableName}.jsonl
  ```
  Run it against PROD: `npx convex run --prod migrations/exportFitness:run`.
- [ ] **Verify counts.** For each table, compare exported row count to live count via `ctx.db.query(tableName).take(N)` sampling.

### Verification

- [ ] Export files exist in `./fork-export/` with non-zero sizes.
- [ ] Spot-check a known user's `fitness_users` row appears in `fitness_users.jsonl` with correct email + `genolyUserId`.
- [ ] Backup tarball from `npx convex export --prod` saved to a known location off the laptop (e.g., S3, encrypted external drive).

---

## Phase 4 — Data transform (1 day)

Goal: rewrite the exported JSONL to match the new schema, generate password-reset tokens for every user.

### Steps

- [ ] **Drop `fitness_` prefix in filenames** if you renamed tables in Phase 2: `fitness_users.jsonl` → `users.jsonl`, etc.
- [ ] **Drop `genolyUserId` from each user row.** Optionally regenerate `_id` (Convex will assign new ones on import anyway, but you need a stable old→new id mapping table).
- [ ] **Build an id-rewrite map.** As you import users, record `{ oldFitnessUserId, newUserId }`. Then rewrite every foreign key in `health_daily`, `friendships`, `goals`, `devices`, `tokens`. (Convex import takes either generated ids or existing ids; cleaner to let Convex assign new ones.)
- [ ] **Generate password-reset tokens.** For every user, create a row in the new `passwordResetTokens` table (or whatever Convex Auth uses): a 32-char random token, 7-day expiry, 1-time use. Email them next phase.
- [ ] **Mark all `fitness_tokens` (now just `tokens`) as revoked.** Mobile devices will re-auth from scratch after the fork. Set `revokedAt = now`, `revokeReason = "fork_migration"`. Or just don't import them — they're useless across deployments anyway since the SHA-256 hashes are tied to plaintext that mobile must rotate.
- [ ] **Validate transformed data.** Spot-check 10 random users: do their `health_daily` rows now reference the new user `_id`?

### Verification

- [ ] Each row in transformed `users.jsonl` has no `genolyUserId` field.
- [ ] Every foreign key in `health_daily.jsonl` resolves to a user in the rewrite map.
- [ ] `passwordResetTokens.jsonl` has exactly one row per user.

---

## Phase 5 — Data import to new deployment (1 day)

Goal: load the transformed data into the new Convex deployment.

### Steps

- [ ] **Run a seed script** in the new repo (`convex/migrations/importFromGenoly.ts`). For each `users.jsonl` row, insert into `users` table; record returned `_id` in the rewrite map.
- [ ] **Process child tables in dependency order:** `users` → `devices` → `health_daily` / `friendships` / `goals` / `tokens` (skipped if not migrating tokens) / `passwordResetTokens`. Apply id rewrites as you go.
- [ ] **Run against the new dev deployment first.** Verify on a small sample. THEN run against new prod.
- [ ] **Compare counts.** Per-table row counts in new deployment must match the source export (within +/-0 — discrepancy means something dropped).

### Verification

- [ ] `npx convex run --prod users:listAll` returns the expected count.
- [ ] One known user can be looked up by email and has the expected friendship + health rows.
- [ ] Import script logs zero errors.

---

## Phase 6 — Code surgery: build the standalone fitness web (3–4 days)

Goal: take the fitness backend + web code from `genoly-family-web` and reshape it into a self-contained codebase in the new web repo.

### Backend (convex/) — what to copy

From `genoly-family-web/convex/fitness/`:

- [ ] Every file (handlers, queries, mutations, http routes) → new repo `convex/`. **Drop the `fitness/` subdirectory** — the new repo's whole convex/ IS the fitness backend.
- [ ] Update import paths: `from "../_generated/api"` stays the same; `from "../auth"` (the Genoly auth.ts) becomes `from "./auth"` once you've copied auth.ts (next step).

### Backend — allow-list of Genoly files to copy

Copy these EXACT files from `genoly-family-web/convex/` to the new repo's `convex/`:

| Source path | Why it's needed | Notes |
|---|---|---|
| `convex/auth.ts` | Convex Auth root (`signIn` action used by fitness token issuance) | The new repo will need its own `convex/auth.ts` configured with `convexAuth({ providers: [Password<DataModel>(...)] })` — see Phase 2 step 4. Copy the file as a starting point and trim Genoly-specific provider config. |
| `convex/lib/auth.ts` | Auth helper functions (requireAuth, RequireRole) | Same code; remove tree/tenant helpers if unused |
| `convex/lib/emailTemplates.ts` | renderEmail() — branded HTML/text generator | Update brand strings to new product |
| `convex/lib/validators.ts` | Validator unions (fitnessUserStatus, etc.) | Strip non-fitness validators; rename `fitness*` → drop the prefix |
| `convex/emails.ts` | ZeptoMail send action (Node runtime) | Verbatim copy; update from-address constants |
| `convex/emailsInternal.ts` | Email log mutations (V8 runtime) | Verbatim copy; rename `emailLog` table if you renamed it |
| `convex/passwordResetProvider.ts` | OTP provider for Convex Auth password reset | Verbatim copy; update brand text in email body |
| `convex/notificationPreferences.ts` | shouldSendEmail() helper + preferences table | Verbatim copy |

These are the files that the ESLint rule (`eslint.config.js` zone 1 `except` array) explicitly permits fitness to import. **If this list has grown** since 2026-05-15 (check the eslint config), update both the eslint config and this document together.

**Important on the `convex/auth.ts` entry (added 2026-05-15):** fitness imports `signIn` from this file inside `convex/fitness/authNode.ts` (the Node-runtime action that validates Genoly email/password during fitness token issuance). On fork, the new repo needs an equivalent `convex/auth.ts` set up with its OWN Convex Auth Password provider — fitness users will re-authenticate against the new deployment, not Genoly's. Don't ship the new fitness product still calling out to Genoly's auth; that defeats the fork.

Set up the new repo's `convex/auth.ts` with `convexAuth({ providers: [Password<DataModel>(...)] })`, mirroring Genoly's pattern. Wire the password reset provider.

### Web (src/) — what to copy

From `genoly-family-web/src/pages/fitness/`:

- [ ] All page components → new repo `src/pages/` (drop the `fitness/` nesting).
- [ ] Update imports: `from "@/components/Layout"` → either copy the layout component to the new repo OR build a fresh one with the new brand.
- [ ] Update routing: the new repo's `src/App.tsx` defines all routes from scratch.

### Web — what to leave behind

The new repo does NOT inherit Genoly's:
- Family tree pages (TreeDetail, TreeMembers, FamilyAtlas, etc.)
- Tenant/multi-tenant context (fitness uses its own user-scoped model)
- Genealogy-specific styling, themes (Classic theme is genealogy-flavored)
- Most of `src/components/` (only generic primitives like Button, Input, Modal — copy those if used)

### Mobile (genoly-mobile/) — minimal changes

The mobile app stays in `genoly-mobile/` since it's already a separate repo. Changes:

- [ ] Update the Convex URL constant to point at the new fitness deployment.
- [ ] Update brand strings (app name, splash, etc.) if the new product has different branding.
- [ ] Reuse `packages/health-sync/`, `packages/types/`, `packages/api-client/` as-is — they're already independent.

### Verification

- [ ] `npm run build` in new web repo succeeds with zero TypeScript errors.
- [ ] `npx convex dev` against new dev deployment succeeds.
- [ ] Local dev server (`npm run dev`) renders home page without console errors.
- [ ] Mobile app pointed at new deployment can issue a token via the email/password flow (after Phase 7).

---

## Phase 7 — Identity transition: password reset email (1 day)

Goal: every user receives an email asking them to set a password for the new product.

### The mechanism

After Phase 4 generated `passwordResetTokens` rows, send the email:

- [ ] **Compose the transition email.** Subject: "Set your password for [New Product Name]". Body explains: "Genoly is splitting into Family Tree + [New Product Name]. To continue using your fitness data, click the link below to set a password for [New Product Name]." Include the reset link with the token query param.
- [ ] **Schedule the send.** Use the new repo's `emails.ts` integration. Send in batches of 100 with 1-second delay to stay within ZeptoMail rate limits.
- [ ] **Track delivery.** Each send logs to `emailLog` in the new deployment. Spot-check after a batch to catch obvious failures.
- [ ] **Tokens expire after 14 days.** Anyone who doesn't reset within 14 days gets a follow-up email. After 30 days, dormant accounts are flagged for cleanup (separate decision).

### Sample email (template starting point)

```
Subject: Set up your [New Product] account

Hi [name],

Your fitness data has moved to a new home: [New Product Name]
(at [new-domain.com]). Genoly continues to handle family trees,
and [New Product] now handles fitness independently.

Click the link below to set a password for [New Product].
Your steps, friends, and goals are already there waiting.

  [Set your password →]

This link expires in 14 days. If you don't recognize this email,
ignore it — you'll keep your Genoly account either way.

— The [New Product] team
```

### Verification

- [ ] Sample 5 user emails arrived in the inbox (check spam folders).
- [ ] Sample link works end-to-end: visit URL → set password → log in → see fitness dashboard with their data.
- [ ] `passwordResetTokens` table shows correct expiry timestamps.

---

## Phase 8 — Cutover (1 day)

Goal: switch traffic from old (Genoly's deployment) to new (standalone deployment), update mobile, take down the old fitness paths.

### Steps

- [ ] **Update mobile app config.** Push a mobile release pointing at the new deployment URL. Wait until App Store / Play Store rollout completes (Android: ~few hours; iOS: ~24h after submission).
- [ ] **DNS cutover.** Point `fitness.genoly.org` (or new domain) at the new web host. TTL low (~5 min) for fast rollback.
- [ ] **Disable fitness in Genoly.** In `genoly-family-web`:
  - Delete `convex/fitness/` directory entirely. The ESLint rule was designed for this exact moment — there are no inbound imports to break.
  - Delete `src/pages/fitness/` directory.
  - Remove fitness routes from `src/App.tsx`.
  - Remove the fitness validators from `convex/lib/validators.ts` (the ones with `fitness*` prefix).
  - Delete `fitness_*` table definitions from `convex/schema.ts`.
  - Delete the 6 fitness route imports + `http.route()` calls from `convex/http.ts`. Genoly's own routes still register; the file shrinks but stays valid.
  - Delete the fitness userSync scheduler call sites from `convex/users.ts` (`updateProfile`, `upsertMe`, `updateMyTimezone` — 5 `ctx.scheduler.runAfter(0, internal.fitness.userSync.syncFitnessUserFromGenoly, ...)` calls).
  - Delete the fitness expired-token cleanup cron from `convex/crons.ts`.
  - Run `npx convex deploy --prod` — this DROPS the fitness tables from Genoly's prod deployment. **THIS IS DESTRUCTIVE — make sure Phase 5 import succeeded first.**
  - Run `npm run lint` — should still pass; the eslint forkability rule remains harmless on an empty allow-list reference. Drop the per-file override for `convex/http.ts` while you're there since its forkability exception no longer applies.
- [ ] **Remove the eslint forkability rule** from `eslint.config.js` (optional cleanup — leaving it in place is fine; it just never fires).
- [ ] **Update master-context.md, memory-bank/, etc.** in `genoly-family-web` to remove fitness references.
- [ ] **Commit + push** the genoly-family-web cleanup. Tag the commit `pre-fitness-fork`.

### Verification

- [ ] `https://fitness.<new-domain>/` loads the new web app.
- [ ] Mobile app on a test device: logs in via the new flow, syncs steps, sees leaderboard.
- [ ] `https://genoly.org/` Genoly app still loads, family tree still works.
- [ ] `npx convex run --prod listTables` against Genoly's prod no longer shows `fitness_*` tables.

---

## Phase 9 — Verification & monitoring (ongoing first week)

Goal: confirm the fork is healthy, watch for regressions.

### Steps

- [ ] **Daily metrics for first 7 days:** new daily-active users on the new deployment, password-reset email open rate, sync success rate, error rates.
- [ ] **Sample real users:** ask 3–5 users to confirm they reset their password and can see their data.
- [ ] **Validate Genoly didn't regress:** Genoly's daily metrics (signups, signins, GEDCOM imports, chat) should be unaffected.
- [ ] **Decommission old data** (per Phase 0 decision): if the policy is to delete fitness_* archives from Genoly's prod, schedule that for ~30 days post-cutover.

---

## Rollback plan

If something fails before mobile cutover (Phase 8):

- The new deployment is empty / partial. Tear it down. No production impact.
- Genoly's deployment still has `convex/fitness/` and all data intact.

If something fails AFTER Phase 8:

- **Within first 24h:** revert the genoly-family-web commit that deleted `convex/fitness/`. Re-run `npx convex deploy --prod`. Convex deployment rollback restores the `fitness_*` tables (Convex retains a 30-day rollback window). DNS cutover reverts. Mobile app rolls back via app store (slower for iOS — may need users on the old version for 24–48h).
- **After 24h:** rollback gets harder; new fitness data has accumulated in the new deployment that doesn't exist in Genoly's. Decide: discard the post-cutover data and revert, OR fix forward in the new deployment.

---

## Document maintenance

This file is part of the forkability contract. **Update it whenever:**

1. The ESLint allow-list in `genoly-family-web/eslint.config.js` zone 1 `except` array changes — Phase 6 §"allow-list of Genoly files to copy" must match exactly.
2. New fitness tables are added to `genoly-family-web/convex/schema.ts` — Phase 2 schema rewriting must mention them.
3. The Convex deployment names or URLs change.
4. New shared infrastructure dependencies appear (e.g., a new auth provider, a new media bucket pattern).

Cross-references that must stay in sync:

- `genoly-family-web/eslint.config.js` (allow-list comments)
- `genoly-family-web/memory-bank/systemPatterns.md` (forkability boundary section)
- `genoly-family-web/memory-bank/MEMORY.md` (forkability invariant note)
- `genoly-family-web/convex/schema.ts` (fitness section block comment)

---

*Maintained by Hyperion Solutions LLC.*
