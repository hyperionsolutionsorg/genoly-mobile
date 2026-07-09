/**
 * PORTED from genoly-family-web convex/lib/fanGeometry.ts (2026-07-09), verbatim
 * except: `AncestorNode` now imports from mobile's ./explorerTypes (the
 * hand-maintained mirror of the web backend shape — see explorerTypes.ts's
 * own header) instead of the web's local "../pedigree" path. All arc math,
 * label/rounding rules, and the ahnentafel slot-assignment logic are
 * unchanged — this is the exact module the Fan view's mobile constraints
 * (default 4 generations, hard cap 5, see components/tree/FanView.tsx) are
 * computed against.
 *
 * fanGeometry — the pure arc-math + layout helpers behind the Fan view
 * (Family Explorer Stage 3 PR6, design plan §2.C).
 *
 * The Fan is a radial ancestor wheel: the anchor sits in a central disc and
 * each generation is a concentric ring outward. Unlike a sunburst, every
 * ancestor occupies a FIXED angular wedge determined by its ahnentafel slot —
 * a missing grandparent must leave its quarter empty, it must NOT let its
 * sibling grow into the gap. That fixed-slot requirement is why we cannot use
 * `d3-hierarchy.partition()` (which sizes wedges by leaf count / value); we use
 * `d3-hierarchy.hierarchy()` purely for the tree walk + parent/ancestor links
 * and compute every wedge here from the slot index.
 *
 * Angle convention (used everywhere below): a `fraction` in [0, 1] is the
 * position around a full circle, 0 = 12 o'clock (top), increasing CLOCKWISE.
 * This keeps the math independent of SVG's y-down coordinate space — the single
 * conversion lives in `polarPoint`.
 *
 * Everything here is pure (no React, no DOM, no Convex ctx), so it unit-tests
 * directly — see __tests__/tree-fanGeometry.test.ts.
 */

import { hierarchy } from 'd3-hierarchy';
import type { AncestorNode } from './explorerTypes';

// ── Sizing (mirrors TreeAtlas.tsx:88–101 — the cited radius reference) ──────

/** Clamp bounds for the square the wheel is drawn into (px). */
export const MIN_FAN_SIZE = 360;
export const MAX_FAN_SIZE = 760;

/**
 * Fit the wheel to a square that's 85% of the smaller viewport dimension,
 * clamped to [MIN_FAN_SIZE, MAX_FAN_SIZE] — identical posture to the Atlas
 * globe so the explorer's two radial surfaces size consistently.
 */
export function fanSize(innerWidth: number, innerHeight: number): number {
  const s = Math.min(innerWidth, innerHeight) * 0.85;
  return Math.max(MIN_FAN_SIZE, Math.min(MAX_FAN_SIZE, s));
}

// ── Year + label helpers ────────────────────────────────────────────────────

/**
 * Pull a 4-digit year out of a free-form date string (`event.dateOriginal`,
 * e.g. "12 Mar 1898", "1898", "abt. 1898"). Returns undefined when none is
 * present, so it composes with formatLifespan's optional inputs.
 */
export function extractYear(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const m = dateStr.match(/\b(\d{4})\b/);
  return m ? Number.parseInt(m[1], 10) : undefined;
}

function baseParentTerm(gender?: string): string {
  if (gender === 'male') return 'father';
  if (gender === 'female') return 'mother';
  return 'parent'; // nonbinary / unknown / other — no invented gendered term (R-1)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Viewer-framed kinship term for an ancestor `generation` rings out, by gender:
 *
 *   0 → "You"   1 → "Father"/"Mother"/"Parent"
 *   2 → "Grandfather"…   3 → "Great-grandfather"…   4 → "Great-great-…"
 *   5+ → "3× great-grandfather" (numeric prefix keeps long lines readable)
 */
export function ancestorRelationship(generation: number, gender?: string): string {
  if (generation <= 0) return 'You';
  const base = baseParentTerm(gender);
  if (generation === 1) return capitalize(base);

  const greats = generation - 2;
  const greatPrefix =
    greats === 0 ? '' : greats <= 2 ? 'great-'.repeat(greats) : `${greats}× great-`;
  return capitalize(`${greatPrefix}grand${base}`);
}

// ── Slot ↔ angle ↔ radius ────────────────────────────────────────────────────

/**
 * The angular wedge a slot occupies, as a [start, end] fraction of the circle.
 * Generation `g` has `2^g` equal slots; slot `i` spans `[i, i+1) / 2^g`.
 */
export function slotFraction(
  generation: number,
  slotIndex: number,
): { start: number; end: number } {
  const count = 2 ** generation;
  const width = 1 / count;
  const start = slotIndex * width;
  return { start, end: start + width };
}

/**
 * Inner/outer radius of generation `g`'s ring. Generation 0 lives inside the
 * central disc (radius `centerRadius`); generations 1..N split the remaining
 * `[centerRadius, maxRadius]` band into equal-thickness rings.
 */
export function ringRadii(
  generation: number,
  generations: number,
  centerRadius: number,
  maxRadius: number,
): { inner: number; outer: number } {
  const thickness = (maxRadius - centerRadius) / Math.max(1, generations);
  const inner = centerRadius + (generation - 1) * thickness;
  return { inner, outer: centerRadius + generation * thickness };
}

/**
 * Convert (radius, fraction) to an SVG point. The one place the clockwise-from-
 * top angle convention meets SVG's y-down space:
 *   x = cx + r·sin(θ),  y = cy − r·cos(θ),  θ = fraction·2π
 */
export function polarPoint(
  cx: number,
  cy: number,
  r: number,
  fraction: number,
): { x: number; y: number } {
  const theta = fraction * 2 * Math.PI;
  return { x: cx + r * Math.sin(theta), y: cy - r * Math.cos(theta) };
}

interface SectorOpts {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  startFraction: number;
  endFraction: number;
}

/** Round to 3 dp so the path strings are compact + stable for snapshot tests. */
function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * SVG path `d` for one annular sector (a single arc wedge): out along the
 * start spoke, clockwise around the outer arc, in along the end spoke, then
 * counter-clockwise back along the inner arc.
 */
export function annularSectorPath(opts: SectorOpts): string {
  const { cx, cy, innerR, outerR, startFraction, endFraction } = opts;
  const large = endFraction - startFraction > 0.5 ? 1 : 0;
  const o0 = polarPoint(cx, cy, outerR, startFraction);
  const o1 = polarPoint(cx, cy, outerR, endFraction);
  const i1 = polarPoint(cx, cy, innerR, endFraction);
  const i0 = polarPoint(cx, cy, innerR, startFraction);
  return [
    `M ${r3(o0.x)} ${r3(o0.y)}`,
    `A ${r3(outerR)} ${r3(outerR)} 0 ${large} 1 ${r3(o1.x)} ${r3(o1.y)}`,
    `L ${r3(i1.x)} ${r3(i1.y)}`,
    `A ${r3(innerR)} ${r3(innerR)} 0 ${large} 0 ${r3(i0.x)} ${r3(i0.y)}`,
    'Z',
  ].join(' ');
}

/**
 * SVG path `d` for just the inner-edge arc of a wedge — the 4px gender-accent
 * stroke (DESIGN.md §2 constant gender accents), drawn as a stroked open arc.
 */
export function innerArcPath(opts: Omit<SectorOpts, 'outerR'>): string {
  const { cx, cy, innerR, startFraction, endFraction } = opts;
  const large = endFraction - startFraction > 0.5 ? 1 : 0;
  const a0 = polarPoint(cx, cy, innerR, startFraction);
  const a1 = polarPoint(cx, cy, innerR, endFraction);
  return `M ${r3(a0.x)} ${r3(a0.y)} A ${r3(innerR)} ${r3(innerR)} 0 ${large} 1 ${r3(a1.x)} ${r3(a1.y)}`;
}

/**
 * Transform that places a tangential, always-upright label at the middle of a
 * wedge. Text is drawn at the origin (text-anchor middle) and this string
 * positions + rotates it: rotation follows the clock angle, flipped 180° on
 * the bottom-left arc so it never reads upside-down.
 */
export function labelTransform(
  cx: number,
  cy: number,
  midRadius: number,
  midFraction: number,
): string {
  const { x, y } = polarPoint(cx, cy, midRadius, midFraction);
  const deg = midFraction * 360;
  const rot = deg > 90 && deg < 270 ? deg + 180 : deg;
  return `translate(${r3(x)} ${r3(y)}) rotate(${r3(rot)})`;
}

// ── Tree flattening (d3-hierarchy) + hover-path test ─────────────────────────

export interface FanArcDatum {
  node: AncestorNode;
  /** 0 = anchor, 1 = parents, … */
  generation: number;
  /** Ahnentafel slot within the generation: 0 .. 2^generation − 1. */
  slotIndex: number;
}

/**
 * Walk the binary ancestor tree into a flat list of present nodes, each tagged
 * with its generation + ahnentafel slot. Uses `d3-hierarchy.hierarchy()` for
 * the depth-aware walk; the slot is assigned here (father → slot·2, mother →
 * slot·2+1) since the genealogical wedge position is ours to define, not
 * d3's. Missing ancestors simply produce no entry — their wedge is rendered
 * empty by the caller.
 */
export function flattenAncestors(root: AncestorNode | null | undefined): FanArcDatum[] {
  if (!root) return [];
  const h = hierarchy<AncestorNode>(root, (d) => {
    const kids: AncestorNode[] = [];
    if (d.father) kids.push(d.father);
    if (d.mother) kids.push(d.mother);
    return kids.length ? kids : null;
  });

  const out: FanArcDatum[] = [];
  const visit = (hn: typeof h, slot: number) => {
    out.push({ node: hn.data, generation: hn.depth, slotIndex: slot });
    for (const child of hn.children ?? []) {
      const isFather = child.data === hn.data.father;
      visit(child as typeof h, slot * 2 + (isFather ? 0 : 1));
    }
  };
  visit(h, 0);
  return out;
}

/**
 * True when slot `(generation, slotIndex)` lies on the ancestral path from the
 * `hovered` wedge back to the centre — i.e. it is the hovered wedge itself or
 * one of its ancestors (a strictly inner ring whose slot is the hovered slot
 * shifted toward the centre). Drives the hover/focus highlight.
 */
export function isOnAncestralPath(
  cell: { generation: number; slotIndex: number },
  hovered: { generation: number; slotIndex: number } | null,
): boolean {
  if (!hovered) return false;
  if (cell.generation > hovered.generation) return false;
  const shift = hovered.generation - cell.generation;
  return hovered.slotIndex >> shift === cell.slotIndex;
}
