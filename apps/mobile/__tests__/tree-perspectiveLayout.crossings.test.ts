/**
 * PORTED from genoly-family-web src/components/explorer/perspective/perspectiveLayout.crossings.test.ts (2026-07-09).
 * Changes: import paths → mobile lib/tree; vitest globals → jest globals;
 * vitest's two-arg expect(value, message) → one-arg (jest).
 */
/**
 * The zero-crossing referee suite — the hard invariant of the perspective
 * Explorer dispatch: NO connector line ever crosses another, at any
 * perspective, on any tree (docs/perspective-explorer-layout.md §4).
 *
 * Rather than trusting the constructive proof, this renders the ACTUAL
 * connector polylines for targeted fixtures and seeded-random genealogies
 * (multi-marriage, half-siblings, cousin marriage, deep chains, 500-person
 * trees) across many perspectives, and asserts:
 *   - zero segment crossings (different families may not even touch; same
 *     family may share its bus rail but never properly cross),
 *   - no connector stabs through an unrelated person card,
 *   - no node boxes overlap.
 */

import { computePerspectiveScope } from "../lib/tree/perspectiveScope";
import { computePerspectiveLayout } from "../lib/tree/perspectiveLayout";
import { family, payloadFor, generateTree, makeRng, referee } from "../lib/tree/perspectiveTestKit";
import type { FamilyEdge } from "../lib/tree/explorerTypes";

function check(anchor: string, families: FamilyEdge[], radius = 5) {
  const { persons, familyEdges } = payloadFor(anchor, families, radius);
  const scope = computePerspectiveScope({ anchorId: anchor, persons, familyEdges });
  const layout = computePerspectiveLayout(scope);
  const report = referee(layout.nodes, layout.edges, familyEdges);
  expect(report.crossings).toEqual([]);
  expect(report.boxStabs).toEqual([]);
  expect(report.nodeOverlaps).toEqual([]);
  return layout;
}

describe("zero-crossing invariant — targeted fixtures", () => {
  test("dense hourglass: both cones, uncles+cousins, siblings+nieces, half-sibs", () => {
    const families = [
      family("f-ggf", ["ggf", "ggm"], ["gf", "gru1", "gru2"]),
      family("f-ggm2", ["hgf", "hgm"], ["gm"]),
      family("f-mgg", ["mggf", "mggm"], ["mgf"]),
      family("f-gf", ["gf", "gm"], ["f", "u1", "u2"]),
      family("f-mgf", ["mgf", "mgm"], ["m", "a1"]),
      family("f-fm", ["f", "m"], ["a", "s1", "s2", "s3"], { primaryAdults: ["f", "m"] }),
      family("f-fx", ["f", "x"], ["h1", "h2"], { primaryAdults: ["x"] }),
      family("f-u1", ["u1", "us1"], ["k1", "k2"]),
      family("f-u2", ["u2", "us2"], ["k3"]),
      family("f-a1", ["a1", "as1"], ["k4", "k5"]),
      family("f-s1", ["s1", "ss1"], ["n1", "n2"]),
      family("f-s2", ["s2", "ss2"], ["n3"]),
      family("f-aw", ["a", "w"], ["c1", "c2", "c3"], { primaryAdults: ["a", "w"] }),
      family("f-w", ["wf", "wm"], ["w"]),
      family("f-c1", ["c1", "cw"], ["gc1", "gc2"]),
      family("f-c2", ["c2", "cw2"], ["gc3"]),
    ];
    for (const anchor of ["a", "w", "f", "m", "gf", "c1", "s2", "u1", "k1"]) {
      check(anchor, families);
    }
  });

  test("triple concurrent marriage: three spouses, children per marriage", () => {
    const families = [
      family("f-p", ["pa", "pb"], ["a"]),
      family("f-m1", ["a", "w1"], ["c1", "c2"], { primaryAdults: ["a", "w1"] }),
      family("f-m2", ["a", "w2"], ["c3"], { primaryAdults: ["w2"] }),
      family("f-m3", ["a", "w3"], ["c4", "c5"], { primaryAdults: ["w3"] }),
    ];
    const layout = check("a", families);
    // All three spouses + all five children render (no conflation).
    for (const id of ["w1", "w2", "w3", "c1", "c2", "c3", "c4", "c5"]) {
      expect(layout.nodes.some((n) => n.id === id)).toBe(true);
    }
  });

  test("cousin marriage: intermarriage chips, still zero crossings", () => {
    const families = [
      family("f-g", ["gf", "gm"], ["f", "u"]),
      family("f-fm", ["f", "m"], ["a", "s"]),
      family("f-u", ["u", "uw"], ["k"]),
      family("f-ks", ["k", "s"], ["cc"]), // cousin married sibling
    ];
    for (const anchor of ["a", "s", "k", "f"]) check(anchor, families);
  });

  test("10-generation lineage chain stays a clean ladder", () => {
    const families: FamilyEdge[] = [];
    for (let g = 0; g < 10; g++) {
      families.push(
        family(`f-g${g}`, [`m${g}`, `w${g}`], [`m${g + 1}`, `sib${g + 1}`]),
      );
    }
    // Unbounded radius: the layout must survive depth even beyond the server's
    // ±5 fetch (future-proofing — depth is a data question, not a layout one).
    for (const anchor of ["m5", "m9", "m1"]) check(anchor, families, Number.POSITIVE_INFINITY);
  });

  test("single-parent lineages route without rings", () => {
    const families = [
      family("f-1", ["solo1"], ["solo2", "x1"]),
      family("f-2", ["solo2"], ["a", "x2"]),
      family("f-3", ["a", "w"], ["c1"]),
    ];
    for (const anchor of ["a", "solo2"]) check(anchor, families);
  });
});

describe("zero-crossing invariant — seeded-random genealogies", () => {
  test("40 random trees × random perspectives, all clean", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { families, personIds } = generateTree(seed, {
        founders: 1 + (seed % 3),
        depth: 4 + (seed % 5),
        maxPersons: 60 + seed * 8,
      });
      const rng = makeRng(seed * 7919);
      const anchors = new Set<string>();
      for (let i = 0; i < 4; i++) {
        anchors.add(personIds[Math.floor(rng() * personIds.length)]);
      }
      for (const anchor of anchors) check(anchor, families);
    }
  });

  test("scale: a 500-person, 10-generation tree lays out clean and fast", () => {
    const { families, personIds } = generateTree(99, {
      founders: 3,
      depth: 10,
      maxPersons: 500,
    });
    expect(personIds.length).toBeGreaterThanOrEqual(400);
    const t0 = performance.now();
    for (const anchor of [personIds[0], personIds[Math.floor(personIds.length / 2)], personIds[personIds.length - 1]]) {
      check(anchor, families, Number.POSITIVE_INFINITY);
    }
    const elapsed = performance.now() - t0;
    // Three full scope+layout+referee passes; the referee is O(n²) and test-only.
    // The layout itself must stay well under a frame — assert the whole bundle
    // stays interactive-grade.
    expect(elapsed).toBeLessThan(3000);
  });

  test("founder perspective on a single clan: 475 visible people, still clean", () => {
    // The worst case for the layout: the anchor's OWN descent is uncapped, so a
    // clan founder sees every descendant at once. Seed 21 yields 475 visible of
    // 601 people across 9 generations.
    const { families } = generateTree(21, { founders: 1, depth: 9, maxPersons: 600 });
    const { persons, familyEdges } = payloadFor("p0000", families, Number.POSITIVE_INFINITY);
    const scope = computePerspectiveScope({ anchorId: "p0000", persons, familyEdges });
    expect(scope.visible.size).toBeGreaterThan(400);
    const t0 = performance.now();
    const layout = computePerspectiveLayout(scope);
    expect(performance.now() - t0).toBeLessThan(100); // well under a frame budget
    const report = referee(layout.nodes, layout.edges, familyEdges);
    expect(report.crossings).toEqual([]);
    expect(report.boxStabs).toEqual([]);
    expect(report.nodeOverlaps).toEqual([]);
  });

  test("bidirectional swap identity holds on random trees", () => {
    const { families, personIds } = generateTree(1234, { depth: 6, maxPersons: 120 });
    const rng = makeRng(42);
    for (let i = 0; i < 5; i++) {
      const anchor = personIds[Math.floor(rng() * personIds.length)];
      const one = check(anchor, families);
      check(personIds[Math.floor(rng() * personIds.length)], families);
      const two = check(anchor, families);
      expect(two).toEqual(one);
    }
  });
});
