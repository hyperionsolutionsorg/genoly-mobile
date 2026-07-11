/**
 * withHealthConnectManifest — Expo config plugin that completes the Health
 * Connect AndroidManifest wiring that `react-native-health-connect`'s own
 * plugin does NOT add (it only injects the permissions-rationale action).
 *
 * Two additions, both required for Health Connect to actually work:
 *
 *  1. `<queries><package android:name="com.google.android.apps.healthdata"/>`
 *     — Android 11+ (API 30) package-visibility. Without it the app cannot
 *     SEE the Health Connect provider package, so `getSdkStatus()` returns
 *     "unavailable" even on a device that has Health Connect and real data.
 *     This was the exact cause of the "Health data unavailable — your device
 *     doesn't support health data syncing" dialog on a Samsung phone that had
 *     Health Connect populated (device-confirmed 2026-07-11).
 *
 *  2. The `android.permission.health.READ_*` permissions for the metrics the
 *     app reads (steps, active calories, distance) — needed for the grant
 *     flow after the provider is visible.
 *
 * Health Connect requires minSdk 26 (already set via expo-build-properties).
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const PROVIDER_PACKAGE = 'com.google.android.apps.healthdata';

// Mirrors packages/health-sync METRIC_TO_HC_RECORD_TYPE for the metrics the
// permissions screen requests (steps / active calories / distance).
const HEALTH_READ_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_DISTANCE',
];

module.exports = function withHealthConnectManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // 1. READ permissions (idempotent).
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    for (const name of HEALTH_READ_PERMISSIONS) {
      const present = manifest['uses-permission'].some(
        (p) => p.$ && p.$['android:name'] === name,
      );
      if (!present) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }

    // 2. Provider package visibility inside <queries> (idempotent).
    manifest.queries = manifest.queries || [];
    const alreadyDeclared = manifest.queries.some((q) =>
      (q.package || []).some((p) => p.$ && p.$['android:name'] === PROVIDER_PACKAGE),
    );
    if (!alreadyDeclared) {
      manifest.queries.push({
        package: [{ $: { 'android:name': PROVIDER_PACKAGE } }],
      });
    }

    return config;
  });
};
