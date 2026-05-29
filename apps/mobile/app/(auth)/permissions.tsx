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
 *
 * Visual style: matches DESIGN.md (genoly-family-web/DESIGN.md) — but
 * the mobile app doesn't yet have a shared theme system, so colors are
 * inlined for now. A mobile-specific DESIGN.md is a future task.
 */

import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { createHealthAdapter, type HealthMetric } from '@genoly/health-sync';
import { setHasRequestedHealthPermissions, setHealthSyncEnabled } from '../../utils/preferences';
import { registerBackgroundSync } from '../../utils/backgroundSync';

// The minimal permission scope confirmed by Shankar on 2026-05-28:
//   Steps + ActiveEnergyBurned + Distance.
//
// ExerciseTime was on the original list but the HealthMetric enum
// doesn't model it — deferred as future interface extension.
const REQUESTED_METRICS: HealthMetric[] = ['steps', 'caloriesActive', 'distanceMeters'];

const TABS_ROUTE = '/(tabs)' as unknown as Href;

export default function PermissionsScreen() {
  const router = useRouter();
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
          'Your device doesn\'t support health data syncing. You can still use Genoly to track manually.',
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
        router.replace(TABS_ROUTE);
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
      <Text style={styles.title}>Connect your health data</Text>
      <Text style={styles.subtitle}>
        Genoly reads your daily activity to compute leaderboards and goal progress.
        We only read what you grant; you can revoke access from Settings anytime.
      </Text>

      <View style={styles.metricList}>
        <MetricRow
          icon="👟"
          label="Steps"
          description="Daily step count from Apple Health / Health Connect."
        />
        <MetricRow
          icon="🔥"
          label="Active calories"
          description="Calories burned during exercise — used for activity goals."
        />
        <MetricRow
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
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={onGrantAccess}
          disabled={requesting}
        >
          {requesting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Grant access</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={onSkip}
          disabled={requesting}
        >
          <Text style={styles.secondaryButtonText}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function MetricRow({ icon, label, description }: { icon: string; label: string; description: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <View style={styles.metricCopy}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: '#fefefe',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginTop: 32,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  metricList: {
    marginBottom: 24,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
  },
  metricIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  metricCopy: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  metricDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  privacyNote: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 32,
  },
  privacyLink: {
    color: '#0066ff',
    textDecorationLine: 'underline',
  },
  buttonRow: {
    gap: 12,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#0066ff',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '500',
  },
});
