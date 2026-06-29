/**
 * Paywall — shown to users who are authenticated but have no Pro-plan tenant.
 *
 * Mobile access is part of the Pro plan. Users on Free or Starter see this
 * screen instead of the app. Two CTAs:
 *   1. "Upgrade your tree" → opens genoly.org/pricing in the system browser
 *      (Apple anti-steering: payment is web-only, not in-app).
 *   2. "Continue on web" → opens genoly.org in the system browser.
 *
 * Downgrade path: if a user was on Pro and their tenant downgrades, they land
 * here after the 5-minute grace period (enforced in _layout.tsx).
 */

import { View, Text, StyleSheet, Linking } from 'react-native';
import { Stack } from 'expo-router';

import { useThemedStyles, type Theme } from '../../theme';
import { Button } from '../../components/ui';

const WEB_PRICING_URL = 'https://genoly.org/pricing';
const WEB_APP_URL = 'https://genoly.org';

export default function PaywallScreen() {
  const styles = useThemedStyles(createStyles);

  function onUpgrade() {
    Linking.openURL(WEB_PRICING_URL);
  }

  function onContinueOnWeb() {
    Linking.openURL(WEB_APP_URL);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.icon}>🌳</Text>
          <Text style={styles.title}>Mobile is part of Pro</Text>
          <Text style={styles.body}>
            The Genoly mobile app is available to members of a Pro-plan family tree.
            Upgrade your tree to unlock mobile access, or continue on the web for free.
          </Text>
          <Button
            variant="primary"
            label="Upgrade your tree"
            accessibilityLabel="Upgrade to Pro plan on genoly.org"
            onPress={onUpgrade}
            style={styles.primaryButton}
          />
          <Button
            variant="secondary"
            label="Continue on web"
            accessibilityLabel="Open Genoly on the web"
            onPress={onContinueOnWeb}
            style={styles.secondaryButton}
          />
        </View>
        <Text style={styles.legal}>
          Subscriptions are managed on genoly.org.{'\n'}
          Billing, cancellation, and upgrades happen on the web.
        </Text>
      </View>
    </>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.colors.bg,
      paddingHorizontal: 24,
      justifyContent: 'space-between',
      paddingTop: 80,
      paddingBottom: 40,
    },
    content: {
      alignItems: 'center',
      gap: 16,
    },
    icon: {
      fontSize: 64,
      marginBottom: 8,
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: t.colors.text,
      textAlign: 'center',
    },
    body: {
      fontSize: 16,
      color: t.colors.textMuted,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 8,
    },
    primaryButton: {
      width: '100%',
    },
    secondaryButton: {
      width: '100%',
    },
    legal: {
      fontSize: 12,
      color: t.colors.textMuted,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
}
