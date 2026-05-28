import Constants from 'expo-constants';
import { createApiClient, SecureTokenStore } from '@genoly/api-client';

const baseUrl = Constants.expoConfig?.extra?.convexBaseUrl;
const appVersion = Constants.expoConfig?.version;

if (!baseUrl) {
  throw new Error(
    'Missing convexBaseUrl in app.json extra. Please make sure it is configured.'
  );
}

export const apiClient = createApiClient({
  tokenStore: new SecureTokenStore(),
  baseUrl,
  appVersion,
});
