---
type: decision
name: "Member side rides the Convex reactive client + Convex Auth; fitness side stays on the HTTP bearer contract"
date_decided: 2026-06-11
status: active
tags: [mobile, architecture, auth, forkability, member-parity]
sources: ["[[mobile-phase-1-implementation]]", "co-hosted-architecture.md", "mobile-sync-architecture.md"]
---

# Member side = Convex reactive client + Convex Auth

**Definition:** The Genoly member experience on mobile (trees, persons, photos, chat, games, rewards, settings, walking challenges) talks to Convex via the official `convex` React client + `@convex-dev/auth` — the same public queries/mutations the web app uses. The fitness layer (health sync, friends, goals, devices) continues to use the 20-endpoint HTTP bearer-token contract unchanged.

## Why

1. **It's the original design.** `genoly-family-web/docs/co-hosted-architecture.md`'s stack diagram draws the unified mobile app with "Family Tab (Convex reactive)" and "Fitness Tab (HTTP API bearer)". This decision implements that diagram, it doesn't invent a new posture.
2. **Member parity over HTTP would be madness.** Mirroring ~90 backend modules / ~200 public functions as hand-rolled HTTP endpoints would bloat the sacred fitness contract (or spawn a second contract), forfeit reactivity, and re-implement the tenant firewall. The web's Convex functions already enforce `requireTreeViewer` + role gates server-side.
3. **Verified feasible.** `@convex-dev/auth` 0.0.91's `ConvexAuthProvider` accepts a pluggable `TokenStorage` (official React Native support) — backed here by expo-secure-store. Password provider flows (sign-in/up, OTP reset, email verify) are non-redirect and work from RN. MFA challenge is an app-level mutation (`verifyMfaForSession`), not a transport concern.
4. **Forkability is strengthened, not weakened.** The fitness contract needs zero changes for this mission (see [[2026-06-11-walking-challenges-schema-placement]]). Mobile keeps zero direct access to `fitness_*` tables.

## Consequences

- New deps in `apps/mobile`: `convex`, `@convex-dev/auth` (both MIT, already pinned in the web repo).
- **Two sessions coexist on device:** Convex Auth JWT (member) + fitness bearer token (health sync). Login screen performs both (Convex Auth `signIn` then `issueToken`); sign-out tears down both (Convex Auth signOut + `revokeToken` + queue wipe + prefs reset). Fitness-token failure must NOT kill the member session and vice versa — degrade per-layer.
- Bearer-token storage rules (AGENTS.md §3.4) extend to the Convex Auth tokens: secure-store only, namespaced keys.
- Bandwidth diet applies to every member-side `useQuery` (Convex dev at 141% Free cap): prefer cached tables, paginate, one subscription per screen, no polling.

## Rejected alternatives

- **Extend the fitness HTTP contract with member endpoints** — breaks product boundaries (genealogy ≠ fitness), bloats the fork seam, loses reactivity.
- **A second Genoly-specific HTTP contract** — all the cost of the above with none of the reuse; Convex Auth would still be needed for credential validation.

## Cross-references

- [[2026-06-11-walking-challenges-schema-placement]], [[2026-06-11-mobile-styling-approach]]
- Web rule honored: invite links use `?invite=` (Convex Auth reserves `?code=`).
