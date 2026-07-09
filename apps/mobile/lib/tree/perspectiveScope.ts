/**
 * PORTED from genoly-family-web convex/lib/perspectiveScope.ts (2026-07-09).
 * Pure + DOM-free; only the FamilyEdge import path changed (mobile mirrors the
 * payload types in ./explorerTypes.ts). Keep in sync with the web copy.
 */
/**
 * perspectiveScope — the pure visible-set computation for the read-only
 * perspective Explorer (docs/perspective-explorer-layout.md §2).
 *
 * At any moment exactly ONE person (the perspective owner = the URL anchor)
 * has their blood family expanded:
 *
 *   - blood ancestry expands upward as a couples-cone (a proper tree even
 *     though the person graph is a DAG);
 *   - collaterals hang off the two nearest ancestor unions only — the owner's
 *     siblings (down to nieces/nephews) and the owner's aunts/uncles (down to
 *     cousins). Deeper collateral worlds collapse to "+N" badges;
 *   - the owner's own descent expands to the fetch radius;
 *   - married-in spouses render as cards but NEVER expand — a spouse with an
 *     off-canvas family carries a swap HANDLE that re-anchors the perspective
 *     to them. Perspective is a swap, not a stack.
 *
 * Because spouses never bring ancestry inline, the visible structure is a
 * forest of downward-only rigid units hung on a strict ancestor cone — the
 * shape perspectiveLayout can draw with zero connector crossings by
 * construction.
 *
 * Intermarriage (both adults of a union already visible as blood — e.g. a
 * cousin marriage) would create a cycle; the union keeps the adult reached
 * first and reports the other via `chips` (rendered as a link chip on the
 * union ring — no cross-canvas connector, so the guarantee survives).
 *
 * Pure + DOM-free: unit-tested headless in the node vitest env.
 */

import type { FamilyEdge } from "./explorerTypes";

/** The minimal person shape the scope walk needs (ExplorerPerson satisfies it). */
export interface ScopePerson {
  _id: string;
  /** Signed offset from the anchor — ancestors positive (server convention). */
  generation: number;
}

// ── Output model ─────────────────────────────────────────────────────────────

/** One union of a unit owner: ring + married-in spouse + children units. */
export interface UnionGroup {
  familyId: string;
  familyType: FamilyEdge["familyType"];
  status: FamilyEdge["status"];
  isPrimary: boolean;
  /** Married-in adult rendered as a card next to the owner (null: single parent). */
  spouseId: string | null;
  /** Intermarriage: the other adult is already visible elsewhere (chip, no card). */
  linkedSpouseId: string | null;
  children: PersonUnit[];
}

/** A person + their DOWNWARD world (unions ordered primary-first). */
export interface PersonUnit {
  personId: string;
  unions: UnionGroup[];
}

/** A blood parent in the ancestor cone. */
export interface ConeParent {
  personId: string;
  /** This parent's own parent family — the cone recursion upward. */
  above: ConeLevel | null;
  /**
   * The parent's OTHER marriages (half-sibling groups), shown only on the
   * owner's parents (level 1). At most one gets an adjacent couple line; the
   * rest still render (ring + spouse + children) with a tether chip.
   */
  extraUnions: UnionGroup[];
}

/** One lineage union of the cone: the couple whose child sits on the spine. */
export interface ConeLevel {
  familyId: string;
  familyType: FamilyEdge["familyType"];
  status: FamilyEdge["status"];
  /** 1–2 blood parents, familyAdults sortOrder order (father-side first). */
  parents: ConeParent[];
  /**
   * The union's other children as downward units — populated only for the two
   * nearest levels (siblings of the owner; aunts/uncles). Empty above.
   */
  collaterals: PersonUnit[];
}

export interface PerspectiveScope {
  anchorId: string;
  /** The owner's own unit: card + spouses + full descent. */
  anchorUnit: PersonUnit;
  /** The cone above the owner (null when the owner has no recorded parents). */
  parentLevel: ConeLevel | null;
  /** Every person rendered on the canvas. */
  visible: Set<string>;
  /** Married-in persons whose family lives off-canvas → swap handle. */
  handles: Set<string>;
  /** personId | `union:<familyId>` → count of hidden kin behind that node. */
  badges: Map<string, number>;
  /** familyId → the intermarried adult already placed elsewhere (link chip). */
  chips: Map<string, string>;
}

// ── Graph indexes ────────────────────────────────────────────────────────────

interface GraphIndex {
  present: Set<string>;
  /** personId → families where they are an adult, ordered primary→sortOrder→id. */
  unionsOf: Map<string, FamilyEdge[]>;
  /** personId → the single deterministic parent family (smallest familyId). */
  childFamilyOf: Map<string, FamilyEdge>;
  familyById: Map<string, FamilyEdge>;
}

/** Order a person's unions primary-first, then sortOrder, then familyId (G7). */
function orderUnions(personId: string, fams: FamilyEdge[]): FamilyEdge[] {
  return [...fams].sort((a, b) => {
    const ap = a.isPrimaryForAdult[personId] ? 0 : 1;
    const bp = b.isPrimaryForAdult[personId] ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const aso = a.sortOrders[personId] ?? 0;
    const bso = b.sortOrders[personId] ?? 0;
    if (aso !== bso) return aso - bso;
    return String(a.familyId).localeCompare(String(b.familyId));
  });
}

export function buildGraphIndex(persons: ScopePerson[], familyEdges: FamilyEdge[]): GraphIndex {
  const present = new Set(persons.map((p) => String(p._id)));
  const unionsRaw = new Map<string, FamilyEdge[]>();
  const childFamiliesRaw = new Map<string, FamilyEdge[]>();
  const familyById = new Map<string, FamilyEdge>();
  for (const f of familyEdges) {
    familyById.set(String(f.familyId), f);
    for (const a of f.adultIds.map(String)) {
      (unionsRaw.get(a) ?? unionsRaw.set(a, []).get(a)!).push(f);
    }
    for (const c of f.childIds.map(String)) {
      (childFamiliesRaw.get(c) ?? childFamiliesRaw.set(c, []).get(c)!).push(f);
    }
  }
  const unionsOf = new Map<string, FamilyEdge[]>();
  for (const [p, fams] of unionsRaw) unionsOf.set(p, orderUnions(p, fams));
  // A person can be a child in more than one recorded family (re-parenting);
  // pick one deterministically so the ancestry is a well-defined tree.
  const childFamilyOf = new Map<string, FamilyEdge>();
  for (const [c, fams] of childFamiliesRaw) {
    childFamilyOf.set(
      c,
      [...fams].sort((a, b) => String(a.familyId).localeCompare(String(b.familyId)))[0],
    );
  }
  return { present, unionsOf, childFamilyOf, familyById };
}

// ── The walk ─────────────────────────────────────────────────────────────────

interface WalkCtx {
  ix: GraphIndex;
  genOf: Map<string, number>;
  visible: Set<string>;
  /**
   * Everyone the expansion will (or would) place as BLOOD — precomputed so a
   * blood relative reached first as somebody's spouse (a cousin who married a
   * sibling) still takes their blood position; the marriage renders as an
   * intermarriage chip instead of stealing them into a spouse card.
   */
  blood: Set<string>;
  /** Unions consumed by the walk (visited guard for cycles / re-encounters). */
  usedUnions: Set<string>;
  handles: Set<string>;
  badges: Map<string, number>;
  chips: Map<string, string>;
}

const addBadge = (ctx: WalkCtx, key: string, n: number) => {
  if (n > 0) ctx.badges.set(key, (ctx.badges.get(key) ?? 0) + n);
};

/**
 * Count the off-canvas world hanging DOWNWARD from the given seed persons:
 * every not-yet-visible descendant plus the married-in spouses met on the way.
 * Used for "+N" badges; never renders, so an over-approximation is acceptable —
 * but this is exact for tree-shaped data.
 */
function countHiddenDescent(ctx: WalkCtx, seeds: string[]): number {
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const s of seeds) {
    if (!ctx.visible.has(s) && ctx.ix.present.has(s) && !seen.has(s)) {
      seen.add(s);
      queue.push(s);
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const u of ctx.ix.unionsOf.get(cur) ?? []) {
      for (const m of [...u.adultIds, ...u.childIds].map(String)) {
        if (seen.has(m) || ctx.visible.has(m) || !ctx.ix.present.has(m)) continue;
        seen.add(m);
        queue.push(m);
      }
    }
  }
  return seen.size;
}

/** Does this married-in spouse have any off-canvas family worth swapping to? */
function spouseHasWorld(ctx: WalkCtx, spouseId: string, throughFamilyId: string): boolean {
  if (ctx.ix.childFamilyOf.has(spouseId)) return true; // parents/siblings exist
  for (const u of ctx.ix.unionsOf.get(spouseId) ?? []) {
    if (String(u.familyId) !== throughFamilyId) return true; // other marriages
  }
  return false;
}

/**
 * Build a person's downward unit. `genFloor` is the deepest server-generation
 * INCLUDED (anchor descent passes -Infinity); children below it collapse into
 * a badge on this unit's owner. `originFid` prevents re-entering the union the
 * walk arrived through.
 */
function buildUnit(
  ctx: WalkCtx,
  personId: string,
  originFid: string | null,
  genFloor: number,
): PersonUnit {
  ctx.visible.add(personId);
  const unions: UnionGroup[] = [];
  for (const u of ctx.ix.unionsOf.get(personId) ?? []) {
    const fid = String(u.familyId);
    if (fid === originFid || ctx.usedUnions.has(fid)) continue;
    ctx.usedUnions.add(fid);

    const otherAdults = u.adultIds.map(String).filter((a) => a !== personId);
    let spouseId: string | null = null;
    let linkedSpouseId: string | null = null;
    for (const a of otherAdults) {
      if (!ctx.ix.present.has(a)) continue;
      if (ctx.visible.has(a) || ctx.blood.has(a)) {
        // Intermarriage — the adult already stands elsewhere as blood. Chip it.
        if (!linkedSpouseId) {
          linkedSpouseId = a;
          ctx.chips.set(fid, a);
        }
      } else if (!spouseId) {
        spouseId = a;
      } else {
        // >2 adults on one family row (rare data shape): surplus adults stay
        // off-canvas, counted behind the ring badge.
        addBadge(ctx, `union:${fid}`, countHiddenDescent(ctx, [a]));
      }
    }
    if (spouseId) {
      ctx.visible.add(spouseId);
      if (spouseHasWorld(ctx, spouseId, fid)) ctx.handles.add(spouseId);
    }

    const children: PersonUnit[] = [];
    const hiddenKids: string[] = [];
    for (const c of u.childIds.map(String)) {
      if (!ctx.ix.present.has(c) || ctx.visible.has(c)) continue;
      const cGen = ctx.genOf.get(c);
      if (cGen === undefined || cGen < genFloor) {
        hiddenKids.push(c);
        continue;
      }
      children.push(buildUnit(ctx, c, fid, genFloor));
    }
    addBadge(ctx, personId, countHiddenDescent(ctx, hiddenKids));

    unions.push({
      familyId: fid,
      familyType: u.familyType,
      status: u.status,
      isPrimary: !!u.isPrimaryForAdult[personId],
      spouseId,
      linkedSpouseId,
      children,
    });
  }
  return { personId, unions };
}

/**
 * Build the ancestor cone above `childId`. `level` counts up from the owner
 * (1 = the owner's parents). Collaterals render only at levels 1 and 2, with
 * descent floors of one-below-the-owner and the owner's generation
 * respectively (siblings → nieces; aunts/uncles → cousins).
 */
function buildCone(ctx: WalkCtx, childId: string, level: number): ConeLevel | null {
  const fam = ctx.ix.childFamilyOf.get(childId);
  if (!fam) return null;
  const fid = String(fam.familyId);
  if (ctx.usedUnions.has(fid)) return null; // pedigree collapse (already climbed)
  ctx.usedUnions.add(fid);

  const parentIds = fam.adultIds
    .map(String)
    .filter((a) => ctx.ix.present.has(a) && !ctx.visible.has(a))
    .slice(0, 2);
  if (parentIds.length === 0) return null;
  for (const p of parentIds) ctx.visible.add(p);

  // Collateral floors: level 1 (owner's siblings) reach one below the owner;
  // level 2 (aunts/uncles) reach the owner's generation (cousins). Above that,
  // whole sibling worlds collapse into a ring badge.
  const showCollaterals = level <= 2;
  const genFloor = level === 1 ? -1 : 0;

  const collaterals: PersonUnit[] = [];
  const hiddenKids: string[] = [];
  for (const c of fam.childIds.map(String)) {
    if (c === childId || !ctx.ix.present.has(c) || ctx.visible.has(c)) continue;
    if (showCollaterals) collaterals.push(buildUnit(ctx, c, fid, genFloor));
    else hiddenKids.push(c);
  }
  addBadge(ctx, `union:${fid}`, countHiddenDescent(ctx, hiddenKids));

  const parents: ConeParent[] = parentIds.map((p) => {
    // A parent's other marriages: rendered as adjacent groups on the owner's
    // parents (half-siblings matter up close); badged above that.
    const others = (ctx.ix.unionsOf.get(p) ?? []).filter(
      (u) => String(u.familyId) !== fid && !ctx.usedUnions.has(String(u.familyId)),
    );
    const extraUnions: UnionGroup[] = [];
    if (level === 1) {
      const host = buildUnit(ctx, p, fid, genFloor);
      // buildUnit re-walks p's remaining unions; p is already visible so the
      // call only materializes the extra union groups.
      extraUnions.push(...host.unions);
    } else {
      const hidden: string[] = [];
      for (const u of others) {
        ctx.usedUnions.add(String(u.familyId));
        hidden.push(...u.adultIds.map(String).filter((a) => a !== p), ...u.childIds.map(String));
      }
      addBadge(ctx, p, countHiddenDescent(ctx, hidden));
    }
    return { personId: p, above: buildCone(ctx, p, level + 1), extraUnions };
  });

  return { familyId: fid, familyType: fam.familyType, status: fam.status, parents, collaterals };
}

/**
 * Dry-run of the expansion: everyone who will stand on the canvas as BLOOD
 * (the anchor, their in-floor descendants, cone parents, in-floor collaterals
 * and half-siblings). Mirrors the walk's floors so spouse-slot decisions in
 * the real walk can consult it regardless of traversal order.
 */
function computeBloodSet(
  ix: GraphIndex,
  genOf: Map<string, number>,
  anchorId: string,
): Set<string> {
  const blood = new Set<string>([anchorId]);

  const addDescent = (p: string, originFid: string | null, floor: number) => {
    for (const u of ix.unionsOf.get(p) ?? []) {
      const fid = String(u.familyId);
      if (fid === originFid) continue;
      for (const c of u.childIds.map(String)) {
        if (!ix.present.has(c) || blood.has(c)) continue;
        const g = genOf.get(c);
        if (g === undefined || g < floor) continue;
        blood.add(c);
        addDescent(c, fid, floor);
      }
    }
  };

  const anchorFam = ix.childFamilyOf.get(anchorId);
  addDescent(anchorId, anchorFam ? String(anchorFam.familyId) : null, Number.NEGATIVE_INFINITY);

  const climbed = new Set<string>();
  const climb = (childId: string, level: number) => {
    const fam = ix.childFamilyOf.get(childId);
    if (!fam) return;
    const fid = String(fam.familyId);
    if (climbed.has(fid)) return;
    climbed.add(fid);
    const parents = fam.adultIds
      .map(String)
      .filter((a) => ix.present.has(a) && !blood.has(a))
      .slice(0, 2);
    for (const p of parents) blood.add(p);
    if (level <= 2) {
      const floor = level === 1 ? -1 : 0;
      for (const c of fam.childIds.map(String)) {
        if (c === childId || !ix.present.has(c) || blood.has(c)) continue;
        blood.add(c);
        addDescent(c, fid, floor);
      }
      if (level === 1) {
        // Parents' other marriages → half-siblings are blood too.
        for (const p of parents) {
          for (const u of ix.unionsOf.get(p) ?? []) {
            const ufid = String(u.familyId);
            if (ufid === fid) continue;
            for (const c of u.childIds.map(String)) {
              if (!ix.present.has(c) || blood.has(c)) continue;
              const g = genOf.get(c);
              if (g === undefined || g < floor) continue;
              blood.add(c);
              addDescent(c, ufid, floor);
            }
          }
        }
      }
    }
    for (const p of parents) climb(p, level + 1);
  };
  climb(anchorId, 1);

  return blood;
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Compute the perspective scope for `anchorId` over an explorerGraph payload.
 * Deterministic: same input → same output (all iteration id- or
 * explicitly-ordered), which is what makes A→B→A swaps reproduce A exactly.
 */
export function computePerspectiveScope(args: {
  anchorId: string;
  persons: ScopePerson[];
  familyEdges: FamilyEdge[];
}): PerspectiveScope {
  const { anchorId, persons, familyEdges } = args;
  const ix = buildGraphIndex(persons, familyEdges);
  const genOf = new Map(persons.map((p) => [String(p._id), p.generation]));
  const ctx: WalkCtx = {
    ix,
    genOf,
    visible: new Set(),
    blood: computeBloodSet(ix, genOf, anchorId),
    usedUnions: new Set(),
    handles: new Set(),
    badges: new Map(),
    chips: new Map(),
  };

  // The walk consumes the anchor's parent union BEFORE the anchor unit would
  // (buildUnit must not re-enter it), so reserve it first.
  const anchorFam = ix.childFamilyOf.get(anchorId);

  ctx.visible.add(anchorId);
  const anchorUnit = buildUnit(
    ctx,
    anchorId,
    anchorFam ? String(anchorFam.familyId) : null,
    Number.NEGATIVE_INFINITY,
  );
  const parentLevel = buildCone(ctx, anchorId, 1);

  return {
    anchorId,
    anchorUnit,
    parentLevel,
    visible: ctx.visible,
    handles: ctx.handles,
    badges: ctx.badges,
    chips: ctx.chips,
  };
}
