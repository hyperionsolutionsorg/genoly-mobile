/**
 * PORTED from genoly-family-web src/components/explorer/perspective/
 * perspectiveTestKit.ts (2026-07-09). TEST-ONLY. Convex Id casts became
 * identity helpers (mobile ids are plain strings).
 */
/**
 * perspectiveTestKit — shared fixtures + geometric verifiers for the
 * perspective Explorer test suites. TEST-ONLY module (imported exclusively by
 * *.test.ts files; never by app code, so it never reaches a bundle).
 *
 * Provides:
 *   - tiny builders for ExplorerPerson / FamilyEdge fixtures;
 *   - a BFS generation-assigner that mirrors convex/explorerGraph.ts semantics
 *     (adults of a union share a generation, children are gen-1, parents gen+1,
 *     bounded by a radius) so scope tests see exactly what the server sends;
 *   - a seeded-random genealogy generator (multi-marriage, married-in spouses,
 *     occasional cousin marriage, configurable depth/size);
 *   - the geometric referee: zero proper connector crossings, no connector
 *     stabbing through an unrelated card, no node-box overlaps.
 */

import type { ExplorerPerson, FamilyEdge } from "./explorerTypes";
import type { LaidEdge, LaidNode } from "./perspectiveLayout";

export const pid = (s: string) => s;
export const fid = (s: string) => s;

export function person(id: string, generation = 0): ExplorerPerson {
  return { _id: pid(id), preferredName: id, isLiving: true, generation };
}

export function family(
  id: string,
  adultIds: string[],
  childIds: string[],
  opts: { primaryAdults?: string[]; sortOrders?: Record<string, number> } = {},
): FamilyEdge {
  const sortOrders: Record<string, number> = {};
  const isPrimaryForAdult: Record<string, boolean> = {};
  adultIds.forEach((a, i) => {
    sortOrders[a] = opts.sortOrders?.[a] ?? i;
    isPrimaryForAdult[a] = opts.primaryAdults ? opts.primaryAdults.includes(a) : true;
  });
  return {
    familyId: fid(id),
    familyType: "married",
    status: "active",
    adultIds: adultIds.map(pid),
    childIds: childIds.map(pid),
    sortOrders,
    isPrimaryForAdult,
  };
}

/**
 * Assign signed generations from `anchorId` exactly like explorerGraph's BFS
 * (ancestors positive, descendants negative), bounded by `radius`, and return
 * the persons the server would return (those the BFS reached).
 */
export function bfsGenerations(
  anchorId: string,
  families: FamilyEdge[],
  radius = Number.POSITIVE_INFINITY,
): Map<string, number> {
  const asAdult = new Map<string, FamilyEdge[]>();
  const asChild = new Map<string, FamilyEdge[]>();
  for (const f of families) {
    for (const a of f.adultIds.map(String)) {
      (asAdult.get(a) ?? asAdult.set(a, []).get(a)!).push(f);
    }
    for (const c of f.childIds.map(String)) {
      (asChild.get(c) ?? asChild.set(c, []).get(c)!).push(f);
    }
  }
  const gen = new Map<string, number>([[anchorId, 0]]);
  const queue = [anchorId];
  const enqueue = (id: string, g: number) => {
    if (gen.has(id)) return;
    gen.set(id, g);
    queue.push(id);
  };
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const g = gen.get(cur)!;
    for (const f of asAdult.get(cur) ?? []) {
      for (const a of f.adultIds.map(String)) enqueue(a, g);
      if (g - 1 >= -radius) for (const c of f.childIds.map(String)) enqueue(c, g - 1);
    }
    if (g + 1 <= radius) {
      for (const f of asChild.get(cur) ?? []) {
        for (const a of f.adultIds.map(String)) enqueue(a, g + 1);
        for (const c of f.childIds.map(String)) enqueue(c, g);
      }
    }
  }
  return gen;
}

/** Server-payload view of a fixture for a given anchor. */
export function payloadFor(
  anchorId: string,
  families: FamilyEdge[],
  radius = Number.POSITIVE_INFINITY,
): { persons: ExplorerPerson[]; familyEdges: FamilyEdge[] } {
  const gens = bfsGenerations(anchorId, families, radius);
  const persons = [...gens.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, g]) => person(id, g));
  const familyEdges = families
    .map((f) => ({
      ...f,
      adultIds: f.adultIds.filter((a) => gens.has(String(a))),
      childIds: f.childIds.filter((c) => gens.has(String(c))),
    }))
    .filter((f) => f.adultIds.length + f.childIds.length >= 2);
  return { persons, familyEdges };
}

// ── Seeded-random genealogies ────────────────────────────────────────────────

/** mulberry32 — small deterministic PRNG so failures reproduce exactly. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedTree {
  families: FamilyEdge[];
  personIds: string[];
}

/**
 * Generate a genealogy: `founders` root couples, up to `depth` generations of
 * descent, 0–4 children per couple, remarriage probability, occasional
 * blood-internal marriages (cousin marriages → intermarriage chips), and a
 * hard cap on person count.
 */
export function generateTree(
  seed: number,
  opts: { founders?: number; depth?: number; maxPersons?: number } = {},
): GeneratedTree {
  const rng = makeRng(seed);
  const founders = opts.founders ?? 2;
  const depth = opts.depth ?? 5;
  const maxPersons = opts.maxPersons ?? 200;

  let personSeq = 0;
  let familySeq = 0;
  const personIds: string[] = [];
  const families: FamilyEdge[] = [];
  const newPerson = () => {
    const id = `p${String(personSeq++).padStart(4, "0")}`;
    personIds.push(id);
    return id;
  };

  interface Member {
    id: string;
    gen: number; // 0 = founder generation, grows downward
    married: number;
  }
  let currentGen: Member[] = [];
  const everyone: Member[] = [];

  for (let i = 0; i < founders; i++) {
    const a = { id: newPerson(), gen: 0, married: 0 };
    const b = { id: newPerson(), gen: 0, married: 0 };
    currentGen.push(a, b);
    everyone.push(a, b);
    const kids: string[] = [];
    const kidCount = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < kidCount; k++) kids.push(newPerson());
    families.push(family(`f${String(familySeq++).padStart(4, "0")}`, [a.id, b.id], kids));
    a.married++;
    b.married++;
    const kidMembers = kids.map((id) => ({ id, gen: 1, married: 0 }));
    everyone.push(...kidMembers);
  }

  for (let g = 1; g < depth && personIds.length < maxPersons; g++) {
    currentGen = everyone.filter((m) => m.gen === g);
    for (const m of currentGen) {
      if (personIds.length >= maxPersons) break;
      let marriages = 0;
      if (rng() < 0.75) marriages = 1;
      if (rng() < 0.12) marriages = 2;
      if (rng() < 0.03) marriages = 3;
      for (let mi = 0; mi < marriages; mi++) {
        // Spouse: usually married-in; sometimes a same-generation blood
        // relative (cousin marriage → the intermarriage chip path).
        let spouseId: string;
        const sameGen = everyone.filter(
          (o) => o.gen === m.gen && o.id !== m.id && o.married === 0,
        );
        if (rng() < 0.08 && sameGen.length > 0) {
          const pick = sameGen[Math.floor(rng() * sameGen.length)];
          pick.married++;
          spouseId = pick.id;
        } else {
          spouseId = newPerson();
          const sm = { id: spouseId, gen: m.gen, married: 1 };
          everyone.push(sm);
          // Married-in spouses sometimes have recorded parents (their own
          // off-perspective world — the swap-handle case).
          if (rng() < 0.4) {
            const pa = newPerson();
            const pb = newPerson();
            everyone.push({ id: pa, gen: m.gen - 1, married: 1 }, { id: pb, gen: m.gen - 1, married: 1 });
            families.push(family(`f${String(familySeq++).padStart(4, "0")}`, [pa, pb], [spouseId]));
          }
        }
        m.married++;
        const kids: string[] = [];
        if (g < depth - 1) {
          const kidCount = Math.floor(rng() * 4);
          for (let k = 0; k < kidCount && personIds.length < maxPersons; k++) {
            const kid = newPerson();
            kids.push(kid);
            everyone.push({ id: kid, gen: g + 1, married: 0 });
          }
        }
        families.push(
          family(`f${String(familySeq++).padStart(4, "0")}`, [m.id, spouseId], kids, {
            primaryAdults: mi === 0 ? [m.id, spouseId] : [spouseId],
          }),
        );
      }
    }
  }
  return { families, personIds };
}

// ── The geometric referee ────────────────────────────────────────────────────

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  edgeId: string;
  familyId: string;
}

function toSegments(edges: LaidEdge[]): Seg[] {
  const segs: Seg[] = [];
  for (const e of edges) {
    for (let i = 0; i < e.points.length - 1; i++) {
      const a = e.points[i];
      const b = e.points[i + 1];
      if (a.x === b.x && a.y === b.y) continue;
      segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, edgeId: e.id, familyId: e.familyId });
    }
  }
  return segs;
}

const EPS = 0.25;

/** Classify how two segments meet: none / touch (a point) / overlap / cross. */
function meet(a: Seg, b: Seg): "none" | "touch" | "overlap" | "cross" {
  const d = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = d(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const d2 = d(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  const d3 = d(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const d4 = d(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  const z = (v: number) => Math.abs(v) < EPS;

  if (!z(d1) && !z(d2) && !z(d3) && !z(d4)) {
    if (d1 * d2 < 0 && d3 * d4 < 0) return "cross";
    return "none";
  }
  // Some collinearity involved. All connectors are axis-aligned, so interval
  // arithmetic settles it exactly.
  const within = (lo: number, hi: number, v: number) => v >= lo - EPS && v <= hi + EPS;
  const overlap1d = (a1: number, a2: number, b1: number, b2: number) => {
    const [alo, ahi] = a1 < a2 ? [a1, a2] : [a2, a1];
    const [blo, bhi] = b1 < b2 ? [b1, b2] : [b2, b1];
    const lo = Math.max(alo, blo);
    const hi = Math.min(ahi, bhi);
    if (hi - lo > EPS) return "overlap" as const;
    if (hi - lo >= -EPS) return "touch" as const;
    return "none" as const;
  };
  if (z(d1) && z(d2) && z(d3) && z(d4)) {
    // Fully collinear.
    const horizontal = Math.abs(a.y1 - a.y2) < EPS;
    if (horizontal && Math.abs(a.y1 - b.y1) > EPS) return "none";
    if (!horizontal && Math.abs(a.x1 - b.x1) > EPS) return "none";
    return horizontal
      ? overlap1d(a.x1, a.x2, b.x1, b.x2)
      : overlap1d(a.y1, a.y2, b.y1, b.y2);
  }
  // An endpoint of one lies on the other (T-touch) — verify by containment.
  const onSeg = (s: Seg, x: number, y: number) =>
    Math.abs(d(s.x1, s.y1, s.x2, s.y2, x, y)) < EPS &&
    within(Math.min(s.x1, s.x2), Math.max(s.x1, s.x2), x) &&
    within(Math.min(s.y1, s.y2), Math.max(s.y1, s.y2), y);
  if (onSeg(a, b.x1, b.y1) || onSeg(a, b.x2, b.y2) || onSeg(b, a.x1, a.y1) || onSeg(b, a.x2, a.y2)) {
    return "touch";
  }
  return "none";
}

export interface RefereeReport {
  crossings: string[];
  boxStabs: string[];
  nodeOverlaps: string[];
}

/**
 * The invariant referee. Violations (each a human-readable string):
 *   - crossings: segments of DIFFERENT families meeting at all, or segments of
 *     the same family properly crossing (same-family touch/overlap is the
 *     shared bus rail — allowed);
 *   - boxStabs: a connector passing through a person card that is not an
 *     adult/child of that connector's family;
 *   - nodeOverlaps: two node boxes overlapping (a ring is allowed to sit on
 *     its own single-parent card — those hubs render no glyph).
 */
export function referee(
  nodes: LaidNode[],
  edges: LaidEdge[],
  families: FamilyEdge[],
): RefereeReport {
  const segs = toSegments(edges);
  const crossings: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i];
      const b = segs[j];
      if (a.edgeId === b.edgeId) continue;
      const m = meet(a, b);
      if (m === "none") continue;
      if (a.familyId === b.familyId && m !== "cross") continue;
      crossings.push(`${a.edgeId} ${m} ${b.edgeId}`);
    }
  }

  const membersOf = new Map<string, Set<string>>();
  for (const f of families) {
    membersOf.set(
      String(f.familyId),
      new Set([...f.adultIds.map(String), ...f.childIds.map(String)]),
    );
  }
  const personNodes = nodes.filter((n) => n.kind === "person");
  const boxStabs: string[] = [];
  const SHRINK = 1;
  for (const s of segs) {
    const allowed = membersOf.get(s.familyId) ?? new Set();
    for (const n of personNodes) {
      if (allowed.has(n.id)) continue;
      const lo = { x: n.x + SHRINK, y: n.y + SHRINK };
      const hi = { x: n.x + n.width - SHRINK, y: n.y + n.height - SHRINK };
      const [sxlo, sxhi] = s.x1 < s.x2 ? [s.x1, s.x2] : [s.x2, s.x1];
      const [sylo, syhi] = s.y1 < s.y2 ? [s.y1, s.y2] : [s.y2, s.y1];
      if (sxhi < lo.x || sxlo > hi.x || syhi < lo.y || sylo > hi.y) continue;
      boxStabs.push(`${s.edgeId} stabs ${n.id}`);
    }
  }

  const nodeOverlaps: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const hubOnCard =
        (a.kind === "hub" && !a.isCouple && b.kind === "person") ||
        (b.kind === "hub" && !b.isCouple && a.kind === "person");
      if (hubOnCard) continue;
      const S = 0.5;
      const sep =
        a.x + a.width - S <= b.x + S ||
        b.x + b.width - S <= a.x + S ||
        a.y + a.height - S <= b.y + S ||
        b.y + b.height - S <= a.y + S;
      if (!sep) nodeOverlaps.push(`${a.id} overlaps ${b.id}`);
    }
  }

  return { crossings, boxStabs, nodeOverlaps };
}
