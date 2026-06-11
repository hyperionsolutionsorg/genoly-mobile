/**
 * convex.ts — the member-side Convex reactive client + Convex Auth storage.
 *
 * Per decision 2026-06-11-member-side-convex-client: the Genoly member
 * experience (trees, persons, rewards, walking challenges…) rides the
 * official `convex` React client + `@convex-dev/auth`, exactly like the
 * web app. The fitness layer keeps its separate HTTP bearer contract
 * (`utils/api.ts`) — the two sessions coexist and tear down together on
 * sign-out.
 *
 * URL discipline (AGENTS.md §3.10): never hardcode deployment URLs —
 * `extra.convexCloudUrl` in app.json is the injection point. Note the
 * member client needs the `.convex.cloud` origin; `.convex.site` is the
 * HTTP-actions endpoint used by the fitness API.
 *
 * Token storage (AGENTS.md §3.4 extended): Convex Auth JWT + refresh
 * token live in expo-secure-store via this TokenStorage adapter, never
 * AsyncStorage. Keys are namespaced by Convex Auth itself.
 */

import Constants from 'expo-constants';
import { ConvexReactClient } from 'convex/react';
import type { TokenStorage } from '@convex-dev/auth/react';

function requireCloudUrl(): string {
  const url = Constants.expoConfig?.extra?.convexCloudUrl as string | undefined;
  if (!url || !url.startsWith('https://')) {
    throw new Error(
      'Missing extra.convexCloudUrl in app.json — the member-side Convex client cannot start.',
    );
  }
  return url;
}

let cachedClient: ConvexReactClient | null = null;

/** Module-level singleton, mirroring the `apiClient` pattern in utils/api.ts. */
export function getConvexClient(): ConvexReactClient {
  if (!cachedClient) {
    cachedClient = new ConvexReactClient(requireCloudUrl());
  }
  return cachedClient;
}

interface SecureStoreModule {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

let cachedSecureStore: SecureStoreModule | null = null;
const memoryShim = new Map<string, string>();

function getSecureStore(): SecureStoreModule {
  if (cachedSecureStore) return cachedSecureStore;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- REASON: lazy require keeps this module importable in Node tests.
    cachedSecureStore = require('expo-secure-store') as SecureStoreModule;
  } catch {
    cachedSecureStore = {
      async getItemAsync(key) {
        return memoryShim.get(key) ?? null;
      },
      async setItemAsync(key, value) {
        memoryShim.set(key, value);
      },
      async deleteItemAsync(key) {
        memoryShim.delete(key);
      },
    };
  }
  return cachedSecureStore;
}

/**
 * SecureStore keys reject some characters Convex Auth uses in its
 * namespaced keys (e.g. ':' and '|'); normalize defensively.
 */
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** TokenStorage adapter handed to <ConvexAuthProvider storage={...}>. */
export const convexAuthStorage: TokenStorage = {
  async getItem(key: string) {
    return getSecureStore().getItemAsync(safeKey(key));
  },
  async setItem(key: string, value: string) {
    await getSecureStore().setItemAsync(safeKey(key), value);
  },
  async removeItem(key: string) {
    await getSecureStore().deleteItemAsync(safeKey(key));
  },
};
