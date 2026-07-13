/**
 * common.ts — shared plumbing for the mobile game screens (games port,
 * 2026-07-13).
 *
 * The web games persist per-tree state (streaks, bests, daily snapshots)
 * in localStorage under `genoly:<game>:<kind>:${treeId}` keys. Mobile
 * mirrors the SAME keys in AsyncStorage so the semantics (and any future
 * migration) stay aligned — but reads are async here, so each game loads
 * its persisted state in an effect and renders a skeleton until ready.
 *
 * Every game component receives GameScreenProps from the dynamic route
 * (app/games/[gameKey].tsx), which resolves the active tree and the
 * registry entry before mounting the game.
 */

export interface GameScreenProps {
  treeId: string;
  /** Tree slug — used in daily-seed keys (matches the web's seeds so a
   *  member sees the SAME daily puzzle on web and mobile). */
  treeSlug: string;
}

// ── AsyncStorage JSON helpers (lazy require — Node-test safe) ────────

interface AsyncStorageModule {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let cachedStorage: AsyncStorageModule | null = null;
const memoryShim = new Map<string, string>();

function getStorage(): AsyncStorageModule {
  if (cachedStorage) return cachedStorage;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- REASON: lazy require keeps this module importable in Node tests.
    const mod = require('@react-native-async-storage/async-storage');
    cachedStorage = (mod?.default ?? mod) as AsyncStorageModule;
  } catch {
    cachedStorage = {
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
  return cachedStorage;
}

/** Read a JSON value persisted under a web-compatible storage key. */
export async function loadGameState<T>(key: string): Promise<T | null> {
  try {
    const raw = await getStorage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Persist a JSON value under a web-compatible storage key. */
export async function saveGameState<T>(key: string, value: T): Promise<void> {
  try {
    await getStorage().setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort — a failed best-score write must never break gameplay.
  }
}

/** Remove a persisted value (used by "play again" style resets). */
export async function clearGameState(key: string): Promise<void> {
  try {
    await getStorage().removeItem(key);
  } catch {
    // Best-effort.
  }
}

// ── Small shared utilities the web pages define inline ──────────────

/**
 * Normalize a person name the way the word games do on the web: NFD,
 * strip diacritics, keep a-z only, lowercase.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();
}

/**
 * Deterministic 32-bit string hash — EXACTLY the web games' inline hash
 * (`(hash * 31 + code) | 0`), so daily picks match across platforms.
 */
export function hashString(str: string): number {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}
