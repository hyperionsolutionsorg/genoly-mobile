/**
 * PORTED from genoly-family-web convex/lib/perspectiveLayout.ts (2026-07-09).
 * Pure + DOM-free + deterministic; copied verbatim. Keep in sync with the web copy.
 */
/**
 * perspectiveLayout — the anchored-hourglass placement pass for the read-only
 * perspective Explorer (docs/perspective-explorer-layout.md §4).
 *
 * Consumes a PerspectiveScope (perspectiveScope.ts) and emits absolutely
 * positioned nodes (person cards + union rings) and orthogonal connector
 * polylines. Because the scope is a strict ancestor cone with downward-only
 * unit blocks, and every block packs into disjoint per-rank X-bands, the
 * emitted connectors cannot cross — verified empirically by
 * perspectiveLayout.crossings.test.ts over seeded-random forests.
 *
 * Structure:
 *   1. LOW ZONE — the owner's unit at port x=0, siblings alternating outward.
 *   2. SIDE BLOCKS — for each of the owner's parents: the parent card, their
 *      extra marriages, this side's aunts/uncles, and the pure couples-cone
 *      pedigree above — built side-agnostically (everything fans right of the
 *      parent) then MIRRORED for the father side, so collateral worlds always
 *      face away from the spine.
 *   3. COMPOSE — side blocks shift toward the spine as far as the per-rank
 *      contours and the couple-line minimum allow; the parents' union ring
 *      sits on the (possibly long) couple line directly above the owner.
 *
 * Y is rank-quantized: rank = -(server generation), so ancestors are negative
 * (up) and descendants positive (down). X comes from rigid-block packing —
 * there is no collision pass; overlap-freedom is a property of the packing.
 *
 * Pure + DOM-free + deterministic (G7): unit-tests run headless.
 */

import type { PerspectiveScope, PersonUnit, UnionGroup, ConeLevel, ConeParent } from "./perspectiveScope";

// ── Geometry vocabulary ──────────────────────────────────────────────────────

/** Uniform person card (PersonCard M) — rethink P8: no shrink-by-distance. */
export const CARD = { width: 180, height: 100 };
/** The owner's card (PersonCard L) — deliberate focal emphasis, same rank Y. */
export const ANCHOR_CARD = { width: 210, height: 112 };
/** The union ring node (Stage-3 glyph, unchanged). */
export const HUB = 18;

/** Clear space between a couple's two cards (the ring centres inside it). */
export const COUPLE_GAP = 44;
/** Gap between sibling / adjacent unit blocks at the same rank. */
export const SIBLING_GAP = 28;
/** Gap between a unit's children blocks. */
export const CHILD_GAP = 24;
/** Gap between the two pedigree cones above a couple. */
export const CONE_GAP = 56;
/** Vertical whitespace between ranks (the connector-bus lane lives here). */
export const RANK_GAP = 72;
/** Row pitch. */
export const RANK_PITCH = CARD.height + RANK_GAP;

export interface LaidPersonNode {
  kind: "person";
  id: string; // personId
  x: number; // top-left
  y: number;
  width: number;
  height: number;
  rank: number;
}

export interface LaidHubNode {
  kind: "hub";
  id: string; // `union:<familyId>`
  familyId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rank: number;
  familyType: UnionGroup["familyType"];
  status: UnionGroup["status"];
  isPrimary: boolean;
  /** Render the ring glyph (false for single-parent routing hubs). */
  isCouple: boolean;
  /** Intermarriage chip: the blood adult placed elsewhere on the canvas. */
  linkedSpouseId: string | null;
  /** Detached extra marriage (3rd+ union): tether glyph, no couple line. */
  isDetached: boolean;
}

export type LaidNode = LaidPersonNode | LaidHubNode;

export interface LaidEdge {
  id: string;
  kind: "couple" | "descent";
  familyId: string;
  /** Node ids the edge is registered between (xyflow bookkeeping only —
   *  the rendered geometry is `points`, not endpoint-derived). */
  sourceId: string;
  targetId: string;
  /** Orthogonal polyline in canvas coordinates. */
  points: Array<{ x: number; y: number }>;
}

export interface PerspectiveLayoutResult {
  nodes: LaidNode[];
  edges: LaidEdge[];
  /** The owner's card centre (viewport centring — no fitView guesswork). */
  anchorCenter: { x: number; y: number };
}

export const unionNodeId = (familyId: string) => `union:${familyId}`;

// ── Rigid blocks ─────────────────────────────────────────────────────────────

/** A rigid block: node id → centre X. Y is fully determined by each id's rank. */
interface Block {
  cx: Map<string, number>;
}

interface HubMeta {
  familyId: string;
  familyType: UnionGroup["familyType"];
  status: UnionGroup["status"];
  isPrimary: boolean;
  isCouple: boolean;
  linkedSpouseId: string | null;
  isDetached: boolean;
}

interface LayoutCtx {
  rankOf: Map<string, number>;
  widthOf: Map<string, number>;
  hubMeta: Map<string, HubMeta>;
  /** union familyId → ordered child ids drawing a descent leg from its ring. */
  descentOf: Map<string, string[]>;
  /** union familyId → the two card ids joined by a couple line. */
  coupleOf: Map<string, [string, string]>;
  /** union familyId → adjacent card linked to the ring by a short stub
   *  (intermarriage chip rings and detached rings' own spouses). */
  stubOf: Map<string, string>;
  anchorId: string;
}

const widthOf = (ctx: LayoutCtx, id: string) => ctx.widthOf.get(id) ?? CARD.width;

/** Per-rank right-edge contour of a block. */
function rightContour(ctx: LayoutCtx, b: Block): Map<number, number> {
  const out = new Map<number, number>();
  for (const [id, cx] of b.cx) {
    const r = ctx.rankOf.get(id)!;
    const edge = cx + widthOf(ctx, id) / 2;
    out.set(r, Math.max(out.get(r) ?? -Infinity, edge));
  }
  return out;
}

/** Per-rank left-edge contour of a block. */
function leftContour(ctx: LayoutCtx, b: Block): Map<number, number> {
  const out = new Map<number, number>();
  for (const [id, cx] of b.cx) {
    const r = ctx.rankOf.get(id)!;
    const edge = cx - widthOf(ctx, id) / 2;
    out.set(r, Math.min(out.get(r) ?? Infinity, edge));
  }
  return out;
}

/** Rigid shift. */
function shiftBlock(b: Block, dx: number): void {
  if (dx === 0) return;
  for (const [id, cx] of b.cx) b.cx.set(id, cx + dx);
}

/** Merge `src` into `dst` (positions already final in dst's frame). */
function mergeBlock(dst: Block, src: Block): void {
  for (const [id, cx] of src.cx) dst.cx.set(id, cx);
}

/**
 * Pack `incoming` to the RIGHT of `base`: shift right by the smallest amount
 * that clears base's right contour at EVERY rank the incoming block spans
 * (never pulls left — a pull could re-introduce overlap elsewhere), then
 * merge. The load-bearing overlap-freedom primitive.
 */
function packRight(ctx: LayoutCtx, base: Block, incoming: Block, gap: number): void {
  const rc = rightContour(ctx, base);
  let shift = 0;
  for (const [id, cx] of incoming.cx) {
    const occupied = rc.get(ctx.rankOf.get(id)!);
    if (occupied === undefined) continue;
    const minCenter = occupied + gap + widthOf(ctx, id) / 2;
    shift = Math.max(shift, minCenter - cx);
  }
  shiftBlock(incoming, shift);
  mergeBlock(base, incoming);
}

/** Mirror of packRight: pack `incoming` to the LEFT of `base`, then merge. */
function packLeft(ctx: LayoutCtx, base: Block, incoming: Block, gap: number): void {
  const lc = leftContour(ctx, base);
  let shift = 0;
  for (const [id, cx] of incoming.cx) {
    const occupied = lc.get(ctx.rankOf.get(id)!);
    if (occupied === undefined) continue;
    const maxCenter = occupied - gap - widthOf(ctx, id) / 2;
    shift = Math.min(shift, maxCenter - cx);
  }
  shiftBlock(incoming, shift);
  mergeBlock(base, incoming);
}

/** Mirror a block around x=0 (father-side construction trick — see header). */
function mirrorBlock(b: Block): void {
  for (const [id, cx] of b.cx) b.cx.set(id, -cx);
}

// ── Registration helpers ─────────────────────────────────────────────────────

function registerPerson(ctx: LayoutCtx, id: string, rank: number): void {
  ctx.rankOf.set(id, rank);
  ctx.widthOf.set(id, id === ctx.anchorId ? ANCHOR_CARD.width : CARD.width);
}

function registerHub(ctx: LayoutCtx, meta: HubMeta, rank: number): string {
  const id = unionNodeId(meta.familyId);
  ctx.rankOf.set(id, rank);
  ctx.widthOf.set(id, HUB);
  ctx.hubMeta.set(id, meta);
  return id;
}

const groupHubMeta = (g: UnionGroup, isDetached: boolean): HubMeta => ({
  familyId: g.familyId,
  familyType: g.familyType,
  status: g.status,
  isPrimary: g.isPrimary,
  isCouple: g.spouseId != null || g.linkedSpouseId != null,
  linkedSpouseId: g.linkedSpouseId,
  isDetached,
});

// ── Downward unit blocks ─────────────────────────────────────────────────────

/**
 * One union group as a rigid block in a local frame with the ring at x=0:
 * children packed beneath and centred, the married-in spouse a COUPLE_GAP
 * seat right of the ring. The unit owner is NOT part of this block.
 */
function buildUnionGroupBlock(
  ctx: LayoutCtx,
  g: UnionGroup,
  rank: number,
  isDetached: boolean,
): Block {
  const hubId = registerHub(ctx, groupHubMeta(g, isDetached), rank);

  const kids: Block = { cx: new Map() };
  const kidPorts: number[] = [];
  for (const c of g.children) {
    const sub = buildUnitBlock(ctx, c, rank + 1);
    packRight(ctx, kids, sub, CHILD_GAP);
    kidPorts.push(kids.cx.get(c.personId)!);
  }
  const grp: Block = { cx: new Map([[hubId, 0]]) };
  if (kidPorts.length > 0) {
    const centroid = kidPorts.reduce((a, b) => a + b, 0) / kidPorts.length;
    shiftBlock(kids, -centroid); // children centroid directly under the ring
    mergeBlock(grp, kids);
    ctx.descentOf.set(
      g.familyId,
      g.children.map((c) => c.personId),
    );
  }
  if (g.spouseId) {
    registerPerson(ctx, g.spouseId, rank);
    const spouse: Block = {
      cx: new Map([[g.spouseId, HUB / 2 + COUPLE_GAP / 2 + widthOf(ctx, g.spouseId) / 2]]),
    };
    // Nothing else lives at the spouse's rank inside this group (children are a
    // rank below), so this is a no-op pack — kept for the structural guarantee.
    packRight(ctx, grp, spouse, COUPLE_GAP / 2);
    if (isDetached) ctx.stubOf.set(g.familyId, g.spouseId); // ring→own-spouse stub
  }
  return grp;
}

/**
 * A person unit (owner + all their union groups) as a rigid block. The owner
 * seats LEFT of their primary ring; a second union MIRRORS to the owner's
 * left so both spouses stay adjacent with short couple lines; 3rd+ unions fan
 * right DETACHED (ring tether, no line back to the owner — a long line would
 * have to cross the nearer spouse's card, and zero-crossings outrank it).
 */
function buildUnitBlock(ctx: LayoutCtx, unit: PersonUnit, rank: number): Block {
  registerPerson(ctx, unit.personId, rank);
  const w = widthOf(ctx, unit.personId);
  const block: Block = { cx: new Map() };

  const groups = unit.unions;
  if (groups.length === 0) {
    block.cx.set(unit.personId, 0);
    return block;
  }

  const primary = buildUnionGroupBlock(ctx, groups[0], rank, false);
  const seated = groups[0].spouseId != null || groups[0].linkedSpouseId != null;
  primary.cx.set(unit.personId, seated ? -(HUB / 2 + COUPLE_GAP / 2 + w / 2) : 0);
  if (groups[0].spouseId) {
    ctx.coupleOf.set(groups[0].familyId, [unit.personId, groups[0].spouseId]);
  } else if (groups[0].linkedSpouseId) {
    ctx.stubOf.set(groups[0].familyId, unit.personId); // owner→chip-ring stub
  }
  mergeBlock(block, primary);

  for (let i = 1; i < groups.length; i++) {
    const g = groups[i];
    if (i === 1) {
      const grp = buildUnionGroupBlock(ctx, g, rank, false);
      mirrorBlock(grp);
      if (g.spouseId) ctx.coupleOf.set(g.familyId, [g.spouseId, unit.personId]);
      else if (g.linkedSpouseId) ctx.stubOf.set(g.familyId, unit.personId);
      packLeft(ctx, block, grp, COUPLE_GAP / 2);
    } else {
      packRight(ctx, block, buildUnionGroupBlock(ctx, g, rank, true), SIBLING_GAP);
    }
  }
  return block;
}

// ── The ancestor cone ────────────────────────────────────────────────────────

/**
 * A couples-cone level (the parents of `childId` and everything above) in a
 * local frame; `dropX` is where the caller must seat the child (the ring x).
 * No collaterals live up here — the scope guarantees it — so cones are pure
 * pedigree and provably crossing-free.
 */
function buildConeBlock(
  ctx: LayoutCtx,
  childId: string,
  level: ConeLevel,
  rank: number,
): { block: Block; dropX: number } {
  const block: Block = { cx: new Map() };
  const ports: number[] = [];

  for (const p of level.parents) {
    registerPerson(ctx, p.personId, rank);
    const sub: Block = { cx: new Map([[p.personId, 0]]) };
    if (p.above) {
      const cone = buildConeBlock(ctx, p.personId, p.above, rank - 1);
      shiftBlock(cone.block, 0 - cone.dropX);
      mergeBlock(sub, cone.block); // strictly above the card → disjoint ranks
    }
    packRight(ctx, block, sub, CONE_GAP);
    ports.push(block.cx.get(p.personId)!);
  }

  const isCouple = level.parents.length === 2;
  const hubId = registerHub(
    ctx,
    {
      familyId: level.familyId,
      familyType: level.familyType,
      status: level.status,
      isPrimary: true,
      isCouple,
      linkedSpouseId: null,
      isDetached: false,
    },
    rank,
  );
  const mid = ports.reduce((a, b) => a + b, 0) / ports.length;
  block.cx.set(hubId, mid);
  if (isCouple) {
    ctx.coupleOf.set(level.familyId, [level.parents[0].personId, level.parents[1].personId]);
  }
  ctx.descentOf.set(level.familyId, [childId]);
  return { block, dropX: mid };
}

/**
 * The block for one of the owner's parents: parent card at local x=0, their
 * extra marriages adjacent, this side's aunts/uncles beyond, the cone above.
 * Side-agnostic (everything fans RIGHT of the parent); the caller mirrors the
 * father side. Port = the parent card (its centre is the lineage column).
 */
function buildParentSideBlock(ctx: LayoutCtx, parent: ConeParent, rank: number): Block {
  registerPerson(ctx, parent.personId, rank);
  const block: Block = { cx: new Map([[parent.personId, 0]]) };

  parent.extraUnions.forEach((g, i) => {
    const detached = i > 0;
    const grp = buildUnionGroupBlock(ctx, g, rank, detached);
    if (!detached) {
      if (g.spouseId) ctx.coupleOf.set(g.familyId, [parent.personId, g.spouseId]);
      else if (g.linkedSpouseId) ctx.stubOf.set(g.familyId, parent.personId);
    }
    packRight(ctx, block, grp, COUPLE_GAP / 2);
  });

  for (const c of parent.above?.collaterals ?? []) {
    packRight(ctx, block, buildUnitBlock(ctx, c, rank), SIBLING_GAP);
  }

  if (parent.above) {
    const cone = buildConeBlock(ctx, parent.personId, parent.above, rank - 1);
    shiftBlock(cone.block, 0 - cone.dropX); // lineage drop lands on the parent
    mergeBlock(block, cone.block); // cone spans ranks ≤ rank-1 only → safe merge
    // The aunts/uncles hang from the same ring as the parent.
    const kids = ctx.descentOf.get(parent.above.familyId) ?? [];
    ctx.descentOf.set(parent.above.familyId, [
      ...kids,
      ...(parent.above.collaterals?.map((c) => c.personId) ?? []),
    ]);
  }

  return block;
}

// ── Y helpers ────────────────────────────────────────────────────────────────

const rankTop = (rank: number, h: number) => rank * RANK_PITCH + (CARD.height - h) / 2;
const rankCenterY = (rank: number) => rank * RANK_PITCH + CARD.height / 2;
const busLaneY = (rank: number) => rank * RANK_PITCH + CARD.height + RANK_GAP / 2;

// ── Orchestrator ─────────────────────────────────────────────────────────────

export function computePerspectiveLayout(scope: PerspectiveScope): PerspectiveLayoutResult {
  const ctx: LayoutCtx = {
    rankOf: new Map(),
    widthOf: new Map(),
    hubMeta: new Map(),
    descentOf: new Map(),
    coupleOf: new Map(),
    stubOf: new Map(),
    anchorId: scope.anchorId,
  };

  // 1. LOW ZONE — owner unit at port 0, siblings alternating outward.
  const canvas = buildUnitBlock(ctx, scope.anchorUnit, 0);
  shiftBlock(canvas, 0 - canvas.cx.get(scope.anchorId)!);

  const siblings = scope.parentLevel?.collaterals ?? [];
  siblings.forEach((sib, i) => {
    const sub = buildUnitBlock(ctx, sib, 0);
    if (i % 2 === 0) packRight(ctx, canvas, sub, SIBLING_GAP);
    else packLeft(ctx, canvas, sub, SIBLING_GAP);
  });

  // 2 + 3. SIDE BLOCKS + the parents' ring above the owner.
  if (scope.parentLevel) {
    const lvl = scope.parentLevel;
    const isCouple = lvl.parents.length === 2;
    const hubId = registerHub(
      ctx,
      {
        familyId: lvl.familyId,
        familyType: lvl.familyType,
        status: lvl.status,
        isPrimary: true,
        isCouple,
        linkedSpouseId: null,
        isDetached: false,
      },
      -1,
    );
    ctx.descentOf.set(lvl.familyId, [scope.anchorId, ...siblings.map((s) => s.personId)]);

    const seat = (p: string) => HUB / 2 + COUPLE_GAP / 2 + widthOf(ctx, p) / 2;

    // FATHER side: build side-agnostic, mirror so collateral worlds face left,
    // seat the parent left of the spine, then contour-clear against the canvas.
    const father = lvl.parents[0];
    {
      const side = buildParentSideBlock(ctx, father, -1);
      mirrorBlock(side);
      if (isCouple) {
        const portCx = side.cx.get(father.personId)!;
        shiftBlock(side, Math.min(0, -seat(father.personId) - portCx));
      }
      packLeft(ctx, canvas, side, SIBLING_GAP);
    }

    // MOTHER side (unmirrored — collaterals already fan right).
    const mother = lvl.parents[1];
    if (mother) {
      const side = buildParentSideBlock(ctx, mother, -1);
      const portCx = side.cx.get(mother.personId)!;
      shiftBlock(side, Math.max(0, seat(mother.personId) - portCx));
      packRight(ctx, canvas, side, SIBLING_GAP);
    }

    if (isCouple) {
      ctx.coupleOf.set(lvl.familyId, [father.personId, mother!.personId]);
      // The ring sits on the couple line directly above the owner — the
      // owner's drop is vertical and the sibling bus stays in the low zone.
      canvas.cx.set(hubId, 0);
    } else {
      // Single parent: the ring rides the parent's own column (no couple
      // line); the descent bus routes from there. Ring glyph is suppressed.
      canvas.cx.set(hubId, canvas.cx.get(father.personId)!);
    }
  }

  // ── Materialize nodes ──────────────────────────────────────────────────────
  const nodes: LaidNode[] = [];
  for (const [id, cx] of [...canvas.cx.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const rank = ctx.rankOf.get(id)!;
    const hub = ctx.hubMeta.get(id);
    if (hub) {
      nodes.push({
        kind: "hub",
        id,
        familyId: hub.familyId,
        x: cx - HUB / 2,
        y: rankCenterY(rank) - HUB / 2,
        width: HUB,
        height: HUB,
        rank,
        familyType: hub.familyType,
        status: hub.status,
        isPrimary: hub.isPrimary,
        isCouple: hub.isCouple,
        linkedSpouseId: hub.linkedSpouseId,
        isDetached: hub.isDetached,
      });
    } else {
      const w = widthOf(ctx, id);
      const h = id === scope.anchorId ? ANCHOR_CARD.height : CARD.height;
      nodes.push({ kind: "person", id, x: cx - w / 2, y: rankTop(rank, h), width: w, height: h, rank });
    }
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // ── Materialize edges ──────────────────────────────────────────────────────
  const edges: LaidEdge[] = [];

  for (const [familyId, [aId, bId]] of [...ctx.coupleOf.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const a = nodeById.get(aId);
    const b = nodeById.get(bId);
    if (!a || !b || aId === bId) continue;
    const [l, r] = a.x <= b.x ? [a, b] : [b, a];
    const y = rankCenterY(l.rank);
    edges.push({
      id: `couple:${familyId}`,
      kind: "couple",
      familyId,
      sourceId: l.id,
      targetId: r.id,
      points: [
        { x: l.x + l.width, y },
        { x: r.x, y },
      ],
    });
  }

  // Short ring↔card stubs (chip rings, detached rings' own spouses). Adjacent
  // by construction, so they cannot cross anything.
  for (const [familyId, cardId] of [...ctx.stubOf.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const hub = nodeById.get(unionNodeId(familyId));
    const card = nodeById.get(cardId);
    if (!hub || !card) continue;
    const y = rankCenterY(hub.rank);
    const hubCx = hub.x + hub.width / 2;
    const cardEdge = hubCx >= card.x + card.width ? card.x + card.width : card.x;
    edges.push({
      id: `couple:${familyId}:stub`,
      kind: "couple",
      familyId,
      sourceId: cardId,
      targetId: hub.id,
      points: [
        { x: cardEdge, y },
        { x: hubCx, y },
      ],
    });
  }

  for (const [familyId, childIds] of [...ctx.descentOf.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const hub = nodeById.get(unionNodeId(familyId));
    if (!hub) continue;
    const hubCx = hub.x + hub.width / 2;
    const hubBottom = hub.y + hub.height;
    const lane = busLaneY(hub.rank);
    for (const c of childIds) {
      const child = nodeById.get(c);
      if (!child) continue;
      const childCx = child.x + child.width / 2;
      const pts =
        Math.abs(childCx - hubCx) < 0.5
          ? [
              { x: hubCx, y: hubBottom },
              { x: hubCx, y: child.y },
            ]
          : [
              { x: hubCx, y: hubBottom },
              { x: hubCx, y: lane },
              { x: childCx, y: lane },
              { x: childCx, y: child.y },
            ];
      edges.push({
        id: `descent:${familyId}:${c}`,
        kind: "descent",
        familyId,
        sourceId: hub.id,
        targetId: c,
        points: pts,
      });
    }
  }

  const anchorNode = nodeById.get(scope.anchorId)!;
  return {
    nodes,
    edges,
    anchorCenter: {
      x: anchorNode.x + anchorNode.width / 2,
      y: anchorNode.y + anchorNode.height / 2,
    },
  };
}
