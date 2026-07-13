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
 *  4. The Android 14+ Health Connect CLIENT declaration: an exported
 *     `activity-alias` handling `android.intent.action.VIEW_PERMISSION_USAGE`
 *     with category `android.intent.category.HEALTH_PERMISSIONS`, guarded by
 *     `android.permission.START_VIEW_PERMISSION_USAGE`. On Android 14+ (where
 *     Health Connect is part of the OS) this is what makes the system
 *     RECOGNIZE the app as a Health Connect client. Without it the app never
 *     appears under Health Connect → App permissions, and requestPermission()
 *     resolves EMPTY without showing any UI — the exact "No access granted +
 *     Genoly missing from Health Connect's app list" dead end on the
 *     operator's Samsung (device-confirmed 2026-07-13). The library's own
 *     plugin only adds the Android-13-era
 *     `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` intent filter.
 *     Note: this does NOT rebrand Genoly as a "health app" — it registers a
 *     minimal three-read-type integration for the walking-challenge features.
 *
 * Health Connect requires minSdk 26 (already set via expo-build-properties).
 */

const { withAndroidManifest, withMainActivity } = require('@expo/config-plugins');

const PROVIDER_PACKAGE = 'com.google.android.apps.healthdata';

// Mirrors packages/health-sync METRIC_TO_HC_RECORD_TYPE for the metrics the
// permissions screen requests (steps / active calories / distance).
const HEALTH_READ_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_DISTANCE',
];

/**
 * 3. Register the permission delegate in MainActivity.onCreate — REQUIRED by
 *    react-native-health-connect (README "Set the permission delegate"): its
 *    requestPermission() launches the permission contract through a `lateinit`
 *    launcher that setPermissionDelegate() initializes. Without this, tapping
 *    "Grant access" hard-crashes the app natively ("Genoly keeps stopping" —
 *    device-confirmed 2026-07-11). The library's own plugin doesn't add it.
 */
function withHealthConnectDelegate(config) {
  return withMainActivity(config, (config) => {
    let src = config.modResults.contents;
    if (!src.includes('HealthConnectPermissionDelegate')) {
      // Kotlin MainActivity (Expo SDK 56 template).
      src = src.replace(
        /(import expo\.modules\.ReactActivityDelegateWrapper)/,
        '$1\nimport dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate',
      );
      src = src.replace(
        /(super\.onCreate\(null\))/,
        '$1\n    // react-native-health-connect: initialize the permission-contract\n    // launcher (see plugins/withHealthConnectManifest.js #3).\n    HealthConnectPermissionDelegate.setPermissionDelegate(this)',
      );
      config.modResults.contents = src;
    }
    return config;
  });
}

module.exports = function withHealthConnectManifest(config) {
  config = withHealthConnectDelegate(config);
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

    const app = manifest.application && manifest.application[0];
    if (app) {
      // 4. Android 14+ client declaration (see header). Idempotent by
      // alias name.
      app['activity-alias'] = app['activity-alias'] || [];
      const aliasName = '.ViewPermissionUsageActivity';
      const aliasPresent = app['activity-alias'].some(
        (a) => a.$ && a.$['android:name'] === aliasName,
      );
      if (!aliasPresent) {
        app['activity-alias'].push({
          $: {
            'android:name': aliasName,
            'android:exported': 'true',
            'android:targetActivity': '.MainActivity',
            'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
          },
          'intent-filter': [
            {
              action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
              category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
            },
          ],
        });
      }

      // Housekeeping: the library's plugin re-appends its Android-13
      // rationale intent-filter on every prebuild, so MainActivity ends
      // up with duplicates. Keep exactly one.
      const mainActivity = (app.activity || []).find(
        (a) => a.$ && a.$['android:name'] === '.MainActivity',
      );
      if (mainActivity && Array.isArray(mainActivity['intent-filter'])) {
        let seenRationale = false;
        mainActivity['intent-filter'] = mainActivity['intent-filter'].filter((f) => {
          const isRationale = (f.action || []).some(
            (a) => a.$ && a.$['android:name'] === 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE',
          );
          if (!isRationale) return true;
          if (seenRationale) return false;
          seenRationale = true;
          return true;
        });
      }
    }

    return config;
  });
};
