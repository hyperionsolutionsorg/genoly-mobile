/**
 * useFriendsData — Step 9 of Phase 1.
 *
 * Powers the Friends screen (`app/friends.tsx`). Mirrors the drain-free
 * shape of `useDashboardData` / `useLeaderboardData` (refresh / refreshing /
 * initialLoading / error), minus the SyncQueue drain step — the friends
 * graph has nothing to do with locally-queued HealthKit uploads, so there's
 * no outbox to flush before reading it.
 *
 * Responsibilities:
 *
 *   1. On mount and on refresh(), call `apiClient.getFriends()` and expose
 *      the four partitions the contract returns: accepted, pendingIncoming,
 *      pendingOutgoing, blocked.
 *   2. Wrap each of the 5 remaining friends mutations (request / accept /
 *      decline / unfriend / block) with:
 *        - a per-action `busyFriendshipId` (or a sentinel for requestFriend,
 *          which has no friendshipId yet) so the screen can show a
 *          per-row spinner instead of a global one,
 *        - NO auto-retry (mutations never auto-retry per AGENTS.md §3.5 —
 *          `apiClient`/`FetchApiClient.request()` already enforces this;
 *          the hook just surfaces the resulting error for the screen to
 *          show and lets the user explicitly retry the tap),
 *        - a local re-fetch of the list on success so the four buckets
 *          stay in sync without the caller needing to remember to refresh.
 *   3. Surface a friendly `actionError` message separate from `error` (the
 *      list-fetch error) so a failed accept/decline doesn't get confused
 *      with a failed initial load.
 *
 * Error-code → copy mapping lives here (not in the screen) per
 * mobile-sync-architecture.md §6: screens never branch on `code` directly.
 */

import { useCallback, useEffect, useState } from 'react';
import type { FriendBrief } from '@genoly/types';
import { ApiClientError } from '@genoly/api-client';
import { apiClient } from '../utils/api';

// ── Public types ─────────────────────────────────────────────────────

export interface FriendsData {
  accepted: FriendBrief[];
  pendingIncoming: FriendBrief[];
  pendingOutgoing: FriendBrief[];
  blocked: FriendBrief[];
  /** True while a refresh() cycle is running. */
  refreshing: boolean;
  /** True until the first fetch cycle settles. */
  initialLoading: boolean;
  /** Last error message from fetching the list; cleared on next refresh. */
  error: string | null;
  /** Trigger a manual re-fetch of the friends list. */
  refresh: () => Promise<void>;

  /** friendshipId of the row currently processing an action, or the
   *  REQUEST_SENTINEL while sendRequest() is in flight. null when idle. */
  busyFriendshipId: string | null;
  /** Last error message from an action (request/accept/decline/unfriend/
   *  block). Cleared at the start of the next action. */
  actionError: string | null;

  /** POST /friends/request. Resolves true on success, false on a mapped
   *  error (already surfaced via actionError) — callers decide whether to
   *  also pop an Alert. */
  sendRequest: (targetEmail: string) => Promise<boolean>;
  /** POST /friends/:id/accept, then refreshes the list. */
  acceptRequest: (friendshipId: string) => Promise<boolean>;
  /** POST /friends/:id/decline, then refreshes the list. */
  declineRequest: (friendshipId: string) => Promise<boolean>;
  /** DELETE /friends/:id — unfriend an accepted friend or withdraw a
   *  pending outgoing request, then refreshes the list. */
  removeFriendship: (friendshipId: string) => Promise<boolean>;
  /** POST /friends/:id/block, then refreshes the list. */
  blockFriend: (friendshipId: string) => Promise<boolean>;
}

/** Sentinel busyFriendshipId while sendRequest() is in flight (no
 *  friendshipId exists yet — the server mints one on success). */
export const REQUEST_SENTINEL = '__send_request__';

// ── Error copy mapping (mobile-sync-architecture.md §6) ─────────────

/**
 * Maps a thrown error to user-facing copy for friends actions. Sentence
 * case, direct, per DESIGN.md tone rules. Exported for tests.
 */
export function friendsActionErrorMessage(err: unknown, action: 'request' | 'accept' | 'decline' | 'remove' | 'block'): string {
  if (err instanceof ApiClientError) {
    switch (err.code) {
      case 'not_found':
        return action === 'request'
          ? "No Genoly account found with that email."
          : 'That friend request or friendship no longer exists.';
      case 'validation_failed':
      case 'bad_request':
        return action === 'request' ? "You can't send a friend request to yourself." : err.message;
      case 'conflict':
        return action === 'request'
          ? "You're already connected with that person."
          : 'This friend request was already handled.';
      case 'forbidden':
        return action === 'accept' || action === 'decline'
          ? 'Only the person who received this request can respond to it.'
          : "You don't have permission to do that.";
      case 'unauthenticated':
      case 'token_revoked':
      case 'token_expired':
        return 'Your session expired. Please sign in again.';
      case 'rate_limited':
        return "Slow down a sec, then try again.";
      default:
        return 'Something went wrong on our end. Please try again.';
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

// ── The hook ─────────────────────────────────────────────────────────

export interface UseFriendsDataOptions {
  /** Skip the on-mount auto-refresh. Used by tests that want to control
   *  timing explicitly. */
  skipInitialRefresh?: boolean;
}

export function useFriendsData(options: UseFriendsDataOptions = {}): FriendsData {
  const [accepted, setAccepted] = useState<FriendBrief[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<FriendBrief[]>([]);
  const [pendingOutgoing, setPendingOutgoing] = useState<FriendBrief[]>([]);
  const [blocked, setBlocked] = useState<FriendBrief[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!options.skipInitialRefresh);
  const [error, setError] = useState<string | null>(null);

  const [busyFriendshipId, setBusyFriendshipId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const result = await apiClient.getFriends();
      setAccepted(result.accepted);
      setPendingIncoming(result.pendingIncoming);
      setPendingOutgoing(result.pendingOutgoing);
      setBlocked(result.blocked);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load friends';
      setError(msg);
    } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (options.skipInitialRefresh) return;
    refresh();
    // refresh is stable via useCallback([]); running once on mount is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendRequest = useCallback(
    async (targetEmail: string): Promise<boolean> => {
      setBusyFriendshipId(REQUEST_SENTINEL);
      setActionError(null);
      try {
        await apiClient.requestFriend({ targetEmail });
        await refresh();
        return true;
      } catch (err) {
        setActionError(friendsActionErrorMessage(err, 'request'));
        return false;
      } finally {
        setBusyFriendshipId(null);
      }
    },
    [refresh],
  );

  const acceptRequest = useCallback(
    async (friendshipId: string): Promise<boolean> => {
      setBusyFriendshipId(friendshipId);
      setActionError(null);
      try {
        await apiClient.acceptFriend(friendshipId);
        await refresh();
        return true;
      } catch (err) {
        setActionError(friendsActionErrorMessage(err, 'accept'));
        return false;
      } finally {
        setBusyFriendshipId(null);
      }
    },
    [refresh],
  );

  const declineRequest = useCallback(
    async (friendshipId: string): Promise<boolean> => {
      setBusyFriendshipId(friendshipId);
      setActionError(null);
      try {
        await apiClient.declineFriend(friendshipId);
        await refresh();
        return true;
      } catch (err) {
        setActionError(friendsActionErrorMessage(err, 'decline'));
        return false;
      } finally {
        setBusyFriendshipId(null);
      }
    },
    [refresh],
  );

  const removeFriendship = useCallback(
    async (friendshipId: string): Promise<boolean> => {
      setBusyFriendshipId(friendshipId);
      setActionError(null);
      try {
        await apiClient.unfriend(friendshipId);
        await refresh();
        return true;
      } catch (err) {
        setActionError(friendsActionErrorMessage(err, 'remove'));
        return false;
      } finally {
        setBusyFriendshipId(null);
      }
    },
    [refresh],
  );

  const blockFriend = useCallback(
    async (friendshipId: string): Promise<boolean> => {
      setBusyFriendshipId(friendshipId);
      setActionError(null);
      try {
        await apiClient.blockFriend(friendshipId);
        await refresh();
        return true;
      } catch (err) {
        setActionError(friendsActionErrorMessage(err, 'block'));
        return false;
      } finally {
        setBusyFriendshipId(null);
      }
    },
    [refresh],
  );

  return {
    accepted,
    pendingIncoming,
    pendingOutgoing,
    blocked,
    refreshing,
    initialLoading,
    error,
    refresh,
    busyFriendshipId,
    actionError,
    sendRequest,
    acceptRequest,
    declineRequest,
    removeFriendship,
    blockFriend,
  };
}
