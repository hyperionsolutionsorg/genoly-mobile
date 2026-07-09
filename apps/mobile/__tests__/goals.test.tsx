/**
 * goals.test.tsx — Step 10 Goals screen coverage.
 *
 * Hook is mocked so the screen tests are deterministic. expo-router is
 * mocked (Stack.Screen renders nothing) — jest-expo 56 cannot load
 * expo-router's screen-level imports (the same TurboModule gap that keeps
 * login/settings/auth-gate/leaderboard/friends suites in describe.skip —
 * see leaderboard.test.tsx's header for the full explanation).
 *
 * SKIPPED (describe.skip, same pattern as friends.test.tsx /
 * leaderboard.test.tsx / activity.test.tsx): jest-expo 56 still doesn't
 * mock RN 0.85's Dimensions.set TurboModule chain, which ScrollView
 * requires lazily at render time ("Cannot convert object to primitive
 * value" in Dimensions.set). Real-device smoke is the authoritative gate
 * during this window — re-enable when jest-expo ships proper TurboModule
 * mocks (tracked in jest.config.js). Hook coverage
 * (useGoalsData.test.ts) runs unskipped and covers the actual business
 * logic.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  Stack: {
    Screen: () => null,
  },
  useRouter: () => ({ push: jest.fn() }),
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

const mockRefresh = jest.fn();
const mockUpsertGoal = jest.fn();
const mockArchiveGoal = jest.fn();
const mockFetchHistory = jest.fn();

jest.mock('../hooks/useGoalsData', () => {
  const actual = jest.requireActual('../hooks/useGoalsData');
  return {
    ...actual,
    useGoalsData: jest.fn(),
  };
});

import GoalsScreen from '../app/goals';
import { useGoalsData } from '../hooks/useGoalsData';

function setHook(state: {
  goals?: object[];
  refreshing?: boolean;
  initialLoading?: boolean;
  error?: string | null;
  busyGoalKey?: string | null;
  actionError?: string | null;
}) {
  (useGoalsData as jest.Mock).mockReturnValue({
    goals: state.goals ?? [],
    refreshing: state.refreshing ?? false,
    initialLoading: state.initialLoading ?? false,
    error: state.error ?? null,
    refresh: mockRefresh,
    busyGoalKey: state.busyGoalKey ?? null,
    actionError: state.actionError ?? null,
    upsertGoal: mockUpsertGoal,
    archiveGoal: mockArchiveGoal,
    history: [],
    historyLoading: false,
    historyError: null,
    fetchHistory: mockFetchHistory,
  });
}

const DAILY_STEPS_GOAL = {
  id: 'g-steps-daily',
  period: 'daily',
  metric: 'steps',
  target: 10000,
  effectiveFrom: 1000,
  createdAt: 1000,
};

describe.skip('GoalsScreen (Step 10)', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockUpsertGoal.mockReset();
    mockArchiveGoal.mockReset();
    mockFetchHistory.mockReset();
    (useGoalsData as jest.Mock).mockReset();
  });

  it('shows loading spinner when initialLoading is true', () => {
    setHook({ initialLoading: true });
    const { getByText } = render(<GoalsScreen />);
    expect(getByText(/Loading your goals/)).toBeTruthy();
  });

  it('renders all 4 goal slots with "Not set" when no goals are active', () => {
    setHook({});
    const { getByText, getAllByText } = render(<GoalsScreen />);
    expect(getByText('Daily steps')).toBeTruthy();
    expect(getByText('Daily active calories')).toBeTruthy();
    expect(getByText('Weekly steps')).toBeTruthy();
    expect(getByText('Weekly active calories')).toBeTruthy();
    expect(getAllByText('Not set')).toHaveLength(4);
  });

  it('renders an active goal target and an Edit action', () => {
    setHook({ goals: [DAILY_STEPS_GOAL] });
    const { getByText, getByLabelText } = render(<GoalsScreen />);
    expect(getByText('10,000 steps')).toBeTruthy();
    expect(getByLabelText('Edit Daily steps goal')).toBeTruthy();
    expect(getByLabelText('Remove Daily steps goal')).toBeTruthy();
  });

  it('refresh button calls hook.refresh', () => {
    setHook({});
    const { getByLabelText } = render(<GoalsScreen />);
    fireEvent.press(getByLabelText('Refresh goals'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('error banner + Retry calls refresh', () => {
    setHook({ error: 'Network down' });
    const { getByText, getByLabelText } = render(<GoalsScreen />);
    expect(getByText('Network down')).toBeTruthy();
    fireEvent.press(getByLabelText('Retry refresh'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('tapping "Set goal" reveals an inline edit form', () => {
    setHook({});
    const { getByLabelText } = render(<GoalsScreen />);
    fireEvent.press(getByLabelText('Set Daily steps goal'));
    expect(getByLabelText('Save Daily steps goal')).toBeTruthy();
    expect(getByLabelText('Cancel editing Daily steps goal')).toBeTruthy();
  });

  it('history link row is present', () => {
    setHook({});
    const { getByLabelText } = render(<GoalsScreen />);
    expect(getByLabelText('View goal history')).toBeTruthy();
  });
});
