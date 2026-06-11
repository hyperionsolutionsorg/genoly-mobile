/**
 * theme.test.ts — C1 foundation coverage for the theme module.
 *
 * Guards: (1) every palette defines the full semantic token set,
 * (2) WCAG AA contrast holds for the load-bearing pairs in all three
 * themes (mirrors the web's 2026-06-10 semantic-token decision),
 * (3) the classic theme swaps onto the platform serif.
 */

import { palettes, type Palette, type ThemeName } from '../theme/colors';
import { buildTypography } from '../theme/typography';
import { buildTheme } from '../theme';

const THEMES: ThemeName[] = ['light', 'dark', 'classic'];

const REQUIRED_TOKENS: (keyof Palette)[] = [
  'primary',
  'primaryHover',
  'onPrimary',
  'bg',
  'surface',
  'surfaceMuted',
  'bgElevated',
  'text',
  'textMuted',
  'border',
  'danger',
  'dangerSurface',
  'success',
  'warning',
  'info',
  'link',
];

// ── WCAG relative luminance + contrast ratio ──────────────────────────

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a 6-digit hex color: ${hex}`);
  const n = parseInt(m[1], 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('theme palettes', () => {
  it.each(THEMES)('%s palette defines every semantic token as 6-digit hex', (name) => {
    const palette = palettes[name];
    for (const token of REQUIRED_TOKENS) {
      expect(palette[token]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(THEMES)('%s: body text on bg and on surface meet WCAG AA (4.5:1)', (name) => {
    const p = palettes[name];
    expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.text, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.textMuted, p.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(THEMES)('%s: onPrimary on primary meets WCAG AA (4.5:1)', (name) => {
    const p = palettes[name];
    expect(contrast(p.onPrimary, p.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(THEMES)('%s: onPrimary works on danger buttons too (3:1 floor)', (name) => {
    // Destructive buttons reuse onPrimary; danger shades are lighter so we
    // hold them to the AA large-text floor.
    const p = palettes[name];
    expect(contrast(p.onPrimary, p.danger)).toBeGreaterThanOrEqual(3);
  });
});

describe('typography', () => {
  it('classic theme swaps body + titles onto the platform serif', () => {
    const classic = buildTypography('classic');
    expect(classic.fontFamily).toBeTruthy();
    expect(classic.body.fontFamily).toBe(classic.fontFamily);
    expect(classic.screenTitle.fontFamily).toBe(classic.fontFamily);
    // Section headers intentionally stay sans (small uppercase serif reads poorly).
    expect(classic.sectionHeader.fontFamily).toBeUndefined();
  });

  it('light + dark stay on the system default (no fontFamily)', () => {
    expect(buildTypography('light').fontFamily).toBeUndefined();
    expect(buildTypography('dark').body.fontFamily).toBeUndefined();
  });
});

describe('buildTheme', () => {
  it.each(THEMES)('%s exposes colors, typography, spacing, radius', (name) => {
    const theme = buildTheme(name);
    expect(theme.name).toBe(name);
    expect(theme.colors).toBe(palettes[name]);
    expect(theme.spacing.xl).toBe(24);
    expect(theme.radius.md).toBe(12);
    expect(theme.typography.screenTitle.fontSize).toBe(28);
  });
});
