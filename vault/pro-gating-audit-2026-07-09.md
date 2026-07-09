# Pro-only gating audit — genoly-mobile (2026-07-09)

Read-only audit of the two un-merged stack HEADs:
- Tree stack `feat/mobile-fan-view` @ `genoly-mobile-treeA` (#28→#31→#32)
- Fitness stack `feat/step-13-polish` @ `genoly-mobile-step8` (#27→#29→#30→#33)

Evidence is line-anchored to files read in the worktrees (not PR text). Server refs are `genoly-family-web/convex`.

## The gate (one code path, all surfaces)

`apps/mobile/app/_layout.tsx` — `RootLayout` mounts `<AuthGate/>` as the **root** layout, wrapping the entire `<Stack>` (treeA L39-64 with `GestureHandlerRootView`; step8 identical minus that wrapper — the only diff between worktrees; `planChecks.ts`, `genolyApi.ts` Pro block byte-identical across both).

`AuthGate` (treeA L81-165 / step8 L74-158) routing `useEffect` (treeA L107-158):
1. `isLoading` → hold splash.
2. `!isAuthenticated && !inAuthGroup` → `replace('/(auth)/login')`.
3. `hasProAccess === null` → **return early, render app underneath** (L117).
4. `!hasProAccess && !inGatedGroup` → `replace('/(gated)/paywall')` (L130); if previously Pro this session, 5-min grace banner + delayed replace (L122-128).
5. Pro → render.

`useHasProTenantAccess` (`lib/genolyApi.ts` L712-716 treeA): `useQuery(listMyTenants)` → `undefined` = `null` (loading), else `hasAnyProTenant` (`planChecks.ts` L22, `plan === "pro"`). Grouping uses `segments[0]`: only `(auth)`/`(gated)` are exempt — **every other segment (`(tabs)`, `leaderboard`, `friends`, `goals`, `goals-history`) is subject to the paywall redirect.** New fitness routes live at `app/*.tsx` top-level (not under `(gated)`), reached via `router.push` from `(tabs)/activity.tsx` L193/204/221 — still under AuthGate. Tree view modes are all inside `(tabs)/tree.tsx` (single screen, `useState` mode switch L74) — same gate.

**Redirect is imperative, post-render.** `router.replace` fires from a `useEffect` *after* first commit. So on cold start / deep link (the `genoly://` scheme is registered), the target screen mounts and its Convex/HTTP queries fire **once** before the replace lands. During the `hasProAccess === null` window the effect returns without redirecting (L117) and renders the app, so a non-Pro user's target screen is briefly visible until `listMyTenants` resolves.

## Server enforcement (read-only findings)

- `explorerGraph:explorerGraph` (Explore/Register data) — `requireTreeViewer(ctx, treeId)` only (`explorerGraph.ts` L53). **No plan/feature gate.** `requireFeatureForTree` is imported and used, but only on the Focus-mode queries `getFamilyScope/getAncestorTree/getRelatedKin/getPersonDetail` (L671/919/1072/1338 → `"focusMode"`, the #243 precedent) — NOT on the mobile-consumed `explorerGraph`.
- `pedigree:getAncestorTree` (Pedigree + Fan; both mobile views call this ref — `genolyApi.ts` L664-668) — `requireTreeViewer(person.treeId)` only (`pedigree.ts` L262). **No plan gate.** Note web separately gates `familyExplorerPedigreeView`/`familyExplorerFanView` as Starter+ (`featureGates.ts` L32-33) at the web UI layer, not in this shared query.
- Fitness HTTP (`friends.ts`/`goals.ts`) — every internal mutation calls `requireFitnessAuth(ctx, plaintext)` (`tokenAuth`; SHA-256 bearer), handlers `extractBearer` + `withErrorHandler` (`goals.ts` L252-268, `friends.ts` L51/111/195/318). **Tenant-free by forkability design — no plan/Pro gate**, per `convex/CLAUDE.md` fitness boundary.

**Residual gap (documented, assessed acceptable):** a non-Pro **tree member** with valid Convex creds can invoke `explorerGraph:explorerGraph` / `pedigree:getAncestorTree` directly, and a holder of a valid 4-month fitness bearer token can hit `/api/fitness/{friends,goals,leaderboard}` — both outside the app, bypassing the client gate. This is acceptable: the same data is a Free/Starter entitlement on web; mobile Pro is a **monetization gate, not a data boundary** (scout's position; web behavior must not change). One web-safe hardening option if hard enforcement is ever wanted: add mobile-namespaced wrapper queries (e.g. `mobileExplorerGraph`) that call `requireFeatureForTree(treeId, "mobileApp")` — the `mobileApp` key already exists, Pro/enterprise (`featureGates.ts` L58) — leaving the web queries untouched.

## Verdict table

| Surface | Client gate | Server backing (gate today) | Non-Pro reaches it via normal app nav? |
|---|---|---|---|
| Explore | AuthGate → paywall | `explorerGraph` · requireTreeViewer, no plan gate | No (paywall) |
| Register | AuthGate → paywall | `explorerGraph` + `listAllPersonsByTree` · no plan gate | No (paywall) |
| Pedigree | AuthGate → paywall | `pedigree:getAncestorTree` · requireTreeViewer, no plan gate | No (paywall) |
| Fan | AuthGate → paywall | `pedigree:getAncestorTree` · requireTreeViewer, no plan gate | No (paywall) |
| Leaderboard | AuthGate → paywall | `/api/fitness/friends/leaderboard` · bearer only | No (paywall) |
| Friends | AuthGate → paywall | `/api/fitness/friends*` · bearer only | No (paywall) |
| Goals | AuthGate → paywall | `/api/fitness/goals*` · bearer only | No (paywall) |
| Goals history | AuthGate → paywall | `/api/fitness/goals/history` · bearer only | No (paywall) |

All 8: **No** for the intended path — an authenticated non-Pro user is redirected to `/(gated)/paywall` before interacting. Caveats: the pre-redirect mount window (F1) and the direct-API bypass above.

## Payment neutrality

- Grep of all new surfaces (`leaderboard/friends/goals/goals-history.tsx`, `(tabs)/tree.tsx`, `components/tree/*`) → **zero** upgrade/pricing/IAP UI; only doc-comment references to the gate. Clean.
- `app/(gated)/paywall.tsx` — two CTAs, both `Linking.openURL` to `genoly.org/pricing` (L20/26) and `genoly.org` (L21/31) in the system browser. No in-app purchase surface.
- `getSubscription()` is a `not_implemented` throwing stub (`packages/api-client/src/client.ts` L348-350). Settings reads tier via `getSession()` → `/api/fitness/auth/me` (client.ts L219; `settings.tsx` L100) and renders a read-only payment-neutral disclosure linking to `genoly.org/account` (settings.tsx L64/395) — **pre-existing, not in today's stacks.**
- Tripwire (`isPaymentNeutral: true` literal, sync-arch §11 L484): **intact.** No new surface consumes subscription state or renders subscription UI without the check — nothing new calls `getSubscription`.

## Findings (ranked)

- **F1 (low, client-only latency gap):** target screen mounts + fires its queries once before AuthGate's `router.replace` lands, and during the `hasProAccess === null` load window the app renders underneath (L117). A non-Pro user (or a deep link via `genoly://`) can momentarily see a gated screen and trigger one round of backing queries before the paywall redirect. Server data still returns (no plan gate), so this is a visual/data-flash gap, not an entitlement bypass beyond the documented residual gap. Mitigation option: block-render the tree until `hasProAccess !== null` (return `null` instead of the app) rather than only holding the effect.
- **F2 (low):** downgrade grace timer is created inside the routing `useEffect`, whose cleanup runs on any `segments`/deps change; navigating during the 5-min window `clearTimeout`s and starts a **fresh** 5 minutes (treeA L122-128). A user who keeps navigating can extend eviction indefinitely. Minor — monetization grace, not a security boundary.
- **F3 (info, by design):** direct-API residual gap — see Server section. Accepted; hardening path documented.

## Not verifiable without a simulator/device

- Actual mount-before-redirect timing / whether a flash is user-perceptible (F1) — needs a device with a non-Pro account.
- Behavior of a live `genoly://` deep link into `/leaderboard` or a tree mode on a cold non-Pro session.
- Real 5-min downgrade-grace expiry and the timer-reset behavior (F2) end-to-end.
- Whether the OS actually opens `genoly.org` externally (Apple anti-steering compliance) vs. an embedded webview.

## Remediation addendum (same day)

F1 and F2 were remediated in PR #34 (`feat/authgate-hardening`, stacked on #32): a render-level hold (`isAuthenticated && hasProAccess === null` → splash, app tree never mounts) closes the F1 mount-before-redirect window, and the downgrade grace deadline is now anchored once at detection (`computeDowngradeDeadline` / `getGraceRemainingMs` in `lib/planChecks.ts`, +8 unit tests) so navigation can no longer extend it. F3 remains accepted-by-design. Reviewed by orchestrator; simulator confirmation items unchanged.
