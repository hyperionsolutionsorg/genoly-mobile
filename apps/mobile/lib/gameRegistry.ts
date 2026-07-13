/**
 * Game registry — single source of truth for the Family Games hub.
 *
 * Each entry declares the game's identity, category, time budget, and the
 * minimum data conditions that must be met for the game to be playable
 * (e.g. Atlas Quiz needs at least 2 placed persons). The hub reads this
 * registry to build its grid; each game's actual implementation lives at
 * `src/pages/games/<slug>.tsx`.
 *
 * Adding a new game = one entry here + one new route in App.tsx +
 * one component file. No schema changes, no cron changes.
 */

/**
 * FLAT MULTI-CATEGORY MODEL (2026-07-06, W1 — supersedes the 2026-06-11
 * two-axis category/playStyle split in memory-bank/wiki/decisions/
 * 2026-06-11-games-category-system.md): every chip on the hub filter
 * strip is a category, every game carries one or more categories, and
 * the hub renders one section per non-empty category with a game's card
 * appearing inside EACH of its tagged sections. Empty categories are
 * hidden (no chips, no headers, no teaser).
 *
 * Category meanings:
 *   - "family" — tests knowledge OF your family (the original
 *     tree-knowledge games)
 *   - "arcade" — reflex/action gameplay, daily-seeded high-score loops
 *   - "quick"  — short casual rounds, no deep thinking required
 *   - "puzzle" — deliberate deduction/solving mechanics
 *   - "sprint" — race-the-clock time-attack mechanics
 */
export type GameCategory = "family" | "arcade" | "quick" | "puzzle" | "sprint";

export interface GameDef {
  /** URL slug used for the route /tree/:slug/games/<key> */
  key: string;
  /** Display name */
  name: string;
  /** Single-emoji icon */
  icon: string;
  /** Card subtitle / explainer (≤ 80 chars) */
  description: string;
  /**
   * Every category this game belongs to (≥ 1). The hub renders the game's
   * card inside EACH tagged section; category chips filter to games
   * carrying that tag. Order within the array is not significant —
   * section order comes from GAME_CATEGORY_ORDER.
   */
  categories: GameCategory[];
  /** Approx play time in minutes (for the card badge) */
  playTimeMin: number;
  /**
   * Minimum tree state required to play. Used by the hub to mark the card
   * as locked + show what's missing.
   */
  requires: {
    /** Total persons on the tree (regardless of place data) */
    totalPersons?: number;
    /** Persons with resolvable lat/lng on the atlas (for map-based games) */
    placedPersons?: number;
    /**
     * Persons with a derivable birth/death YEAR — i.e. they are the
     * primary participant of ≥1 birth or death event with a numeric
     * dateStart. Mirrors getGamesContext.personsWithYearCount, which uses
     * the same definition Timeline Tap's buildTimelineItems applies to
     * timeline rows (no false unlocks).
     */
    personsWithYear?: number;
    /** Persons whose preferredName length falls inside this inclusive range */
    nameLengthRange?: { min: number; max: number };
    /** At least this many parent → child relationships */
    parentChildLinks?: number;
  };
}

/** Hub section + filter-chip order (sentence case labels in META). */
export const GAME_CATEGORY_ORDER: GameCategory[] = [
  "family",
  "arcade",
  "quick",
  "puzzle",
  "sprint",
];

/** Section headers + the category chips on the filter strip. */
export const GAME_CATEGORY_META: Record<GameCategory, { label: string; icon: string }> = {
  family: { label: "Family", icon: "👥" },
  arcade: { label: "Arcade", icon: "🕹️" },
  quick: { label: "Quick play", icon: "🧠" },
  puzzle: { label: "Puzzles", icon: "🎯" },
  sprint: { label: "Time-attack", icon: "🏃" },
};

/**
 * Groups games into hub sections: one entry per category (in
 * GAME_CATEGORY_ORDER) that has at least one tagged game. A game tagged
 * with N categories appears in N sections. Pure — the hub calls it with
 * GAMES; tests call it with fixtures.
 */
export function gamesByCategory(
  games: readonly GameDef[],
): Array<{ category: GameCategory; games: GameDef[] }> {
  return GAME_CATEGORY_ORDER.map((category) => ({
    category,
    games: games.filter((g) => g.categories.includes(category)),
  })).filter((section) => section.games.length > 0);
}

export const GAMES: GameDef[] = [
  {
    key: "wordle",
    name: "Family Wordle",
    icon: "🟩",
    description: "Guess today's family name in 6 tries. Letter-by-letter colour feedback.",
    // Wordle-style letter elimination is deduction, not reflex → puzzle.
    categories: ["puzzle", "family"],
    playTimeMin: 2,
    requires: {
      totalPersons: 1,
      nameLengthRange: { min: 4, max: 8 },
    },
  },
  {
    key: "word-search",
    name: "Family Word Search",
    icon: "🔍",
    description: "Find family names hidden in a 15×15 letter grid. Rotates weekly.",
    // Untimed hidden-word grid search → puzzle.
    categories: ["puzzle", "family"],
    playTimeMin: 10,
    requires: { totalPersons: 4 },
  },
  {
    key: "atlas-quiz",
    name: "Atlas Quiz",
    icon: "🗺️",
    description: "Pin family birthplaces on a world map. Score by accuracy.",
    // 5 casual pin-drop rounds of recall + accuracy — a quick quiz loop,
    // no solving/deduction (retagged from "puzzle", W1 2026-07-06).
    categories: ["quick", "family"],
    playTimeMin: 5,
    requires: { placedPersons: 2 },
  },
  {
    key: "sprint",
    name: "Generation Sprint",
    icon: "⏱️",
    description: "Race up the family tree. How many parents back can you name?",
    // 90-second race up the ancestor chain → time-attack.
    categories: ["sprint", "family"],
    playTimeMin: 3,
    requires: { totalPersons: 3, parentChildLinks: 2 },
  },
  {
    key: "who-am-i",
    name: "Who Am I?",
    icon: "🕵️",
    description: "Guess the family member from progressively-revealed clues. Fewer clues, more points.",
    // Clue-by-clue deduction with a risk/reward reveal budget → puzzle.
    categories: ["puzzle", "family"],
    playTimeMin: 3,
    requires: { totalPersons: 3 },
  },
  {
    key: "this-or-that",
    name: "This or That",
    icon: "⚖️",
    description: "Pairwise family showdowns. Who's older, who's further north, who has more kids?",
    // 10 rapid binary picks in ~2 minutes — the canonical quick-play loop.
    categories: ["quick", "family"],
    playTimeMin: 2,
    requires: { totalPersons: 4 },
  },
  {
    key: "family-connections",
    name: "Family Connections",
    icon: "🧩",
    description: "Sort family members into hidden groups. New puzzle every day.",
    // Untimed deliberate grouping deduction (NYT-Connections mechanics, 4
    // mistakes, no clock) → puzzle only. Its former "arcade" tag encoded
    // daily-ness, not gameplay; the flat model tags by true gameplay
    // (W1 2026-07-06 — supersedes the two-axis shelf identity).
    categories: ["puzzle"],
    playTimeMin: 5,
    // Mirrors MIN_PERSONS_3X3 in src/lib/connectionsPuzzle.ts (kept as a
    // literal so the hub bundle doesn't pull in the puzzle generator):
    // 9+ persons → 3×3 board, 16+ → full 4×4. Below 9 the page shows the
    // F-007-style "not enough family yet" empty state.
    requires: { totalPersons: 9 },
  },
  {
    key: "timeline-tap",
    name: "Timeline Tap",
    icon: "⚡",
    description: "Tap family events into order against the clock. Daily high score.",
    // 30-second reflex tapping with combo scoring → arcade AND time-attack.
    categories: ["sprint", "arcade"],
    playTimeMin: 1,
    // Real precondition (2026-06-11, replacing the totalPersons:3 proxy):
    // getGamesContext.personsWithYearCount counts persons with a derivable
    // birth/death year — the same raw material the page's tier ladder
    // reduces (src/lib/timelineTapGame.ts). 5 year-bearing people supply
    // the full 5-card round; the page's own tier check stays as defense
    // for deep links and for same-year collisions (5 people sharing fewer
    // than 3 distinct years still get the F-007 empty state there).
    requires: { personsWithYear: 5 },
  },
];

export const GAME_BY_KEY = new Map<string, GameDef>(GAMES.map((g) => [g.key, g]));

/**
 * Picks a deterministic "Today's game" for a tree based on day-of-year so
 * every user in the tree sees the same daily rotation, and so the choice
 * is stable across reloads on the same day.
 */
export function pickTodaysGame(): GameDef {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  return GAMES[dayOfYear % GAMES.length];
}

/**
 * Evaluates whether a game is playable given current tree state. Returns
 * `null` if playable, otherwise a short user-facing reason (e.g. "Add 3
 * more people to unlock").
 */
export interface TreeGameContext {
  totalPersons: number;
  placedPersons: number;
  parentChildLinks: number;
  /** preferredName lengths of every person — used for nameLengthRange check */
  nameLengths: number[];
  /** Persons with a derivable birth/death year (see requires.personsWithYear). */
  personsWithYearCount: number;
}

export function checkPlayable(
  game: GameDef,
  ctx: TreeGameContext,
): string | null {
  const r = game.requires;
  if (r.totalPersons !== undefined && ctx.totalPersons < r.totalPersons) {
    const need = r.totalPersons - ctx.totalPersons;
    return `Add ${need} more ${need === 1 ? "person" : "people"} to unlock`;
  }
  if (r.placedPersons !== undefined && ctx.placedPersons < r.placedPersons) {
    const need = r.placedPersons - ctx.placedPersons;
    return `Add a birth place to ${need} more ${need === 1 ? "person" : "people"} to unlock`;
  }
  if (
    r.personsWithYear !== undefined &&
    ctx.personsWithYearCount < r.personsWithYear
  ) {
    const need = r.personsWithYear - ctx.personsWithYearCount;
    return `Add a birth or death year to ${need} more ${need === 1 ? "person" : "people"} to unlock`;
  }
  if (r.parentChildLinks !== undefined && ctx.parentChildLinks < r.parentChildLinks) {
    const need = r.parentChildLinks - ctx.parentChildLinks;
    return `Add ${need} more parent-child ${need === 1 ? "link" : "links"} to unlock`;
  }
  if (r.nameLengthRange) {
    const { min, max } = r.nameLengthRange;
    const matching = ctx.nameLengths.filter((n) => n >= min && n <= max).length;
    if (matching === 0) {
      return `Needs at least one ${min}-${max} letter first name`;
    }
  }
  return null;
}
