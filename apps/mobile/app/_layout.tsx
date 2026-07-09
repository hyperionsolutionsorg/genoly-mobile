// apps/mobile/app/_layout.tsx
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from 'expo-router/react-navigation';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';

import { ThemeProvider, useTheme } from '../theme';
import { ToastHost } from '../components/ui';
import { getConvexClient, convexAuthStorage } from '../utils/convex';
import { getHasRequestedHealthPermissions } from '../utils/preferences';
import { useHasProTenantAccess } from '../lib/genolyApi';
import { DOWNGRADE_GRACE_MS } from '../lib/planChecks';

// Cast once at module scope — Expo Router's Href type is generated from
// the file system route map, but `(auth)/login` is a group-route the
// generator doesn't always pick up. Narrow `as any` to JUST the string
// argument so router-object typing stays intact.
const LOGIN_ROUTE = '/(auth)/login' as unknown as Href;
const PERMISSIONS_ROUTE = '/(auth)/permissions' as unknown as Href;
const PAYWALL_ROUTE = '/(gated)/paywall' as unknown as Href;

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const rootGestureStyle = { flex: 1 } as const;

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
    // GestureHandlerRootView must wrap the app for the tree canvases'
    // pan/pinch GestureDetectors (components/tree/ZoomPanView.tsx).
    <GestureHandlerRootView style={rootGestureStyle}>
      <ConvexAuthProvider client={getConvexClient()} storage={convexAuthStorage}>
        <ThemeProvider>
          <AuthGate />
        </ThemeProvider>
      </ConvexAuthProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Cold-start auth gate (C2 rework — decision 2026-06-11-member-side-convex-client).
 *
 * Extended in V1.0.0 with a Pro-plan gate (mobile is Pro-only).
 *
 * Arms:
 *   1. Member session loading → keep splash.
 *   2. No member session + outside the (auth) group → /(auth)/login.
 *   3. Session valid + health permissions never requested → /(auth)/permissions.
 *   4. Session valid + no Pro tenant → /(gated)/paywall.
 *   5. Otherwise → render the app.
 *
 * Downgrade path: when a user loses their last Pro tenant while in-app, a
 * 5-minute grace banner is shown before the hard redirect fires.
 */
function AuthGate() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const segments = useSegments();
  const router = useRouter();

  // Pro-plan gate — only queried after auth resolves to avoid a double-load.
  const hasProAccess = useHasProTenantAccess();

  // Downgrade grace: track whether the user previously had Pro access so we
  // can detect a mid-session flip and show a warning banner before evicting.
  const hadProRef = useRef<boolean | null>(null);
  const [showDowngradeBanner, setShowDowngradeBanner] = useState(false);

  // Cast: the generated typed-routes union lags new route groups until
  // `expo start` regenerates .expo/types (same reason as the Href casts).
  const inAuthGroup = (segments[0] as string) === '(auth)';
  const inGatedGroup = (segments[0] as string) === '(gated)';

  // Hide the splash once the session check resolves.
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  // Auth + plan routing.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      if (!inAuthGroup) {
        router.replace(LOGIN_ROUTE);
      }
      return;
    }

    // While plan is loading (null), hold — don't bounce to paywall prematurely.
    if (hasProAccess === null) return;

    if (!hasProAccess) {
      // Downgrade detection: if the user previously had Pro in this session
      // and just lost it, show the grace banner and delay the redirect.
      if (hadProRef.current === true && !inGatedGroup) {
        setShowDowngradeBanner(true);
        const timer = setTimeout(() => {
          setShowDowngradeBanner(false);
          router.replace(PAYWALL_ROUTE);
        }, DOWNGRADE_GRACE_MS);
        return () => clearTimeout(timer);
      }
      if (!inGatedGroup) {
        router.replace(PAYWALL_ROUTE);
      }
      hadProRef.current = false;
      return;
    }

    hadProRef.current = true;
    setShowDowngradeBanner(false); // Pro restored (e.g. re-upgrade)

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
  }, [isLoading, isAuthenticated, inAuthGroup, inGatedGroup, hasProAccess, router]);

  if (isLoading) {
    return null; // splash still visible
  }

  return <ThemedNavigation downgradeBanner={showDowngradeBanner} />;
}


/**
 * Bridges the app theme (light/dark/classic — see theme/) into
 * react-navigation's theme object so headers, tab bars, and transitions
 * pick up the same palette as our screens.
 */
function ThemedNavigation({ downgradeBanner }: { downgradeBanner: boolean }) {
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
      {downgradeBanner && (
        <View style={downgradeBannerStyles(t)}>
          <Text style={downgradeBannerText(t)}>
            Your tree's plan was downgraded. Mobile access ends in 5 minutes — save your work.
          </Text>
        </View>
      )}
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(gated)" options={{ headerShown: false }} />
      </Stack>
      <ToastHost />
    </NavThemeProvider>
  );
}

function downgradeBannerStyles(t: ReturnType<typeof useTheme>) {
  return {
    backgroundColor: t.colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
  } as const;
}

function downgradeBannerText(t: ReturnType<typeof useTheme>) {
  return {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center' as const,
    fontWeight: '600' as const,
  };
}
