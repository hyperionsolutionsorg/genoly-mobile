/**
 * Fitness Dashboard — Step 7 of Phase 1.
 *
 * Layout (top-to-bottom):
 *   1. Header: "Today" + last-synced timestamp + Refresh button
 *   2. Optional dead-letter banner (only when deadLetterDepth > 0)
 *   3. Today's three big-number cards: Steps, Active calories, Distance
 *   4. Section: "Last 7 days" with horizontal bars
 *
 * States handled:
 *   - Initial load (skeleton placeholders)
 *   - Empty (new user, no data yet)
 *   - Error (banner with retry CTA)
 *   - Refreshing (button shows spinner)
 *
 * Per the mobile DESIGN.md:
 *   - All colors are inlined (Phase 1.5 will lift into a theme module)
 *   - Native Alert.alert for the "Clear failed syncs" confirmation
 *   - TouchableOpacity with accessibility labels on every action
 *
 * Per Shankar's morning Q3 ("don't show too many errors, becomes noise"):
 *   - The dead-letter banner has a one-tap Clear action inline. No need
 *     to dig into Settings. After confirming, the banner disappears
 *     immediately — no accumulated noise.
 */

import { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import type { HealthEntry } from '@genoly/types';
import { useDashboardData } from '../../hooks/useDashboardData';

export default function FitnessScreen() {
  const data = useDashboardData();

  const onRefresh = useCallback(() => {
    data.refresh();
  }, [data]);

  const onClearDeadLetters = useCallback(() => {
    Alert.alert(
      'Clear failed syncs?',
      `${data.deadLetterDepth} entr${data.deadLetterDepth === 1 ? 'y' : 'ies'} couldn't be uploaded and will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            data.clearDeadLetters();
          },
        },
      ],
      { cancelable: true },
    );
  }, [data]);

  if (data.initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066ff" />
        <Text style={styles.loadingText}>Loading your activity…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerTextCol}>
          <Text style={styles.screenTitle}>Today</Text>
          <Text style={styles.subtitle}>{formatLastSynced(data.lastSyncedAt)}</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Refresh dashboard"
          style={[styles.refreshButton, data.refreshing && styles.refreshButtonDisabled]}
          onPress={onRefresh}
          disabled={data.refreshing}
        >
          {data.refreshing ? (
            <ActivityIndicator size="small" color="#0066ff" />
          ) : (
            <Text style={styles.refreshButtonText}>Refresh</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Error banner */}
      {data.error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{data.error}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Retry refresh"
            onPress={onRefresh}
          >
            <Text style={styles.errorBannerAction}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Dead-letter banner (only when there's something to surface) */}
      {data.deadLetterDepth > 0 && (
        <View style={styles.deadLetterBanner}>
          <Text style={styles.deadLetterBannerText}>
            {data.deadLetterDepth} entr{data.deadLetterDepth === 1 ? 'y' : 'ies'} failed to sync.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Clear failed syncs"
            onPress={onClearDeadLetters}
          >
            <Text style={styles.deadLetterBannerAction}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Today's big numbers */}
      <View style={styles.todayCard}>
        <BigNumberRow
          label="Steps"
          value={formatSteps(data.today?.steps ?? 0)}
          empty={data.today === null}
        />
        <View style={styles.todayDivider} />
        <BigNumberRow
          label="Active calories"
          value={formatCalories(data.today?.caloriesActive ?? 0)}
          empty={data.today === null}
        />
        <View style={styles.todayDivider} />
        <BigNumberRow
          label="Distance"
          value={formatDistance(data.today?.distanceMeters ?? null)}
          empty={data.today === null}
        />
      </View>

      {/* Empty state when there's no data at all */}
      {data.last7Days.length === 0 && !data.error && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No activity yet</Text>
          <Text style={styles.emptyStateBody}>
            Your steps, calories, and distance will appear here as soon as your phone&apos;s
            health app starts syncing.
          </Text>
        </View>
      )}

      {/* Last 7 days */}
      {data.last7Days.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last 7 days</Text>
          <View style={styles.sectionBody}>
            <SevenDayChart entries={data.last7Days} todayDate={data.range.to} />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function BigNumberRow({
  label,
  value,
  empty,
}: {
  label: string;
  value: string;
  empty: boolean;
}) {
  return (
    <View style={styles.bigNumberRow}>
      <Text style={styles.bigNumberLabel}>{label}</Text>
      <Text style={[styles.bigNumberValue, empty && styles.bigNumberValueEmpty]}>
        {empty ? '—' : value}
      </Text>
    </View>
  );
}

/**
 * Horizontal bar chart. Each day is a row: short date label on the left,
 * bar in the middle (width proportional to steps relative to the max
 * across the 7 days), step count on the right.
 *
 * The "max" is computed from the visible window — so a quiet week's bars
 * are still readable, and an active week's bars don't crowd a single
 * massive day.
 */
function SevenDayChart({
  entries,
  todayDate,
}: {
  entries: HealthEntry[];
  todayDate: string;
}) {
  const maxSteps = Math.max(...entries.map((e) => e.steps), 1);

  return (
    <View>
      {entries.map((entry) => {
        const widthPct = (entry.steps / maxSteps) * 100;
        const isToday = entry.date === todayDate;
        return (
          <View key={entry.date} style={styles.barRow}>
            <Text style={[styles.barDateLabel, isToday && styles.barDateLabelToday]}>
              {formatDayLabel(entry.date, todayDate)}
            </Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${widthPct}%` },
                  isToday && styles.barFillToday,
                ]}
              />
            </View>
            <Text style={styles.barValueLabel}>{formatSteps(entry.steps)}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Formatters ──────────────────────────────────────────────────────

function formatSteps(n: number): string {
  return n.toLocaleString();
}

function formatCalories(n: number): string {
  return `${Math.round(n).toLocaleString()} kcal`;
}

function formatDistance(meters: number | null): string {
  if (meters === null) return '—';
  const km = meters / 1000;
  return `${km.toFixed(km < 10 ? 2 : 1)} km`;
}

/** "Mon", "Tue", ... — except today which gets "Today" and yesterday "Yest." */
function formatDayLabel(date: string, todayDate: string): string {
  if (date === todayDate) return 'Today';
  // YYYY-MM-DD → day of week. We construct in local TZ to avoid a UTC shift.
  const [yyyy, mm, dd] = date.split('-').map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  const dayName = d.toLocaleDateString(undefined, { weekday: 'short' });
  return dayName;
}

function formatLastSynced(lastSyncedAt: number | null): string {
  if (lastSyncedAt === null) return 'Not synced yet';
  const now = Date.now();
  const seconds = Math.floor((now - lastSyncedAt) / 1000);
  if (seconds < 60) return 'Synced just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Synced ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours} hour${hours === 1 ? '' : 's'} ago`;
  return 'Synced over a day ago';
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: '#fefefe',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fefefe',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  headerTextCol: {
    flexShrink: 1,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    minWidth: 84,
    alignItems: 'center',
  },
  refreshButtonDisabled: {
    opacity: 0.7,
  },
  refreshButtonText: {
    color: '#0066ff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    marginBottom: 16,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#991b1b',
    marginRight: 8,
  },
  errorBannerAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#991b1b',
  },
  deadLetterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fef3c7',
    marginBottom: 16,
  },
  deadLetterBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
    marginRight: 8,
  },
  deadLetterBannerAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
  },
  todayCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
  },
  bigNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  bigNumberLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  bigNumberValue: {
    fontSize: 28,
    fontWeight: '600',
    color: '#111827',
  },
  bigNumberValueEmpty: {
    color: '#9ca3af',
    fontSize: 24,
  },
  todayDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 4,
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
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  barDateLabel: {
    width: 56,
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  barDateLabelToday: {
    color: '#0066ff',
    fontWeight: '600',
  },
  barTrack: {
    flex: 1,
    height: 16,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#0066ff',
    borderRadius: 4,
  },
  barFillToday: {
    backgroundColor: '#1d4ed8',
  },
  barValueLabel: {
    width: 64,
    fontSize: 12,
    color: '#374151',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  emptyState: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyStateBody: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
