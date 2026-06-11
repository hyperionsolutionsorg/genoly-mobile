/**
 * preferences.ts — non-sensitive app preferences stored in AsyncStorage.
 *
 * For sensitive data (bearer tokens, etc.) use the `tokenStore` exported
 * from `./api.ts` which is backed by expo-secure-store.
 *
 * Why two stores: SecureStore is hardware-backed but limited to ~2KB per
 * item and slower to read. AsyncStorage is fine for booleans + small
 * strings and faster on cold start.
 *
 * Pattern: each preference gets a typed getter + setter pair. Adding a
 * new flag = add a key constant + getter + setter. Don't introduce a
 * generic key-value API — explicit typing catches typos.
 *
 * Native module loading is wrapped in a defensive lazy require so the
 * preference functions work in Node test environments by falling back
 * to an in-memory shim.
 */

interface AsyncStorageModule {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let cachedModule: AsyncStorageModule | null = null;
const memoryShim = new Map<string, string>();

function getStorage(): AsyncStorageModule {
  if (cachedModule) return cachedModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- REASON: lazy require keeps this module importable in Node tests.
    const mod = require('@react-native-async-storage/async-storage');
    cachedModule = (mod?.default ?? mod) as AsyncStorageModule;
  } catch {
    // Node test environment — use in-memory shim.
    cachedModule = {
      async getItem(key: string) {
        return memoryShim.get(key) ?? null;
      },
      async setItem(key: string, value: string) {
        memoryShim.set(key, value);
      },
      async removeItem(key: string) {
        memoryShim.delete(key);
      },
    };
  }
  return cachedModule;
}

// ── Keys ──────────────────────────────────────────────────────────────

const KEY_HAS_REQUESTED_HEALTH_PERMISSIONS = 'genoly.hasRequestedHealthPermissions';
const KEY_HEALTH_SYNC_ENABLED = 'genoly.healthSyncEnabled';
const KEY_THEME_PREFERENCE = 'genoly.themePreference';

// ── Getters + setters ─────────────────────────────────────────────────

/**
 * Whether the permissions screen has been shown to this user on this
 * device. If false, the auth gate routes to `/(auth)/permissions` after
 * login. If true, the user has already resolved the prompt (grant OR
 * skip) and the gate goes straight to `/(tabs)`.
 *
 * This flag is per-device + per-app-install. Reinstalling the app
 * resets it; signing in with a different account does NOT.
 */
export async function getHasRequestedHealthPermissions(): Promise<boolean> {
  const raw = await getStorage().getItem(KEY_HAS_REQUESTED_HEALTH_PERMISSIONS);
  return raw === 'true';
}

export async function setHasRequestedHealthPermissions(value: boolean): Promise<void> {
  await getStorage().setItem(KEY_HAS_REQUESTED_HEALTH_PERMISSIONS, value ? 'true' : 'false');
}

/**
 * Whether health sync is currently enabled. Set to true if the user
 * grants permissions on the permissions screen; set to false if they
 * skip or revoke. The actual sync drainer (Step 5+) reads this before
 * pulling from the native health store.
 */
export async function getHealthSyncEnabled(): Promise<boolean> {
  const raw = await getStorage().getItem(KEY_HEALTH_SYNC_ENABLED);
  return raw === 'true';
}

export async function setHealthSyncEnabled(value: boolean): Promise<void> {
  await getStorage().setItem(KEY_HEALTH_SYNC_ENABLED, value ? 'true' : 'false');
}

/**
 * Theme preference: 'system' follows the OS light/dark setting; 'light',
 * 'dark', and 'classic' pin a specific palette (mirrors the web's three
 * themes). Consumed by ThemeProvider in `theme/index.tsx`.
 */
export type ThemePreference = 'system' | 'light' | 'dark' | 'classic';

const THEME_PREFERENCE_VALUES: readonly ThemePreference[] = ['system', 'light', 'dark', 'classic'];

export async function getThemePreference(): Promise<ThemePreference> {
  const raw = await getStorage().getItem(KEY_THEME_PREFERENCE);
  return THEME_PREFERENCE_VALUES.includes(raw as ThemePreference)
    ? (raw as ThemePreference)
    : 'system';
}

export async function setThemePreference(value: ThemePreference): Promise<void> {
  await getStorage().setItem(KEY_THEME_PREFERENCE, value);
}

// ── Test helpers ──────────────────────────────────────────────────────

/** Clears the in-memory shim. ONLY use from Jest setup. */
export function __resetPreferencesShim(): void {
  memoryShim.clear();
  cachedModule = null;
}
