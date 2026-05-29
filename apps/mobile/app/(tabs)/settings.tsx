/**
 * Settings tab — Step 11 of Phase 1.
 *
 * Sections:
 *   - Account: shows email (best-effort; gracefully handles no-session)
 *     and a Sign out button that calls `apiClient.revokeToken()` with
 *     scope: 'this_device'.
 *   - Health sync: shows enabled/disabled state; "Manage permissions"
 *     bounces to the permissions screen if the user wants to re-grant
 *     or revoke from inside the app.
 *   - Subscription: hard-coded link to genoly.org (mobile is payment-
 *     neutral; subscription is web-only per Apple anti-steering).
 *   - Legal: Hyperion Solutions LLC disclosure.
 *
 * Logout flow:
 *   1. Native confirm Alert (server reachability isn't guaranteed).
 *   2. On confirm: call apiClient.revokeToken({ scope: 'this_device' }).
 *      The api-client already clears the local token after a successful
 *      server call.
 *   3. ALSO clear the permissions prefs so the next sign-in re-prompts.
 *   4. router.replace('/(auth)/login') — fail-closed: even if the
 *      revoke call errors (e.g. offline), we still clear local state and
 *      route to login. The server-side row stays around but the next
 *      cold start will route through login again.
 *
 * Visual style matches `/(auth)/permissions.tsx`. A mobile DESIGN.md
 * is on the way (Round 3 task #157) to consolidate these tokens.
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
import { apiClient, tokenStore } from '../../utils/api';
import {
  getHealthSyncEnabled,
  setHasRequestedHealthPermissions,
  setHealthSyncEnabled,
} from '../../utils/preferences';
import { unregisterBackgroundSync } from '../../utils/backgroundSync';

const LOGIN_ROUTE = '/(auth)/login' as unknown as Href;
const PERMISSIONS_ROUTE = '/(auth)/permissions' as unknown as Href;

const SUBSCRIPTION_URL = 'https://genoly.org/account';

export default function SettingsScreen() {
  const router = useRouter();
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
      'You\'ll need to sign in again to see your data.',
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
      // Try the server-side revoke. If offline / errors, we still
      // clear local state below — fail-closed semantics.
      try {
        await apiClient.revokeToken({ scope: 'this_device' });
      } catch {
        // Best-effort revoke; local clear is what actually matters
        // for the auth gate.
        await tokenStore.clearToken();
      }

      // Reset permission prefs so the next sign-in flow re-prompts.
      // This is intentional UX: a sign-out is a "clean slate" — the
      // next user on this device (or this user on a re-install) gets
      // the permissions screen again.
      await setHasRequestedHealthPermissions(false);
      await setHealthSyncEnabled(false);

      // Stop the background drainer — no point waking up if we have
      // no token + no permission to read health data. Best-effort;
      // the task body re-checks healthSyncEnabled at the top so even
      // if unregister silently fails, the next wake is a no-op.
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
        'Couldn\'t open browser',
        `Please visit ${SUBSCRIPTION_URL} to manage your subscription.`,
      );
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.screenTitle}>Settings</Text>

      {/* Account section */}
      <Section title="Account">
        <Row label="Email">
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.valueText}>{email ?? 'Signed in'}</Text>
          )}
        </Row>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={[styles.signOutButton, signingOut && styles.signOutButtonDisabled]}
          onPress={onSignOutPressed}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.signOutButtonText}>Sign out</Text>
          )}
        </TouchableOpacity>
      </Section>

      {/* Health sync section */}
      <Section title="Health sync">
        <Row label="Status">
          <Text style={[styles.valueText, healthEnabled ? styles.statusOn : styles.statusOff]}>
            {healthEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </Row>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Manage permissions"
          style={styles.secondaryButton}
          onPress={onManagePermissions}
        >
          <Text style={styles.secondaryButtonText}>Manage permissions</Text>
        </TouchableOpacity>
      </Section>

      {/* Subscription section — payment-neutral disclosure */}
      <Section title="Subscription">
        <Text style={styles.bodyText}>
          The Genoly mobile app is free. Subscriptions are managed on the web —
          billing, cancellation, and upgrades happen on genoly.org.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Manage subscription on the web"
          style={styles.secondaryButton}
          onPress={onManageSubscription}
        >
          <Text style={styles.secondaryButtonText}>Manage on genoly.org</Text>
        </TouchableOpacity>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: '#fefefe',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#6b7280',
    marginBottom: 8,
  },
  sectionBody: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  rowLabel: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueText: {
    fontSize: 15,
    color: '#6b7280',
  },
  statusOn: {
    color: '#15803d',
    fontWeight: '600',
  },
  statusOff: {
    color: '#a16207',
    fontWeight: '600',
  },
  bodyText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 12,
  },
  signOutButton: {
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutButtonDisabled: {
    opacity: 0.7,
  },
  signOutButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '500',
  },
  legal: {
    fontSize: 11,
    opacity: 0.55,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
    lineHeight: 16,
  },
});
