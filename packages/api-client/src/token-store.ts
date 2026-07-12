export interface TokenStore {
  getToken(): Promise<string | null>;
  setToken(token: string, expiresAt: number): Promise<void>;
  clearToken(): Promise<void>;
  isExpired(): Promise<boolean>;
}

interface StoredTokenBlob {
  token: string;
  expiresAt: number;
}

const SECURE_STORE_KEY = 'genoly.auth.token';

/**
 * In-memory TokenStore for testing and Node.js environments where
 * expo-secure-store is not available.
 */
export class MemoryTokenStore implements TokenStore {
  private token: string | null = null;
  private expiresAt: number = 0;

  async getToken(): Promise<string | null> {
    if (await this.isExpired()) {
      return null;
    }
    return this.token;
  }

  async setToken(token: string, expiresAt: number): Promise<void> {
    this.token = token;
    this.expiresAt = expiresAt;
  }

  async clearToken(): Promise<void> {
    this.token = null;
    this.expiresAt = 0;
  }

  async isExpired(): Promise<boolean> {
    if (!this.token) return true;
    return Date.now() >= this.expiresAt;
  }
}

interface ExpoSecureStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/**
 * Device-backed secure TokenStore leveraging expo-secure-store.
 */
export class SecureTokenStore implements TokenStore {
  private secureStore: ExpoSecureStore | null = null;

  constructor() {
    // Dynamic import to prevent crash in Node environments where native module is missing
    try {
      this.secureStore = require('expo-secure-store');
    } catch {
      this.secureStore = null;
      // A missing module here silently disables the fitness bearer token — every
      // getToken() returns null, surfacing as "No bearer token available" with no
      // other clue. `expo-secure-store` must be a dependency of the host app.
      // Warn loudly in dev so this can never hide again.
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(
          '[SecureTokenStore] expo-secure-store is unavailable — the fitness bearer ' +
            'token cannot be persisted. Install `expo-secure-store` in the app and rebuild.',
        );
      }
    }
  }

  async getToken(): Promise<string | null> {
    if (!this.secureStore) {
      return null;
    }
    try {
      const raw = await this.secureStore.getItemAsync(SECURE_STORE_KEY);
      if (!raw) return null;
      const parsed: StoredTokenBlob = JSON.parse(raw);
      if (Date.now() >= parsed.expiresAt) {
        await this.clearToken();
        return null;
      }
      return parsed.token;
    } catch (err: unknown) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[SecureTokenStore] Failed to read token: ${msg}`);
      }
      return null;
    }
  }

  async setToken(token: string, expiresAt: number): Promise<void> {
    if (!this.secureStore) {
      return;
    }
    const blob: StoredTokenBlob = { token, expiresAt };
    await this.secureStore.setItemAsync(SECURE_STORE_KEY, JSON.stringify(blob));
  }

  async clearToken(): Promise<void> {
    if (!this.secureStore) {
      return;
    }
    await this.secureStore.deleteItemAsync(SECURE_STORE_KEY);
  }

  async isExpired(): Promise<boolean> {
    if (!this.secureStore) {
      return true;
    }
    try {
      const raw = await this.secureStore.getItemAsync(SECURE_STORE_KEY);
      if (!raw) return true;
      const parsed: StoredTokenBlob = JSON.parse(raw);
      return Date.now() >= parsed.expiresAt;
    } catch (err: unknown) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[SecureTokenStore] Failed to check token expiry: ${msg}`);
      }
      return true;
    }
  }
}
