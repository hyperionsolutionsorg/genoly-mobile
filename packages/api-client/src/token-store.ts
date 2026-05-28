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

/**
 * Device-backed secure TokenStore leveraging expo-secure-store.
 */
export class SecureTokenStore implements TokenStore {
  private secureStore: any;

  constructor() {
    // Dynamic import to prevent crash in Node environments where native module is missing
    try {
      this.secureStore = require('expo-secure-store');
    } catch (e) {
      this.secureStore = null;
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
    } catch (e) {
      // Fail silently, returning null (user will be unauthenticated)
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
    } catch (e) {
      return true;
    }
  }
}
