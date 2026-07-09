/**
 * PORTED from genoly-family-web src/components/explorer/fan/fanGeometry.test.ts
 * (2026-07-09). Changes: import path → mobile lib/tree; vitest globals →
 * jest globals (describe/it/expect are ambient under jest-expo, no import
 * needed); `AncestorNode` import path → mobile's explorerTypes mirror.
 *
 * Unit tests for fanGeometry — the pure arc-math + layout helpers behind the
 * Fan view (Stage 3 PR6). No React / DOM / Convex, so they run headless.
 */

import type { AncestorNode } from '../lib/tree/explorerTypes';
import {
  MAX_FAN_SIZE,
  MIN_FAN_SIZE,
  ancestorRelationship,
  annularSectorPath,
  extractYear,
  fanSize,
  flattenAncestors,
  innerArcPath,
  isOnAncestralPath,
  labelTransform,
  polarPoint,
  ringRadii,
  slotFraction,
} from '../lib/tree/fanGeometry';

const TAU = 2 * Math.PI;

describe('fanSize', () => {
  it('fits 85% of the smaller dimension', () => {
    expect(fanSize(1000, 800)).toBeCloseTo(800 * 0.85); // 680, within clamp
  });
  it('clamps to the floor and ceiling', () => {
    expect(fanSize(200, 200)).toBe(MIN_FAN_SIZE);
    expect(fanSize(4000, 4000)).toBe(MAX_FAN_SIZE);
  });
});

describe('extractYear', () => {
  it('pulls a 4-digit year from free-form dates', () => {
    expect(extractYear('12 Mar 1898')).toBe(1898);
    expect(extractYear('abt. 1898')).toBe(1898);
    expect(extractYear('1898')).toBe(1898);
  });
  it('returns undefined when absent', () => {
    expect(extractYear(undefined)).toBeUndefined();
    expect(extractYear('')).toBeUndefined();
    expect(extractYear('spring')).toBeUndefined();
  });
});

describe('ancestorRelationship', () => {
  it('labels the anchor and parents by gender', () => {
    expect(ancestorRelationship(0)).toBe('You');
    expect(ancestorRelationship(1, 'male')).toBe('Father');
    expect(ancestorRelationship(1, 'female')).toBe('Mother');
    expect(ancestorRelationship(1, 'unknown')).toBe('Parent');
  });
  it('builds grand- and great-grand- terms', () => {
    expect(ancestorRelationship(2, 'male')).toBe('Grandfather');
    expect(ancestorRelationship(3, 'female')).toBe('Great-grandmother');
    expect(ancestorRelationship(4, 'male')).toBe('Great-great-grandfather');
  });
  it('switches to a numeric prefix for deep generations', () => {
    expect(ancestorRelationship(5, 'female')).toBe('3× great-grandmother');
    expect(ancestorRelationship(7, 'male')).toBe('5× great-grandfather');
  });
});

describe('slotFraction', () => {
  it('splits each generation into 2^g equal wedges', () => {
    expect(slotFraction(0, 0)).toEqual({ start: 0, end: 1 });
    expect(slotFraction(1, 0)).toEqual({ start: 0, end: 0.5 });
    expect(slotFraction(1, 1)).toEqual({ start: 0.5, end: 1 });
    expect(slotFraction(2, 3)).toEqual({ start: 0.75, end: 1 });
  });
});

describe('ringRadii', () => {
  it('divides [centerRadius, maxRadius] into equal rings', () => {
    // center 100, max 400, 3 gens → thickness 100.
    expect(ringRadii(1, 3, 100, 400)).toEqual({ inner: 100, outer: 200 });
    expect(ringRadii(2, 3, 100, 400)).toEqual({ inner: 200, outer: 300 });
    expect(ringRadii(3, 3, 100, 400)).toEqual({ inner: 300, outer: 400 });
  });
});

describe('polarPoint', () => {
  it('places fraction 0 at the top, increasing clockwise', () => {
    const cx = 100;
    const cy = 100;
    const r = 50;
    const top = polarPoint(cx, cy, r, 0);
    expect(top.x).toBeCloseTo(100);
    expect(top.y).toBeCloseTo(50); // straight up (y-down)
    const right = polarPoint(cx, cy, r, 0.25);
    expect(right.x).toBeCloseTo(150);
    expect(right.y).toBeCloseTo(100);
    const bottom = polarPoint(cx, cy, r, 0.5);
    expect(bottom.x).toBeCloseTo(100);
    expect(bottom.y).toBeCloseTo(150);
  });
});

describe('annularSectorPath', () => {
  it('emits a closed wedge with both arcs', () => {
    const d = annularSectorPath({
      cx: 100,
      cy: 100,
      innerR: 40,
      outerR: 80,
      startFraction: 0,
      endFraction: 0.25,
    });
    expect(d.startsWith('M ')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).toContain('A 80 80'); // outer arc radius
    expect(d).toContain('A 40 40'); // inner arc radius
  });
  it('sets the large-arc flag only past a half turn', () => {
    const small = annularSectorPath({
      cx: 0,
      cy: 0,
      innerR: 1,
      outerR: 2,
      startFraction: 0,
      endFraction: 0.5,
    });
    // exactly a half turn is NOT "large"
    expect(small).toContain('A 2 2 0 0 1');
    const big = annularSectorPath({
      cx: 0,
      cy: 0,
      innerR: 1,
      outerR: 2,
      startFraction: 0,
      endFraction: 0.75,
    });
    expect(big).toContain('A 2 2 0 1 1');
  });
});

describe('innerArcPath', () => {
  it('is an open arc at the inner radius', () => {
    const d = innerArcPath({ cx: 0, cy: 0, innerR: 30, startFraction: 0, endFraction: 0.25 });
    expect(d.startsWith('M ')).toBe(true);
    expect(d).toContain('A 30 30');
    expect(d.includes('Z')).toBe(false);
  });
});

describe('labelTransform', () => {
  it('does not rotate a top-of-circle label', () => {
    const t = labelTransform(100, 100, 50, 0);
    expect(t).toContain('rotate(0)');
  });
  it('flips bottom-half labels so they stay upright', () => {
    // fraction 0.5 → 180° clock angle → flipped by 180 → 360
    const t = labelTransform(100, 100, 50, 0.5);
    expect(t).toContain('rotate(360)');
  });
});

describe('isOnAncestralPath', () => {
  const hovered = { generation: 3, slotIndex: 5 }; // binary 101
  it('includes the hovered wedge itself', () => {
    expect(isOnAncestralPath({ generation: 3, slotIndex: 5 }, hovered)).toBe(true);
  });
  it('includes inner-ring ancestors (slot shifted toward centre)', () => {
    expect(isOnAncestralPath({ generation: 2, slotIndex: 2 }, hovered)).toBe(true); // 101>>1 = 10
    expect(isOnAncestralPath({ generation: 1, slotIndex: 1 }, hovered)).toBe(true); // 101>>2 = 1
    expect(isOnAncestralPath({ generation: 0, slotIndex: 0 }, hovered)).toBe(true); // centre always
  });
  it('excludes siblings and outer rings', () => {
    expect(isOnAncestralPath({ generation: 2, slotIndex: 3 }, hovered)).toBe(false);
    expect(isOnAncestralPath({ generation: 4, slotIndex: 10 }, hovered)).toBe(false);
  });
  it('returns false with no hover', () => {
    expect(isOnAncestralPath({ generation: 1, slotIndex: 0 }, null)).toBe(false);
  });
});

describe('flattenAncestors', () => {
  function node(preferredName: string, extra: Partial<AncestorNode> = {}): AncestorNode {
    return {
      _id: preferredName,
      preferredName,
      isLiving: false,
      spouseFamilies: [],
      father: null,
      mother: null,
      ...extra,
    };
  }

  it('returns [] for a null tree', () => {
    expect(flattenAncestors(null)).toEqual([]);
  });

  it('assigns father→slot·2 and mother→slot·2+1', () => {
    const tree = node('anchor', {
      father: node('dad', { gender: 'male', father: node('grandpa', { gender: 'male' }) }),
      mother: node('mom', { gender: 'female' }),
    });
    const flat = flattenAncestors(tree);
    const byName = new Map(flat.map((d) => [d.node.preferredName, d]));

    expect(byName.get('anchor')).toMatchObject({ generation: 0, slotIndex: 0 });
    expect(byName.get('dad')).toMatchObject({ generation: 1, slotIndex: 0 });
    expect(byName.get('mom')).toMatchObject({ generation: 1, slotIndex: 1 });
    // grandpa = dad's father → slot 0·2 = 0 at generation 2
    expect(byName.get('grandpa')).toMatchObject({ generation: 2, slotIndex: 0 });
  });

  it('keeps a present parent in its own slot when the other is missing', () => {
    // father missing, mother present → mother must still take the odd slot.
    const tree = node('anchor', { mother: node('mom', { gender: 'female' }) });
    const flat = flattenAncestors(tree);
    const mom = flat.find((d) => d.node.preferredName === 'mom');
    expect(mom).toMatchObject({ generation: 1, slotIndex: 1 });
    expect(flat.find((d) => d.node.preferredName === 'dad')).toBeUndefined();
  });
});

// Anchor for the angle convention: a full circle is TAU radians.
it('sanity: full circle is 2π', () => {
  expect(TAU).toBeCloseTo(6.2832, 3);
});
