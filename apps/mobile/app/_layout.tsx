// apps/mobile/app/_layout.tsx
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from 'expo-router/react-navigation';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ScreenOrientation from 'expo-screen-orientation';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';

import { ThemeProvider, useTheme } from '../theme';
import { ToastHost } from '../components/ui';
import { getConvexClient, convexAuthStorage } from '../utils/convex';
import { getHasRequestedHealthPermissions } from '../utils/preferences';
import { useHasProTenantAccess } from '../lib/genolyApi';
import { computeDowngradeDeadline, getGraceRemainingMs } from '../lib/planChecks';

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

  // app.json orientation is "default" (so the native config PERMITS
  // landscape — required for the Explore rotate toggle). But we want the
  // app portrait EVERYWHERE by default, regardless of the device's
  // auto-rotate setting. A programmatic lock overrides the accelerometer,
  // so this holds even when the user has rotation-lock off on their phone.
  // Only the Explore surface unlocks to landscape on its rotate button and
  // relocks portrait on leave (see app/(tabs)/tree.tsx).
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

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
 *   3. Session valid, Pro status still resolving (`hasProAccess === null`) →
 *      hold the splash. The app tree must not mount here — mounting would
 *      fire a gated screen's queries once before we know whether the user
 *      is Pro (2026-07-09 audit F1).
 *   4. Session valid + health permissions never requested → /(auth)/permissions.
 *   5. Session valid + no Pro tenant → /(gated)/paywall.
 *   6. Otherwise → render the app.
 *
 * Downgrade path: when a user loses their last Pro tenant while in-app, a
 * 5-minute grace banner is shown before the hard redirect fires. The grace
 * deadline is anchored once at detection time (`computeDowngradeDeadline`)
 * and owned by a dedicated effect keyed only on that deadline, so it cannot
 * be reset by unrelated re-renders such as in-app navigation
 * (2026-07-09 audit F2).
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
  // Plain ref (not state): true for the whole lifetime of an active grace
  // window, from detection through eviction/cancellation. Read-only inside
  // the routing effect below so it deliberately stays out of that effect's
  // dependency array — it exists only to stop the routing effect from
  // firing a redundant immediate redirect while (or right after) the
  // dedicated eviction effect owns the timing.
  const graceActiveRef = useRef(false);
  const [showDowngradeBanner, setShowDowngradeBanner] = useState(false);
  // Absolute epoch-ms deadline for the current downgrade grace window, set
  // exactly once at detection and cleared when the grace period ends or Pro
  // is regained. `null` means no grace period is active.
  const [downgradeDeadline, setDowngradeDeadline] = useState<number | null>(null);

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
    // (Render-level hold for F1 lives below, after this effect.)
    if (hasProAccess === null) return;

    if (!hasProAccess) {
      // Downgrade detection: if the user previously had Pro in this session
      // and just lost it, anchor a grace deadline once and show the banner.
      // hadProRef is flipped to false immediately so a later re-run of this
      // effect (e.g. triggered by navigation) can't re-enter this branch and
      // re-anchor a fresh deadline (2026-07-09 audit F2).
      const justDowngraded = hadProRef.current === true;
      hadProRef.current = false;

      if (justDowngraded && !inGatedGroup) {
        graceActiveRef.current = true;
        setDowngradeDeadline(computeDowngradeDeadline(Date.now()));
        setShowDowngradeBanner(true);
        return;
      }

      // No grace in flight (never had Pro this session, already inside the
      // gated group, or a grace window is already being timed by the
      // eviction effect below) — redirect immediately as before.
      if (!graceActiveRef.current && !inGatedGroup) {
        router.replace(PAYWALL_ROUTE);
      }
      return;
    }

    hadProRef.current = true;
    graceActiveRef.current = false;
    setShowDowngradeBanner(false); // Pro restored (e.g. re-upgrade)
    setDowngradeDeadline(null); // Cancel any pending eviction.

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

  // Downgrade-grace eviction timer. Keyed ONLY on `downgradeDeadline`, which
  // is set exactly once at detection above. Each run recomputes the
  // remaining time from that fixed deadline and the current clock, so even
  // if this effect re-runs (e.g. because `router` isn't referentially
  // stable across navigations), the timer still fires at the ORIGINAL
  // detection time + DOWNGRADE_GRACE_MS — never a fresh 5 minutes
  // (2026-07-09 audit F2).
  useEffect(() => {
    if (downgradeDeadline === null) return;
    const remaining = getGraceRemainingMs(downgradeDeadline, Date.now());
    const timer = setTimeout(() => {
      graceActiveRef.current = false;
      setShowDowngradeBanner(false);
      setDowngradeDeadline(null);
      router.replace(PAYWALL_ROUTE);
    }, remaining);
    return () => clearTimeout(timer);
  }, [downgradeDeadline, router]);

  if (isLoading) {
    return null; // splash still visible
  }

  // Session resolved but Pro status is still in flight: hold the splash
  // rather than mounting the app tree underneath. This closes the F1
  // mount-before-redirect window — a gated screen (and its queries) can no
  // longer mount before we know the user isn't Pro.
  if (isAuthenticated && hasProAccess === null) {
    return null;
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
      {/* Every screen renders its own in-page title via <Screen>, so:
          - full-screen surfaces (tabs, auth, wizard, paywall) hide the
            native header entirely (it was showing raw route names like
            "(auth)/login" — operator report 2026-07-10);
          - pushed detail screens keep a native header for the back
            affordance but get real titles, and the back button is
            chevron-only (no "(tabs)" label). */}
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(gated)/paywall" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/signup" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/mfa-challenge" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/permissions" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="add-person" options={{ title: 'Add person' }} />
        <Stack.Screen name="challenge-create" options={{ title: 'New challenge' }} />
        <Stack.Screen name="challenge/[challengeId]" options={{ title: 'Challenge' }} />
        <Stack.Screen name="friends" options={{ title: 'Friends' }} />
        <Stack.Screen name="games/index" options={{ title: 'Games' }} />
        <Stack.Screen name="games/[gameKey]" options={{ title: 'Game' }} />
        <Stack.Screen name="goals" options={{ title: 'Goals' }} />
        <Stack.Screen name="goals-history" options={{ title: 'Goal history' }} />
        <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
        <Stack.Screen name="support" options={{ title: 'Support' }} />
        <Stack.Screen name="support-article/[slug]" options={{ title: 'Help article' }} />
        <Stack.Screen name="person/[personId]/index" options={{ title: 'Person' }} />
        <Stack.Screen name="person/[personId]/edit" options={{ title: 'Edit person' }} />
        <Stack.Screen name="person/[personId]/add-event" options={{ title: 'Add event' }} />
        <Stack.Screen name="person/[personId]/add-photo" options={{ title: 'Add photo' }} />
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
