/**
 * explorerTypes — hand-maintained mirrors of the web backend's tree-surface
 * payload shapes (genoly-family-web convex/explorerGraph.ts + convex/pedigree.ts).
 *
 * The web repo's `convex/_generated/api` can't be imported here (separate
 * repo), so these types are pinned by hand exactly like lib/genolyApi.ts does
 * for its function references. The web backend is the source of truth — when a
 * payload changes there, update it here.
 *
 * PURE TYPES ONLY — no imports, no runtime code — so the ported geometry
 * modules under lib/tree/ stay dependency-free and Node-testable.
 */

/** persons.gender enum (web convex/lib/validators.ts `gender`). */
export type PersonGender = 'male' | 'female' | 'nonbinary' | 'unknown' | 'other';

/** families.familyType enum (web convex/lib/validators.ts `familyType`). */
export type FamilyType = 'married' | 'unmarried' | 'partnered' | 'unknown';

/** families.status enum (web convex/lib/validators.ts `familyStatus`). */
export type FamilyStatus = 'active' | 'ended' | 'unknown';

// ── explorerGraph:explorerGraph payload ───────────────────────────────

/** One person in the bounded neighborhood (web ExplorerPerson). */
export interface ExplorerPerson {
  _id: string;
  slug?: string;
  preferredName: string;
  surname?: string;
  gender?: PersonGender;
  /** Birth year (UTC) from the primary birth event, if any. */
  birthYear?: number;
  /** Death year (UTC) from the primary death event, if any. */
  deathYear?: number;
  isLiving: boolean;
  /** Signed offset from the anchor: +1 parent, -1 child, 0 anchor/sibling/spouse. */
  generation: number;
}

/** One family (union) among the bounded set (web FamilyEdge). */
export interface FamilyEdge {
  familyId: string;
  familyType: FamilyType;
  status: FamilyStatus;
  adultIds: string[];
  childIds: string[];
  /** adultId → familyAdults.sortOrder within this union. */
  sortOrders: Record<string, number>;
  /** adultId → whether this family is that adult's primary union. */
  isPrimaryForAdult: Record<string, boolean>;
}

export type ViewerConfidence = 'linked' | 'heuristic';

export type ReadOnlyContext = 'demo-admin' | 'demo-viewer' | 'viewer-role' | null;

/** The full explorerGraph:explorerGraph return payload. */
export interface ExplorerGraphResult {
  persons: ExplorerPerson[];
  familyEdges: FamilyEdge[];
  /** The viewer's resolved person on this tree (linked identity or heuristic). */
  viewerPersonId: string | null;
  viewerConfidence: ViewerConfidence;
  readOnlyContext: ReadOnlyContext;
  caps: { truncatedUnions: string[]; hitRadiusCeiling: boolean };
  /** Total non-trashed persons in the tree (for "X of Y" copy). */
  totalPersons: number;
}

// ── pedigree:getAncestorTree payload ──────────────────────────────────

/** One adult on a spouse family row (web convex/lib/personSpouses.ts). */
export interface SpouseFamilyAdult {
  personId: string;
  preferredName: string;
  surname?: string;
  isLiving: boolean;
  birthYear?: number;
  deathYear?: number;
  slug?: string;
}

export interface SpouseFamilyData {
  familyId: string;
  createdAt: number;
  adults: SpouseFamilyAdult[];
}

/**
 * The NESTED ancestor tree node returned by `pedigree:getAncestorTree`
 * (father/mother recursion). ⚠️ Distinct from `explorerGraph:getAncestorTree`
 * (a flat Ahnentafel shape, Focus-only, Pro-gated server-side) — the mobile
 * Pedigree/Fan surfaces must ONLY use this nested shape.
 */
export interface AncestorNode {
  _id: string;
  slug?: string;
  preferredName: string;
  surname?: string;
  gender?: string;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  isLiving: boolean;
  spouseFamilies: SpouseFamilyData[];
  father?: AncestorNode | null;
  mother?: AncestorNode | null;
}
