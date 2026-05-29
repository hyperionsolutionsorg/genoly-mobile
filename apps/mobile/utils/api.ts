import Constants from 'expo-constants';
import { createApiClient, SecureTokenStore } from '@genoly/api-client';

const baseUrl = Constants.expoConfig?.extra?.convexBaseUrl;
const appVersion = Constants.expoConfig?.version;

if (!baseUrl) {
  throw new Error(
    'Missing convexBaseUrl in app.json extra. Please make sure it is configured.'
  );
}

// Export a shared token store for use in auth gate checks
const tokenStore = new SecureTokenStore();

export const apiClient = createApiClient({
  tokenStore,
  baseUrl,
  appVersion,
});

export { tokenStore };
