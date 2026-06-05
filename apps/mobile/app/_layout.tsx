// apps/mobile/app/_layout.tsx
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import { useFonts } from 'expo-font';
import { Stack, useRouter, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { tokenStore } from '../utils/api';
import { getHasRequestedHealthPermissions } from '../utils/preferences';

// Cast once at module scope — Expo Router's Href type is generated from
// the file system route map, but `(auth)/login` is a group-route the
// generator doesn't always pick up. Narrow `as any` to JUST the string
// argument so router-object typing stays intact.
const LOGIN_ROUTE = '/(auth)/login' as unknown as Href;
const PERMISSIONS_ROUTE = '/(auth)/permissions' as unknown as Href;

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });
  const [authChecked, setAuthChecked] = useState(false);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // Hide splash when fonts loaded.
  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Check authentication status + first-run permissions on mount.
  //
  // Per the Phase 1 sync architecture (§13), the cold-start gate is a
  // local-only check: "I have a non-expired local token = I'm signed in."
  // The server-side getSession() validation is a later step.
  //
  // Three-arm routing:
  //   1. No token OR expired token → /(auth)/login
  //   2. Token valid + permissions not yet requested → /(auth)/permissions
  //   3. Token valid + permissions resolved → render (tabs)
  useEffect(() => {
    async function checkAuth() {
      try {
        const token = await tokenStore.getToken();
        const expired = await tokenStore.isExpired();
        if (!token || expired) {
          router.replace(LOGIN_ROUTE);
          return;
        }
        // Step 4 — first-run permissions screen.
        const hasRequested = await getHasRequestedHealthPermissions();
        if (!hasRequested) {
          router.replace(PERMISSIONS_ROUTE);
          return;
        }
        // Otherwise: signed in + permissions resolved → fall through to
        // the Stack render below.
      } catch {
        // On any storage error, fail closed: redirect to login.
        router.replace(LOGIN_ROUTE);
      } finally {
        setAuthChecked(true);
      }
    }
    if (loaded) {
      checkAuth();
    }
  }, [loaded, router]);

  if (!loaded || !authChecked) {
    return null; // splash handled via SplashScreen
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
