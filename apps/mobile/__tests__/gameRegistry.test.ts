/**
 * gameRegistry.test.ts — mobile mirror of the web's gameRegistry.test.ts
 * (flat multi-category model, W1 2026-07-06), adapted vitest → jest.
 * Pins the invariants the games hub relies on plus checkPlayable's lock
 * messaging (games port, 2026-07-13).
 */

import {
  GAMES,
  GAME_BY_KEY,
  GAME_CATEGORY_META,
  GAME_CATEGORY_ORDER,
  checkPlayable,
  gamesByCategory,
  pickTodaysGame,
  type GameCategory,
  type GameDef,
  type TreeGameContext,
} from '../lib/gameRegistry';

function makeGame(key: string, categories: GameCategory[]): GameDef {
  return {
    key,
    name: key,
    icon: '🎮',
    description: 'fixture',
    categories,
    playTimeMin: 1,
    requires: {},
  };
}

function makeCtx(overrides: Partial<TreeGameContext> = {}): TreeGameContext {
  return {
    totalPersons: 20,
    placedPersons: 10,
    parentChildLinks: 10,
    nameLengths: [4, 5, 6, 7],
    personsWithYearCount: 10,
    ...overrides,
  };
}

describe('gamesByCategory', () => {
  it('groups games into sections following GAME_CATEGORY_ORDER', () => {
    const sections = gamesByCategory([
      makeGame('a', ['sprint']),
      makeGame('b', ['family']),
      makeGame('c', ['puzzle']),
    ]);
    expect(sections.map((s) => s.category)).toEqual(['family', 'puzzle', 'sprint']);
  });

  it('hides categories with no tagged games and lists multi-category games in each section', () => {
    const sections = gamesByCategory([
      makeGame('multi', ['family', 'puzzle']),
      makeGame('solo', ['puzzle']),
    ]);
    const byCat = Object.fromEntries(sections.map((s) => [s.category, s.games.map((g) => g.key)]));
    expect(byCat).toEqual({ family: ['multi'], puzzle: ['multi', 'solo'] });
  });
});

describe('shipped GAMES tagging', () => {
  it('every game has ≥1 known category and no repeats', () => {
    for (const game of GAMES) {
      expect(game.categories.length).toBeGreaterThan(0);
      expect(new Set(game.categories).size).toBe(game.categories.length);
      for (const c of game.categories) {
        expect(GAME_CATEGORY_ORDER).toContain(c);
      }
    }
  });

  it('every category (= every filter chip) is non-empty and has meta', () => {
    const sections = gamesByCategory(GAMES);
    expect(sections.map((s) => s.category)).toEqual(GAME_CATEGORY_ORDER);
    for (const c of GAME_CATEGORY_ORDER) {
      expect(GAME_CATEGORY_META[c].label).toBeTruthy();
      expect(GAME_CATEGORY_META[c].icon).toBeTruthy();
    }
  });

  it('keeps the W1 tagging decisions (mirrors the web registry)', () => {
    const tags = (key: string) => [...(GAME_BY_KEY.get(key)?.categories ?? [])].sort();
    expect(tags('wordle')).toEqual(['family', 'puzzle']);
    expect(tags('word-search')).toEqual(['family', 'puzzle']);
    expect(tags('atlas-quiz')).toEqual(['family', 'quick']);
    expect(tags('sprint')).toEqual(['family', 'sprint']);
    expect(tags('who-am-i')).toEqual(['family', 'puzzle']);
    expect(tags('this-or-that')).toEqual(['family', 'quick']);
    expect(tags('family-connections')).toEqual(['puzzle']);
    expect(tags('timeline-tap')).toEqual(['arcade', 'sprint']);
  });

  it("pickTodaysGame returns a registry entry (Home's Today's Pick)", () => {
    expect(GAMES).toContain(pickTodaysGame());
  });
});

describe('checkPlayable', () => {
  it('passes a rich tree for every shipped game', () => {
    for (const game of GAMES) {
      expect(checkPlayable(game, makeCtx())).toBeNull();
    }
  });

  it('locks with actionable copy per requirement kind', () => {
    const wordle = GAME_BY_KEY.get('wordle')!;
    expect(checkPlayable(wordle, makeCtx({ totalPersons: 0 }))).toMatch(/more (person|people)/);
    expect(checkPlayable(wordle, makeCtx({ nameLengths: [2, 12] }))).toMatch(/letter first name/);

    const atlas = GAME_BY_KEY.get('atlas-quiz')!;
    expect(checkPlayable(atlas, makeCtx({ placedPersons: 0 }))).toMatch(/birth place/);

    const sprint = GAME_BY_KEY.get('sprint')!;
    expect(checkPlayable(sprint, makeCtx({ parentChildLinks: 0 }))).toMatch(/parent-child/);

    const timeline = GAME_BY_KEY.get('timeline-tap')!;
    expect(checkPlayable(timeline, makeCtx({ personsWithYearCount: 1 }))).toMatch(/birth or death year/);
  });
});
