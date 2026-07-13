/**
 * Daily-seed utilities — shared by the Arcade games (Family Connections,
 * Timeline Tap) per the 2026-06-10 arcade-category decision.
 *
 * Strategy: client-side deterministic RNG seeded by
 * `${dateUTC}|${treeSlug}|${gameKey}` (xmur3 string hash → mulberry32
 * PRNG). Every member of a tree derives the identical daily puzzle with
 * zero server state and zero extra bandwidth; the UTC day boundary matches
 * the streak system (convex/lib/streaks.ts) and pickTodaysGame().
 *
 * Everything here is a pure function — unit-tested in
 * src/lib/dailySeed.test.ts (determinism, distribution sanity, date
 * rollover).
 */

/** xmur3 string hash — produces a 32-bit seed from an arbitrary string. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** mulberry32 — small fast PRNG over a 32-bit seed; returns [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic RNG stream for a seed key — same key, same sequence. */
export function createSeededRng(key: string): () => number {
  return mulberry32(xmur3(key)());
}

/** Canonical daily seed key: `${dateUTC}|${treeSlug}|${gameKey}`. */
export function dailySeedKey(dateUTC: string, treeSlug: string, gameKey: string): string {
  return `${dateUTC}|${treeSlug}|${gameKey}`;
}

/** Today's UTC day as YYYY-MM-DD — matches the streak system's UTC boundary. */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** In-place Fisher–Yates with the provided RNG. Returns the same array. */
export function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Seeded pick of `n` items — does not mutate `items`. */
export function seededPick<T>(items: T[], n: number, rng: () => number): T[] {
  return seededShuffle([...items], rng).slice(0, n);
}
