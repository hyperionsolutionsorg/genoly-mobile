/**
 * Settings tab — Step 11 of Phase 1, migrated onto the theme module + UI
 * kit in C1. Sections:
 *   - Account: email (best-effort; handles no-session) + Sign out
 *     (apiClient.revokeToken scope 'this_device').
 *   - Health sync: enabled/disabled state; "Manage permissions" bounces
 *     to the permissions screen.
 *   - Appearance: theme picker (System / Light / Dark / Classic) —
 *     mirrors the web's three themes.
 *   - Subscription: link to genoly.org (mobile is payment-neutral;
 *     subscription is web-only per Apple anti-steering).
 *   - Legal: Hyperion Solutions LLC disclosure.
 *
 * Logout flow (fail-closed): server revoke best-effort → clear local
 * token → reset permission prefs → unregister background drainer →
 * route to login. Wave C2 extends this to ALSO tear down the member
 * (Convex Auth) session.
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { apiClient, tokenStore } from '../../utils/api';
import { useMe } from '../../hooks/useMe';
import {
  getHealthSyncEnabled,
  setHasRequestedHealthPermissions,
  setHealthSyncEnabled,
} from '../../utils/preferences';
import { unregisterBackgroundSync } from '../../utils/backgroundSync';
import {
  useTheme,
  useThemedStyles,
  useThemePreference,
  type Theme,
  type ThemePreference,
} from '../../theme';
import { Button, Section } from '../../components/ui';

const LOGIN_ROUTE = '/(auth)/login' as unknown as Href;
const PERMISSIONS_ROUTE = '/(auth)/permissions' as unknown as Href;

const SUBSCRIPTION_URL = 'https://genoly.org/account';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'classic', label: 'Classic' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const t = useTheme();
  const styles = useThemedStyles(createStyles);
  const { preference, setPreference } = useThemePreference();
  const { signOut } = useAuthActions();
  const { me } = useMe();
  const [email, setEmail] = useState<string | null>(null);
  const [healthEnabled, setHealthEnabled] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initial load — fetch session + prefs in parallel. Failure is OK;
  // each section falls back to a placeholder.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [sessionResult, healthResult] = await Promise.allSettled([
        apiClient.getSession(),
        getHealthSyncEnabled(),
      ]);
      if (cancelled) return;
      if (sessionResult.status === 'fulfilled' && sessionResult.value?.user?.email) {
        setEmail(sessionResult.value.user.email);
      }
      if (healthResult.status === 'fulfilled') {
        setHealthEnabled(healthResult.value);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSignOutPressed = () => {
    Alert.alert(
      'Sign out',
      "You'll need to sign in again to see your data.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: performSignOut },
      ],
      { cancelable: true },
    );
  };

  const performSignOut = async () => {
    setSigningOut(true);
    try {
      // Dual-session teardown (decision 2026-06-11-member-side-convex-client):
      // both the member (Convex Auth) session and the fitness bearer token
      // go, each best-effort and fail-closed.
      try {
        await signOut();
      } catch {
        // The auth gate keys off the member session; if the server call
        // failed offline, the local Convex Auth state is still cleared
        // by signOut's storage teardown on next attempt.
      }
      try {
        await apiClient.revokeToken({ scope: 'this_device' });
      } catch {
        // Best-effort revoke; local clear is what actually matters
        // for the auth gate.
        await tokenStore.clearToken();
      }

      // Reset permission prefs so the next sign-in flow re-prompts.
      await setHasRequestedHealthPermissions(false);
      await setHealthSyncEnabled(false);

      // Stop the background drainer — no point waking up if we have
      // no token + no permission to read health data.
      await unregisterBackgroundSync();

      router.replace(LOGIN_ROUTE);
    } finally {
      setSigningOut(false);
    }
  };

  const onManagePermissions = () => {
    router.push(PERMISSIONS_ROUTE);
  };

  const onManageSubscription = () => {
    Linking.openURL(SUBSCRIPTION_URL).catch(() => {
      Alert.alert(
        "Couldn't open browser",
        `Please visit ${SUBSCRIPTION_URL} to manage your subscription.`,
      );
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text accessibilityRole="header" style={styles.screenTitle}>
        Settings
      </Text>

      {/* Account section */}
      <Section label="Account">
        <Row styles={styles} label="Email">
          {loading && !me ? (
            <ActivityIndicator color={t.colors.textMuted} />
          ) : (
            <Text style={styles.valueText}>{me?.email ?? email ?? 'Signed in'}</Text>
          )}
        </Row>
        <Button
          variant="destructive"
          label="Sign out"
          onPress={onSignOutPressed}
          loading={signingOut}
          style={styles.sectionButton}
        />
      </Section>

      {/* Health sync section */}
      <Section label="Health sync">
        <Row styles={styles} label="Status">
          <Text style={[styles.valueText, healthEnabled ? styles.statusOn : styles.statusOff]}>
            {healthEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </Row>
        <Button
          variant="secondary"
          label="Manage permissions"
          onPress={onManagePermissions}
          style={styles.sectionButton}
        />
      </Section>

      {/* Appearance — theme picker */}
      <Section label="Appearance">
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((option) => {
            const selected = preference === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                accessibilityRole="button"
                accessibilityLabel={`Theme: ${option.label}`}
                accessibilityState={{ selected }}
                activeOpacity={0.7}
                onPress={() => setPreference(option.value)}
                style={[styles.themeChip, selected && styles.themeChipSelected]}
              >
                <Text style={[styles.themeChipText, selected && styles.themeChipTextSelected]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.helperText}>
          Classic brings the heirloom serif look from the web to your phone.
        </Text>
      </Section>

      {/* Subscription section — payment-neutral disclosure */}
      <Section label="Subscription">
        <Text style={styles.bodyText}>
          The Genoly mobile app is free. Subscriptions are managed on the web —
          billing, cancellation, and upgrades happen on genoly.org.
        </Text>
        <Button
          variant="secondary"
          label="Manage on genoly.org"
          accessibilityLabel="Manage subscription on the web"
          onPress={onManageSubscription}
          style={styles.sectionButton}
        />
      </Section>

      {/* Legal */}
      <Text style={styles.legal}>
        Genoly is a product of Hyperion Solutions LLC, an Illinois limited
        liability company. By using this app you agree to the Terms of Service
        and Privacy Policy at genoly.org/legal.
      </Text>
    </ScrollView>
  );
}

type Styles = ReturnType<typeof createStyles>;

function Row({
  styles,
  label,
  children,
}: {
  styles: Styles;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      padding: t.spacing.xl,
      backgroundColor: t.colors.bg,
    },
    screenTitle: {
      ...t.typography.screenTitle,
      color: t.colors.text,
      marginTop: t.spacing.sm,
      marginBottom: t.spacing.xl,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      marginBottom: t.spacing.sm,
    },
    rowLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    rowValue: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    valueText: {
      fontSize: 15,
      color: t.colors.textMuted,
    },
    statusOn: {
      color: t.colors.success,
      fontWeight: '600',
    },
    statusOff: {
      color: t.colors.warning,
      fontWeight: '600',
    },
    bodyText: {
      ...t.typography.cardDescription,
      color: t.colors.text,
      marginBottom: t.spacing.md,
    },
    sectionButton: {
      marginTop: t.spacing.sm,
    },
    themeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    themeChip: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.lg,
      marginRight: t.spacing.sm,
      marginBottom: t.spacing.sm,
      backgroundColor: t.colors.bgElevated,
      minHeight: 44,
      justifyContent: 'center',
    },
    themeChipSelected: {
      backgroundColor: t.colors.primary,
      borderColor: t.colors.primary,
    },
    themeChipText: {
      fontSize: 15,
      fontWeight: '500',
      color: t.colors.text,
    },
    themeChipTextSelected: {
      color: t.colors.onPrimary,
      fontWeight: '600',
    },
    helperText: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      marginTop: t.spacing.xs,
    },
    legal: {
      ...t.typography.legal,
      color: t.colors.text,
      textAlign: 'center',
      marginTop: t.spacing.sm,
      paddingHorizontal: t.spacing.lg,
    },
  });
}
