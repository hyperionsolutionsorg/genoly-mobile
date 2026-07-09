/**
 * Layout-invariant suite for classicLayout.ts: generation/depth handling,
 * missing-parent ("unknown ancestor") truncation, spouseFamilies being
 * present-but-unused (web parity — ClassicTree's ancestor mode never
 * renders spouse boxes), sibling/cousin separation, and determinism.
 */

import {
  computeClassicLayout,
  formatLifespan,
  COUSIN_GAP,
  NODE_HEIGHT,
  NODE_WIDTH,
  SIBLING_GAP,
  type ClassicLayoutNode,
} from '../lib/tree/classicLayout';
import type { AncestorNode, SpouseFamilyData } from '../lib/tree/explorerTypes';

function person(id: string, overrides: Partial<AncestorNode> = {}): AncestorNode {
  return {
    _id: id,
    preferredName: id,
    isLiving: true,
    spouseFamilies: [],
    father: null,
    mother: null,
    ...overrides,
  };
}

function findNode(nodes: ClassicLayoutNode[], id: string): ClassicLayoutNode {
  const n = nodes.find((x) => x.id === id);
  expect(n).toBeDefined();
  return n!;
}

describe('computeClassicLayout', () => {
  test('a root with no known ancestors lays out as a single focus node', () => {
    const root = person('root');
    const result = computeClassicLayout(root);

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
    const focus = findNode(result.nodes, 'root');
    expect(focus.isFocus).toBe(true);
    expect(focus.generation).toBe(0);
    expect(focus.width).toBe(NODE_WIDTH);
    expect(focus.height).toBe(NODE_HEIGHT);
    expect(result.rootId).toBe('root');
    expect(result.rootCenter).toEqual({
      x: focus.x + focus.width / 2,
      y: focus.y + focus.height / 2,
    });
  });

  test('a full two-generation tree assigns strictly increasing generation depth going back in time', () => {
    const root = person('root', {
      father: person('father', {
        father: person('pgf'),
        mother: person('pgm'),
      }),
      mother: person('mother', {
        father: person('mgf'),
        mother: person('mgm'),
      }),
    });
    const result = computeClassicLayout(root);

    expect(result.nodes).toHaveLength(7);
    expect(result.edges).toHaveLength(6);

    expect(findNode(result.nodes, 'root').generation).toBe(0);
    expect(findNode(result.nodes, 'father').generation).toBe(1);
    expect(findNode(result.nodes, 'mother').generation).toBe(1);
    expect(findNode(result.nodes, 'pgf').generation).toBe(2);
    expect(findNode(result.nodes, 'pgm').generation).toBe(2);
    expect(findNode(result.nodes, 'mgf').generation).toBe(2);
    expect(findNode(result.nodes, 'mgm').generation).toBe(2);

    // Web-parity y-inversion: the focus (gen 0) sits at the BOTTOM (largest
    // y), the oldest generation (gen 2) sits at the TOP (smallest y).
    const rootY = findNode(result.nodes, 'root').y;
    const parentY = findNode(result.nodes, 'father').y;
    const grandparentY = findNode(result.nodes, 'pgf').y;
    expect(rootY).toBeGreaterThan(parentY);
    expect(parentY).toBeGreaterThan(grandparentY);

    // Same-generation nodes share a y (row).
    expect(findNode(result.nodes, 'father').y).toBe(findNode(result.nodes, 'mother').y);
    expect(findNode(result.nodes, 'pgf').y).toBe(findNode(result.nodes, 'mgm').y);
  });

  test('a missing parent ("unknown ancestor") truncates that branch — no placeholder node', () => {
    // root has a father (whose own parents are both known) but no mother.
    const root = person('root', {
      father: person('father', {
        father: person('pgf'),
        mother: person('pgm'),
      }),
      mother: null,
    });
    const result = computeClassicLayout(root);

    expect(result.nodes).toHaveLength(4); // root, father, pgf, pgm — no mother/maternal branch
    expect(result.edges).toHaveLength(3);
    expect(result.nodes.some((n) => n.id === 'mother')).toBe(false);
    expect(findNode(result.nodes, 'root').generation).toBe(0);
    expect(findNode(result.nodes, 'father').generation).toBe(1);
    expect(findNode(result.nodes, 'pgf').generation).toBe(2);
    expect(findNode(result.nodes, 'pgm').generation).toBe(2);
  });

  test('a node with no known ancestors at all beyond the root is just the one box', () => {
    const root = person('root', { father: null, mother: null });
    const result = computeClassicLayout(root);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });

  test('spouseFamilies on a node are present but ignored — one box per ancestor, no spouse boxes (web parity)', () => {
    const spouseFamilies: SpouseFamilyData[] = [
      {
        familyId: 'fam-1',
        createdAt: 0,
        adults: [
          { personId: 'root', preferredName: 'root', isLiving: true },
          { personId: 'spouse-1', preferredName: 'Spouse One', isLiving: true },
        ],
      },
    ];
    const root = person('root', {
      spouseFamilies,
      father: person('father', { spouseFamilies }),
    });
    const result = computeClassicLayout(root);

    // Only root + father boxes — the spouse never gets a node of its own.
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.some((n) => n.id === 'spouse-1')).toBe(false);
    // The layout node shape carries no spouse field at all.
    const rootNode = findNode(result.nodes, 'root');
    expect((rootNode as unknown as Record<string, unknown>).spouseFamilies).toBeUndefined();
  });

  test('full siblings (same parent) separate by exactly NODE_WIDTH+SIBLING_GAP; cross-branch neighbors by at least NODE_WIDTH+COUSIN_GAP', () => {
    const root = person('root', {
      father: person('father', {
        father: person('pgf'),
        mother: person('pgm'),
      }),
      mother: person('mother', {
        father: person('mgf'),
        mother: person('mgm'),
      }),
    });
    const result = computeClassicLayout(root);

    const pgf = findNode(result.nodes, 'pgf');
    const pgm = findNode(result.nodes, 'pgm'); // sibling of pgf (both children of "father")
    const mgf = findNode(result.nodes, 'mgf'); // first child of "mother" — adjacent to pgm, different parent
    const mgm = findNode(result.nodes, 'mgm'); // sibling of mgf

    // Left-to-right order across the whole generation-2 row.
    expect(pgf.x).toBeLessThan(pgm.x);
    expect(pgm.x).toBeLessThan(mgf.x);
    expect(mgf.x).toBeLessThan(mgm.x);

    // Full-sibling leaf pairs sit exactly one separation() apart (no
    // subtree pushing involved — both are childless leaves).
    expect(pgm.x - pgf.x).toBeCloseTo(NODE_WIDTH + SIBLING_GAP, 5);
    expect(mgm.x - mgf.x).toBeCloseTo(NODE_WIDTH + SIBLING_GAP, 5);

    // Cross-branch neighbors (different parents-in-hierarchy) get at least
    // the wider cousin gap.
    expect(mgf.x - pgm.x).toBeGreaterThanOrEqual(NODE_WIDTH + COUSIN_GAP - 1e-6);
  });

  test('determinism: the same tree shape lays out identically on repeat calls', () => {
    const build = () =>
      person('root', {
        father: person('father', { father: person('pgf'), mother: person('pgm') }),
        mother: person('mother'),
      });
    const a = computeClassicLayout(build());
    const b = computeClassicLayout(build());
    expect(a).toEqual(b);
  });

  test('bounds enclose every node box', () => {
    const root = person('root', {
      father: person('father', { father: person('pgf'), mother: person('pgm') }),
      mother: person('mother'),
    });
    const result = computeClassicLayout(root);
    for (const n of result.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(result.minX);
      expect(n.x + n.width).toBeLessThanOrEqual(result.maxX);
      expect(n.y).toBeGreaterThanOrEqual(result.minY);
      expect(n.y + n.height).toBeLessThanOrEqual(result.maxY);
    }
    expect(result.width).toBe(result.maxX - result.minX);
    expect(result.height).toBe(result.maxY - result.minY);
  });
});

describe('formatLifespan', () => {
  test('living person with a known birth year', () => {
    expect(formatLifespan('1990-01-01', undefined, true)).toBe('b. 1990');
  });

  test('living person with no dates renders nothing', () => {
    expect(formatLifespan(undefined, undefined, true)).toBe('');
  });

  test('deceased person with both dates', () => {
    expect(formatLifespan('1900-01-01', '1970-06-01', false)).toBe('1900–1970');
  });

  test('deceased person with only a death date', () => {
    expect(formatLifespan(undefined, '1970-06-01', false)).toBe('?–1970');
  });

  test('no dates at all and not living renders nothing', () => {
    expect(formatLifespan(undefined, undefined, false)).toBe('');
  });
});
