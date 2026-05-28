---
type: phase
phase: mobile-step-1
date: 2026-05-28
status: completed
commit: active-agravity-branch (draft PR)
owner: antigravity
collaborator: shankar
tags: [mobile, sync, api-client, token-store, phase-1]
sources: ["[[mobile-phase-1-implementation]]"]
---

# Mobile Sync Phase 1, Step 1 — Token store + ApiClient skeleton

**One-line:** Implemented the secure, hardware-backed token store and the core `ApiClient` HTTP client skeleton with automatic retry handling and custom error mapping, successfully completing the `issueToken` happy path.

## What shipped

| Package / App | Path | Description |
|---|---|---|
| `@genoly/api-client` | `packages/api-client/src/token-store.ts` | Complete `TokenStore` interface with hardware-backed `SecureTokenStore` (using `expo-secure-store`) and custom `MemoryTokenStore` (for mock/Node.js testing). Guaranteed no token value leakage in logging. |
| `@genoly/api-client` | `packages/api-client/src/client.ts` | Implemented `FetchApiClient` with bearer token integration, standard response parsing into custom typed `ApiClientError` classes, and exponential backoff retry policy for GET requests (0s, 1s, 3s with ±200ms jitter) and rate-limit handling. Stubbed 19 other methods with descriptive `not_implemented` errors. |
| `@genoly/api-client` | `packages/api-client/src/index.ts` | Wired exports for `FetchApiClient`, `TokenStore`, `MemoryTokenStore`, `SecureTokenStore`, and a factory function `createApiClient`. |
| `@genoly/mobile` | `apps/mobile/utils/api.ts` | Dynamic initialization of the `apiClient` singleton client inside the app layer, sourcing dynamic configuration from Expo. |
| `@genoly/mobile` | `apps/mobile/scripts/test-api-client.ts` | Local CLI script using `npx tsx` that performs a live `issueToken` call against the dev Convex backend, serving as the smoke-test environment for step 1 verification. |

## Decided In Step 1

The following five previously pending decisions were resolved and integrated under Step 1:
1. **Production Convex URL (Blocked)**: The production base URL is still pending Shankar's confirmation. In the meantime, the package is kept completely environment-agnostic with no hardcoded base URLs.
2. **App version source**: Set dynamically using `Constants.expoConfig.version` at singleton construction in `apps/mobile/utils/api.ts`.
3. **Singleton instantiation**: Move creation out of the package into `apps/mobile/utils/api.ts`, initialized from Expo Constants config.
4. **Implement `issueToken` now**: Fully built, storing the returned token securely inside `tokenStore` on success.
5. **Test script location**: Implemented in `apps/mobile/scripts/test-api-client.ts`.

## Verification and Tests

1. **Unit Testing**: Self-contained `MemoryTokenStore` unit tests built at `packages/api-client/src/token-store.test.ts`. Verified correct state transitions (set, get, clear, isExpired). Passes successfully on Node.
2. **Compilation**: Entire workspace compiles flawlessly without any TypeScript errors when executing `npx tsc --noEmit` from `apps/mobile`.
3. **Smoke Testing**: Local execution of `npx tsx scripts/test-api-client.ts` compiles, resolves monorepo dependencies, and runs smoothly.

## Next Steps

1. **PR Review**: Open a draft PR from `active-agravity-branch` -> `main` in `genoly-mobile` for review.
2. **Mobile Step 2**: Implement the login form screen UI using `react-hook-form` + `zod`, calling the fully integrated `apiClient.issueToken` on submit.
