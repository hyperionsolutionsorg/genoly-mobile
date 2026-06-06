import { MemoryTokenStore } from './token-store';

describe('MemoryTokenStore', () => {
  it('starts in an expired/empty state', async () => {
    const store = new MemoryTokenStore();
    expect(await store.isExpired()).toBe(true);
    expect(await store.getToken()).toBeNull();
  });

  it('stores and retrieves a valid token', async () => {
    const store = new MemoryTokenStore();
    const expiry = Date.now() + 10_000;
    await store.setToken('test_token_123', expiry);

    expect(await store.isExpired()).toBe(false);
    expect(await store.getToken()).toBe('test_token_123');
  });

  it('reports expired and returns null when token expiry is in the past', async () => {
    const store = new MemoryTokenStore();
    const pastExpiry = Date.now() - 1_000;
    await store.setToken('expired_token', pastExpiry);

    expect(await store.isExpired()).toBe(true);
    expect(await store.getToken()).toBeNull();
  });

  it('clears token — isExpired returns true and getToken returns null', async () => {
    const store = new MemoryTokenStore();
    await store.setToken('another_token', Date.now() + 10_000);
    await store.clearToken();

    expect(await store.isExpired()).toBe(true);
    expect(await store.getToken()).toBeNull();
  });
});
