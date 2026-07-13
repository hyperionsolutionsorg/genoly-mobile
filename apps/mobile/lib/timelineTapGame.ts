/**
 * Timeline Tap — pure game logic (Item 5 PR-5c, the last arcade game).
 *
 * Mechanic: 5 dated events from the tree appear as shuffled cards; tap
 * them in chronological order. Correct tap → the card locks into the
 * ordered rail with its year revealed and the combo grows; wrong tap →
 * combo resets. Timed mode races a 30s cap for a high score; relaxed
 * (untimed) mode scores accuracy only.
 *
 * All functions here are pure and React-free so they're unit-testable
 * (src/lib/timelineTapGame.test.ts) — the component
 * (src/pages/games/TimelineTap.tsx) only wires the query + UI state.
 *
 * DATA SOURCE — `api.timeline.getTreeTimeline` (convex/timeline.ts), an
 * EXISTING client read (the Tree Timeline page's query; no new server
 * code per the client-side games architecture). It returns event rows
 * joined with participant names, so real event phrasing is possible:
 * "Alfred was born", "Maya and Sam were married". Death phrasing is
 * memorial-safe but factual: "passed away" (per PR-5c brief — "we
 * remember X" is too soft, "died" too blunt).
 *
 * Rows are reduced to dated items:
 *   - only events with a numeric dateStart qualify;
 *   - birth/death events are deduped per person keeping the EARLIEST
 *     dated one (the e2e seed's Test Child has both a future "reminder"
 *     birth and the 1980 pedigree fixture — the fixture must win);
 *   - person-verb types need a participant name; other types fall back
 *     to the event title, and are skipped when neither exists.
 *
 * DAILY ROUND (seeded by `${dateUTC}|${tree.slug}|timeline-tap` via
 * src/lib/dailySeed.ts — shared with Family Connections, PR #121):
 *   - at most ONE item per calendar year is eligible (a board with two
 *     1950 cards has an ambiguous "correct" order at the year
 *     granularity the player sees);
 *   - TIER LADDER over distinct-year items: 5+ → full 5-card round;
 *     3–4 → short round of that many cards; below 3 → null and the page
 *     renders the F-007-style "add a birthday" empty state. The hub card
 *     gates on `requires.personsWithYear: 5` (2026-06-11 —
 *     getGamesContext.personsWithYearCount counts persons with a dated
 *     birth/death event, the same year definition buildTimelineItems
 *     applies below) — this tier check stays as defense for deep links
 *     and for same-year collisions the person-level count can't see.
 *   - the display order is seeded-shuffled and never equals the solved
 *     order (deterministic rotation when the shuffle lands on it).
 *
 * SCORING:
 *   - timed: each correct tap = 100 × combo (combo = consecutive correct
 *     count, so 100/200/300…); wrong tap resets the combo, costs nothing;
 *     finishing all cards before the 30s cap adds 10 pts per full second
 *     remaining. Timeout keeps points earned, no bonus.
 *   - relaxed: score = accuracy only (% of taps that were correct).
 *   - the two modes keep SEPARATE personal bests (decision doc: neither
 *     mode feels second-class).
 */

import { createSeededRng, seededPick, seededShuffle } from "./dailySeed";

// ─── Tunables ────────────────────────────────────────────────────────────────

/** Cards in a full daily round. */
export const ROUND_SIZE_FULL = 5;
/** Below this many distinct-year items → empty state (F-007 ladder). */
export const MIN_ITEMS = 3;
/** Timed-mode clock. */
export const TIME_LIMIT_MS = 30_000;
/** Points for a correct tap before the combo multiplier. */
export const BASE_POINTS = 100;
/** Timed-mode bonus per FULL second left when the last card locks in. */
export const TIME_BONUS_PER_SECOND = 10;

// ─── Types ───────────────────────────────────────────────────────────────────

/** The shape `timeline.getTreeTimeline` rows reduce to (subset we read). */
export interface TimelineRowInput {
  _id: string;
  type: string;
  title: string | null;
  dateStart: number | null;
  year: number | null;
  participants: Array<{
    personId: string;
    preferredName: string;
    role: string | null;
  }>;
}

/** One playable card. */
export interface TimelineItem {
  /** Event id — stable card identity. */
  id: string;
  /** Player-facing sentence, e.g. "Alfred was born". No year (that's the puzzle). */
  label: string;
  /** Revealed when the card locks into the rail. */
  year: number;
  /** Full-precision order key (year ties can't happen post-pick, but kept exact). */
  dateStart: number;
}

export type TimelineTier = "full" | "short";

export interface TimelineRound {
  tier: TimelineTier;
  /** The answer key — items in chronological order. */
  ordered: TimelineItem[];
  /** Item ids in shuffled display order (never the solved order). */
  displayOrder: string[];
}

export type TimelineMode = "timed" | "relaxed";

// ─── Row → item reduction ────────────────────────────────────────────────────

/** Person-verb phrasings per event type. Memorial-safe but factual. */
const SOLO_VERBS: Record<string, (name: string) => string> = {
  birth: (n) => `${n} was born`,
  death: (n) => `${n} passed away`,
  burial: (n) => `${n} was laid to rest`,
  baptism: (n) => `${n} was baptized`,
  immigration: (n) => `${n} immigrated`,
  emigration: (n) => `${n} emigrated`,
  military_service: (n) => `${n} entered military service`,
};

const PAIR_VERBS: Record<
  string,
  { pair: (a: string, b: string) => string; solo: (name: string) => string }
> = {
  marriage: {
    pair: (a, b) => `${a} and ${b} were married`,
    solo: (n) => `${n} was married`,
  },
  divorce: {
    pair: (a, b) => `${a} and ${b} divorced`,
    solo: (n) => `${n} divorced`,
  },
};

function participantNames(row: TimelineRowInput): string[] {
  // Primary participants first — the person the event is "about".
  const sorted = [...row.participants].sort((a, b) => {
    const ap = a.role === "primary" ? 0 : 1;
    const bp = b.role === "primary" ? 0 : 1;
    return ap - bp;
  });
  return sorted.map((p) => p.preferredName.trim()).filter((n) => n.length > 0);
}

function labelFor(row: TimelineRowInput): string | null {
  const names = participantNames(row);
  const solo = SOLO_VERBS[row.type];
  if (solo) return names.length > 0 ? solo(names[0]) : null;
  const pair = PAIR_VERBS[row.type];
  if (pair) {
    if (names.length >= 2) return pair.pair(names[0], names[1]);
    if (names.length === 1) return pair.solo(names[0]);
    return null;
  }
  // residence / occupation / education / custom — the title is the story.
  const title = row.title?.trim();
  return title && title.length > 0 ? title : null;
}

/**
 * Reduce timeline rows to playable items: dated, labelable, and with
 * births/deaths deduped per person (earliest dated event wins). Output is
 * sorted chronologically (dateStart asc, id tiebreak) so downstream
 * selection is independent of query order.
 */
export function buildTimelineItems(rows: TimelineRowInput[]): TimelineItem[] {
  // Dedupe pass for per-person lifecycle events.
  const lifecycleBest = new Map<string, TimelineRowInput>();
  const rest: TimelineRowInput[] = [];
  for (const row of rows) {
    if (typeof row.dateStart !== "number" || typeof row.year !== "number") continue;
    if (row.type === "birth" || row.type === "death") {
      const pid = row.participants.find((p) => p.role === "primary")?.personId ??
        row.participants[0]?.personId;
      if (!pid) continue; // a birth/death with no person can't be phrased
      const key = `${row.type}:${pid}`;
      const prev = lifecycleBest.get(key);
      if (!prev || (row.dateStart as number) < (prev.dateStart as number)) {
        lifecycleBest.set(key, row);
      }
    } else {
      rest.push(row);
    }
  }

  const out: TimelineItem[] = [];
  for (const row of [...lifecycleBest.values(), ...rest]) {
    const label = labelFor(row);
    if (!label) continue;
    out.push({
      id: row._id,
      label,
      year: row.year as number,
      dateStart: row.dateStart as number,
    });
  }
  out.sort((a, b) => a.dateStart - b.dateStart || (a.id < b.id ? -1 : 1));
  return out;
}

// ─── Daily round selection ───────────────────────────────────────────────────

/**
 * Pick today's round from the item pool. Deterministic for a given
 * (seedKey, items) pair. Returns null below the MIN_ITEMS floor — the
 * caller renders the empty state.
 */
export function pickDailyRound(
  seedKey: string,
  items: TimelineItem[],
): TimelineRound | null {
  const rng = createSeededRng(seedKey);

  // One card per distinct year — keeps "chronological order" unambiguous
  // at the granularity the player sees. Buckets iterate in ascending-year
  // order (items are pre-sorted) so the rng stream is deterministic.
  const byYear = new Map<number, TimelineItem[]>();
  for (const item of items) {
    if (!byYear.has(item.year)) byYear.set(item.year, []);
    byYear.get(item.year)!.push(item);
  }
  const perYear: TimelineItem[] = [];
  for (const bucket of byYear.values()) {
    perYear.push(bucket.length === 1 ? bucket[0] : seededPick(bucket, 1, rng)[0]);
  }

  if (perYear.length < MIN_ITEMS) return null;

  const size = Math.min(ROUND_SIZE_FULL, perYear.length);
  const ordered = seededPick(perYear, size, rng).sort(
    (a, b) => a.dateStart - b.dateStart || (a.id < b.id ? -1 : 1),
  );

  let displayOrder = seededShuffle(
    ordered.map((i) => i.id),
    rng,
  );
  // A shuffle can land on the solved order — rotate once so the round is
  // never pre-solved (deterministic, and different for size ≥ 2).
  if (displayOrder.every((id, i) => id === ordered[i].id)) {
    displayOrder = [...displayOrder.slice(1), displayOrder[0]];
  }

  return {
    tier: size >= ROUND_SIZE_FULL ? "full" : "short",
    ordered,
    displayOrder,
  };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export interface RoundProgress {
  /** Cards locked into the rail so far (prefix of `ordered`). */
  placed: number;
  /** Total taps, right or wrong. */
  taps: number;
  /** Correct taps (=== placed, kept separate for clarity in accuracy). */
  correct: number;
  /** Consecutive-correct streak — the multiplier for the NEXT correct tap is combo+1. */
  combo: number;
  /** Timed-mode points earned from taps (no time bonus yet). */
  score: number;
}

export const INITIAL_PROGRESS: RoundProgress = {
  placed: 0,
  taps: 0,
  correct: 0,
  combo: 0,
  score: 0,
};

/** Points for a correct tap given the streak BEFORE this tap. */
export function tapPoints(comboBefore: number): number {
  return BASE_POINTS * (comboBefore + 1);
}

/** Timed-mode completion bonus: 10 pts per FULL second remaining. */
export function timeBonus(remainingMs: number): number {
  return Math.max(0, Math.floor(remainingMs / 1000)) * TIME_BONUS_PER_SECOND;
}

/** Accuracy as a whole-number percentage (0 taps → 0). */
export function accuracyPct(correct: number, taps: number): number {
  return taps === 0 ? 0 : Math.round((correct / taps) * 100);
}

export interface TapResult {
  progress: RoundProgress;
  correct: boolean;
  /** The item that locked in (when correct). */
  placedItem: TimelineItem | null;
  /** True when this tap placed the final card. */
  finished: boolean;
}

/**
 * Apply a tap to the round. Correct = the tapped card is the
 * chronologically next unplaced item. Pure — returns new progress.
 */
export function applyTap(
  ordered: TimelineItem[],
  progress: RoundProgress,
  tappedId: string,
): TapResult {
  const next = ordered[progress.placed];
  if (next && next.id === tappedId) {
    const updated: RoundProgress = {
      placed: progress.placed + 1,
      taps: progress.taps + 1,
      correct: progress.correct + 1,
      combo: progress.combo + 1,
      score: progress.score + tapPoints(progress.combo),
    };
    return {
      progress: updated,
      correct: true,
      placedItem: next,
      finished: updated.placed === ordered.length,
    };
  }
  return {
    progress: { ...progress, taps: progress.taps + 1, combo: 0 },
    correct: false,
    placedItem: null,
    finished: false,
  };
}

/**
 * Final score for a finished round.
 *   - timed: tap points + completion time bonus (timeout → no bonus).
 *   - relaxed: accuracy percentage only (no clock, no bonus).
 */
export function finalScore(
  mode: TimelineMode,
  progress: RoundProgress,
  opts: { completed: boolean; remainingMs: number },
): number {
  if (mode === "relaxed") return accuracyPct(progress.correct, progress.taps);
  return progress.score + (opts.completed ? timeBonus(opts.remainingMs) : 0);
}
