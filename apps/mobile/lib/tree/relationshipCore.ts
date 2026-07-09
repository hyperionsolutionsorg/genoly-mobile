/**
 * PORTED from genoly-family-web convex/lib/relationshipCore.ts (2026-07-09).
 * Pure + DOM-free. Only change: Convex codegen types (Doc/Id) replaced with
 * plain strings + the local PersonGender mirror. Keep in sync with the web copy.
 */
/**
 * relationshipCore — the PURE relationship algorithm (Family Explorer Stage 3
 * PR1, design plan §3.7).
 *
 * This is the shared-pure-lib refactor of `convex/relationships.ts`, mirroring
 * the `convex/lib/pedigreeGeometry.ts` precedent (shipped #159): one algorithm,
 * two callers — the existing `relationships.computeRelationship` server query
 * (PersonDetail's RelationshipBadge) and the explorer's client-side List/Family
 * relationship labels (computed over the `explorerGraph` result with no
 * per-node query).
 *
 * EVERYTHING HERE IS PURE. No `ctx`, no DB, no DOM, no Convex runtime — it
 * operates on in-memory maps the caller assembles. That keeps it unit-testable
 * in isolation and callable from both the server (build maps from `ctx.db`) and
 * the browser (build maps from the `explorerGraph` payload).
 *
 * Two public entry points:
 *   - `computeRelationshipFromMaps` — bare labels ("father", "second cousin
 *     once removed", "themselves", "no traceable relation"). Exact behavioural
 *     parity with the original `relationships.ts` query, which the refactored
 *     query wraps so RelationshipBadge keeps working unchanged.
 *   - `computeRelationshipLabel` — viewer-framed labels for the explorer ("You",
 *     "Your father", "Your wife's cousin", "Distant relative") + a `kind`
 *     classification + a `confidence` flag (linked vs heuristic anchor, §3.8).
 *
 * Bounded at 8 generations each way (16 total span) — far more than any
 * practical tree — plus at most ONE spouse hop for the in-law layer.
 */

import type { PersonGender } from "./explorerTypes";

/** Walk-distance ceiling each direction. Matches the original MAX_GENERATIONS. */
export const MAX_GENERATIONS = 8;

type Gender = PersonGender | undefined;

/**
 * In-memory relationship graph. Keyed by raw id strings (Convex ids are
 * strings at runtime) so the pure module never touches the Convex runtime.
 * The server assembles this from `ctx.db`; the client assembles it from the
 * `explorerGraph` payload.
 */
export interface RelationshipGraph {
  /** personId → minimal person info (only gender is needed for labels). */
  persons: Map<string, { gender?: Gender }>;
  /** personId → familyIds in which they are an ADULT (parent/spouse/…). */
  familyAdultsByPerson: Map<string, string[]>;
  /** childPersonId → the family rows in which they appear as a CHILD. */
  familyChildrenByChild: Map<string, { familyId: string; relationshipType: string }[]>;
  /** familyId → adult personIds in that family. */
  adultsByFamily: Map<string, string[]>;
  /** familyId → child personIds in that family. */
  childrenByFamily: Map<string, string[]>;
}

interface AncestorInfo {
  /** Generations above the seed (1 = parent, 2 = grandparent, …). */
  up: number;
  /** True if any link on the chain was non-biological (step/adopted/…). */
  stepFlag: boolean;
}

/** The raw, un-framed result — exact parity with the old query's return. */
export interface BareRelationship {
  label: string;
  lca: string | null;
  fromGens: number;
  toGens: number;
  step: boolean;
}

export type RelationshipKind =
  | "self"
  | "blood"
  | "spouse"
  | "in-law"
  | "step"
  | "none";

/** The viewer-framed result used by the explorer's List + Family views. */
export interface FramedRelationship {
  label: string;
  kind: RelationshipKind;
  /**
   * `linked` once the viewer has confirmed their identity on the tree
   * (treeMembers.personId set, §3.8); `heuristic` while the anchor is only a
   * best-guess. The explorer renders heuristic "Your X" labels muted.
   */
  confidence: "linked" | "heuristic";
}

// ── Ancestor walk (pure, map-based) ──────────────────────────────────────

/** BFS up-and-out from `seedId`, recording every reachable ancestor. */
function collectAncestors(
  seedId: string,
  graph: RelationshipGraph,
): Map<string, AncestorInfo> {
  const out = new Map<string, AncestorInfo>();
  out.set(seedId, { up: 0, stepFlag: false });
  const queue: Array<{ id: string; up: number; stepFlag: boolean }> = [
    { id: seedId, up: 0, stepFlag: false },
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.up >= MAX_GENERATIONS) continue;

    // Families where `cur.id` is a CHILD → the adults are upstream parents.
    const asChild = graph.familyChildrenByChild.get(cur.id) ?? [];
    for (const cf of asChild) {
      const step = cur.stepFlag || cf.relationshipType !== "biological";
      const adults = graph.adultsByFamily.get(cf.familyId) ?? [];
      for (const a of adults) {
        const nextUp = cur.up + 1;
        const existing = out.get(a);
        if (!existing || existing.up > nextUp) {
          out.set(a, { up: nextUp, stepFlag: step });
          queue.push({ id: a, up: nextUp, stepFlag: step });
        }
      }
    }
  }

  return out;
}

/** True if A and B are adults in a shared family (spouses/partners). */
function areSpouses(a: string, b: string, graph: RelationshipGraph): boolean {
  const aFamilies = new Set(graph.familyAdultsByPerson.get(a) ?? []);
  if (aFamilies.size === 0) return false;
  const bFamilies = graph.familyAdultsByPerson.get(b) ?? [];
  return bFamilies.some((f) => aFamilies.has(f));
}

/** All adults sharing a family with `personId` (their spouses/co-parents). */
function getSpouses(personId: string, graph: RelationshipGraph): string[] {
  const out = new Set<string>();
  for (const f of graph.familyAdultsByPerson.get(personId) ?? []) {
    for (const a of graph.adultsByFamily.get(f) ?? []) {
      if (a !== personId) out.add(a);
    }
  }
  return [...out];
}

interface LcaResult {
  lca: string;
  fromA: number;
  fromB: number;
  step: boolean;
}

/**
 * Lowest common ancestor between two pre-computed ancestor sets — the ancestor
 * reachable from both that minimizes (genFromA + genFromB). Preserves the
 * original query's tie-break (first improvement wins on a strict `<`).
 */
function findLca(
  ancA: Map<string, AncestorInfo>,
  ancB: Map<string, AncestorInfo>,
): LcaResult | null {
  let best: LcaResult | null = null;
  let bestCost = Infinity;
  for (const [pid, infoA] of ancA) {
    const infoB = ancB.get(pid);
    if (!infoB) continue;
    const cost = infoA.up + infoB.up;
    if (cost < bestCost) {
      bestCost = cost;
      best = {
        lca: pid,
        fromA: infoA.up,
        fromB: infoB.up,
        step: infoA.stepFlag || infoB.stepFlag,
      };
    }
  }
  return best;
}

/** Blood link between two persons via their LCA, or null if none within bound. */
function bloodLink(a: string, b: string, graph: RelationshipGraph): LcaResult | null {
  return findLca(collectAncestors(a, graph), collectAncestors(b, graph));
}

// ── Label translation (ported verbatim — already pure) ───────────────────

function labelForRelationship(
  fromAUp: number,
  fromBUp: number,
  step: boolean,
  toGender: Gender | undefined,
): string {
  const prefix = step ? "step-" : "";

  if (fromAUp === 0 && fromBUp === 0) return "themselves";

  // A is the LCA → B descends from A.
  if (fromAUp === 0) {
    return ancestorDescendantLabel(fromBUp, "descendant", toGender, prefix);
  }
  // B is the LCA → A descends from B → B is A's ancestor.
  if (fromBUp === 0) {
    return ancestorDescendantLabel(fromAUp, "ancestor", toGender, prefix);
  }

  // Siblings (full or half).
  if (fromAUp === 1 && fromBUp === 1) {
    return step ? "half-sibling" : siblingWord(toGender);
  }

  // Aunt / uncle / niece / nephew chain.
  if (fromAUp === 1 || fromBUp === 1) {
    const farUp = Math.max(fromAUp, fromBUp);
    const greatPrefix = "great-".repeat(Math.max(0, farUp - 2));
    if (fromAUp === 1) {
      // B is the more distant one → B is A's niece/nephew.
      return `${prefix}${greatPrefix}${nieceNephewWord(toGender)}`;
    }
    return `${prefix}${greatPrefix}${auntUncleWord(toGender)}`;
  }

  // Cousins.
  const cousinDegree = Math.min(fromAUp, fromBUp) - 1;
  const removed = Math.abs(fromAUp - fromBUp);
  const ord = ordinal(cousinDegree);
  const removedSuffix =
    removed === 0
      ? ""
      : removed === 1
        ? " once removed"
        : removed === 2
          ? " twice removed"
          : ` ${removed} times removed`;
  return `${prefix}${ord} cousin${removedSuffix}`;
}

function ancestorDescendantLabel(
  gens: number,
  direction: "ancestor" | "descendant",
  gender: Gender | undefined,
  prefix: string,
): string {
  if (gens === 1) {
    return prefix + (direction === "ancestor" ? parentWord(gender) : childWord(gender));
  }
  if (gens === 2) {
    return prefix + (direction === "ancestor" ? grandparentWord(gender) : grandchildWord(gender));
  }
  const greatPrefix = "great-".repeat(gens - 2);
  return (
    prefix +
    greatPrefix +
    (direction === "ancestor" ? grandparentWord(gender) : grandchildWord(gender))
  );
}

function parentWord(g: Gender | undefined): string {
  if (g === "male") return "father";
  if (g === "female") return "mother";
  return "parent";
}
function childWord(g: Gender | undefined): string {
  if (g === "male") return "son";
  if (g === "female") return "daughter";
  return "child";
}
function grandparentWord(g: Gender | undefined): string {
  if (g === "male") return "grandfather";
  if (g === "female") return "grandmother";
  return "grandparent";
}
function grandchildWord(g: Gender | undefined): string {
  if (g === "male") return "grandson";
  if (g === "female") return "granddaughter";
  return "grandchild";
}
function siblingWord(g: Gender | undefined): string {
  if (g === "male") return "brother";
  if (g === "female") return "sister";
  return "sibling";
}
function auntUncleWord(g: Gender | undefined): string {
  if (g === "male") return "uncle";
  if (g === "female") return "aunt";
  return "aunt/uncle";
}
function nieceNephewWord(g: Gender | undefined): string {
  if (g === "male") return "nephew";
  if (g === "female") return "niece";
  return "niece/nephew";
}
function spouseWord(g: Gender | undefined): string {
  if (g === "male") return "husband";
  if (g === "female") return "wife";
  return "spouse";
}

function ordinal(n: number): string {
  if (n <= 0) return "0th";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// ── Public: bare relationship (parity with the original query) ────────────

/**
 * Bare, un-framed relationship from A to B — the exact shape the original
 * `relationships.computeRelationship` query returned, so the refactored query
 * is a thin wrapper and RelationshipBadge stays untouched.
 *
 * Returns `null` only when B is not present in the graph (the old query
 * returned null for a missing / cross-tree target).
 */
export function computeRelationshipFromMaps(
  fromPersonId: string,
  toPersonId: string,
  graph: RelationshipGraph,
): BareRelationship | null {
  if (fromPersonId === toPersonId) {
    return { label: "themselves", lca: null, fromGens: 0, toGens: 0, step: false };
  }

  const toPerson = graph.persons.get(toPersonId);
  if (!toPerson) return null;

  // Spouse shortcut — same generation, no ancestor chain needed.
  if (areSpouses(fromPersonId, toPersonId, graph)) {
    return {
      label: spouseWord(toPerson.gender),
      lca: null,
      fromGens: 0,
      toGens: 0,
      step: false,
    };
  }

  const lca = findLca(
    collectAncestors(fromPersonId, graph),
    collectAncestors(toPersonId, graph),
  );
  if (!lca) {
    return { label: "no traceable relation", lca: null, fromGens: 0, toGens: 0, step: false };
  }

  return {
    label: labelForRelationship(lca.fromA, lca.fromB, lca.step, toPerson.gender),
    lca: lca.lca,
    fromGens: lca.fromA,
    toGens: lca.fromB,
    step: lca.step,
  };
}

// ── Public: viewer-framed label (the explorer's List + Family API) ────────

/**
 * The in-law layer (design plan §3.7) — the genuinely new logic on top of the
 * blood/spouse core. Bounded to exactly ONE spouse hop:
 *
 *   A) target is the SPOUSE of a blood relative of the viewer
 *      → son/daughter-in-law (viewer's child's spouse),
 *        brother/sister-in-law (viewer's sibling's spouse),
 *        else "Your <blood label>'s husband/wife".
 *   B) target is a BLOOD RELATIVE of one of the viewer's spouses
 *      → mother/father-in-law (spouse's parent),
 *        brother/sister-in-law (spouse's sibling),
 *        else "Your <spouse possessive>'s <blood label>".
 *
 * Returns null when no single-hop in-law relation is found.
 */
function computeInLaw(
  viewerId: string,
  targetId: string,
  graph: RelationshipGraph,
  targetGender: Gender | undefined,
): string | null {
  // Pre-compute: is the target ALSO registered as an adult in any family
  // where the viewer is a child? If yes, the target is one of the viewer's
  // recorded parents (biological, step, adopted — the underlying
  // `familyChildren.relationshipType` distinguishes those, but ANY of them
  // means "this is my parent", not "this is my parent's spouse"). Path A
  // below guards on this: PR 2.5 hotfix (brief §6) — the prior code labelled
  // biological mothers as "Your stepmother" whenever the viewer's parent
  // union carried a separate familyEdge that also listed her as an adult on
  // a different family (or when the viewer's own child-of edge was missing
  // for that family so `findLca` couldn't find her upstream). This guard
  // ensures we never step-label a person who's registered as the viewer's
  // parent on ANY family, regardless of how the ancestor walk reached her.
  const targetIsRecordedParentOfViewer = (
    graph.familyChildrenByChild.get(viewerId) ?? []
  ).some((childRow) =>
    (graph.adultsByFamily.get(childRow.familyId) ?? []).includes(targetId),
  );

  // A) target is the spouse of one of the viewer's blood relatives.
  for (const rel of getSpouses(targetId, graph)) {
    const link = bloodLink(viewerId, rel, graph);
    if (!link) continue;
    // viewer's parent's spouse → stepmother / stepfather (Issue #403). The
    // bloodLink is from viewer (A) to relative (B) — when the relative is the
    // viewer's parent, A descends one gen and B is the LCA (fromA=1, fromB=0).
    // The target (the parent's spouse, but not the viewer's bio parent — the
    // bio parent would already have been matched by the blood/step branch
    // above) is the step-parent. Warmer than the prior "Your father's wife"
    // fallback. Only fires when the target's gender is known (male/female);
    // unknown / non-binary genders fall through to the general possessive
    // chain. Cultural-locale layer (Chinnamma, Peddamma, etc.) is a separate
    // scope (task #355, casual kinship labels).
    //
    // GUARD (PR 2.5 hotfix — brief §6): only fire the step-label when the
    // target is NOT recorded as one of the viewer's parents on ANY family.
    // Without this guard, a biological mother whose upstream LCA edge went
    // missing (or resolved via a different family than expected) gets
    // mis-labelled "Stepmother" because the code sees "spouse of your
    // father" without asking "is she also YOUR mother?".
    if (
      link.fromA === 1 &&
      link.fromB === 0 &&
      !targetIsRecordedParentOfViewer
    ) {
      if (targetGender === "female") return "Your stepmother";
      if (targetGender === "male") return "Your stepfather";
    }
    // viewer's child (viewer is LCA, rel is 1 gen down)
    if (link.fromA === 0 && link.fromB === 1) {
      return "Your " + (targetGender === "female" ? "daughter-in-law" : "son-in-law");
    }
    // viewer's sibling (shared parent one gen up on both sides)
    if (link.fromA === 1 && link.fromB === 1) {
      return "Your " + (targetGender === "female" ? "sister-in-law" : "brother-in-law");
    }
    // general: "Your <relative>'s husband/wife"
    const relLabel = labelForRelationship(
      link.fromA,
      link.fromB,
      link.step,
      graph.persons.get(rel)?.gender,
    );
    return `Your ${relLabel}'s ${spouseWord(targetGender)}`;
  }

  // B) target is a blood relative of one of the viewer's spouses.
  for (const spouse of getSpouses(viewerId, graph)) {
    const link = bloodLink(spouse, targetId, graph);
    if (!link) continue;
    const spousePossessive = spouseWord(graph.persons.get(spouse)?.gender);
    // target is the spouse's parent (spouse 1 gen up, target is LCA)
    if (link.fromA === 1 && link.fromB === 0) {
      return "Your " + (targetGender === "female" ? "mother-in-law" : "father-in-law");
    }
    // target is the spouse's sibling
    if (link.fromA === 1 && link.fromB === 1) {
      return "Your " + (targetGender === "female" ? "sister-in-law" : "brother-in-law");
    }
    // general: "Your wife's/husband's <blood label>"
    const relLabel = labelForRelationship(link.fromA, link.fromB, link.step, targetGender);
    return `Your ${spousePossessive}'s ${relLabel}`;
  }

  return null;
}

/**
 * Viewer-framed relationship label — the explorer's List + Family API.
 *
 *   - self            → "You"
 *   - spouse          → "Your husband/wife/spouse"
 *   - blood / step    → "Your father", "Your step-mother", "Your second cousin"
 *   - in-law (1 hop)  → "Your son-in-law", "Your wife's cousin"
 *   - none / >bound   → "Distant relative"
 *
 * `confidence` is passed through from the caller (linked once the viewer's
 * identity is confirmed on the tree, heuristic while the anchor is a guess).
 */
export function computeRelationshipLabel(
  viewerPersonId: string,
  targetPersonId: string,
  graph: RelationshipGraph,
  opts?: { confidence?: "linked" | "heuristic" },
): FramedRelationship {
  const confidence = opts?.confidence ?? "heuristic";

  if (viewerPersonId === targetPersonId) {
    return { label: "You", kind: "self", confidence };
  }

  const target = graph.persons.get(targetPersonId);
  if (!target) {
    return { label: "Distant relative", kind: "none", confidence };
  }

  // 1) Spouse.
  if (areSpouses(viewerPersonId, targetPersonId, graph)) {
    return { label: "Your " + spouseWord(target.gender), kind: "spouse", confidence };
  }

  // 2) Blood / step (ancestor · descendant · sibling · cousin via LCA).
  const lca = findLca(
    collectAncestors(viewerPersonId, graph),
    collectAncestors(targetPersonId, graph),
  );
  if (lca) {
    const bare = labelForRelationship(lca.fromA, lca.fromB, lca.step, target.gender);
    return { label: "Your " + bare, kind: lca.step ? "step" : "blood", confidence };
  }

  // 3) In-law (at most one spouse hop on top of the blood walk).
  const inLaw = computeInLaw(viewerPersonId, targetPersonId, graph, target.gender);
  if (inLaw) return { label: inLaw, kind: "in-law", confidence };

  // 4) Nothing within bounds.
  return { label: "Distant relative", kind: "none", confidence };
}
