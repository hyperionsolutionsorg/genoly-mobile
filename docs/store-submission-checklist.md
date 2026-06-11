# Store submission checklist — Genoly mobile

> **For the operator (Shankar).** Step-by-step from credentials-in-hand to
> first review submission, both stores. Everything code-side is already in
> place; this document is the part only you can do. Written 2026-06-11
> (mobile e2e run, wave J). `eas submit` is operator-only by policy.

## 0. Current state (what's already done)

- `app.json`: name **Genoly**, slug `genoly-mobile`, version 0.1.0, scheme `genoly`, bundle id / package **`org.hyperionsolutions.genoly`** (iOS + Android), portrait-only, iOS deploymentTarget 16.4 + `UIBackgroundModes [fetch, processing]`, Android `RECEIVE_BOOT_COMPLETED`, adaptive icon configured.
- Assets: `apps/mobile/assets/images/icon.png` + `splash-icon.png` + `adaptive-icon.png` (1024×1024 Genoly branding) + favicon.
- Permission strings: HealthKit usage strings live in the `react-native-health` plugin block of app.json; photo library + camera strings in the `expo-image-picker` block. Health Connect via `react-native-health-connect` plugin.
- `eas.json`: `development` (dev client, iOS simulator, APK), `preview` (internal APK), `production` (auto-increment, Android app-bundle). EAS account `@hyperionsolutionsorg` (Hobby).
- CI: every push to main triggers the Android preview build workflow (`.github/workflows/build-android.yml`) — green as of 2026-06-11.
- **Pending operator decisions (unchanged):** `extra.convexProdBaseUrl` + `extra.convexProdCloudUrl` are placeholders — set BOTH to the prod deployment before any production build. Store metadata drafts: `vault/store-metadata.md`.

## 1. Apple (App Store)

### 1a. Enrollment + identity
- [ ] Enroll Hyperion Solutions LLC in the Apple Developer Program ($99/yr) — enroll as the LLC (needs the D-U-N-S number), NOT as an individual, so the seller name reads "Hyperion Solutions LLC".
- [ ] In developer.apple.com → Certificates, IDs & Profiles → Identifiers: register App ID `org.hyperionsolutions.genoly` with capabilities **HealthKit** + Background Modes.
- [ ] Let EAS manage signing (recommended): `eas credentials` → iOS → production → let Expo create the distribution cert + provisioning profile. No manual p12 juggling.

### 1b. App Store Connect record
- [ ] appstoreconnect.apple.com → My Apps → New App: platform iOS, name **Genoly**, primary language en-US, bundle ID `org.hyperionsolutions.genoly`, SKU `genoly-mobile`.
- [ ] App Information: category **Lifestyle** (secondary: Health & Fitness), content rights, age rating questionnaire (see `vault/store-metadata.md` — expect 4+).
- [ ] **Privacy nutrition labels** (App Privacy section) — declare truthfully per `vault/store-metadata.md §Privacy`: Health & Fitness data (steps) linked to identity, used for app functionality only, NOT used for tracking; contact info (email), user content (photos, messages).
- [ ] Privacy policy URL: `https://genoly.org/privacy`. Support URL: `https://genoly.org/support`.

### 1c. Build + TestFlight
- [ ] Set prod URLs in `app.json > extra` (convexProdBaseUrl + convexProdCloudUrl) — commit via PR.
- [ ] `cd apps/mobile && eas build --platform ios --profile production`
- [ ] `eas submit --platform ios` (or upload via Transporter).
- [ ] TestFlight → add yourself + family as internal testers; verify: sign-in, signup, welcome wizard, dashboard, tree browse, photo upload, **HealthKit permission flow on a real iPhone**, walking challenge create/join/sync, theme switch, sign-out.
- [ ] Export compliance: app uses only standard HTTPS/ATS encryption → answer "standard encryption, exempt" (set `ITSAppUsesNonExemptEncryption=false` in app.json infoPlist to skip the prompt — one-line PR).

### 1d. Review notes
- [ ] Provide a demo login in App Review notes: `demo-admin@genoly.org` / the demo password (see web `convex/lib/demoUsers.ts`) — the demo tree resets nightly, perfect for review.
- [ ] Note for reviewer: subscriptions are intentionally absent; the app is fully free (payment-neutral); "Manage subscription" links out per the anti-steering-compliant pattern (reader-app style acknowledgment, no purchase prompt).

## 2. Google (Play Store)

### 2a. Account + record
- [ ] Create a Google Play Console developer account for Hyperion Solutions LLC ($25 one-time). Organization account → needs the LLC's D-U-N-S/verification.
- [ ] Create app: name **Genoly**, default language en-US, app (not game), free.
- [ ] Store listing from `vault/store-metadata.md` (short + full description, screenshots, feature graphic 1024×500 — needs creating).

### 2b. Declarations
- [ ] **Data safety form**: collects email + name (account), photos (user content), health data (steps — used for app functionality, not shared with third parties, encrypted in transit, deletable via account deletion).
- [ ] **Health Connect**: Play Console → App content → Health apps declaration. The app reads steps/active-calories/distance via Health Connect for family walking challenges. Health Connect permissions are declared by the `react-native-health-connect` plugin in the manifest.
- [ ] Content rating questionnaire (IARC) — expect Everyone.
- [ ] Opt in to the **pre-launch report** (App content → Pre-launch report) — free device-lab smoke pass.

### 2c. Build + tracks
- [ ] `eas build --platform android --profile production` (app-bundle).
- [ ] `eas submit --platform android` after linking a service-account JSON (Play Console → API access; EAS docs walk through it), or upload the .aab manually the first time (Play requires a manual first upload).
- [ ] Internal testing track first → add testers by email → same verification list as TestFlight, plus: **Health Connect app installed** on the test device (Android 13 and earlier need the Health Connect app from Play).

## 3. Both stores — final gates

- [ ] Prod Convex deployment seeded + demo account verified working against prod (`keen-owl-415`).
- [ ] EMAIL_ALLOWLIST **must remain unset on prod** (memory rule) — signup verification emails must reach real users.
- [ ] Push notifications: NOT configured (scaffold only — `apps/mobile/lib/notifications.ts` logs in dev). Before enabling: APNs key (Apple) + FCM (Google) via `eas credentials`, install `expo-notifications`, swap the `deliver()` transport. Not a launch blocker — all current nudges are local-foreground only.
- [ ] Screenshots per device class (see `vault/store-metadata.md §Screenshots`).
- [ ] Versioning: bump `version` in app.json per release; Android versionCode auto-increments via the production profile.

## 4. After approval

- [ ] Swap the web "Get the app" CTA targets (PENDING_TASKS §16 in genoly-family-web) from genoly.org to the real store URLs.
- [ ] Add store badges to genoly.org landing + `/support`.
- [ ] Revisit `docs/fitness-api-contract.md` "Open questions for v2" — challenges shipped Genoly-side; the contract needed no changes.
