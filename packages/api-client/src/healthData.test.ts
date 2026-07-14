/**
 * healthData.test.ts — DELETE /api/fitness/health-data coverage (the
 * "remove my health data" user right, 2026-07-13; pairs with the
 * server's 1-year retention cron).
 *
 * Mocks global fetch via the constructor option (AGENTS.md "No
 * live-Convex test runs"). Mirrors goals.test.ts harness.
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

async function makeClient(fetchMock: jest.Mock) {
  const tokenStore = new MemoryTokenStore();
  await tokenStore.setToken('test-bearer-token', Date.now() + 60_000);
  return new FetchApiClient({
    tokenStore,
    baseUrl: 'https://robust-oyster-899.convex.site',
    fetch: fetchMock as unknown as typeof fetch,
  });
}

describe('FetchApiClient — deleteHealthData', () => {
  it('DELETEs /api/fitness/health-data with the bearer and parses the count', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { deleted: 42, serverTime: 1234567890 }));
    const client = await makeClient(fetchMock);

    const result = await client.deleteHealthData();

    expect(result).toEqual({ deleted: 42, serverTime: 1234567890 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://robust-oyster-899.convex.site/api/fitness/health-data');
    expect(opts.method).toBe('DELETE');
    expect(opts.headers.Authorization).toBe('Bearer test-bearer-token');
  });

  it('maps 401 to an ApiClientError (invalid token)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { error: { code: 'unauthenticated', message: 'bad token' } }),
      );
    const client = await makeClient(fetchMock);

    await expect(client.deleteHealthData()).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      client.deleteHealthData().catch((e) => e instanceof ApiClientError),
    ).resolves.toBe(true);
  });

  it('does NOT auto-retry on a 500 — DELETE is a mutation (AGENTS.md §3.5)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(500, { error: { code: 'internal', message: 'boom' } }));
    const client = await makeClient(fetchMock);

    await expect(client.deleteHealthData()).rejects.toBeInstanceOf(ApiClientError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
