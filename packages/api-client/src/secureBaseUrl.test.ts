/**
 * secureBaseUrl.test.ts — transport hardening (2026-07-11).
 *
 * The fitness HTTP client previously accepted ANY baseUrl scheme, so a
 * misconfigured production build (e.g. a scheme-less or http:// URL) could send
 * bearer-authenticated health/friend data over cleartext. `assertSecureBaseUrl`
 * (called in the FetchApiClient constructor) now refuses cleartext to any
 * non-local host while still permitting http:// to loopback/LAN for local
 * development against the self-hosted Convex backend.
 */

import { assertSecureBaseUrl, FetchApiClient } from './client';
import { MemoryTokenStore } from './token-store';

describe('assertSecureBaseUrl', () => {
  test('allows https to any host', () => {
    expect(() => assertSecureBaseUrl('https://robust-oyster-899.convex.site')).not.toThrow();
    expect(() => assertSecureBaseUrl('https://keen-owl-415.convex.site/')).not.toThrow();
  });

  test('allows http ONLY to loopback / LAN (local dev)', () => {
    expect(() => assertSecureBaseUrl('http://127.0.0.1:3210')).not.toThrow();
    expect(() => assertSecureBaseUrl('http://localhost:3210')).not.toThrow();
    expect(() => assertSecureBaseUrl('http://192.168.1.50:3210')).not.toThrow();
    expect(() => assertSecureBaseUrl('http://10.0.0.5:3210')).not.toThrow();
    expect(() => assertSecureBaseUrl('http://172.16.0.9:3210')).not.toThrow();
  });

  test('rejects http to a public host (cleartext leak)', () => {
    expect(() => assertSecureBaseUrl('http://robust-oyster-899.convex.site')).toThrow(/insecure/i);
    expect(() => assertSecureBaseUrl('http://example.com')).toThrow(/insecure/i);
    // A non-private public IP is not "local".
    expect(() => assertSecureBaseUrl('http://8.8.8.8')).toThrow(/insecure/i);
  });

  test('rejects a scheme-less or malformed URL (e.g. an unresolved prod placeholder)', () => {
    expect(() => assertSecureBaseUrl('keen-owl-415-placeholder')).toThrow();
    expect(() => assertSecureBaseUrl('')).toThrow();
  });

  test('the FetchApiClient constructor enforces it', () => {
    expect(
      () =>
        new FetchApiClient({
          tokenStore: new MemoryTokenStore(),
          baseUrl: 'http://robust-oyster-899.convex.site',
        }),
    ).toThrow(/insecure/i);
    expect(
      () =>
        new FetchApiClient({
          tokenStore: new MemoryTokenStore(),
          baseUrl: 'https://robust-oyster-899.convex.site',
        }),
    ).not.toThrow();
  });
});
