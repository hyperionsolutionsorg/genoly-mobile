/**
 * useFriendsData.test.ts — Step 9 hook coverage.
 *
 * Covers:
 *   1. skipInitialRefresh disables on-mount fetch
 *   2. fetches + partitions the four buckets on mount
 *   3. fetch failure surfaces in error state
 *   4. refresh() re-runs the cycle
 *   5. sendRequest success re-fetches the list and clears actionError
 *   6. sendRequest failure maps error codes to friendly copy, does not refetch's
 *      partitions incorrectly (list still gets called once on mount only)
 *   7. acceptRequest / declineRequest / removeFriendship / blockFriend each
 *      call their respective apiClient method, then refresh
 *   8. busyFriendshipId is set during the action and cleared after
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';

jest.mock('../utils/api', () => ({
  apiClient: {
    getFriends: jest.fn(),
    requestFriend: jest.fn(),
    acceptFriend: jest.fn(),
    declineFriend: jest.fn(),
    unfriend: jest.fn(),
    blockFriend: jest.fn(),
  },
}));

import {
  useFriendsData,
  friendsActionErrorMessage,
  REQUEST_SENTINEL,
} from '../hooks/useFriendsData';
import { apiClient } from '../utils/api';
import { ApiClientError } from '@genoly/api-client';

function makeBoard() {
  return {
    accepted: [
      {
        friendshipId: 'f-accepted',
        fitnessUserId: 'u-alice',
        displayName: 'Alice',
        avatarPhotoKey: null,
        status: 'accepted' as const,
        createdAt: 1000,
        acceptedAt: 2000,
      },
    ],
    pendingIncoming: [
      {
        friendshipId: 'f-incoming',
        fitnessUserId: 'u-bob',
        displayName: 'Bob',
        avatarPhotoKey: null,
        status: 'pending' as const,
        createdAt: 1500,
        acceptedAt: null,
      },
    ],
    pendingOutgoing: [
      {
        friendshipId: 'f-outgoing',
        fitnessUserId: 'u-carol',
        displayName: 'Carol',
        avatarPhotoKey: null,
        status: 'pending' as const,
        createdAt: 1600,
        acceptedAt: null,
      },
    ],
    blocked: [],
  };
}

function resetMocks() {
  (apiClient.getFriends as jest.Mock).mockReset();
  (apiClient.requestFriend as jest.Mock).mockReset();
  (apiClient.acceptFriend as jest.Mock).mockReset();
  (apiClient.declineFriend as jest.Mock).mockReset();
  (apiClient.unfriend as jest.Mock).mockReset();
  (apiClient.blockFriend as jest.Mock).mockReset();
}

describe('useFriendsData', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('skipInitialRefresh disables on-mount fetch', () => {
    const { result } = renderHook(() => useFriendsData({ skipInitialRefresh: true }));
    expect(apiClient.getFriends).not.toHaveBeenCalled();
    expect(result.current.initialLoading).toBe(false);
  });

  it('fetches and partitions the four buckets on mount', async () => {
    (apiClient.getFriends as jest.Mock).mockResolvedValue(makeBoard());
    const { result } = renderHook(() => useFriendsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(apiClient.getFriends).toHaveBeenCalledTimes(1);
    expect(result.current.accepted).toHaveLength(1);
    expect(result.current.accepted[0].displayName).toBe('Alice');
    expect(result.current.pendingIncoming).toHaveLength(1);
    expect(result.current.pendingIncoming[0].displayName).toBe('Bob');
    expect(result.current.pendingOutgoing).toHaveLength(1);
    expect(result.current.blocked).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });

  it('fetch failure surfaces in error state', async () => {
    (apiClient.getFriends as jest.Mock).mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useFriendsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(result.current.error).toBe('network down');
    expect(result.current.accepted).toHaveLength(0);
  });

  it('refresh() re-runs the fetch', async () => {
    (apiClient.getFriends as jest.Mock).mockResolvedValue(makeBoard());
    const { result } = renderHook(() => useFriendsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(apiClient.getFriends).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });

    expect(apiClient.getFriends).toHaveBeenCalledTimes(2);
  });

  it('sendRequest: success calls requestFriend then re-fetches the list', async () => {
    (apiClient.getFriends as jest.Mock).mockResolvedValue(makeBoard());
    (apiClient.requestFriend as jest.Mock).mockResolvedValue({
      friendshipId: 'f-new',
      status: 'pending',
    });
    const { result } = renderHook(() => useFriendsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    let ok: boolean = false;
    await act(async () => {
      ok = await result.current.sendRequest('friend@genoly.org');
    });

    expect(ok).toBe(true);
    expect(apiClient.requestFriend).toHaveBeenCalledWith({ targetEmail: 'friend@genoly.org' });
    expect(apiClient.getFriends).toHaveBeenCalledTimes(2);
    expect(result.current.actionError).toBeNull();
    expect(result.current.busyFriendshipId).toBeNull();
  });

  it('sendRequest: 404 not_found maps to a friendly "no account" message and does not refetch', async () => {
    (apiClient.getFriends as jest.Mock).mockResolvedValue(makeBoard());
    (apiClient.requestFriend as jest.Mock).mockRejectedValue(
      new ApiClientError({ code: 'not_found', message: 'No Genoly user with that email' }, 404),
    );
    const { result } = renderHook(() => useFriendsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    let ok: boolean = true;
    await act(async () => {
      ok = await result.current.sendRequest('nobody@genoly.org');
    });

    expect(ok).toBe(false);
    expect(result.current.actionError).toBe('No Genoly account found with that email.');
    // Only the initial mount fetch — a failed request doesn't trigger a refetch.
    expect(apiClient.getFriends).toHaveBeenCalledTimes(1);
  });

  it('sendRequest: 409 conflict maps to "already connected" message', async () => {
    (apiClient.getFriends as jest.Mock).mockResolvedValue(makeBoard());
    (apiClient.requestFriend as jest.Mock).mockRejectedValue(
      new ApiClientError({ code: 'conflict', message: "Friendship already exists with status 'accepted'" }, 409),
    );
    const { result } = renderHook(() => useFriendsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    await act(async () => {
      await result.current.sendRequest('friend@genoly.org');
    });

    expect(result.current.actionError).toBe("You're already connected with that person.");
  });

  it('acceptRequest: calls apiClient.acceptFriend, refreshes, tracks busyFriendshipId', async () => {
    (apiClient.getFriends as jest.Mock).mockResolvedValue(makeBoard());
    (apiClient.acceptFriend as jest.Mock).mockResolvedValue({ status: 'accepted', acceptedAt: 5000 });
    const { result } = renderHook(() => useFriendsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    let ok: boolean = false;
    await act(async () => {
      ok = await result.current.acceptRequest('f-incoming');
    });

    expect(ok).toBe(true);
    expect(apiClient.acceptFriend).toHaveBeenCalledWith('f-incoming');
    expect(apiClient.getFriends).toHaveBeenCalledTimes(2);
    expect(result.current.busyFriendshipId).toBeNull();
  });

  it('acceptRequest: 403 forbidden maps to recipient-only message', async () => {
    (apiClient.getFriends as jest.Mock).mockResolvedValue(makeBoard());
    (apiClient.acceptFriend as jest.Mock).mockRejectedValue(
      new ApiClientError({ code: 'forbidden', message: 'Requester cannot accept their own request' }, 403),
    );
    const { result } = renderHook(() => useFriendsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    await act(async () => {
      await result.current.acceptRequest('f-incoming');
    });

    expect(result.current.actionError).toBe(
      'Only the person who received this request can respond to it.',
    );
  });

  it('declineRequest: calls apiClient.declineFriend then refreshes', async () => {
    (apiClient.getFriends as jest.Mock).mockResolvedValue(makeBoard());
    (apiClient.declineFriend as jest.Mock).mockResolvedValue(undefined);
    const { result } = renderHook(() => useFriendsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    await act(async () => {
      await result.current.declineRequest('f-incoming');
    });

    expect(apiClient.declineFriend).toHaveBeenCalledWith('f-incoming');
    expect(apiClient.getFriends).toHaveBeenCalledTimes(2);
  });

  it('removeFriendship: calls apiClient.unfriend then refreshes', async () => {
    (apiClient.getFriends as jest.Mock).mockResolvedValue(makeBoard());
    (apiClient.unfriend as jest.Mock).mockResolvedValue(undefined);
    const { result } = renderHook(() => useFriendsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    await act(async () => {
      await result.current.removeFriendship('f-accepted');
    });

    expect(apiClient.unfriend).toHaveBeenCalledWith('f-accepted');
    expect(apiClient.getFriends).toHaveBeenCalledTimes(2);
  });

  it('blockFriend: calls apiClient.blockFriend then refreshes', async () => {
    (apiClient.getFriends as jest.Mock).mockResolvedValue(makeBoard());
    (apiClient.blockFriend as jest.Mock).mockResolvedValue({ status: 'blocked', blockedAt: 9000 });
    const { result } = renderHook(() => useFriendsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    await act(async () => {
      await result.current.blockFriend('f-accepted');
    });

    expect(apiClient.blockFriend).toHaveBeenCalledWith('f-accepted');
    expect(apiClient.getFriends).toHaveBeenCalledTimes(2);
  });

  it('busyFriendshipId is set to REQUEST_SENTINEL while sendRequest is in flight', async () => {
    (apiClient.getFriends as jest.Mock).mockResolvedValue(makeBoard());
    let resolveRequest: (v: { friendshipId: string; status: 'pending' }) => void = () => {};
    (apiClient.requestFriend as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveRequest = resolve; }),
    );
    const { result } = renderHook(() => useFriendsData());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.sendRequest('friend@genoly.org');
    });

    await waitFor(() => expect(result.current.busyFriendshipId).toBe(REQUEST_SENTINEL));

    await act(async () => {
      resolveRequest({ friendshipId: 'f-new', status: 'pending' });
      await pending;
    });

    expect(result.current.busyFriendshipId).toBeNull();
  });
});

describe('friendsActionErrorMessage', () => {
  it('maps unauthenticated/token_revoked/token_expired to a re-login message', () => {
    expect(
      friendsActionErrorMessage(new ApiClientError({ code: 'unauthenticated', message: 'x' }, 401), 'accept'),
    ).toBe('Your session expired. Please sign in again.');
    expect(
      friendsActionErrorMessage(new ApiClientError({ code: 'token_revoked', message: 'x' }, 401), 'accept'),
    ).toBe('Your session expired. Please sign in again.');
  });

  it('maps rate_limited to a slow-down message', () => {
    expect(
      friendsActionErrorMessage(new ApiClientError({ code: 'rate_limited', message: 'x' }, 429), 'request'),
    ).toBe('Slow down a sec, then try again.');
  });

  it('falls back to a generic message for a non-ApiClientError', () => {
    expect(friendsActionErrorMessage(new Error('boom'), 'block')).toBe('boom');
    expect(friendsActionErrorMessage('not an error', 'block')).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
