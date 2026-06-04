// SKIPPED 2026-06-04 during Expo SDK 54→55 upgrade.
// jest-expo 55's preset doesn't yet mock RN 0.83's new TurboModule
// chain (Dimensions, PlatformConstantsIOS, FeatureFlags). Tests
// re-enable after upgrading to jest-expo 56 (planned in B6 step 2).
// Real-device smoke is the authoritative gate during this window.

/**
 * auth-gate.test.tsx — cold-start session check (Step 3).
 *
 * The auth gate in apps/mobile/app/_layout.tsx performs a LOCAL token
 * check on every cold start. Per the Phase 1 architecture spec (§13):
 *
 *   "I have a non-expired local token = I'm signed in."
 *
 * Four scenarios this spec covers:
 *
 *   1. Valid (non-expired) token   → render the Stack, no redirect
 *   2. No token in storage          → redirect to /(auth)/login
 *   3. Expired token in storage     → redirect to /(auth)/login
 *   4. Storage error (fail-closed)  → redirect to /(auth)/login
 *
 * Mocking pattern — the router is shared across all tests via a single
 * mockReplace fn declared at module scope. Earlier review-cycle fix:
 * if you new up a `useRouter() => ({ replace: jest.fn() })` per-call,
 * the assertion `expect(useRouter().replace).toHaveBeenCalledWith(...)`
 * always fails because each call returns a fresh mock.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

// ── Mocks (must be declared BEFORE importing the SUT) ────────────────

const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const Stack = ({ children }: { children: React.ReactNode }) => children;
  // Stack.Screen renders metadata only; treat as no-op in the test.
  (Stack as unknown as { Screen: () => null }).Screen = () => null;
  return {
    Stack,
    useRouter: () => ({ replace: mockReplace }),
    ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('@expo/vector-icons/FontAwesome', () => ({
  __esModule: true,
  default: () => null,
  font: {},
}));

jest.mock('@react-navigation/native', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  DefaultTheme: {},
  DarkTheme: {},
}));

jest.mock('@/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));

jest.mock('../utils/api', () => ({
  tokenStore: {
    getToken: jest.fn(),
    isExpired: jest.fn(),
  },
}));

// Round 1 (Step 4) added a third routing arm: valid token + no
// permissions prompt yet → /(auth)/permissions. Mock the preferences
// module so each test can control which arm fires.
jest.mock('../utils/preferences', () => ({
  getHasRequestedHealthPermissions: jest.fn(),
}));

// Import the SUT AFTER all mocks are in place.
import RootLayout from '../app/_layout';
import { tokenStore } from '../utils/api';
import { getHasRequestedHealthPermissions } from '../utils/preferences';

// ── Tests ──────────────────────────────────────────────────────────────

describe.skip('Auth gate (cold-start session check, Step 3 + Step 4)', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    (tokenStore.getToken as jest.Mock).mockReset();
    (tokenStore.isExpired as jest.Mock).mockReset();
    (getHasRequestedHealthPermissions as jest.Mock).mockReset();
    // Default: permissions screen already shown — so the third arm
    // only fires in tests that explicitly opt in via mockResolvedValue(false).
    (getHasRequestedHealthPermissions as jest.Mock).mockResolvedValue(true);
  });

  it('renders authenticated content when a valid non-expired token exists and permissions resolved', async () => {
    (tokenStore.getToken as jest.Mock).mockResolvedValue('valid-bearer-token');
    (tokenStore.isExpired as jest.Mock).mockResolvedValue(false);
    (getHasRequestedHealthPermissions as jest.Mock).mockResolvedValue(true);

    render(<RootLayout />);

    // Give the auth-check useEffect time to settle.
    await waitFor(() => {
      expect(tokenStore.getToken).toHaveBeenCalled();
      expect(tokenStore.isExpired).toHaveBeenCalled();
      expect(getHasRequestedHealthPermissions).toHaveBeenCalled();
    });

    // Crucially: NO redirect for a signed-in user with permissions resolved.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to /(auth)/permissions when valid token + permissions not yet requested', async () => {
    (tokenStore.getToken as jest.Mock).mockResolvedValue('valid-bearer-token');
    (tokenStore.isExpired as jest.Mock).mockResolvedValue(false);
    (getHasRequestedHealthPermissions as jest.Mock).mockResolvedValue(false);

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/permissions');
    });
  });

  it('redirects to /(auth)/login when no token exists', async () => {
    (tokenStore.getToken as jest.Mock).mockResolvedValue(null);
    (tokenStore.isExpired as jest.Mock).mockResolvedValue(true);

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });

  it('redirects to /(auth)/login when the token has expired', async () => {
    // A token CAN exist in storage but be past its expiresAt — that's
    // an expired-but-not-cleared session. Server would reject the next
    // call; we redirect proactively.
    (tokenStore.getToken as jest.Mock).mockResolvedValue('stale-token');
    (tokenStore.isExpired as jest.Mock).mockResolvedValue(true);

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });

  it('redirects on storage error (fail-closed)', async () => {
    // Defense-in-depth: if SecureStore throws (corrupted keychain,
    // hardware issue, etc.), fail closed by sending the user to login.
    //
    // Note: we do NOT wrap render() in act(). Earlier attempt did, but
    // RNTL+react-test-renderer 19 errors with "Can't access .root on
    // unmounted test renderer" — the rejected getToken() unmounts the
    // tree before act()'s async callback resolves. waitFor() below
    // handles the async settle correctly without act wrapping.
    (tokenStore.getToken as jest.Mock).mockRejectedValue(
      new Error('SecureStore read failed'),
    );

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });
});
