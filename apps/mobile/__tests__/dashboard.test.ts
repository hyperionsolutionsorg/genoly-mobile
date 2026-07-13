/**
 * dashboard.test.ts — C4 pure-logic coverage: the deterministic Today's
 * Pick rotation (must match the web's day-of-year algorithm) and the
 * dashboard formatting helpers.
 */

import { GAMES, pickTodaysGame } from '../lib/gameRegistry';
import { medalFor, annivEmoji, annivTitle, annivWhen } from '../lib/dashboardFormat';
import { isoDayUtc } from '../hooks/useRecordVisit';

describe('pickTodaysGame', () => {
  // The registry was rewritten to the web's flat multi-category model
  // (games port, 2026-07-13); pickTodaysGame() now matches the web
  // signature (no date param), so date control goes through fake timers.
  afterEach(() => {
    jest.useRealTimers();
  });

  function atDate(date: Date): string {
    jest.useFakeTimers({ now: date });
    const key = pickTodaysGame().key;
    jest.useRealTimers();
    return key;
  }

  it('is deterministic for a given date', () => {
    const date = new Date(2026, 5, 11);
    expect(atDate(date)).toBe(atDate(date));
  });

  it('uses day-of-year modulo registry length (web parity)', () => {
    const date = new Date(2026, 5, 11);
    const startOfYear = new Date(2026, 0, 0);
    const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86_400_000);
    expect(atDate(date)).toBe(GAMES[dayOfYear % GAMES.length].key);
  });

  it('rotates through all 8 games over consecutive days', () => {
    const seen = new Set<string>();
    for (let i = 0; i < GAMES.length; i++) {
      seen.add(atDate(new Date(2026, 2, 10 + i)));
    }
    expect(seen.size).toBe(GAMES.length);
  });
});

describe('dashboard formatting', () => {
  it('medals the top three, numbers the rest', () => {
    expect(medalFor(1)).toBe('🥇');
    expect(medalFor(2)).toBe('🥈');
    expect(medalFor(3)).toBe('🥉');
    expect(medalFor(4)).toBe('4.');
  });

  const base = {
    occursOn: '2026-06-20',
    daysFromNow: 9,
    yearsSince: 50,
    originalDate: '1976-06-20',
  };

  it('formats birthdays, marriages, and memorials with warmth', () => {
    expect(annivTitle({ ...base, kind: 'birthday', personName: 'Maya' })).toBe('Maya turns 50');
    expect(
      annivTitle({ ...base, kind: 'marriage', partnerNames: { p1: 'Ana', p2: 'Raj' } }),
    ).toBe('Ana & Raj — 50 years');
    expect(annivTitle({ ...base, kind: 'death_anniversary', personName: 'Edith' })).toBe(
      'Remembering Edith',
    );
    expect(annivEmoji({ kind: 'birthday' })).toBe('🎂');
  });

  it('humanizes the countdown', () => {
    expect(annivWhen({ daysFromNow: 0 })).toBe('Today');
    expect(annivWhen({ daysFromNow: 1 })).toBe('Tomorrow');
    expect(annivWhen({ daysFromNow: 6 })).toBe('In 6 days');
  });
});

describe('isoDayUtc', () => {
  it('formats a UTC day string', () => {
    expect(isoDayUtc(Date.UTC(2026, 5, 11, 23, 59))).toBe('2026-06-11');
    expect(isoDayUtc(Date.UTC(2026, 5, 12, 0, 1))).toBe('2026-06-12');
  });
});
