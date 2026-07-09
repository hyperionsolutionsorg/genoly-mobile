/**
 * friends.test.ts — Step 9 coverage for the 6 friends endpoints on
 * FetchApiClient (per fitness-api-contract.md §3 and
 * mobile-sync-architecture.md §4/§6).
 *
 * Mocks global fetch (injected via the `fetch` constructor option so we
 * never touch the real network — AGENTS.md "No live-Convex test runs").
 *
 * Covers:
 *   1. getFriends — success shape (GET, no retry needed to assert here)
 *   2. requestFriend — success (201) + 404/409/400 error-code mapping
 *   3. acceptFriend — success (200) + 403/409/404 error-code mapping
 *   4. declineFriend — success (204, no body) + 409 error-code mapping
 *   5. unfriend — success (204, no body) via DELETE
 *   6. blockFriend — success (200)
 *   7. No-auto-retry-on-mutations: POST/DELETE only attempt fetch ONCE
 *      even on a 500/network-error response — retries are GET-only per
 *      AGENTS.md §3.5 and mobile-sync-architecture.md §4.c.
 */

import { FetchApiClient } from './client';
import { ApiClientError } from './index';
import { MemoryTokenStore } from './token-store';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null } as unknown as Headers,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function emptyResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null } as unknown as Headers,
    json: async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    },
    text: async () => '',
  } as unknown as Response;
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(status, { error: { code, message } });
}

async function makeClient(fetchMock: jest.Mock) {
  const tokenStore = new MemoryTokenStore();
  await tokenStore.setToken('test-bearer-token', Date.now() + 60_000);
  return new FetchApiClient({
    tokenStore,
    baseUrl: 'https://robust-oyster-899.convex.site',
    fetch: fetchMock as unknown as typeof fetch,
  });
}

describe('FetchApiClient — friends endpoints', () => {
  // ── getFriends ─────────────────────────────────────────────────────

  it('getFriends: GET /api/fitness/friends returns the partitioned lists', async () => {
    const board = {
      accepted: [
        {
          friendshipId: 'f1',
          fitnessUserId: 'u-a',
          displayName: 'Alice',
          avatarPhotoKey: null,
          status: 'accepted',
          createdAt: 1000,
          acceptedAt: 2000,
        },
      ],
      pendingIncoming: [],
      pendingOutgoing: [],
      blocked: [],
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, board));
    const client = await makeClient(fetchMock);

    const result = await client.getFriends();

    expect(result).toEqual(board);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://robust-oyster-899.convex.site/api/fitness/friends');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer test-bearer-token');
  });

  // ── requestFriend ──────────────────────────────────────────────────

  it('requestFriend: POST /api/fitness/friends/request returns 201 body', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(201, { friendshipId: 'f2', status: 'pending' }));
    const client = await makeClient(fetchMock);

    const result = await client.requestFriend({ targetEmail: 'friend@genoly.org' });

    expect(result).toEqual({ friendshipId: 'f2', status: 'pending' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://robust-oyster-899.convex.site/api/fitness/friends/request',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ targetEmail: 'friend@genoly.org' });
  });

  it('requestFriend: maps 404 not_found (no user at that email, or privacy-hidden block)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(errorResponse(404, 'not_found', 'No Genoly user with that email'));
    const client = await makeClient(fetchMock);

    await expect(client.requestFriend({ targetEmail: 'nobody@genoly.org' })).rejects.toMatchObject(
      { code: 'not_found', status: 404 },
    );
  });

  it('requestFriend: maps 409 conflict (friendship already exists)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(errorResponse(409, 'conflict', "Friendship already exists with status 'accepted'"));
    const client = await makeClient(fetchMock);

    await expect(client.requestFriend({ targetEmail: 'friend@genoly.org' })).rejects.toMatchObject(
      { code: 'conflict', status: 409 },
    );
  });

  it('requestFriend: maps 400 validation_failed (self-friend attempt)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(errorResponse(400, 'validation_failed', 'Cannot friend yourself'));
    const client = await makeClient(fetchMock);

    await expect(client.requestFriend({ targetEmail: 'me@genoly.org' })).rejects.toMatchObject({
      code: 'validation_failed',
      status: 400,
    });
  });

  // ── acceptFriend ───────────────────────────────────────────────────

  it('acceptFriend: POST .../:id/accept returns 200 body', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { status: 'accepted', acceptedAt: 5000 }));
    const client = await makeClient(fetchMock);

    const result = await client.acceptFriend('f3');

    expect(result).toEqual({ status: 'accepted', acceptedAt: 5000 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://robust-oyster-899.convex.site/api/fitness/friends/f3/accept',
    );
    expect(init.method).toBe('POST');
  });

  it('acceptFriend: maps 403 forbidden (requester cannot accept own request)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        errorResponse(403, 'forbidden', 'Requester cannot accept their own request'),
      );
    const client = await makeClient(fetchMock);

    await expect(client.acceptFriend('f3')).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    });
  });

  it('acceptFriend: maps 409 conflict (already accepted/blocked)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(errorResponse(409, 'conflict', "Cannot accept friendship in status 'accepted'"));
    const client = await makeClient(fetchMock);

    await expect(client.acceptFriend('f3')).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });

  it('acceptFriend: maps 404 not_found (not a member / does not exist)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(errorResponse(404, 'not_found', 'Friendship not found'));
    const client = await makeClient(fetchMock);

    await expect(client.acceptFriend('bogus')).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  // ── declineFriend ──────────────────────────────────────────────────

  it('declineFriend: POST .../:id/decline resolves void on 204 (no body)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(emptyResponse(204));
    const client = await makeClient(fetchMock);

    await expect(client.declineFriend('f4')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://robust-oyster-899.convex.site/api/fitness/friends/f4/decline',
    );
    expect(init.method).toBe('POST');
  });

  it('declineFriend: maps 409 conflict (not currently pending)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(errorResponse(409, 'conflict', "Cannot decline friendship in status 'accepted'"));
    const client = await makeClient(fetchMock);

    await expect(client.declineFriend('f4')).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });

  // ── unfriend ───────────────────────────────────────────────────────

  it('unfriend: DELETE /api/fitness/friends/:id resolves void on 204 (no body)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(emptyResponse(204));
    const client = await makeClient(fetchMock);

    await expect(client.unfriend('f5')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://robust-oyster-899.convex.site/api/fitness/friends/f5');
    expect(init.method).toBe('DELETE');
  });

  it('unfriend: maps 404 not_found (not a member, or not the blocker on a blocked row)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(errorResponse(404, 'not_found', 'Friendship not found'));
    const client = await makeClient(fetchMock);

    await expect(client.unfriend('f5')).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  // ── blockFriend ────────────────────────────────────────────────────

  it('blockFriend: POST .../:id/block returns 200 body', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { status: 'blocked', blockedAt: 9000 }));
    const client = await makeClient(fetchMock);

    const result = await client.blockFriend('f6');

    expect(result).toEqual({ status: 'blocked', blockedAt: 9000 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://robust-oyster-899.convex.site/api/fitness/friends/f6/block');
    expect(init.method).toBe('POST');
  });

  it('blockFriend: maps 404 not_found (not a member of the friendship)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(errorResponse(404, 'not_found', 'Friendship not found'));
    const client = await makeClient(fetchMock);

    await expect(client.blockFriend('f6')).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  // ── No-auto-retry-on-mutations (AGENTS.md §3.5 / architecture §4.c) ──

  it('does NOT retry POST requestFriend on a 500 — fetch is called exactly once', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(errorResponse(500, 'internal', 'Server bug'));
    const client = await makeClient(fetchMock);

    await expect(client.requestFriend({ targetEmail: 'friend@genoly.org' })).rejects.toMatchObject(
      { code: 'internal', status: 500 },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry POST acceptFriend on a network error — fetch is called exactly once', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('Network request failed'));
    const client = await makeClient(fetchMock);

    await expect(client.acceptFriend('f3')).rejects.toBeInstanceOf(ApiClientError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry DELETE unfriend on a 500 — fetch is called exactly once', async () => {
    const fetchMock = jest.fn().mockResolvedValue(errorResponse(500, 'internal', 'Server bug'));
    const client = await makeClient(fetchMock);

    await expect(client.unfriend('f5')).rejects.toMatchObject({ code: 'internal', status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry POST declineFriend on a 429 rate_limited — fetch is called exactly once', async () => {
    const fetchMock = jest.fn().mockResolvedValue(errorResponse(429, 'rate_limited', 'Slow down'));
    const client = await makeClient(fetchMock);

    await expect(client.declineFriend('f4')).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ── Contrast: GET DOES retry (sanity check the boundary is real) ────

  it('sanity: getFriends (GET) DOES retry on a 500, unlike the mutations above', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(500, 'internal', 'transient'))
      .mockResolvedValueOnce(
        jsonResponse(200, { accepted: [], pendingIncoming: [], pendingOutgoing: [], blocked: [] }),
      );
    const client = await makeClient(fetchMock);

    const result = await client.getFriends();

    expect(result.accepted).toEqual([]);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  }, 10_000);
});
