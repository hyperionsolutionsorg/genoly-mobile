/**
 * PORTED from genoly-family-web src/components/explorer/perspective/perspectiveScope.test.ts (2026-07-09).
 * Changes: import paths → mobile lib/tree; vitest globals → jest globals;
 * vitest's two-arg expect(value, message) → one-arg (jest).
 */
/**
 * Scope-rule suite for the perspective Explorer (perspectiveScope.ts).
 * Asserts the visible-set contract from docs/perspective-explorer-layout.md §2:
 * blood expands, spouses stub with handles, collaterals bound to two levels,
 * hidden worlds become badges, intermarriage becomes chips.
 */

import { computePerspectiveScope } from "../lib/tree/perspectiveScope";
import { family, payloadFor } from "../lib/tree/perspectiveTestKit";

/**
 * The shared fixture (anchor = "a"):
 *
 *   ggf+ggm ─ gf, gru          (gru = grand-uncle: hidden, badged on that ring)
 *   gf+gm   ─ f, u1            (u1 = uncle)
 *   mgf+mgm ─ m, a1            (a1 = aunt)
 *   f+m     ─ a, s1, s2        (siblings)
 *   f+x     ─ h1               (half-sibling via father's other marriage)
 *   u1+us   ─ k1               (cousin; us married-in)
 *   k1+s2   ─ cc               (cousin married sibling → intermarriage chip)
 *   a+w     ─ c1, c2           (w married-in with parents wf+wm → handle)
 *   wf+wm   ─ w
 *   c1+cw   ─ gc1              (grandchild; cw married-in, no recorded kin)
 *   s1+ss   ─ n1               (niece)
 *   n1+ns   ─ nn1              (niece's child — BELOW the sibling floor → badge)
 */
const FAMILIES = [
  family("f-ggf", ["ggf", "ggm"], ["gf", "gru"]),
  family("f-gf", ["gf", "gm"], ["f", "u1"]),
  family("f-mgf", ["mgf", "mgm"], ["m", "a1"]),
  family("f-fm", ["f", "m"], ["a", "s1", "s2"], { primaryAdults: ["f", "m"] }),
  family("f-fx", ["f", "x"], ["h1"], { primaryAdults: ["x"] }),
  family("f-u1", ["u1", "us"], ["k1"]),
  family("f-k1s2", ["k1", "s2"], ["cc"]),
  family("f-aw", ["a", "w"], ["c1", "c2"]),
  family("f-w", ["wf", "wm"], ["w"]),
  family("f-c1", ["c1", "cw"], ["gc1"]),
  family("f-s1", ["s1", "ss"], ["n1"]),
  family("f-n1", ["n1", "ns"], ["nn1"]),
];

function scopeFor(anchor: string) {
  const { persons, familyEdges } = payloadFor(anchor, FAMILIES, 5);
  return computePerspectiveScope({ anchorId: anchor, persons, familyEdges });
}

describe("perspective scope", () => {
  const scope = scopeFor("a");

  test("blood ancestry expands: parents, grandparents, great-grandparents", () => {
    for (const id of ["f", "m", "gf", "gm", "mgf", "mgm", "ggf", "ggm"]) {
      expect(scope.visible.has(id)).toBe(true);
    }
  });

  test("collaterals: siblings + nieces, uncles/aunts + cousins", () => {
    for (const id of ["s1", "s2", "u1", "a1", "k1", "n1", "h1"]) {
      expect(scope.visible.has(id)).toBe(true);
    }
  });

  test("grand-uncle stays hidden and is badged on his parents' ring", () => {
    expect(scope.visible.has("gru")).toBe(false);
    expect(scope.badges.get("union:f-ggf")).toBe(1);
  });

  test("below-floor descent is badged on the nearest visible card", () => {
    // The niece's child nn1 sits below the sibling floor → collapses onto n1.
    // The niece's spouse ns is same-rank and still renders as a card.
    expect(scope.visible.has("nn1")).toBe(false);
    expect(scope.visible.has("ns")).toBe(true);
    expect(scope.badges.get("n1")).toBe(1);
  });

  test("married-in spouses stub with handles when they have a world", () => {
    expect(scope.visible.has("w")).toBe(true);
    expect(scope.handles.has("w")).toBe(true); // has parents wf+wm
    expect(scope.visible.has("wf")).toBe(false); // spouse ancestry NEVER expands
    expect(scope.handles.has("cw")).toBe(false); // no recorded kin → no handle
    expect(scope.handles.has("us")).toBe(false);
  });

  test("the owner's descent is uncapped: children and grandchildren render", () => {
    for (const id of ["c1", "c2", "gc1", "cw"]) {
      expect(scope.visible.has(id)).toBe(true);
    }
  });

  test("intermarriage renders as a chip, never a second card", () => {
    // k1 (cousin) married s2 (sibling): both blood — the k1+s2 union carries a
    // chip for whichever adult the walk reached second; nobody is duplicated.
    expect(scope.chips.get("f-k1s2")).toBeDefined();
    expect(["k1", "s2"]).toContain(scope.chips.get("f-k1s2"));
    expect(scope.visible.has("cc")).toBe(true); // their child still renders
  });

  test("half-siblings surface through the parent's extra union", () => {
    const father = scope.parentLevel!.parents.find((p) => p.personId === "f")!;
    expect(father.extraUnions.map((g) => g.familyId)).toContain("f-fx");
    expect(scope.visible.has("x")).toBe(true);
    expect(scope.visible.has("h1")).toBe(true);
  });

  test("swap is symmetric: from w's perspective, a becomes the handle-carrier", () => {
    const swapped = scopeFor("w");
    expect(swapped.visible.has("wf")).toBe(true); // w's parents now expand
    expect(swapped.visible.has("a")).toBe(true); // previous owner still a spouse card
    expect(swapped.handles.has("a")).toBe(true); // …carrying the way back
    expect(swapped.visible.has("gf")).toBe(false); // a's ancestry collapsed
  });

  test("determinism: identical inputs give identical scopes", () => {
    const again = scopeFor("a");
    expect([...again.visible].sort()).toEqual([...scope.visible].sort());
    expect([...again.badges.entries()].sort()).toEqual([...scope.badges.entries()].sort());
    expect([...again.handles].sort()).toEqual([...scope.handles].sort());
  });

  test("anchor with no parents: no cone, unit still builds", () => {
    const top = scopeFor("ggf");
    expect(top.parentLevel).toBeNull();
    expect(top.visible.has("ggm")).toBe(true); // spouse card
    expect(top.visible.has("gf")).toBe(true); // descent
  });
});
