---
type: decision
name: "Mobile styling: first-party theme module + UI kit on RN StyleSheet — no Tamagui, no NativeWind"
date_decided: 2026-06-11
status: active
tags: [mobile, design-system, styling]
sources: ["DESIGN.md", "[[2026-06-11-member-side-convex-client]]"]
---

# Styling approach: theme module on StyleSheet

**Definition:** Build `apps/mobile/theme/` (colors.ts with light/dark/classic palettes, typography.ts, spacing.ts) + a small first-party component kit (`components/ui/`: Screen, Section, Button, TextField, Card, Banner, EmptyState, Toast, Skeleton) on plain React Native `StyleSheet`. Migrate the existing inlined-hex screens onto it mechanically. Tamagui and NativeWind are rejected.

## Why

1. **DESIGN.md already planned this.** §2 names the `theme/colors.ts` module as the designated Phase-1.5 path and deliberately kept the palette table inline-able so migration stays mechanical. The brief's §4 offers Tamagui/NativeWind as options, not mandates ("your choice; defend in decision page").
2. **Consistency beats novelty at this scale.** Five shipped screens + ~30 planned ones, one design language, three themes. A token module + 9 primitives covers it. Tamagui's compiler and NativeWind's Tailwind runtime each bring config surface, upgrade coupling to Expo SDK majors (we just lived through 54→55→56), and a second styling dialect next to the existing StyleSheet code — cost without proportional benefit.
3. **Theme switching needs runtime tokens anyway.** The web's Light/Dark/Classic themes map to a `ThemeProvider` (React context — static config, the legit Context use per mobile-sync-architecture §7) feeding token objects. Classic = serif accents (system serif via `fontFamily: Platform.select({ios:'Georgia', android:'serif'})`) + warm palette, mirroring the web's Palatino swap. None of that requires a styling framework.
4. **Zero new dependencies** = zero new licenses, zero bundle weight, zero SDK-upgrade coupling. Production-grade preference favors the durable boring thing here.

## Consequences

- Dark + classic palettes must be locked in `theme/colors.ts` (DESIGN.md §10 flagged dark mode as open — this mission closes it), derived from the web's semantic tokens (incl. `on-primary` contrast rule from web decision 2026-06-10; WCAG AA on every pair).
- Existing screens (login, permissions, fitness, settings) migrate off inlined hex in the foundation PR — one mechanical pass, exactly as DESIGN.md predicted.
- New screens import tokens; raw hex in screen files becomes a review red flag.
- DESIGN.md gets updated (palette tables per theme + kit usage) when the foundation PR lands.

## Rejected alternatives

- **Tamagui** — powerful, but its optimizing compiler + themes engine is a framework commitment; overkill for one app with 3 fixed themes; nontrivial Expo SDK upgrade surface.
- **NativeWind** — Tailwind ergonomics are nice but introduce a second styling dialect and a babel/metro plugin chain; the team's muscle memory (web CSS variables ≈ token objects) maps better to plain tokens.
