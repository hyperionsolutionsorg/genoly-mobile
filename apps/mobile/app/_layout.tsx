// apps/mobile/app/_layout.tsx
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from 'expo-router/react-navigation';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';

import { ThemeProvider, useTheme } from '../theme';
import { ToastHost } from '../components/ui';
import { getConvexClient, convexAuthStorage } from '../utils/convex';
import { getHasRequestedHealthPermissions } from '../utils/preferences';

// Cast once at module scope — Expo Router's Href type is generated from
// the file system route map, but `(auth)/login` is a group-route the
// generator doesn't always pick up. Narrow `as any` to JUST the string
// argument so router-object typing stays intact.
const LOGIN_ROUTE = '/(auth)/login' as unknown as Href;
const PERMISSIONS_ROUTE = '/(auth)/permissions' as unknown as Href;

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) {
    return null; // splash handled via SplashScreen
  }

  return (
    <ConvexAuthProvider client={getConvexClient()} storage={convexAuthStorage}>
      <ThemeProvider>
        <AuthGate />
      </ThemeProvider>
    </ConvexAuthProvider>
  );
}

/**
 * Cold-start auth gate (C2 rework — decision 2026-06-11-member-side-convex-client).
 *
 * The MEMBER session (Convex Auth JWT) is now the primary gate; the
 * fitness bearer token is a secondary credential used only by health
 * sync (acquired alongside member sign-in, degraded gracefully if absent).
 *
 * Arms:
 *   1. Member session loading → keep splash.
 *   2. No member session + outside the (auth) group → /(auth)/login.
 *   3. Session valid + health permissions never requested → /(auth)/permissions.
 *   4. Otherwise → render the app.
 *
 * Forward navigation after an explicit sign-in (MFA challenge, permissions,
 * tabs) stays in the screens themselves — the gate only guards entry.
 */
function AuthGate() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const segments = useSegments();
  const router = useRouter();

  // Cast: the generated typed-routes union lags new route groups until
  // `expo start` regenerates .expo/types (same reason as the Href casts).
  const inAuthGroup = (segments[0] as string) === '(auth)';

  // Hide the splash once the session check resolves.
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      if (!inAuthGroup) {
        router.replace(LOGIN_ROUTE);
      }
      return;
    }
    if (!inAuthGroup) {
      // Cold start with a valid session — make sure the first-run
      // permissions prompt has been resolved (grant OR skip).
      let cancelled = false;
      getHasRequestedHealthPermissions()
        .then((hasRequested) => {
          if (!cancelled && !hasRequested) {
            router.replace(PERMISSIONS_ROUTE);
          }
        })
        .catch(() => {
          // Storage error — leave the user where they are; the
          // permissions screen stays reachable from Settings.
        });
      return () => {
        cancelled = true;
      };
    }
  }, [isLoading, isAuthenticated, inAuthGroup, router]);

  if (isLoading) {
    return null; // splash still visible
  }

  return <ThemedNavigation />;
}

/**
 * Bridges the app theme (light/dark/classic — see theme/) into
 * react-navigation's theme object so headers, tab bars, and transitions
 * pick up the same palette as our screens.
 */
function ThemedNavigation() {
  const t = useTheme();
  const base = t.name === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: t.colors.primary,
      background: t.colors.bg,
      card: t.colors.bgElevated,
      text: t.colors.text,
      border: t.colors.border,
      notification: t.colors.danger,
    },
  };

  return (
    <NavThemeProvider value={navTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <ToastHost />
    </NavThemeProvider>
  );
}
