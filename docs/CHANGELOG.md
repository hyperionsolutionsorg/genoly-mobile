# Changelog — Genoly Mobile

All notable changes to the Genoly mobile app will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-06-27

### Added — initial public release

#### Authentication
- Convex Auth (email + password) with MFA support
- Dual-session model: member session (Convex Auth JWT) + fitness bearer token (health sync only)
- Cold-start auth gate: splash held until session resolves, then routed to login / permissions / home
- Pro-plan gate: mobile access requires at least one Pro-plan tenant; non-Pro users see the paywall screen

#### Navigation
- 5-tab navigation: Home / Tree / Challenges / Activity / Settings
- Light, Dark, and Classic (serif/ancient) theming with system-mode support
- Expo Router with typed routes (SDK 56)

#### Home Dashboard
- Contribution streak (🔥) and visit streak (👋) display
- Today's Pick — rotating daily family game (deterministic day-of-year algorithm, web parity)
- Top-3 leaderboard widget
- Upcoming anniversaries (birthdays, marriages, memorials)
- First-run welcome wizard with autosave

#### Tree Essentials
- Person search across the full tree
- Person directory and individual profiles
- Edit / add person, add events, photo upload to Cloudflare R2
- Add-person flow with relationship picker

#### Family Walking Challenges
- Hub, creation, and detail screens
- HealthKit (iOS) + Health Connect (Android) step sync with privacy toggle
- Live leaderboards and team progress

#### Activity
- Daily step count, distance, active calories sourced from HealthKit / Health Connect
- Opt-in with full revoke support from Settings

#### Settings
- Account: email display + sign-out (fails closed: server revoke → local clear)
- Security: MFA enrollment and verification
- Health sync: enabled / disabled toggle + manage permissions
- Appearance: theme picker (System / Light / Dark / Classic)
- Notifications: challenge nudges with quiet-hours enforcement (10pm–7am)
- Support: KB search + 38 articles + contact form
- Subscription disclosure (payment-neutral; billing on genoly.org)
- About: version 1.0.0 (build 1)

#### Plan Gate
- Paywall screen for Free/Starter users with "Upgrade your tree" and "Continue on web" CTAs
- Reactive downgrade detection: 5-minute grace banner before hard redirect if a Pro tenant downgrades mid-session

#### Version System
- `app.json` version bumped to 1.0.0 (iOS buildNumber 1, Android versionCode 100)
- `constants/version.ts` constant (VERSION, BUILD_NUMBER)
- Version displayed in Settings → About

---

## Future versioning guide

| Type | When to bump | Example |
|------|-------------|---------|
| **PATCH** `1.0.x` | Bug fixes, crash fixes, minor copy tweaks | Fix Health Connect reconnect loop |
| **MINOR** `1.x.0` | New screens or significant feature additions | Add DNA match screen |
| **MAJOR** `2.0.0` | Breaking changes — navigation restructures, auth contract changes | New EAS runtime |

Update this file with every user-visible change. EAS Build bumps `buildNumber`/`versionCode` independently of the marketing version.
