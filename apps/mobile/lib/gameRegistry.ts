/**
 * gameRegistry.ts — mobile mirror of the web's src/lib/gameRegistry.ts
 * two-axis model (decision 2026-06-11 games-hub filter):
 *   category: 'family' | 'arcade'  (section identity)
 *   playStyle: 'quick' | 'puzzle' | 'sprint'  (gameplay cross-cut;
 *   arcade games carry ONLY category identity)
 *
 * Today's Pick uses the same deterministic day-of-year rotation as the
 * web (all members see the same pick on the same day; zero server reads).
 */

export type GameCategory = 'family' | 'arcade';
export type GamePlayStyle = 'quick' | 'puzzle' | 'sprint';

export interface GameInfo {
  key: string;
  name: string;
  emoji: string;
  category: GameCategory;
  playStyle?: GamePlayStyle;
  minutes: number;
  blurb: string;
}

/** Order mirrors the web registry — the daily rotation depends on it. */
export const GAMES: GameInfo[] = [
  { key: 'wordle', name: 'Family Wordle', emoji: '🟩', category: 'family', playStyle: 'quick', minutes: 5, blurb: 'Guess the family name of the day' },
  { key: 'word-search', name: 'Word Search', emoji: '🔍', category: 'family', playStyle: 'puzzle', minutes: 10, blurb: 'Find your relatives in the grid' },
  { key: 'atlas-quiz', name: 'Atlas Quiz', emoji: '🗺️', category: 'family', playStyle: 'puzzle', minutes: 5, blurb: 'Where in the world was your family?' },
  { key: 'sprint', name: 'Generation Sprint', emoji: '⚡', category: 'family', playStyle: 'sprint', minutes: 2, blurb: 'Order the generations against the clock' },
  { key: 'who-am-i', name: 'Who Am I?', emoji: '🎭', category: 'family', playStyle: 'puzzle', minutes: 8, blurb: 'Guess the relative from the clues' },
  { key: 'this-or-that', name: 'This or That', emoji: '⚖️', category: 'family', playStyle: 'quick', minutes: 3, blurb: 'Quick-fire family picks' },
  { key: 'family-connections', name: 'Family Connections', emoji: '🧩', category: 'arcade', minutes: 5, blurb: 'Sort 16 tiles into 4 hidden groups' },
  { key: 'timeline-tap', name: 'Timeline Tap', emoji: '⏱️', category: 'arcade', minutes: 4, blurb: 'Tap events in chronological order' },
];

/**
 * Deterministic daily pick — same algorithm as web pickTodaysGame():
 * day-of-year modulo registry length. Pass a date for testability.
 */
export function pickTodaysGame(now: Date = new Date()): GameInfo {
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  return GAMES[dayOfYear % GAMES.length];
}
