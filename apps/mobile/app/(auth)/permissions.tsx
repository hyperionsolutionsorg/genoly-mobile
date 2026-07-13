/**
 * Permissions screen — shown ONCE after sign-in (Step 4 of Phase 1).
 *
 * Routing: `_layout.tsx` checks `hasRequestedPermissions` and routes the
 * user here if false. After the user resolves the screen (grant or
 * skip) the flag is set and subsequent cold starts route directly to
 * `/(tabs)`.
 *
 * UX:
 *   - Friendly explanation of WHY we need access (steps, calories,
 *     distance — the 3 metrics that map to Shankar's approved scope)
 *   - "Grant access" CTA → triggers the native permission dialog via
 *     the HealthAdapter
 *   - "Maybe later" → skips with `healthSyncEnabled=false`; users can
 *     revisit from Settings (Step 11)
 */

import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { createHealthAdapter, type HealthMetric } from '@genoly/health-sync';
import { setHasRequestedHealthPermissions, setHealthSyncEnabled } from '../../utils/preferences';
import { registerBackgroundSync } from '../../utils/backgroundSync';
import { collectAndDrainNow } from '../../utils/healthSync';
import { useThemedStyles, type Theme } from '../../theme';
import { Button } from '../../components/ui';

// The minimal permission scope confirmed by Shankar on 2026-05-28:
//   Steps + ActiveEnergyBurned + Distance.
//
// ExerciseTime was on the original list but the HealthMetric enum
// doesn't model it — deferred as future interface extension.
const REQUESTED_METRICS: HealthMetric[] = ['steps', 'caloriesActive', 'distanceMeters'];

const TABS_ROUTE = '/(tabs)' as unknown as Href;

export default function PermissionsScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const [requesting, setRequesting] = useState(false);

  const onGrantAccess = async () => {
    setRequesting(true);
    try {
      const adapter = createHealthAdapter();
      const available = await adapter.isAvailable();
      if (!available) {
        // Health store unavailable — likely simulator, web preview, or
        // unsupported device. Mark the prompt as shown so we don't
        // re-prompt every cold start.
        await setHasRequestedHealthPermissions(true);
        await setHealthSyncEnabled(false);
        Alert.alert(
          'Health data unavailable',
          "Your device doesn't support health data syncing. You can still use Genoly to track manually.",
          [{ text: 'OK', onPress: () => router.replace(TABS_ROUTE) }],
        );
        return;
      }

      const result = await adapter.requestPermissions(REQUESTED_METRICS);
      await setHasRequestedHealthPermissions(true);
      await setHealthSyncEnabled(result.granted);

      if (result.granted) {
        // Step 6 — kick off the background sync drainer now that we
        // have permission to read health data. Failure here is non-
        // fatal: the user reaches the tabs either way, and the
        // foreground drain (Step 7+) will still run.
        await registerBackgroundSync();
        // Day-one initial pull (30-day window, §3.7): collect + upload
        // now so the dashboard isn't empty until the next drain cycle.
        // Fire-and-forget; assumeEnabled skips re-reading the flag we
        // just wrote. collectAndDrainNow never throws.
        collectAndDrainNow({ assumeEnabled: true });
        router.replace(TABS_ROUTE);
      } else if (adapter.openHealthSettings) {
        // The OS permission dialog resolved with nothing. On Android
        // this usually means Health Connect has rate-limited the dialog
        // (after a couple of denials it auto-resolves empty WITHOUT
        // showing UI — a dead end unless we route the user to grant
        // manually). Offer that path; when they come back and tap
        // "Grant access" again, requestPermissions() picks up manual
        // grants without relaunching the broken dialog.
        Alert.alert(
          'No access granted',
          'If no permission screen appeared, Android is suppressing it. You can grant access directly in Health Connect (App permissions → Genoly), then come back and tap "Grant access" again.',
          [
            {
              text: 'Open Health Connect',
              onPress: () => {
                adapter.openHealthSettings?.();
              },
            },
            { text: 'Not now', style: 'cancel', onPress: () => router.replace(TABS_ROUTE) },
          ],
        );
      } else {
        Alert.alert(
          'No access granted',
          'You can grant access later from Settings.',
          [{ text: 'Continue', onPress: () => router.replace(TABS_ROUTE) }],
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Permission error', msg);
    } finally {
      setRequesting(false);
    }
  };

  const onSkip = async () => {
    await setHasRequestedHealthPermissions(true);
    await setHealthSyncEnabled(false);
    router.replace(TABS_ROUTE);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Connect your health data
      </Text>
      <Text style={styles.subtitle}>
        Genoly reads your daily activity to compute leaderboards and goal progress.
        We only read what you grant; you can revoke access from Settings anytime.
      </Text>

      <View style={styles.metricList}>
        <MetricRow
          styles={styles}
          icon="👟"
          label="Steps"
          description="Daily step count from Apple Health / Health Connect."
        />
        <MetricRow
          styles={styles}
          icon="🔥"
          label="Active calories"
          description="Calories burned during exercise — used for activity goals."
        />
        <MetricRow
          styles={styles}
          icon="📏"
          label="Distance"
          description="Walking + running distance for daily totals."
        />
      </View>

      <Text style={styles.privacyNote}>
        Your health data stays on your device unless you complete a sync. We never
        sell or share it. Read our{' '}
        <Text style={styles.privacyLink}>privacy policy</Text> at genoly.org/privacy.
      </Text>

      <View style={styles.buttonRow}>
        <Button
          label="Grant access"
          onPress={onGrantAccess}
          loading={requesting}
          accessibilityHint="Opens the system health permissions dialog"
        />
        <Button
          variant="secondary"
          label="Maybe later"
          onPress={onSkip}
          disabled={requesting}
          style={styles.skipButton}
        />
      </View>
    </ScrollView>
  );
}

type Styles = ReturnType<typeof createStyles>;

function MetricRow({
  styles,
  icon,
  label,
  description,
}: {
  styles: Styles;
  icon: string;
  label: string;
  description: string;
}) {
  return (
    <View style={styles.metricRow}>
      <Text accessibilityElementsHidden style={styles.metricIcon}>
        {icon}
      </Text>
      <View style={styles.metricCopy}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricDescription}>{description}</Text>
      </View>
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
    title: {
      ...t.typography.screenTitle,
      color: t.colors.text,
      marginTop: t.spacing.xxl,
      marginBottom: t.spacing.md,
      textAlign: 'center',
    },
    subtitle: {
      ...t.typography.subtitle,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginBottom: t.spacing.xxl,
    },
    metricList: {
      marginBottom: t.spacing.xl,
    },
    metricRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.sm,
      marginBottom: t.spacing.sm,
    },
    metricIcon: {
      fontSize: 24,
      marginRight: t.spacing.md,
    },
    metricCopy: {
      flex: 1,
    },
    metricLabel: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      marginBottom: t.spacing.xs,
    },
    metricDescription: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
    },
    privacyNote: {
      ...t.typography.helper,
      fontSize: 13,
      lineHeight: 18,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginBottom: t.spacing.xxl,
    },
    privacyLink: {
      color: t.colors.link,
      textDecorationLine: 'underline',
    },
    buttonRow: {},
    skipButton: {
      marginTop: t.spacing.md,
    },
  });
}
