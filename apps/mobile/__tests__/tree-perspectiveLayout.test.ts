/**
 * PORTED from genoly-family-web src/components/explorer/perspective/perspectiveLayout.test.ts (2026-07-09).
 * Changes: import paths → mobile lib/tree; vitest globals → jest globals;
 * vitest's two-arg expect(value, message) → one-arg (jest).
 */
/**
 * Placement-invariant suite for perspectiveLayout.ts: couple seating, ring
 * positioning, rank quantization, determinism, and the bidirectional-swap
 * identity (A → B → A reproduces A's exact layout). The zero-crossing referee
 * has its own suite (perspectiveLayout.crossings.test.ts).
 */

import { computePerspectiveScope } from "../lib/tree/perspectiveScope";
import {
  computePerspectiveLayout,
  unionNodeId,
  COUPLE_GAP,
  RANK_PITCH,
  HUB,
  type LaidNode,
  type LaidPersonNode,
  type LaidHubNode,
} from "../lib/tree/perspectiveLayout";
import { family, payloadFor } from "../lib/tree/perspectiveTestKit";

const FAMILIES = [
  family("f-gf", ["gf", "gm"], ["f", "u1"]),
  family("f-mgf", ["mgf", "mgm"], ["m"]),
  family("f-fm", ["f", "m"], ["a", "s1", "s2"], { primaryAdults: ["f", "m"] }),
  family("f-aw", ["a", "w"], ["c1", "c2"], { primaryAdults: ["a", "w"] }),
  family("f-aw2", ["a", "w2"], ["c3"], { primaryAdults: ["w2"] }),
  family("f-w", ["wf", "wm"], ["w"]),
  family("f-c1", ["c1", "cw"], ["gc1"]),
];

function layoutFor(anchor: string, families = FAMILIES) {
  const { persons, familyEdges } = payloadFor(anchor, families, 5);
  const scope = computePerspectiveScope({ anchorId: anchor, persons, familyEdges });
  return computePerspectiveLayout(scope);
}

const personNode = (nodes: LaidNode[], id: string): LaidPersonNode => {
  const n = nodes.find((x) => x.id === id);
  expect(n).toBeDefined();
  expect(n!.kind).toBe("person");
  return n as LaidPersonNode;
};
const hubNode = (nodes: LaidNode[], familyId: string): LaidHubNode => {
  const n = nodes.find((x) => x.id === unionNodeId(familyId));
  expect(n).toBeDefined();
  return n as LaidHubNode;
};
const cx = (n: { x: number; width: number }) => n.x + n.width / 2;

describe("perspective layout", () => {
  const result = layoutFor("a");

  test("ranks are strictly generation rows", () => {
    const a = personNode(result.nodes, "a");
    const f = personNode(result.nodes, "f");
    const gf = personNode(result.nodes, "gf");
    const c1 = personNode(result.nodes, "c1");
    expect(f.rank).toBe(a.rank - 1);
    expect(gf.rank).toBe(a.rank - 2);
    expect(c1.rank).toBe(a.rank + 1);
    expect(Math.round(f.y - gf.y)).toBe(RANK_PITCH);
  });

  test("the anchor sits at the origin with the parents' ring directly above", () => {
    const a = personNode(result.nodes, "a");
    expect(cx(a)).toBeCloseTo(0, 5);
    const ring = hubNode(result.nodes, "f-fm");
    expect(cx(ring)).toBeCloseTo(0, 5);
    expect(ring.rank).toBe(a.rank - 1);
  });

  test("couples seat tight around their ring (primary marriage)", () => {
    const a = personNode(result.nodes, "a");
    const w = personNode(result.nodes, "w");
    const ring = hubNode(result.nodes, "f-aw");
    // owner | ring | spouse — the ring centres in the couple gap, so each card
    // edge sits HUB/2 + COUPLE_GAP/2 from the ring centre.
    const seat = HUB / 2 + COUPLE_GAP / 2;
    expect(cx(ring) - (a.x + a.width)).toBeCloseTo(seat, 5);
    expect(w.x - cx(ring)).toBeCloseTo(seat, 5);
  });

  test("a second marriage mirrors to the owner's other side", () => {
    const a = personNode(result.nodes, "a");
    const w = personNode(result.nodes, "w");
    const w2 = personNode(result.nodes, "w2");
    expect(cx(w)).toBeGreaterThan(cx(a));
    expect(cx(w2)).toBeLessThan(cx(a)); // second spouse on the left
    const ring2 = hubNode(result.nodes, "f-aw2");
    expect(cx(ring2)).toBeGreaterThan(cx(w2));
    expect(cx(ring2)).toBeLessThan(cx(a));
  });

  test("children per marriage group under their own ring", () => {
    const ringAw = hubNode(result.nodes, "f-aw");
    const ringAw2 = hubNode(result.nodes, "f-aw2");
    const c1 = personNode(result.nodes, "c1");
    const c2 = personNode(result.nodes, "c2");
    const c3 = personNode(result.nodes, "c3");
    // c1+c2 centroid under ring f-aw; c3 under ring f-aw2 (no conflation).
    expect((cx(c1) + cx(c2)) / 2).toBeCloseTo(cx(ringAw), 5);
    expect(cx(c3)).toBeCloseTo(cx(ringAw2), 5);
  });

  test("parents flank the spine; the couple line spans through the ring", () => {
    const f = personNode(result.nodes, "f");
    const m = personNode(result.nodes, "m");
    expect(f.x + f.width).toBeLessThanOrEqual(-COUPLE_GAP / 2 + 0.001);
    expect(m.x).toBeGreaterThanOrEqual(COUPLE_GAP / 2 - 0.001);
    const couple = result.edges.find((e) => e.id === "couple:f-fm")!;
    expect(couple.points[0].y).toBe(couple.points[1].y); // horizontal
  });

  test("each parent hangs directly under their own parents' ring", () => {
    const f = personNode(result.nodes, "f");
    const gfRing = hubNode(result.nodes, "f-gf");
    expect(cx(gfRing)).toBeCloseTo(cx(f), 5);
    const m = personNode(result.nodes, "m");
    const mgfRing = hubNode(result.nodes, "f-mgf");
    expect(cx(mgfRing)).toBeCloseTo(cx(m), 5);
  });

  test("hub boxes are HUB-sized and ride the couple line's Y", () => {
    const ring = hubNode(result.nodes, "f-aw");
    const a = personNode(result.nodes, "a");
    expect(ring.width).toBe(HUB);
    expect(ring.y + ring.height / 2).toBeCloseTo(a.rank * RANK_PITCH + 50, 5);
  });

  test("anchorCenter reports the anchor card centre", () => {
    const a = personNode(result.nodes, "a");
    expect(result.anchorCenter.x).toBeCloseTo(cx(a), 5);
    expect(result.anchorCenter.y).toBeCloseTo(a.y + a.height / 2, 5);
  });

  test("determinism: identical inputs → byte-identical layouts", () => {
    const again = layoutFor("a");
    expect(again).toEqual(result);
  });

  test("bidirectional swap: A→W→A reproduces A's layout exactly", () => {
    const atW = layoutFor("w");
    // From w's perspective the previous owner is a spouse card…
    expect(personNode(atW.nodes, "a")).toBeDefined();
    expect(atW.nodes.find((n) => n.id === "gf")).toBeUndefined();
    // …and swapping back is pixel-identical to the original.
    const backAtA = layoutFor("a");
    expect(backAtA).toEqual(result);
  });

  test("uncles hang from the grandparents' ring alongside the lineage parent", () => {
    const legs = result.edges.filter((e) => e.id.startsWith("descent:f-gf:"));
    const targets = legs.map((e) => e.id.split(":")[2]).sort();
    expect(targets).toEqual(["f", "u1"]);
  });
});
