import { MemoryTokenStore } from './token-store';

async function runTests() {
  console.log('Running MemoryTokenStore tests...');

  const store = new MemoryTokenStore();

  // Test initial state
  if (!(await store.isExpired())) {
    throw new Error('Initial store should be expired/empty');
  }
  if ((await store.getToken()) !== null) {
    throw new Error('Initial token should be null');
  }

  // Test set and get
  const expiry = Date.now() + 10000; // 10 seconds from now
  await store.setToken('test_token_123', expiry);

  if (await store.isExpired()) {
    throw new Error('Store should not be expired yet');
  }
  if ((await store.getToken()) !== 'test_token_123') {
    throw new Error('Retrieved token does not match set token');
  }

  // Test expiry
  const pastExpiry = Date.now() - 1000; // 1 second ago
  await store.setToken('expired_token', pastExpiry);

  if (!(await store.isExpired())) {
    throw new Error('Store should be expired');
  }
  if ((await store.getToken()) !== null) {
    throw new Error('Expired token should return null');
  }

  // Test clear
  await store.setToken('another_token', Date.now() + 10000);
  await store.clearToken();

  if (!(await store.isExpired())) {
    throw new Error('Store should be expired after clearing');
  }
  if ((await store.getToken()) !== null) {
    throw new Error('Token should be null after clearing');
  }

  console.log('All MemoryTokenStore tests passed successfully!');
}

runTests().catch((err: unknown) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
