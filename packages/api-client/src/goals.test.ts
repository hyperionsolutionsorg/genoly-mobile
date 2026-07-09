/**
 * goals.test.ts — Step 10 coverage for the 4 goals endpoints on
 * FetchApiClient (per fitness-api-contract.md §4 and
 * mobile-sync-architecture.md §4/§6).
 *
 * Mocks global fetch (injected via the `fetch` constructor option so we
 * never touch the real network — AGENTS.md "No live-Convex test runs").
 *
 * Covers:
 *   1. getGoals — success shape (GET)
 *   2. getGoalsHistory — success shape, optional query params (period/
 *      metric/limit), and omitting them entirely
 *   3. upsertGoal — success (200, created: true / created: false) +
 *      400/401 error-code mapping
 *   4. archiveGoal — success (204, no body) + 404 error-code mapping
 *      (ownership check failure per the contract's "don't leak
 *      existence" rule)
 *   5. No-auto-retry-on-mutations: PUT/DELETE only attempt fetch ONCE
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

describe('FetchApiClient — goals endpoints', () => {
  // ── getGoals ───────────────────────────────────────────────────────

  it('getGoals: GET /api/fitness/goals returns the active goals list', async () => {
    const body = {
      goals: [
        {
          id: 'g1',
          period: 'daily',
          metric: 'steps',
          target: 10000,
          effectiveFrom: 1000,
          createdAt: 1000,
        },
      ],
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, body));
    const client = await makeClient(fetchMock);

    const result = await client.getGoals();

    expect(result).toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://robust-oyster-899.convex.site/api/fitness/goals');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer test-bearer-token');
  });

  // ── getGoalsHistory ────────────────────────────────────────────────

  it('getGoalsHistory: GET with no opts omits query params', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { goals: [] }));
    const client = await makeClient(fetchMock);

    const result = await client.getGoalsHistory();

    expect(result).toEqual({ goals: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://robust-oyster-899.convex.site/api/fitness/goals/history');
    expect(init.method).toBe('GET');
  });

  it('getGoalsHistory: passes period/metric/limit as query params', async () => {
    const body = {
      goals: [
        {
          id: 'g0',
          period: 'daily',
          metric: 'steps',
          target: 8000,
          effectiveFrom: 500,
          archivedAt: 900,
          createdAt: 100,
        },
      ],
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, body));
    const client = await makeClient(fetchMock);

    const result = await client.getGoalsHistory({ period: 'daily', metric: 'steps', limit: 25 });

    expect(result).toEqual(body);
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/api/fitness/goals/history');
    expect(parsed.searchParams.get('period')).toBe('daily');
    expect(parsed.searchParams.get('metric')).toBe('steps');
    expect(parsed.searchParams.get('limit')).toBe('25');
  });

  it('getGoalsHistory: maps 400 validation_failed (bad limit)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(errorResponse(400, 'validation_failed', 'limit must be between 1 and 200'));
    const client = await makeClient(fetchMock);

    await expect(client.getGoalsHistory({ limit: 999 })).rejects.toMatchObject({
      code: 'validation_failed',
      status: 400,
    });
  });

  // ── upsertGoal ─────────────────────────────────────────────────────

  it('upsertGoal: PUT /api/fitness/goals returns created:true for a new goal', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { id: 'g2', status: 'active', created: true }));
    const client = await makeClient(fetchMock);

    const result = await client.upsertGoal({ period: 'daily', metric: 'steps', target: 10000 });

    expect(result).toEqual({ id: 'g2', status: 'active', created: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://robust-oyster-899.convex.site/api/fitness/goals');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ period: 'daily', metric: 'steps', target: 10000 });
  });

  it('upsertGoal: PUT returns created:false when the same target already exists (idempotent no-op)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { id: 'g2', status: 'active', created: false }));
    const client = await makeClient(fetchMock);

    const result = await client.upsertGoal({ period: 'daily', metric: 'steps', target: 10000 });

    expect(result).toEqual({ id: 'g2', status: 'active', created: false });
  });

  it('upsertGoal: maps 400 validation_failed (bad target)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(errorResponse(400, 'validation_failed', 'target must be a non-negative integer'));
    const client = await makeClient(fetchMock);

    await expect(
      client.upsertGoal({ period: 'daily', metric: 'steps', target: -5 }),
    ).rejects.toMatchObject({ code: 'validation_failed', status: 400 });
  });

  it('upsertGoal: maps 401 unauthenticated', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(errorResponse(401, 'unauthenticated', 'Invalid token'));
    const client = await makeClient(fetchMock);

    await expect(
      client.upsertGoal({ period: 'weekly', metric: 'calories', target: 20000 }),
    ).rejects.toMatchObject({ code: 'unauthenticated', status: 401 });
  });

  // ── archiveGoal ────────────────────────────────────────────────────

  it('archiveGoal: DELETE /api/fitness/goals/:goalId resolves void on 204 (no body)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(emptyResponse(204));
    const client = await makeClient(fetchMock);

    await expect(client.archiveGoal('g3')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://robust-oyster-899.convex.site/api/fitness/goals/g3');
    expect(init.method).toBe('DELETE');
  });

  it("archiveGoal: maps 404 not_found (not the goal's owner, or doesn't exist)", async () => {
    const fetchMock = jest.fn().mockResolvedValue(errorResponse(404, 'not_found', 'Goal not found'));
    const client = await makeClient(fetchMock);

    await expect(client.archiveGoal('bogus')).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });
  });

  // ── No-auto-retry-on-mutations (AGENTS.md §3.5 / architecture §4.c) ──

  it('does NOT retry PUT upsertGoal on a 500 — fetch is called exactly once', async () => {
    const fetchMock = jest.fn().mockResolvedValue(errorResponse(500, 'internal', 'Server bug'));
    const client = await makeClient(fetchMock);

    await expect(
      client.upsertGoal({ period: 'daily', metric: 'steps', target: 10000 }),
    ).rejects.toMatchObject({ code: 'internal', status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry PUT upsertGoal on a network error — fetch is called exactly once', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('Network request failed'));
    const client = await makeClient(fetchMock);

    await expect(
      client.upsertGoal({ period: 'daily', metric: 'steps', target: 10000 }),
    ).rejects.toBeInstanceOf(ApiClientError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry DELETE archiveGoal on a 500 — fetch is called exactly once', async () => {
    const fetchMock = jest.fn().mockResolvedValue(errorResponse(500, 'internal', 'Server bug'));
    const client = await makeClient(fetchMock);

    await expect(client.archiveGoal('g3')).rejects.toMatchObject({ code: 'internal', status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry PUT upsertGoal on a 429 rate_limited — fetch is called exactly once', async () => {
    const fetchMock = jest.fn().mockResolvedValue(errorResponse(429, 'rate_limited', 'Slow down'));
    const client = await makeClient(fetchMock);

    await expect(
      client.upsertGoal({ period: 'daily', metric: 'steps', target: 10000 }),
    ).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ── Contrast: GET DOES retry (sanity check the boundary is real) ────

  it('sanity: getGoals (GET) DOES retry on a 500, unlike the mutations above', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(500, 'internal', 'transient'))
      .mockResolvedValueOnce(jsonResponse(200, { goals: [] }));
    const client = await makeClient(fetchMock);

    const result = await client.getGoals();

    expect(result.goals).toEqual([]);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  }, 10_000);
});
