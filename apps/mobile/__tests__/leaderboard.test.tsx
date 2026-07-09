/**
 * leaderboard.test.tsx — Step 8 Leaderboard screen coverage (salvaged from
 * `origin/feat/step-8-leaderboard` e630ba3; screen relocated from
 * `app/(tabs)/leaderboard.tsx` to `app/leaderboard.tsx` — pushed screen off
 * the Activity tab, not a 6th tab).
 *
 * Covers:
 *   1. Loading state shows spinner
 *   2. Empty state when no friends + no error
 *   3. My-row card shows "YOU" badge + rank + steps
 *   4. Friends list renders ranks + names + steps
 *   5. Refresh button calls hook.refresh
 *   6. Error banner + Retry calls refresh
 *
 * Hook is mocked so the screen tests are deterministic. expo-router is
 * mocked (Stack.Screen renders nothing) — jest-expo 56 cannot load
 * expo-router's screen-level imports (the same TurboModule gap that keeps
 * login/settings/auth-gate/fitness suites in testPathIgnorePatterns).
 *
 * SKIPPED (describe.skip, same pattern as activity.test.tsx): jest-expo 56
 * still doesn't mock RN 0.85's Dimensions.set TurboModule chain, which
 * ScrollView requires lazily at render time ("Cannot convert object to
 * primitive value" in Dimensions.set). Real-device smoke is the
 * authoritative gate during this window — re-enable when jest-expo ships
 * proper TurboModule mocks (tracked in jest.config.js).
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  Stack: {
    Screen: () => null,
  },
}));

jest.mock('../utils/api', () => ({
  apiClient: {
    getLeaderboard: jest.fn(),
  },
  tokenStore: {},
}));

const mockRefresh = jest.fn();

jest.mock('../hooks/useLeaderboardData', () => {
  const actual = jest.requireActual('../hooks/useLeaderboardData');
  return {
    ...actual,
    useLeaderboardData: jest.fn(),
  };
});

import LeaderboardScreen from '../app/leaderboard';
import { useLeaderboardData } from '../hooks/useLeaderboardData';

function setHook(state: {
  rows?: object[];
  date?: string;
  myStepGoal?: number | null;
  myCalorieGoal?: number | null;
  refreshing?: boolean;
  initialLoading?: boolean;
  error?: string | null;
}) {
  (useLeaderboardData as jest.Mock).mockReturnValue({
    rows: state.rows ?? [],
    date: state.date ?? '2026-05-29',
    myStepGoal: state.myStepGoal ?? null,
    myCalorieGoal: state.myCalorieGoal ?? null,
    refreshing: state.refreshing ?? false,
    initialLoading: state.initialLoading ?? false,
    error: state.error ?? null,
    refresh: mockRefresh,
  });
}

const ME_ROW = {
  rank: 2,
  fitnessUserId: 'u-me',
  displayName: 'Me',
  avatarPhotoKey: null,
  isMe: true,
  steps: 8200,
  caloriesActive: 320,
  caloriesBasal: 1450,
  lastSyncedAt: Date.now(),
};

const ALICE_ROW = {
  rank: 1,
  fitnessUserId: 'u-a',
  displayName: 'Alice',
  avatarPhotoKey: null,
  isMe: false,
  steps: 14500,
  caloriesActive: 600,
  caloriesBasal: 1400,
  lastSyncedAt: Date.now(),
};

const BOB_ROW = {
  rank: 3,
  fitnessUserId: 'u-b',
  displayName: 'Bob',
  avatarPhotoKey: null,
  isMe: false,
  steps: 5100,
  caloriesActive: 240,
  caloriesBasal: 1380,
  lastSyncedAt: Date.now(),
};

describe.skip('LeaderboardScreen (Step 8)', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    (useLeaderboardData as jest.Mock).mockReset();
  });

  it('shows loading spinner when initialLoading is true', () => {
    setHook({ initialLoading: true });
    const { getByText } = render(<LeaderboardScreen />);
    expect(getByText(/Loading leaderboard/)).toBeTruthy();
  });

  it('shows empty state when no friends + no error', () => {
    setHook({ rows: [ME_ROW] });
    const { getByText } = render(<LeaderboardScreen />);
    expect(getByText('No friends on the board yet')).toBeTruthy();
  });

  it('renders my-row with YOU badge', () => {
    setHook({ rows: [ME_ROW, ALICE_ROW] });
    const { getByText } = render(<LeaderboardScreen />);
    expect(getByText('YOU')).toBeTruthy();
    expect(getByText('Me')).toBeTruthy();
    expect(getByText('8,200')).toBeTruthy();
  });

  it('renders friends list ranked', () => {
    setHook({ rows: [ALICE_ROW, ME_ROW, BOB_ROW] });
    const { getByText } = render(<LeaderboardScreen />);
    expect(getByText('Alice')).toBeTruthy();
    expect(getByText('Bob')).toBeTruthy();
    expect(getByText('14,500')).toBeTruthy();
    expect(getByText('5,100')).toBeTruthy();
    expect(getByText('#1')).toBeTruthy();
    expect(getByText('#3')).toBeTruthy();
  });

  it('refresh button calls hook.refresh', () => {
    setHook({ rows: [ME_ROW] });
    const { getByLabelText } = render(<LeaderboardScreen />);
    fireEvent.press(getByLabelText('Refresh leaderboard'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('error banner + Retry calls refresh', () => {
    setHook({ rows: [ME_ROW], error: 'Network down' });
    const { getByText, getByLabelText } = render(<LeaderboardScreen />);
    expect(getByText('Network down')).toBeTruthy();
    fireEvent.press(getByLabelText('Retry refresh'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
