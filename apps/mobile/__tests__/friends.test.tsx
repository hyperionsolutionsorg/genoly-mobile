/**
 * friends.test.tsx — Step 9 Friends screen coverage.
 *
 * Hook is mocked so the screen tests are deterministic. expo-router is
 * mocked (Stack.Screen renders nothing) — jest-expo 56 cannot load
 * expo-router's screen-level imports (the same TurboModule gap that keeps
 * login/settings/auth-gate/leaderboard suites in describe.skip — see
 * leaderboard.test.tsx's header for the full explanation).
 *
 * SKIPPED (describe.skip, same pattern as leaderboard.test.tsx /
 * activity.test.tsx): jest-expo 56 still doesn't mock RN 0.85's
 * Dimensions.set TurboModule chain, which ScrollView requires lazily at
 * render time ("Cannot convert object to primitive value" in
 * Dimensions.set). Real-device smoke is the authoritative gate during
 * this window — re-enable when jest-expo ships proper TurboModule mocks
 * (tracked in jest.config.js). Hook coverage (useFriendsData.test.ts)
 * runs unskipped and covers the actual business logic.
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
    getFriends: jest.fn(),
    requestFriend: jest.fn(),
    acceptFriend: jest.fn(),
    declineFriend: jest.fn(),
    unfriend: jest.fn(),
    blockFriend: jest.fn(),
  },
  tokenStore: {},
}));

const mockRefresh = jest.fn();
const mockSendRequest = jest.fn();
const mockAcceptRequest = jest.fn();
const mockDeclineRequest = jest.fn();
const mockRemoveFriendship = jest.fn();
const mockBlockFriend = jest.fn();

jest.mock('../hooks/useFriendsData', () => {
  const actual = jest.requireActual('../hooks/useFriendsData');
  return {
    ...actual,
    useFriendsData: jest.fn(),
  };
});

import FriendsScreen from '../app/friends';
import { useFriendsData } from '../hooks/useFriendsData';

function setHook(state: {
  accepted?: object[];
  pendingIncoming?: object[];
  pendingOutgoing?: object[];
  blocked?: object[];
  refreshing?: boolean;
  initialLoading?: boolean;
  error?: string | null;
  busyFriendshipId?: string | null;
  actionError?: string | null;
}) {
  (useFriendsData as jest.Mock).mockReturnValue({
    accepted: state.accepted ?? [],
    pendingIncoming: state.pendingIncoming ?? [],
    pendingOutgoing: state.pendingOutgoing ?? [],
    blocked: state.blocked ?? [],
    refreshing: state.refreshing ?? false,
    initialLoading: state.initialLoading ?? false,
    error: state.error ?? null,
    refresh: mockRefresh,
    busyFriendshipId: state.busyFriendshipId ?? null,
    actionError: state.actionError ?? null,
    sendRequest: mockSendRequest,
    acceptRequest: mockAcceptRequest,
    declineRequest: mockDeclineRequest,
    removeFriendship: mockRemoveFriendship,
    blockFriend: mockBlockFriend,
  });
}

const ALICE = {
  friendshipId: 'f-alice',
  fitnessUserId: 'u-alice',
  displayName: 'Alice',
  avatarPhotoKey: null,
  status: 'accepted',
  createdAt: 1000,
  acceptedAt: 2000,
};

const BOB_INCOMING = {
  friendshipId: 'f-bob',
  fitnessUserId: 'u-bob',
  displayName: 'Bob',
  avatarPhotoKey: null,
  status: 'pending',
  createdAt: 1500,
  acceptedAt: null,
};

describe.skip('FriendsScreen (Step 9)', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockSendRequest.mockReset();
    mockAcceptRequest.mockReset();
    mockDeclineRequest.mockReset();
    mockRemoveFriendship.mockReset();
    mockBlockFriend.mockReset();
    (useFriendsData as jest.Mock).mockReset();
  });

  it('shows loading spinner when initialLoading is true', () => {
    setHook({ initialLoading: true });
    const { getByText } = render(<FriendsScreen />);
    expect(getByText(/Loading friends/)).toBeTruthy();
  });

  it('shows empty state when every bucket is empty', () => {
    setHook({});
    const { getByText } = render(<FriendsScreen />);
    expect(getByText('No friends yet')).toBeTruthy();
  });

  it('renders accepted friends with an Unfriend action', () => {
    setHook({ accepted: [ALICE] });
    const { getByText, getByLabelText } = render(<FriendsScreen />);
    expect(getByText('Alice')).toBeTruthy();
    expect(getByLabelText('Unfriend Alice')).toBeTruthy();
  });

  it('renders incoming requests with Accept/Decline actions', () => {
    setHook({ pendingIncoming: [BOB_INCOMING] });
    const { getByLabelText } = render(<FriendsScreen />);
    expect(getByLabelText("Accept Bob's friend request")).toBeTruthy();
    expect(getByLabelText("Decline Bob's friend request")).toBeTruthy();
  });

  it('refresh button calls hook.refresh', () => {
    setHook({ accepted: [ALICE] });
    const { getByLabelText } = render(<FriendsScreen />);
    fireEvent.press(getByLabelText('Refresh friends'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('error banner + Retry calls refresh', () => {
    setHook({ accepted: [ALICE], error: 'Network down' });
    const { getByText, getByLabelText } = render(<FriendsScreen />);
    expect(getByText('Network down')).toBeTruthy();
    fireEvent.press(getByLabelText('Retry refresh'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
