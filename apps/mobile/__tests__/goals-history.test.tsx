/**
 * goals-history.test.tsx — Step 10 Goal history screen coverage.
 *
 * Two suites:
 *
 *   1. `groupHistoryByMonth` — a pure function exported from
 *      `app/goals-history.tsx` (no react-native render involved), so it
 *      runs UNSKIPPED regardless of the jest-expo TurboModule gap. Same
 *      precedent as `useDashboardData.ts`'s exported `computeDashboardRange`
 *      being unit-tested directly from `useDashboardData.test.ts`.
 *
 *   2. Screen render tests — SKIPPED (describe.skip, same pattern as
 *      `goals.test.tsx` / `friends.test.tsx` / `leaderboard.test.tsx`):
 *      jest-expo 56 still doesn't mock RN 0.85's Dimensions.set
 *      TurboModule chain that ScrollView requires at render time. Real-
 *      device smoke is the authoritative gate during this window.
 */

import { groupHistoryByMonth } from '../app/goals-history';
import type { ArchivedGoal } from '@genoly/types';

function makeGoal(overrides: Partial<ArchivedGoal>): ArchivedGoal {
  return {
    id: 'g-default',
    period: 'daily',
    metric: 'steps',
    target: 10000,
    effectiveFrom: 0,
    archivedAt: 0,
    createdAt: 0,
    ...overrides,
  };
}

describe('groupHistoryByMonth', () => {
  it('returns an empty array for an empty list', () => {
    expect(groupHistoryByMonth([])).toEqual([]);
  });

  it('groups entries archived in the same calendar month together', () => {
    const julyA = makeGoal({ id: 'g1', archivedAt: new Date(2026, 6, 3).getTime() });
    const julyB = makeGoal({ id: 'g2', archivedAt: new Date(2026, 6, 20).getTime() });
    const june = makeGoal({ id: 'g3', archivedAt: new Date(2026, 5, 10).getTime() });

    const groups = groupHistoryByMonth([julyA, julyB, june]);

    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe('2026-07');
    expect(groups[0].items.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(groups[1].key).toBe('2026-06');
    expect(groups[1].items.map((g) => g.id)).toEqual(['g3']);
  });

  it('preserves input order within a group (server already sorts, we just partition)', () => {
    const first = makeGoal({ id: 'newer', archivedAt: new Date(2026, 6, 20).getTime() });
    const second = makeGoal({ id: 'older', archivedAt: new Date(2026, 6, 3).getTime() });

    const groups = groupHistoryByMonth([first, second]);

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((g) => g.id)).toEqual(['newer', 'older']);
  });

  it('produces a human-readable month/year label', () => {
    const goal = makeGoal({ archivedAt: new Date(2026, 6, 3).getTime() });
    const groups = groupHistoryByMonth([goal]);
    expect(groups[0].label).toMatch(/July/);
    expect(groups[0].label).toMatch(/2026/);
  });
});

// ── Screen render suite (render-blocked, see header) ────────────────

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  Stack: {
    Screen: () => null,
  },
}));

jest.mock('../utils/api', () => ({
  apiClient: {
    getGoals: jest.fn(),
    getGoalsHistory: jest.fn(),
    upsertGoal: jest.fn(),
    archiveGoal: jest.fn(),
  },
  tokenStore: {},
}));

const mockFetchHistory = jest.fn();

jest.mock('../hooks/useGoalsData', () => {
  const actual = jest.requireActual('../hooks/useGoalsData');
  return {
    ...actual,
    useGoalsData: jest.fn(),
  };
});

// eslint-disable-next-line import/first
import GoalsHistoryScreen from '../app/goals-history';
// eslint-disable-next-line import/first
import { useGoalsData } from '../hooks/useGoalsData';

function setHook(state: { history?: object[]; historyLoading?: boolean; historyError?: string | null }) {
  (useGoalsData as jest.Mock).mockReturnValue({
    goals: [],
    refreshing: false,
    initialLoading: false,
    error: null,
    refresh: jest.fn(),
    busyGoalKey: null,
    actionError: null,
    upsertGoal: jest.fn(),
    archiveGoal: jest.fn(),
    history: state.history ?? [],
    historyLoading: state.historyLoading ?? false,
    historyError: state.historyError ?? null,
    fetchHistory: mockFetchHistory,
  });
}

describe.skip('GoalsHistoryScreen (Step 10)', () => {
  beforeEach(() => {
    mockFetchHistory.mockReset();
    (useGoalsData as jest.Mock).mockReset();
  });

  it('calls fetchHistory on mount', () => {
    setHook({});
    render(<GoalsHistoryScreen />);
    expect(mockFetchHistory).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there is no history', () => {
    setHook({});
    const { getByText } = render(<GoalsHistoryScreen />);
    expect(getByText('No history yet')).toBeTruthy();
  });

  it('changing the period filter re-calls fetchHistory with the new filter', () => {
    setHook({});
    const { getByLabelText } = render(<GoalsHistoryScreen />);
    fireEvent.press(getByLabelText('Filter by period: Daily'));
    expect(mockFetchHistory).toHaveBeenLastCalledWith({ period: 'daily', metric: undefined });
  });
});
