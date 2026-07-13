/**
 * Family Connections — pure puzzle-generation logic (Item 5 PR-5b).
 *
 * NYT-Connections-style daily puzzle over REAL tree members: every tile is
 * a person from the tree, and the hidden groups are family dimensions. All
 * functions here are pure and React-free so they're unit-testable
 * (src/lib/connectionsPuzzle.test.ts) — the component
 * (src/pages/games/Connections.tsx) only wires queries + UI state.
 *
 * Daily-seed strategy (2026-06-10 arcade-category decision): deterministic
 * RNG seeded by `${dateUTC}|${tree.slug}|family-connections` via the shared
 * src/lib/dailySeed.ts (xmur3 → mulberry32). Every member of the tree
 * derives the identical board for the day with zero server state.
 *
 * GROUP DIMENSIONS (each carries a person-predicate used for an NYT-style
 * fairness check — a chosen group's criterion must not be satisfied by any
 * tile OUTSIDE the group on the same board, or the puzzle is ambiguous):
 *   - living / remembered members (memorial-safe copy — never "dead")
 *   - same generation in the tree (computed from parent links)
 *   - born in the same decade (birth year from the atlas feed)
 *   - first names starting with the same letter
 *   - first names with the same letter count
 *   - same surname
 *   - married/partnered in this tree (family co-adults)
 *   - parents in this tree (has children recorded)
 *
 * TIER THRESHOLDS — the board degrades deterministically with tree size
 * ("qualifying persons" = non-archived persons with a non-empty, unique
 * display name; duplicates beyond the first are dropped because tile
 * labels double as ids):
 *   - 4×4 (4 groups of 4, 16 tiles): attempted when ≥ 16 persons qualify
 *     AND the backtracking picker finds 4 disjoint fair groups.
 *   - 3×3 (3 groups of 3, 9 tiles): attempted when ≥ 9 persons qualify,
 *     or when the 4×4 pick fails despite 16+ persons (sparse attributes).
 *   - null (empty state): fewer than 9 qualifying persons, or no fair 3×3
 *     pick exists — the page shows the F-007-style "not enough family yet"
 *     empty state with an Add-person CTA. The hub card locks below
 *     9 total persons (gameRegistry requires.totalPersons = 9).
 *   Calibration: the Genoly demo tree (26 persons with dates + genders)
 *   fills the full 4×4; the 5–7-person e2e seed trees land on the empty
 *   state by design and assert it in the e2e spec.
 */

import { createSeededRng, seededPick, seededShuffle } from "./dailySeed";

// Tier thresholds — documented above; the registry mirrors the 3×3 floor.
export const MIN_PERSONS_4X4 = 16;
export const MIN_PERSONS_3X3 = 9;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConnectionsPersonInput {
  id: string;
  /** Display name shown on the tile (preferredName). Unique per board. */
  name: string;
  surname?: string;
  isLiving: boolean;
  birthYear?: number;
  /** 0 = earliest known generation; children = max(parent) + 1. */
  generation?: number;
  /** Has a co-adult (spouse/partner) in at least one family. */
  hasSpouse: boolean;
  /** Has at least one child recorded in the tree. */
  hasChildren: boolean;
}

export type ConnectionsTier = "4x4" | "3x3";

export interface ConnectionsGroup {
  id: string;
  /** Player-facing group label, revealed on solve (sentence case). */
  label: string;
  /** Generator kind — diagnostics + tests; not shown to players. */
  kind: string;
  /** Exactly `groupSize` unique person-name tiles. */
  tiles: string[];
}

export interface ConnectionsPuzzle {
  tier: ConnectionsTier;
  /** Tiles per group AND number of groups (4 for 4×4, 3 for 3×3). */
  groupSize: number;
  /** Groups in band-colour order (index 0–3). */
  groups: ConnectionsGroup[];
  /** groupSize² person-name tiles, seeded-shuffled. Unique → used as ids. */
  tiles: string[];
}

/** Internal candidate — a possible group plus its fairness predicate. */
interface Candidate {
  label: string;
  kind: string;
  /** Persons consumed by this group (length === groupSize). */
  persons: ConnectionsPersonInput[];
  /**
   * NYT-style fairness predicate: no person tile from another chosen group
   * may satisfy it (else the board is ambiguous).
   */
  matches: (p: ConnectionsPersonInput) => boolean;
  /** Groups sharing a theme are never co-selected (thematic ambiguity). */
  theme?: string;
}

// ─── Generation depth (pure graph walk) ─────────────────────────────────────

/**
 * Compute generation depth per person from a parent adjacency map.
 * Roots (no known parents) are generation 0; every child is
 * max(parent generations) + 1. Iterates to a fixed point; cycles (bad
 * data) are bounded by the iteration cap and simply stop deepening.
 */
export function computeGenerations(
  personIds: string[],
  parents: Record<string, string[]>,
): Record<string, number> {
  const gen: Record<string, number> = {};
  for (const id of personIds) gen[id] = 0;
  const cap = personIds.length + 1;
  for (let pass = 0; pass < cap; pass++) {
    let changed = false;
    for (const id of personIds) {
      const ps = parents[id] ?? [];
      for (const p of ps) {
        if (gen[p] === undefined) continue;
        const want = gen[p] + 1;
        if (gen[id] < want) {
          gen[id] = want;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return gen;
}

// ─── Source assembly (existing query shapes → person inputs) ────────────────

/**
 * Build the generator input from the two existing game reads
 * (games.getRelationshipGraph + atlas.getAtlasData.personsTime — the same
 * feeds This or That already uses; no new server code per the client-side
 * games architecture). Persons with duplicate display names beyond the
 * first are dropped — tile labels must be unique for selection to be
 * unambiguous. Sorted by id so generation is independent of query order.
 */
export function buildConnectionsPersons(args: {
  persons: Array<{ _id: string; preferredName: string; surname?: string; isLiving: boolean }>;
  parents: Record<string, string[]>;
  children: Record<string, string[]>;
  spouses: Record<string, string[]>;
  personsTime: Array<{ personId: string; birthYear: number | undefined }>;
}): ConnectionsPersonInput[] {
  const sorted = [...args.persons].sort((a, b) =>
    String(a._id) < String(b._id) ? -1 : 1,
  );
  const generations = computeGenerations(
    sorted.map((p) => String(p._id)),
    args.parents,
  );
  const birthYearById = new Map<string, number>();
  for (const t of args.personsTime) {
    if (typeof t.birthYear === "number") birthYearById.set(t.personId, t.birthYear);
  }

  const seenNames = new Set<string>();
  const out: ConnectionsPersonInput[] = [];
  for (const p of sorted) {
    const name = p.preferredName.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenNames.has(key)) continue; // duplicate label — skip
    seenNames.add(key);
    const id = String(p._id);
    out.push({
      id,
      name,
      surname: p.surname?.trim() || undefined,
      isLiving: p.isLiving,
      birthYear: birthYearById.get(id),
      generation: generations[id],
      hasSpouse: (args.spouses[id] ?? []).length > 0,
      hasChildren: (args.children[id] ?? []).length > 0,
    });
  }
  return out;
}

// ─── Candidate generators ────────────────────────────────────────────────────

function firstNameOf(p: ConnectionsPersonInput): string {
  return p.name.split(/\s+/)[0] ?? p.name;
}

/**
 * Generate the candidate-group pool from the person dimensions. Each
 * candidate consumes exactly `groupSize` seeded-picked members from its
 * dimension bucket, so the combination varies day to day. The pool is
 * seeded-shuffled before backtracking.
 */
export function generateCandidates(
  persons: ConnectionsPersonInput[],
  groupSize: number,
  rng: () => number,
): Candidate[] {
  const candidates: Candidate[] = [];

  const add = (
    label: string,
    kind: string,
    members: ConnectionsPersonInput[],
    matches: (p: ConnectionsPersonInput) => boolean,
    theme?: string,
  ) => {
    if (members.length < groupSize) return;
    candidates.push({
      label,
      kind,
      persons: seededPick(members, groupSize, rng),
      matches,
      theme,
    });
  };

  // 1. Living / remembered (memorial-safe label — never "dead").
  add(
    "Living family members",
    "living",
    persons.filter((p) => p.isLiving),
    (p) => p.isLiving,
    "life-status",
  );
  add(
    "Remembered family members",
    "remembered",
    persons.filter((p) => !p.isLiving),
    (p) => !p.isLiving,
    "life-status",
  );

  // 2. Same generation in the tree.
  const byGeneration = new Map<number, ConnectionsPersonInput[]>();
  for (const p of persons) {
    if (p.generation === undefined) continue;
    if (!byGeneration.has(p.generation)) byGeneration.set(p.generation, []);
    byGeneration.get(p.generation)!.push(p);
  }
  for (const [g, members] of byGeneration) {
    add(
      g === 0 ? "Earliest generation in the tree" : `Generation ${g + 1} of the tree`,
      `generation-${g}`,
      members,
      (p) => p.generation === g,
    );
  }

  // 3. Born in the same decade.
  const byDecade = new Map<number, ConnectionsPersonInput[]>();
  for (const p of persons) {
    if (p.birthYear === undefined) continue;
    const decade = Math.floor(p.birthYear / 10) * 10;
    if (!byDecade.has(decade)) byDecade.set(decade, []);
    byDecade.get(decade)!.push(p);
  }
  for (const [decade, members] of byDecade) {
    add(
      `Born in the ${decade}s`,
      `decade-${decade}`,
      members,
      (p) => p.birthYear !== undefined && Math.floor(p.birthYear / 10) * 10 === decade,
    );
  }

  // 4. First names starting with the same letter.
  const byInitial = new Map<string, ConnectionsPersonInput[]>();
  for (const p of persons) {
    const initial = firstNameOf(p).charAt(0).toUpperCase();
    if (!initial) continue;
    if (!byInitial.has(initial)) byInitial.set(initial, []);
    byInitial.get(initial)!.push(p);
  }
  for (const [letter, members] of byInitial) {
    add(
      `First names starting with ${letter}`,
      `initial-${letter}`,
      members,
      (p) => firstNameOf(p).charAt(0).toUpperCase() === letter,
    );
  }

  // 5. First names with the same letter count.
  const byNameLength = new Map<number, ConnectionsPersonInput[]>();
  for (const p of persons) {
    const len = firstNameOf(p).length;
    if (!byNameLength.has(len)) byNameLength.set(len, []);
    byNameLength.get(len)!.push(p);
  }
  for (const [len, members] of byNameLength) {
    add(
      `First names with ${len} letters`,
      `name-length-${len}`,
      members,
      (p) => firstNameOf(p).length === len,
    );
  }

  // 6. Same surname.
  const bySurname = new Map<string, ConnectionsPersonInput[]>();
  for (const p of persons) {
    if (!p.surname) continue;
    const key = p.surname.toLowerCase();
    if (!bySurname.has(key)) bySurname.set(key, []);
    bySurname.get(key)!.push(p);
  }
  for (const members of bySurname.values()) {
    const surname = members[0].surname!;
    add(
      `The ${surname} family name`,
      `surname-${surname.toLowerCase()}`,
      members,
      (p) => p.surname?.toLowerCase() === surname.toLowerCase(),
    );
  }

  // 7–8. Family roles (married/partnered, parents). Same theme — the two
  // overlap heavily in real trees, so they never share a board.
  add(
    "Married or partnered in this tree",
    "has-spouse",
    persons.filter((p) => p.hasSpouse),
    (p) => p.hasSpouse,
    "family-role",
  );
  add(
    "Parents in this tree",
    "has-children",
    persons.filter((p) => p.hasChildren),
    (p) => p.hasChildren,
    "family-role",
  );

  // Diversity interleave: a board of four same-dimension groups (e.g. four
  // "First names with N letters") is fair but monotonous. Bucket the
  // shuffled candidates by dimension family and round-robin across
  // families so the backtracker tries mixed boards first — it still falls
  // back to same-family combos when nothing else is compatible.
  seededShuffle(candidates, rng);
  const familyOf = (kind: string) => kind.split("-")[0];
  const buckets = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const fam = familyOf(c.kind);
    if (!buckets.has(fam)) buckets.set(fam, []);
    buckets.get(fam)!.push(c);
  }
  const families = seededShuffle([...buckets.keys()], rng);
  const interleaved: Candidate[] = [];
  for (let round = 0; interleaved.length < candidates.length; round++) {
    for (const fam of families) {
      const bucket = buckets.get(fam)!;
      if (round < bucket.length) interleaved.push(bucket[round]);
    }
  }
  return interleaved;
}

// ─── Group selection (backtracking with fairness checks) ────────────────────

function compatible(c: Candidate, chosen: Candidate[]): boolean {
  for (const o of chosen) {
    if (c.label === o.label) return false;
    if (c.theme && c.theme === o.theme) return false;
    // A person can be a tile in at most one group.
    if (c.persons.some((p) => o.persons.some((q) => q.id === p.id))) return false;
    // NYT fairness: a group's criterion must not match tiles outside it.
    if (c.persons.some((p) => o.matches(p))) return false;
    if (o.persons.some((p) => c.matches(p))) return false;
  }
  return true;
}

/** Backtracking pick of `want` mutually-compatible candidates (in order). */
export function chooseGroups(candidates: Candidate[], want: number): Candidate[] | null {
  const chosen: Candidate[] = [];
  function pick(start: number): boolean {
    if (chosen.length === want) return true;
    for (let i = start; i < candidates.length; i++) {
      const c = candidates[i];
      if (!compatible(c, chosen)) continue;
      chosen.push(c);
      if (pick(i + 1)) return true;
      chosen.pop();
    }
    return false;
  }
  return pick(0) ? chosen : null;
}

// ─── Puzzle assembly ─────────────────────────────────────────────────────────

function buildPuzzleAtTier(
  seedKey: string,
  persons: ConnectionsPersonInput[],
  tier: ConnectionsTier,
): ConnectionsPuzzle | null {
  const groupSize = tier === "4x4" ? 4 : 3;
  // Per-tier sub-key: the 3×3 fallback gets its own deterministic stream
  // instead of consuming a partially-advanced 4×4 stream.
  const rng = createSeededRng(`${seedKey}|${tier}`);
  const candidates = generateCandidates(persons, groupSize, rng);
  if (candidates.length < groupSize) return null;
  const chosen = chooseGroups(candidates, groupSize);
  if (!chosen) return null;

  const groups: ConnectionsGroup[] = chosen.map((c, i) => ({
    id: `g${i}`,
    label: c.label,
    kind: c.kind,
    tiles: c.persons.map((p) => p.name),
  }));
  const tiles = seededShuffle(
    groups.flatMap((g) => g.tiles),
    rng,
  );
  return { tier, groupSize, groups, tiles };
}

/**
 * Build today's puzzle for the tree: full 4×4 when the tree supports it,
 * else the 3×3 fallback, else null (caller renders the "not enough family
 * yet" empty state). Deterministic for a given (seedKey, persons) pair —
 * see the tier-threshold doc in the file header.
 */
export function buildDailyPuzzle(
  seedKey: string,
  persons: ConnectionsPersonInput[],
): ConnectionsPuzzle | null {
  if (persons.length >= MIN_PERSONS_4X4) {
    const full = buildPuzzleAtTier(seedKey, persons, "4x4");
    if (full) return full;
  }
  if (persons.length >= MIN_PERSONS_3X3) {
    return buildPuzzleAtTier(seedKey, persons, "3x3");
  }
  return null;
}

// ─── Guess evaluation ────────────────────────────────────────────────────────

/** Group index that owns a tile label, or -1. */
export function groupIndexOfTile(puzzle: ConnectionsPuzzle, tile: string): number {
  return puzzle.groups.findIndex((g) => g.tiles.includes(tile));
}

export interface GuessResult {
  /** Solved group index when all tiles share one group, else null. */
  solvedGroupIndex: number | null;
  /** True when all but one tile share a group (NYT "one away"). */
  oneAway: boolean;
  /** Group index per guessed tile — feeds the emoji share grid. */
  row: number[];
}

/** Evaluate a guess of `puzzle.groupSize` tiles against the puzzle. */
export function evaluateGuess(puzzle: ConnectionsPuzzle, tiles: string[]): GuessResult {
  const row = tiles.map((t) => groupIndexOfTile(puzzle, t));
  const counts = new Map<number, number>();
  for (const g of row) counts.set(g, (counts.get(g) ?? 0) + 1);
  const best = Math.max(...counts.values());
  return {
    solvedGroupIndex: best === puzzle.groupSize ? row[0] : null,
    oneAway: best === puzzle.groupSize - 1,
    row,
  };
}

/** Emoji share grid — one row per guess, coloured square per tile's group. */
export const GROUP_EMOJI = ["🟨", "🟩", "🟦", "🟪"] as const;

export function buildShareGrid(guessRows: number[][]): string {
  return guessRows
    .map((row) => row.map((g) => GROUP_EMOJI[g] ?? "⬜").join(""))
    .join("\n");
}
