# Overnight questions — judgment calls + ambiguities

**Session:** 2026-05-29 autonomous Claude run (Steps 4 + 12 + 5 + 11 + 6 + DESIGN.md — three rounds)
**Status:** ANSWER REQUIRED before merging the overnight work, OR confirm-as-is + acknowledge as decided

Each item below is a place where the architecture doc was ambiguous OR I had to make a judgment call to keep moving. I list the decision I made AND the alternative, so you can override during morning review.

---

## Q1. Android library: `react-native-health-connect` vs `expo-health-connect`

**Architecture doc says:** `expo-health-connect` (in `genoly-family-web/docs/mobile-sync-architecture.md` §1)
**Existing health-sync package header says:** `react-native-health-connect`

**My decision:** `react-native-health-connect`. Reasons:
- The package-internal comment is more recent and more authoritative for the package layer
- `react-native-health-connect` has wider production adoption + more stable API surface
- The Expo SDK 54 module ecosystem is moving toward letting native bindings live outside the `expo-` scope when the third-party option is more mature
- Swap is local to one file (`HealthConnectAdapter.ts`) if you prefer `expo-health-connect`

**To override:** swap the `require('react-native-health-connect')` line in `HealthConnectAdapter.ts` and the corresponding `package.json` dependency. The adapter's outer surface (HealthAdapter interface) doesn't change.

---

## Q2. HealthMetric enum doesn't include ExerciseTime

**Your approved permission scope (2026-05-28):** Steps + ActiveEnergyBurned + Distance + ExerciseTime
**The existing `HealthMetric` enum:** `'steps' | 'caloriesActive' | 'caloriesBasal' | 'distanceMeters'`

**My decision:** Implemented 3 of 4 approved metrics (Steps, ActiveEnergyBurned, Distance). Dropped ExerciseTime because it doesn't have an enum slot. Adding it requires:
1. Update `@genoly/types` `HealthEntryUpload` to include an `exerciseMinutes` field
2. Update `HealthMetric` enum in `packages/health-sync/src/index.ts`
3. Update adapter mapping tables (HK: `AppleExerciseTime`, HC: `ExerciseSession.activeDuration`)
4. Server contract update in `genoly-family-web/docs/fitness-api-contract.md`

**To resolve:** decide if ExerciseTime is needed for Phase 1 launch. If yes, that's a separate small PR after Step 4+12 merges. If no, defer until Phase 2.

---

## Q3. `__DEV__` global in Jest environment

**Concern:** I used `typeof __DEV__ !== 'undefined' && __DEV__` guards before `console.warn` calls in the adapters. In Jest, `__DEV__` may not be defined, so these `console.warn` calls won't fire — which is fine. But if you want test-time visibility into the adapter's silent-fail paths, add to `apps/mobile/jest.config.js`:

```js
globals: { __DEV__: true }
```

Not a blocker. Tests still pass either way (the warns are diagnostic, not assertional).

---

## Q4. iOS HealthKit per-metric permission verification

**Apple's design:** the HealthKit permission dialog doesn't tell the app which metrics the user granted vs denied (privacy-by-obscurity).

**My implementation:** the adapter trusts the dialog return — if `initHealthKit` succeeds, I treat all REQUESTED metrics as granted.

**Risk:** if the user grants Steps but denies Distance, my code thinks both are granted. The read for Distance will return empty (HealthKit returns no data), which the UI handles correctly. So the failure mode is "leaderboard shows 0 distance even though user has walked" — quiet rather than loud.

**Fix later:** in Phase 1.5, add a per-metric verification step that does a tiny range read for each requested metric and treats empty results as "probably not granted." Defer.

---

## Q5. Permissions screen visual design

**Issue:** the mobile app has no DESIGN.md or theme system yet. I inlined colors using the same palette as the web's light-theme tokens (`#0066ff` primary, `#6b7280` muted, `#f9fafb` surface).

**Round 3 resolution:** **RESOLVED in Round 3.** Mobile `DESIGN.md` now exists at the repo root. It documents the inlined palette (matching what I used) as the de-facto standard and calls out the eventual `theme/colors.ts` migration as a §10 future item. Next mobile UI work (Steps 7-10) anchors to this file.

---

## Q6. Logout flow (where to wire `revokeToken`)

**What I did:** Implemented `revokeToken` in the ApiClient (one of the four newly-unstubbed methods). It POSTs to `/api/fitness/auth/revoke` AND clears the local tokenStore.

**Round 3 resolution:** **RESOLVED in Round 3.** Settings screen at `apps/mobile/app/(tabs)/settings.tsx` now has the Sign-out button. Flow: native `Alert.alert` confirm → `apiClient.revokeToken({ scope: 'this_device' })` (with `tokenStore.clearToken()` fallback on error) → reset permission prefs → `unregisterBackgroundSync()` → `router.replace('/(auth)/login')`. 8-test Jest suite covers happy-path + cancel + fail-closed.

---

## Q7. Step 5 deferred (originally approved as stretch)

**Your approval:** "Yes — stretch into Step 5 if Step 4+12 is clean"

**Round 2 resolution:** **RESOLVED in Round 2.** After Shankar's "Steps 4+12+5" green-light during the session, Step 5 was added: new `@genoly/sync-queue` package with SQLite-backed outbox + drainer + retry classifier + dead-letter logic + 16-test Jest suite.

---

## Q8. Background-fetch task body single drain vs loop

**Issue (Round 3):** the `runBackgroundSyncTask()` body calls `SyncQueue.drain()` exactly once per wake-up. It does NOT loop until the queue is empty.

**My decision:** single drain per wake. Reasons:
- iOS background-fetch is capped at ~30 seconds. A loop that hits a slow network kills the task before the next wake.
- One batch of up to BATCH_SIZE=50 rows is sufficient for typical use (a user produces maybe 1 row per day at the day boundary).
- The foreground drainer (future Step 7+) will drain to empty when the user opens the app.

**Risk:** if 50+ rows queue up between wake-ups, depth grows. Recovers naturally on next wake.

**To override:** wrap the body in a `while (queueDepth > 0) drain()` loop with a hard timeout. Not recommended.

---

## Q9. Mobile `theme/colors.ts` not yet created

**Issue (Round 3):** the Settings screen + permissions screen + login screen still use inlined hex literals. The `DESIGN.md` calls out the migration but doesn't execute it.

**My decision:** defer to a future PR. Migration is mechanical (replace `'#0066ff'` with `theme.light.primary` etc.) but should land in one PR with a `theme/` module created. Doing it in pieces creates churn.

**To override:** start the theme module now. ~20 lines of code, no architecture work needed; just lifts the hex values into a typed exported object.

---

## Q10. Background sync register/unregister symmetry

**Issue (Round 3):** I wire `registerBackgroundSync()` in the permissions screen on grant. I wire `unregisterBackgroundSync()` in Settings on sign-out. But there's NO wiring on:
- Settings → "Manage permissions" → user revokes via OS / re-enters and skips. The bg-sync stays registered. The task body's `getHealthSyncEnabled()` check prevents actual drains, so this is safe but not optimal.
- Cold-start re-register (in case the OS unregistered after a long quiet period).

**To override:** add `registerBackgroundSync()` to `_layout.tsx` cold-start (gated on healthSyncEnabled=true). Minor change. Deferred because it's better verified with a real device.

---

## Summary

Every decision above is reversible. The default I picked is documented inline in code comments where relevant. Morning review = read the phase page (`memory-bank/wiki/phases/2026-05-29-mobile-step-4-12-overnight.md`) + this file + decide which (if any) defaults to flip.
