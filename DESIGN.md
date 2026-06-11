# Genoly Mobile — Design System (DESIGN.md)

> **For AI agents and humans building UI for the Genoly mobile app.** Drop this into
> context when generating new screens or components. Companion to
> [`AGENTS.md`](./AGENTS.md) (which is about *how* to build) — this file is about *how
> it should look and feel*. Created 2026-05-29.
>
> Format mirrors [`genoly-family-web/DESIGN.md`](../genoly-family-web/DESIGN.md) (Stitch
> spec) with React-Native-specific extensions. Where the two diverge, this file wins
> for mobile work; consult the web file for the brand-level reference.

---

## 1. Visual Theme & Atmosphere

The Genoly mobile app is the **daily-touch companion** to the web product: the member-side family experience (dashboard, tree, photos, games, walking challenges) plus passive health-data sync. The web remains the place for heavy work (tree editing depth, admin, billing). Mobile is **delightful, daily, social, healthy** — lightweight screens, fast glances, family warmth.

Visual language matches the web app's "warm, considered, human" mood, but adapted to native conventions:

- **Native primitives over custom widgets.** Use `TouchableOpacity` / `Pressable`, system fonts, native `Alert.alert()` for confirmations. Avoid recreating the web's CSS modal pattern on mobile — the platform already has one.
- **Three themes, one module.** Light / Dark / Classic mirror the web's themes via `apps/mobile/theme/` (see §2). `system` preference follows the OS light/dark setting.
- **Reachable buttons.** Primary CTAs sit in the bottom half of the screen where the thumb naturally rests. Don't put a "Sign out" button at the top of a long scroll view.
- **No splashy animations.** The mobile app should feel quick and predictable. Use the native spring animations from React Navigation; don't add custom transitions on top.

**Tone in copy:** sentence case, direct, warm but not cute. Matches the web app: "Wrong email or password. Try again." not "Whoops! That didn't work!"

**Payment-neutral copy:** mobile is the free app; subscription is web-only (Apple/Google anti-steering compliance). Any reference to billing routes the user to genoly.org with no in-app upsell language.

---

## 2. Color Palette & Roles

### Current state (since C1 foundation, 2026-06-11)

The palette lives in **`apps/mobile/theme/colors.ts`** as three complete semantic palettes (light / dark / classic), surfaced through `ThemeProvider` + `useTheme()` + `useThemedStyles()` in `apps/mobile/theme/`. **Do not inline hex literals in screens** — consume tokens:

```ts
import { useThemedStyles, type Theme } from '../../theme';

const styles = useThemedStyles(createStyles);   // inside the component

function createStyles(t: Theme) {               // module scope
  return StyleSheet.create({
    container: { backgroundColor: t.colors.bg, padding: t.spacing.xl },
  });
}
```

Theme selection is a Settings → Appearance chip row (`System / Light / Dark / Classic`), persisted via `utils/preferences.ts` (`genoly.themePreference`). `system` follows the OS light/dark setting. Classic mirrors the web's heirloom serif theme — `theme/typography.ts` swaps body + titles onto the platform serif (Georgia / serif).

`__tests__/theme.test.ts` enforces token completeness + WCAG AA contrast for the load-bearing pairs on every palette. **Do not introduce new colors** — pick the closest token; if a token is genuinely missing, add it to all three palettes + the test.

### Light palette (default)

| Token | Hex | Role |
|---|---|---|
| `primary` | `#0066ff` | Primary action — filled buttons, links, focus accents |
| `primaryHover` | `#0052cc` | Pressed state on primary buttons (use `activeOpacity={0.85}` instead in most cases) |
| `onPrimary` | `#ffffff` | Text/icon ON primary surfaces — never hardcode `#fff` |
| `bg` | `#fefefe` | Screen background (one tick off white to reduce LCD glare) |
| `surface` | `#f9fafb` | Card / section background — the "raised" layer |
| `surfaceMuted` | `#f3f4f6` | De-emphasized blocks: skeletons, disabled chips, bar tracks |
| `bgElevated` | `#ffffff` | Floating overlays: toasts, secondary buttons, tab bar |
| `text` | `#111827` | Default body text |
| `textMuted` | `#6b7280` | Secondary text, hints, breadcrumb separators |
| `border` | `#e5e7eb` | Hairline borders, dividers, input outlines |
| `danger` | `#dc2626` | Sign out button, error text, destructive accents |
| `dangerSurface` | `#fef2f2` | Soft background behind error banners |
| `success` | `#15803d` | "Enabled", "Synced", positive status pills |
| `warning` | `#a16207` | "Disabled", "Pending grant", neutral-negative status |
| `info` | `#0369a1` | Informational accents |
| `link` | `#0066ff` | Inline links inside body text |

### Dark palette

Derived from the web `[data-theme="dark"]` tokens: bg `#0f172a`, surface `#1e293b`, surfaceMuted/bgElevated `#273449`, text `#f1f5f9`, textMuted `#94a3b8`, border `#334155`, primary `#60a5fa` with **onPrimary `#0f172a`** (dark slate on light blue — 7.02:1, per the web's 2026-06-10 semantic-token decision), danger `#f87171` on dangerSurface `#2d1414`, success `#34d399`, warning `#fbbf24`, info `#38bdf8`.

### Classic palette

Derived from the web `[data-theme="classic"]` heirloom tokens: warm parchment bg `#f5f0e8`, surface `#faf7f2`, surfaceMuted `#ede4d3`, bgElevated `#fffdf8`, sepia text `#3c2a1a` / muted `#7a6652`, border `#d4c5aa`, leather primary `#8b5e3c` (onPrimary `#ffffff`), danger `#a83232`, success `#556b2f`, warning `#92400e`, info `#31597c`. Typography swaps to the platform serif (see §3).

### Gender accents (constants, theme-independent)

These do NOT change with theme. They map to enum values — switching colors would change meaning.

| Hex | Role |
|---|---|
| `#3b82f6` | **Male** accent — for any person card UI on the leaderboard / friends screens |
| `#ec4899` | **Female** accent |

### Migration note

When you add a new screen, prefer inlining from this table over inventing a new shade. When the `theme/colors.ts` module lands, every screen will be migrated in one PR — your inlined value will become `theme.light.primary` etc. Picking from the table now keeps that migration mechanical.

---

## 3. Typography Rules

### Font stack

System fonts only. No custom font files. Native rendering pipeline + Expo's `useFonts` is reserved for special purposes (the existing `SpaceMono` font is loaded for a future code-display use case, not body text).

- **iOS:** San Francisco (system default)
- **Android:** Roboto (system default)
- **Web preview:** browser default sans

In `StyleSheet.create()`, do not specify `fontFamily` — let the system default apply. The one case where you specify is the (future) monospace badge: `fontFamily: 'SpaceMono'`.

### Hierarchy

React Native uses unitless font sizes (no `rem`). Treat the numbers below as the absolute scale.

| Role | Size | Weight | Use |
|---|---|---|---|
| Screen title | `28` | `'600'` | Page title — Login, Settings, Permissions ("Settings", "Connect your health data") |
| Section header | `12` | `'600'` + uppercase + `letterSpacing: 1` | Settings section labels ("ACCOUNT", "HEALTH SYNC") |
| Row label | `15` | `'500'` | Setting row labels ("Email", "Status") |
| Body | `15` | `'400'` | Default body text inside cards / sections |
| Subtitle | `16` | `'400'` | One-line subtitle below a screen title, color `textMuted` |
| Card title | `16` | `'600'` | Person card name, metric label on permissions screen |
| Card description | `14` | `'400'` | Helper text in cards, body in permissions metric rows |
| Button label | `15–16` | `'500–600'` | All button text; primary action gets `'600'`, secondary `'500'` |
| Form input | `15` | `'400'` | TextInput default size — matches body |
| Helper / error | `12` | `'400'` | Validation messages, fine print |
| Legal footer | `11` | `'400'` + `opacity: 0.55` | The Hyperion Solutions disclosure at the bottom of Settings |

**Line height:** RN does not inherit a default. Set `lineHeight` on any text block of more than one line. Rule of thumb: body and subtitle get `lineHeight: 20–22` (≈ `1.4× fontSize`); body inside paragraphs of legal copy gets `lineHeight: 16–18`.

**Don't use `fontStyle: 'italic'`** unless quoting a third party. Italic is hard to read on small screens and not in our design language.

---

## 4. Component Stylings

Patterns documented here exist in the codebase. When adding a new screen, copy the closest existing screen's styles and adjust — don't write from scratch.

### Buttons

Three variants. **Always use `TouchableOpacity`** with `accessibilityRole="button"` + `accessibilityLabel`. Don't use `Pressable` unless you need press-state custom rendering — `TouchableOpacity` gives the native dim-on-press feedback for free.

| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| **Primary** | `primary` (`#0066ff`) | `#fff` | none | Save, Continue, Grant access, Log in |
| **Secondary** | `#ffffff` | `text` (`#111827`) | `border` (`#e5e7eb`) | Cancel, Manage permissions, Maybe later |
| **Destructive** | `error` (`#dc2626`) | `#fff` | none | Sign out, Delete |
| **Plain link** | transparent | `link` (`#0066ff`) | none | "Forgot password?", "View privacy policy" |

**Canonical shape:**

```ts
button: {
  borderRadius: 8,
  paddingVertical: 12,
  alignItems: 'center',
  // primary
  backgroundColor: '#0066ff',
}
buttonText: {
  color: '#fff',
  fontSize: 16,
  fontWeight: '600',
}
```

When the button is processing async work, show an `ActivityIndicator` **inside** the button (not next to it). Disable the button via the `disabled` prop and dim with `opacity: 0.7`. Existing pattern: see `apps/mobile/app/(auth)/login.tsx` and `apps/mobile/app/(tabs)/settings.tsx`.

### Form inputs

```ts
input: {
  borderWidth: 1,
  borderColor: '#ccc',          // intentionally lighter than --color-border
  borderRadius: 8,
  padding: 12,
  marginBottom: 8,
  fontSize: 15,
}
```

**Always wire with `react-hook-form` + `zod`** via the `Controller` component. Never use bare `setValue` + `value` props. Existing pattern: `apps/mobile/app/(auth)/login.tsx`. Validation errors render under the field in `error` (`#d00`) at `fontSize: 12`.

### Cards / sections

The two patterns in current use:

**Metric-row card** (permissions screen):
```ts
metricRow: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  paddingVertical: 12,
  paddingHorizontal: 16,
  backgroundColor: '#f9fafb',
  borderRadius: 8,
  marginBottom: 8,
}
```

**Settings section** (settings screen):
```ts
sectionBody: {
  backgroundColor: '#f9fafb',
  borderRadius: 12,                // slightly larger radius for grouped content
  padding: 16,
}
```

Both sit on `bg` and lift to `surface`. **Don't add `shadowOffset` / `elevation` to in-flow cards** — the contrast against the page background already separates them. Reserve elevation for floating UI (see §6).

### Section headers

Above each grouped section, render an uppercase letterspaced label:

```ts
sectionTitle: {
  fontSize: 12,
  fontWeight: '600',
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: '#6b7280',
  marginBottom: 8,
}
```

This matches iOS Settings convention. Don't use a divider line between the label and the section body — the radius + background change is enough visual separation.

### Confirmations (native dialog, not custom modal)

The web app uses a custom React modal (the F-009 `confirm()` helper). **Mobile uses `Alert.alert()` from React Native** — native dialogs are platform-correct, accessible, and free.

```ts
Alert.alert(
  'Sign out',                          // title — short
  "You'll need to sign in again to see your data.",  // body — one sentence
  [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: performSignOut },
  ],
  { cancelable: true },
);
```

**Rules:**
- Destructive action gets `style: 'destructive'` (red on iOS, normal on Android).
- Cancel gets `style: 'cancel'` (last button on iOS, first on Android — system handles ordering).
- Don't add a third "Maybe later" or similar button. Native dialogs are two-choice; if you need three, you need a screen, not a dialog.
- Title is a short noun phrase ("Sign out"), not a verb command ("Are you sure?").

### Screen layout

Every screen sits inside a `ScrollView` with this base shape (unless it's a fixed-layout form like Login):

```ts
container: {
  flexGrow: 1,
  padding: 24,
  backgroundColor: '#fefefe',
}
```

Screen title at the top, `marginTop: 8, marginBottom: 24`. Sections stacked vertically with `marginBottom: 32` between them. Legal footer (if any) at the bottom with `marginTop: 8`.

For form screens (Login), use `padding: 24` and `justifyContent: 'center'` so the form floats vertically — keyboard pushes the screen up nicely.

---

## 5. Layout Principles

### Spacing scale

Use these absolute numbers in `StyleSheet.create()`. Don't invent intermediate values.

```
4    // tight icon-text gap
8    // default gap inside small containers, button-to-button gap
12   // metric row padding, input padding, button vertical padding
16   // section body padding, card padding
24   // screen padding, screen title bottom margin
32   // gap between major sections
```

If you reach for a number not on this scale (e.g. `10`, `20`), step back — you almost certainly want `8`, `12`, `16`, or `24`.

### Flex over absolute positioning

Always use Flexbox layout primitives. The only acceptable use of `position: 'absolute'` is for overlays (already covered by `Modal`) and the rare "pin a badge to a corner" pattern.

**Two canonical layouts:**

- **Vertical stack:** default `flexDirection: 'column'`. Stack children with `marginBottom` (not `gap`, which has had patchy support across Expo SDK versions). Existing pattern: all screens.
- **Row with label + value:** `flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'`. Used for setting rows.

For a grid of cards in a future leaderboard screen, use `FlatList` with `numColumns={2}` and `columnWrapperStyle: { gap: 12 }`. Don't try to recreate CSS Grid manually.

### Safe area

Wrap any screen that renders to the edges in `SafeAreaView` from `react-native-safe-area-context`. Currently the auth screens and tabs use Expo Router's automatic safe-area handling — don't add a redundant `SafeAreaView` inside a route that's already a `Stack.Screen`.

**Test on a notched device** (iPhone 14 Pro and up) before saying "looks good." A screen that's fine on a Pixel 6 may have a button under the dynamic island on iOS.

### Touch targets

Minimum 44×44 pt for any tappable element (Apple HIG; also a Google accessibility guideline). Verify by reading the rendered button's height in dev tools — buttons with `paddingVertical: 12` + `fontSize: 16` reach ~44 pt naturally; smaller buttons may need explicit `minHeight: 44`.

Never wrap a one-line text in `TouchableOpacity` without padding. Tapping a 16 pt-high "Forgot password?" link is frustrating.

### Density

Mobile defaults to **less dense** than web. Padding is 24 vs 16 on screen edges. Type sizes are larger (15+ vs 14+) because phones are read at arm's length, not at desk distance. Don't try to cram dashboard density onto a phone — pages should breathe.

---

## 6. Depth & Elevation

React Native has two distinct shadow APIs:
- **iOS**: `shadowColor` + `shadowOffset` + `shadowOpacity` + `shadowRadius` (CoreGraphics-style)
- **Android**: `elevation` (Material elevation in dp)

When applying a shadow, **specify both** in the same style block. If you only set iOS shadow props, Android renders no shadow at all.

### Depth layers

| Layer | Background | Shadow | Examples |
|---|---|---|---|
| 0 — Page | `bg` (`#fefefe`) | none | Screen background |
| 1 — Surface (in-flow) | `surface` (`#f9fafb`) | none | Cards, sections, metric rows |
| 2 — Surface (floating) | `surface` (`#f9fafb`) | small | Bottom-sheet handle, dropdown menus (future) |
| 3 — Modal / dialog | `surface` | large | Native `Alert.alert` (handles its own shadow) |

We don't actually render layer 2 yet — no dropdowns in Phase 1. When you do, use this:

```ts
floating: {
  backgroundColor: '#f9fafb',
  borderRadius: 12,
  // iOS
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.12,
  shadowRadius: 12,
  // Android
  elevation: 6,
}
```

### Press states

- **TouchableOpacity** handles itself via `activeOpacity`. Default is `0.2` (too dim); the cleaner value is `0.85` for primary buttons, `0.7` for secondary, `0.9` for plain links.
- **Don't** add a `transform: scale()` press effect. The native opacity dim is enough; scaling looks jittery on Android.

### No web-style hover

Mobile has no hover. Don't port hover transitions from the web. If a card needs to indicate it's pressable, give it a 1px border or a small chevron (`›`) on the right rather than relying on hover-to-discover affordance.

---

## 7. Do's and Don'ts

### DO
- Use `TouchableOpacity` with `accessibilityRole="button"` and `accessibilityLabel` on every interactive element. Screen reader support is non-negotiable.
- Use `Alert.alert()` for confirmations — native dialogs are accessible and platform-correct.
- Use `react-hook-form` + `zod` + `Controller` for any form (login, future settings forms).
- Use `expo-router` route strings (`'/(tabs)'`, `'/(auth)/login'`) and cast through `Href` at module scope when the generator misses a route. Pattern: `const LOGIN_ROUTE = '/(auth)/login' as unknown as Href;`.
- Use `SecureStore` for bearer tokens (already wrapped in `tokenStore` from `utils/api.ts`). Use `AsyncStorage` only for non-sensitive prefs (already wrapped in `utils/preferences.ts`).
- Use the defensive-native-module-loading pattern when adding new native deps — wrap `require('the-module')` in a try/catch and fall back to an in-memory or no-op shim so the file imports cleanly from Node tests.
- Use sentence case in all copy. "Sign out", not "Sign Out".
- Use the spacing scale (§5) and the color palette (§2). Don't invent values.
- Test on iOS simulator AND an Android emulator before saying the screen is done.
- Default `ScrollView` `contentContainerStyle: { flexGrow: 1 }` so a short page still uses the full vertical space.

### DON'T
- Don't recreate the web's custom modal pattern. Use `Alert.alert()`.
- Don't import `react-native` modules at the top of a `packages/*` file — that breaks Node tests and the forkability rule. Native module imports live in `apps/mobile/` only, with rare exceptions wrapped in lazy `require`.
- Don't use inline styles (`style={{ marginTop: 8 }}`) — go through `StyleSheet.create()`. Inline styles disable Reanimated's static analysis and the small perf hit adds up across a screen.
- Don't use `position: 'absolute'` for layout. It bites you on every device size you didn't test.
- Don't introduce a new color outside §2's palette. Pick the closest and reuse.
- Don't introduce a new font size outside §3's hierarchy. Pick the closest.
- Don't write Title Case headings. Sentence case throughout.
- Don't auto-dismiss confirm dialogs. Two explicit options, cancel + action.
- Don't push the user to subscribe inside the app. Subscription is web-only (anti-steering compliance). Settings links to `genoly.org/account` via `Linking.openURL`.
- Don't ship a screen without an `accessibilityLabel` on its primary action.
- Don't paste platform-specific code (`if (Platform.OS === 'ios')`) without a comment explaining what breaks on the other platform. We err on the side of code that runs identically on both.
- Don't hardcode the Convex base URL. Read it from `Constants.expoConfig?.extra?.convexBaseUrl` and throw at startup if missing. Pattern: see `utils/api.ts`.

---

## 8. Responsive & Platform Behavior

### Phone-first, tablet-tolerant

The app targets phones. Tablet support is "doesn't crash on iPad" — the layout will work because it's vertical-stack-based, but a 1024 pt-wide tablet looks like a stretched phone, not a tailored tablet UI. That's acceptable for Phase 1.

### Orientation

Portrait-only for Phase 1. The lock is set in `app.json` via `"orientation": "portrait"`. If you find yourself reaching for landscape support, surface it as a separate task — the friends/leaderboard screens haven't been designed for landscape and rotating them mid-flight will break alignment.

### Platform differences to be aware of

- **`Alert.alert` button order** differs between iOS and Android. iOS puts the cancel button on the right (so it's the rightmost click target), Android puts it on the left. RN handles this for you when you mark buttons with `style: 'cancel'`. Don't fight it.
- **Status bar:** iOS dark-on-light needs `StatusBar` with `barStyle="dark-content"`. Currently set globally via the root layout.
- **Back button:** Android hardware back is wired automatically by `expo-router`. Don't override unless you have a specific reason.
- **Pull-to-refresh:** not implemented yet. When the dashboard ships, use `<RefreshControl>` on the `ScrollView`.

### iOS-specific

- App Store anti-steering: the in-app **Subscription** section may not show prices, may not offer a way to subscribe, and must not link out to "manage subscription" without the user first tapping a button. The current Settings → "Manage on genoly.org" pattern satisfies this — don't change it.
- HealthKit permission strings live in `app.json` under the `react-native-health` config plugin. Edit there, not in the code.

### Android-specific

- Health Connect requires the Health Connect app to be installed on the device. The adapter handles this gracefully (`getSdkStatus() !== SDK_AVAILABLE` returns false from `isAvailable()`); the permissions screen falls back to "Health data unavailable" copy.
- Status bar color: Android needs explicit `StatusBar` `backgroundColor` for visual continuity. Currently uses the default.

---

## 9. Agent Prompt Guide

### Quick color reference

```
Primary blue     #0066ff   — buttons, links, focus
Page background  #fefefe   — screen bg
Section bg       #f9fafb   — cards, sections
Body text        #111827
Muted text       #6b7280   — secondary text, hints
Border           #e5e7eb   — input outlines, hairlines
Error red        #dc2626   — sign out, error text
Success green    #15803d   — "Enabled", positive status
Warning amber    #a16207   — "Disabled", neutral-negative
Male accent      #3b82f6   — gender-coded UI
Female accent    #ec4899
```

### Ready-to-use prompts

**For a new screen:**

> "Build a new screen at `apps/mobile/app/(tabs)/<name>.tsx`. Use a `ScrollView` with `contentContainerStyle: { flexGrow: 1, padding: 24, backgroundColor: '#fefefe' }`. Screen title at the top: `fontSize: 28, fontWeight: '600', marginTop: 8, marginBottom: 24`. Stack sections vertically with `marginBottom: 32` between them. Each section has an uppercase section title (`fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: '#6b7280', marginBottom: 8`) and a section body on `#f9fafb` with `borderRadius: 12, padding: 16`. Follow the existing pattern in `apps/mobile/app/(tabs)/settings.tsx`."

**For a new primary action:**

> "Add a primary action button. Use `TouchableOpacity` with `accessibilityRole='button'` and a descriptive `accessibilityLabel`. Style: `{ backgroundColor: '#0066ff', borderRadius: 8, paddingVertical: 12, alignItems: 'center' }`. Text inside: `{ color: '#fff', fontSize: 16, fontWeight: '600' }`. When the button is processing async work, render an `ActivityIndicator color='#fff'` inside it instead of the text and add `disabled={loading}` + a dimmed style with `opacity: 0.7`."

**For a destructive confirmation:**

> "Use `Alert.alert()` from React Native. Title: a short noun phrase ('Sign out', 'Delete account'). Body: one sentence explaining the consequence. Buttons: `[{ text: 'Cancel', style: 'cancel' }, { text: '<Action>', style: 'destructive', onPress: <handler> }]`. Pass `{ cancelable: true }` as the fourth arg. Don't build a custom modal — `Alert.alert` is native, accessible, and free."

**For a new form:**

> "Use `react-hook-form` with `zod` resolver. Each field uses `<Controller>` — never bare `setValue`. Inputs use `TextInput` with the existing input style (border, radius 8, padding 12, fontSize 15). Show validation errors directly under each field in `{ color: '#d00', fontSize: 12, marginBottom: 4 }`. Submit button is primary; disable during submission with an `ActivityIndicator` inside. Pattern: see `apps/mobile/app/(auth)/login.tsx`."

**For a new background task:**

> "Add it as a separate function in `apps/mobile/utils/<name>.ts`. Define the task with `TaskManager.defineTask()` at module load (idempotent via a module-scope flag). Provide a `register*()` / `unregister*()` pair. Inside the task body, ALWAYS re-check user-intent prefs (e.g. `getHealthSyncEnabled()`) at the top — don't rely on unregistering to fully remove pending wake-ups. Defensive native-module loading: wrap `require()` in try/catch. Pattern: see `apps/mobile/utils/backgroundSync.ts`."

**For a new bearer-token-protected API call:**

> "Use `apiClient` from `apps/mobile/utils/api.ts`. The client handles bearer-token attachment, expiration, and retries (GET only). Errors come back as `ApiClientError` instances with `.code` (semantic error code) and `.status` (HTTP). Map known codes to friendly messages — pattern: see `mapLoginError` in `apps/mobile/app/(auth)/login.tsx`."

**For a new permission-gated feature:**

> "Read the pref via `getHealthSyncEnabled()` from `utils/preferences.ts` on screen mount. Render a disabled-but-visible state if the pref is false, with a 'Manage permissions' button that routes to `/(auth)/permissions` via `router.push(PERMISSIONS_ROUTE)`. Don't crash or render nothing — the user should always be able to find their way to the permission grant UI."

### When in doubt

- **Read `apps/mobile/app/(tabs)/settings.tsx` and `apps/mobile/app/(auth)/permissions.tsx`** — these are the canonical Phase 1 mobile UI patterns. Match their style language.
- **Read the corresponding section in `genoly-family-web/DESIGN.md`.** The brand language is the same; only the implementation primitives differ.
- **Check `apps/mobile/utils/api.ts`, `utils/preferences.ts`, `utils/backgroundSync.ts`** — the utility patterns are deliberate (defensive native-module loading, lazy require, in-memory shims for tests). Reuse them.
- **Don't introduce new patterns without checking.** Genoly Mobile aims for a tight, consistent surface — every screen should feel like the same person wrote it.

---

## 10. Open / future items

These are explicitly NOT covered yet. Surface a separate task before building them.

- ~~**Dark mode palette.**~~ DONE 2026-06-11 (C1 foundation) — `theme/colors.ts` locks dark + classic; Settings → Appearance picks the theme.
- ~~**Centralized `theme/colors.ts` module.**~~ DONE 2026-06-11 (C1 foundation) — all screens migrated; new screens must consume tokens.
- **Tablet / landscape layouts.** Out of scope for Phase 1.
- **Custom fonts.** SpaceMono is loaded but not used in body text. If a future spec calls for serif heirloom typography (matching the web's classic theme), surface as a task — don't import a third-party font in a content PR.
- **Pull-to-refresh.** Add when the dashboard screen ships.
- **Animations.** Reanimated is installed but the only animation in Phase 1 is the splash-screen hide. Don't add custom animations without an explicit ask.
- **Localization.** Copy is English-only. No `i18n` library yet — when one lands, it should wrap every literal string in this app.

---

## Companion files

- [`AGENTS.md`](./AGENTS.md) — how to build the mobile project (rules, tools, workflows)
- [`memory-bank/wiki/current/active-context.md`](./memory-bank/wiki/current/active-context.md) — what's currently being worked on
- [`../genoly-family-web/DESIGN.md`](../genoly-family-web/DESIGN.md) — the brand-level design system (the source-of-truth for color + typography decisions; this file specializes those for React Native)
- [`../genoly-family-web/docs/mobile-sync-architecture.md`](../genoly-family-web/docs/mobile-sync-architecture.md) — the 13-step Phase 1 architecture

**Last updated:** 2026-06-11 (C1 foundation: theme module with light/dark/classic palettes, `components/ui/` kit — Button / Screen / Section / Card / TextField / Banner / EmptyState / Toast / Skeleton, member-app 5-tab navigation). Bump this when meaningful design decisions land — introducing a new component pattern, retiring an old one, etc.
