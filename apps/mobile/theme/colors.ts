/**
 * Theme palettes — the mobile mirror of the web's semantic CSS variables
 * (genoly-family-web/src/index.css :root / [data-theme="dark"] / [data-theme="classic"]).
 *
 * Light values come from the mobile DESIGN.md table (which wins over the web file
 * for mobile work). Dark and classic are derived from the web tokens so the brand
 * reads identically across surfaces. Every text/background pair passes WCAG AA.
 *
 * Do NOT inline hex literals in screens — import { useTheme } and consume tokens.
 */

export type ThemeName = 'light' | 'dark' | 'classic';

export interface Palette {
  /** Primary action — filled buttons, links, focus accents */
  primary: string;
  /** Pressed/darkened primary (rarely needed — prefer activeOpacity) */
  primaryHover: string;
  /** Text/icon color ON a primary surface. Never hardcode #fff. */
  onPrimary: string;
  /** Screen background */
  bg: string;
  /** Card / section background — the raised layer */
  surface: string;
  /** Muted surface for de-emphasized blocks (skeletons, disabled chips) */
  surfaceMuted: string;
  /** Elevated overlays (toasts, floating cards) */
  bgElevated: string;
  /** Default body text */
  text: string;
  /** Secondary text, hints */
  textMuted: string;
  /** Hairline borders, dividers, input outlines */
  border: string;
  /** Errors, destructive accents */
  danger: string;
  /** Soft background behind danger content */
  dangerSurface: string;
  /** Positive status */
  success: string;
  /** Neutral-negative status */
  warning: string;
  /** Informational accents */
  info: string;
  /** Inline links */
  link: string;
}

export const lightPalette: Palette = {
  primary: '#0066ff',
  primaryHover: '#0052cc',
  onPrimary: '#ffffff',
  bg: '#fefefe',
  surface: '#f9fafb',
  surfaceMuted: '#f3f4f6',
  bgElevated: '#ffffff',
  text: '#111827',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  danger: '#dc2626',
  dangerSurface: '#fef2f2',
  success: '#15803d',
  warning: '#a16207',
  info: '#0369a1',
  link: '#0066ff',
};

export const darkPalette: Palette = {
  primary: '#60a5fa',
  primaryHover: '#93bbfd',
  // Dark slate on the light-blue primary — 7.02:1 (web decision 2026-06-10).
  onPrimary: '#0f172a',
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceMuted: '#273449',
  bgElevated: '#273449',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  border: '#334155',
  danger: '#f87171',
  dangerSurface: '#2d1414',
  success: '#34d399',
  warning: '#fbbf24',
  info: '#38bdf8',
  link: '#60a5fa',
};

export const classicPalette: Palette = {
  primary: '#8b5e3c',
  primaryHover: '#6d4a30',
  onPrimary: '#ffffff',
  bg: '#f5f0e8',
  surface: '#faf7f2',
  surfaceMuted: '#ede4d3',
  bgElevated: '#fffdf8',
  text: '#3c2a1a',
  textMuted: '#7a6652',
  border: '#d4c5aa',
  danger: '#a83232',
  dangerSurface: '#f7e6e0',
  success: '#556b2f',
  warning: '#92400e',
  info: '#31597c',
  link: '#8b5e3c',
};

export const palettes: Record<ThemeName, Palette> = {
  light: lightPalette,
  dark: darkPalette,
  classic: classicPalette,
};

/**
 * Gender accents — constants, theme-independent. They map to enum values;
 * changing them with theme would change meaning (DESIGN.md §2).
 */
export const genderAccents = {
  male: '#3b82f6',
  female: '#ec4899',
} as const;
