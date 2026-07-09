/**
 * Activity — your steps, calories, and distance (the fitness dashboard,
 * Step 7 of Phase 1; relocated from the old Fitness tab in the C1
 * navigation rework).
 *
 * Layout (top-to-bottom):
 *   1. Header: "Today" + last-synced timestamp + Refresh button
 *   2. Optional dead-letter banner (only when deadLetterDepth > 0)
 *   3. Today's three big-number cards: Steps, Active calories, Distance
 *   4. Section: "Last 7 days" with horizontal bars
 *   5. Section: "Friends" — link row to the pushed Leaderboard screen
 *      (`/leaderboard`, Step 8 salvage: daily standings vs fitness friends)
 *   6. Section: "Goals" — link row to the pushed Goals screen (Step 10:
 *      set/edit/archive daily & weekly steps/calories targets + history)
 *
 * Goals/dashboard consistency note (Step 10): this dashboard's "Today"
 * card renders raw HealthEntry values from `getDailyAggregates` — it does
 * NOT render goal targets today, so there's no duplicated-source-of-truth
 * risk to reconcile here. The only other place goal values reach the
 * client today is `friends/leaderboard`'s `myStepGoal`/`myCalorieGoal`
 * response fields (Step 8) — `useLeaderboardData` already reads them off
 * the SAME `fitness_goals` active rows this screen's "Goals" section
 * edits via `useGoalsData`, so a goal changed here is picked up next time
 * the leaderboard re-fetches (no client-side goals cache to invalidate).
 * Note `leaderboard.tsx` doesn't currently render those two fields in its
 * UI (pre-existing, out of scope for this step) — flagging in case a
 * future pass wants to surface "vs. your goal" on that screen.
 *
 * States handled: initial load / empty / error / refreshing.
 *
 * Per Shankar's morning Q3 ("don't show too many errors, becomes noise"):
 * the dead-letter banner has a one-tap Clear action inline; after
 * confirming, the banner disappears immediately.
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
  RefreshControl,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import type { HealthEntry } from '@genoly/types';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useThemedStyles, useTheme, MIN_TOUCH_TARGET, type Theme } from '../../theme';
import { Banner } from '../../components/ui';

// Typed-routes union lags new top-level routes until `expo start`
// regenerates .expo/types — same cast pattern as the rest of the app.
const LEADERBOARD_ROUTE = '/leaderboard' as unknown as Href;
const FRIENDS_ROUTE = '/friends' as unknown as Href;
const GOALS_ROUTE = '/goals' as unknown as Href;

export default function ActivityScreen() {
  const t = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
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
        <ActivityIndicator size="large" color={t.colors.primary} />
        <Text style={styles.loadingText}>Loading your activity…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={data.refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />
      }
    >
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
            <ActivityIndicator size="small" color={t.colors.primary} />
          ) : (
            <Text style={styles.refreshButtonText}>Refresh</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Error banner */}
      {data.error && (
        <Banner variant="error" message={data.error} actionLabel="Retry" onAction={onRefresh} />
      )}

      {/* Dead-letter banner (only when there's something to surface) */}
      {data.deadLetterDepth > 0 && (
        <Banner
          variant="warning"
          message={`${data.deadLetterDepth} entr${data.deadLetterDepth === 1 ? 'y' : 'ies'} failed to sync.`}
          actionLabel="Clear"
          onAction={onClearDeadLetters}
        />
      )}

      {/* Today's big numbers */}
      <View style={styles.todayCard}>
        <BigNumberRow
          styles={styles}
          label="Steps"
          value={formatSteps(data.today?.steps ?? 0)}
          empty={data.today === null}
        />
        <View style={styles.todayDivider} />
        <BigNumberRow
          styles={styles}
          label="Active calories"
          value={formatCalories(data.today?.caloriesActive ?? 0)}
          empty={data.today === null}
        />
        <View style={styles.todayDivider} />
        <BigNumberRow
          styles={styles}
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
            <SevenDayChart styles={styles} entries={data.last7Days} todayDate={data.range.to} />
          </View>
        </View>
      )}

      {/* Friends — manage connections (Step 9) + link to daily standings (Step 8) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Friends</Text>
        <View style={styles.sectionBody}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Manage friends"
            accessibilityHint="Send requests, accept or decline, and manage your friends list"
            style={styles.linkRow}
            onPress={() => router.push(FRIENDS_ROUTE)}
          >
            <Text style={styles.linkRowLabel}>Manage friends</Text>
            <Text style={styles.linkRowChevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.linkRowDivider} />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open friends leaderboard"
            accessibilityHint="Shows today's step standings across you and your fitness friends"
            style={styles.linkRow}
            onPress={() => router.push(LEADERBOARD_ROUTE)}
          >
            <Text style={styles.linkRowLabel}>Friends leaderboard</Text>
            <Text style={styles.linkRowChevron}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Goals — set/edit targets + history (Step 10) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Goals</Text>
        <View style={styles.sectionBody}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Manage goals"
            accessibilityHint="Set, edit, or remove your daily and weekly steps and calories targets"
            style={styles.linkRow}
            onPress={() => router.push(GOALS_ROUTE)}
          >
            <Text style={styles.linkRowLabel}>Manage goals</Text>
            <Text style={styles.linkRowChevron}>›</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

type Styles = ReturnType<typeof createStyles>;

// ── Sub-components ───────────────────────────────────────────────────

function BigNumberRow({
  styles,
  label,
  value,
  empty,
}: {
  styles: Styles;
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
  styles,
  entries,
  todayDate,
}: {
  styles: Styles;
  entries: HealthEntry[];
  todayDate: string;
}) {
  const maxSteps = Math.max(...entries.map((e) => e.steps), 1);

  return (
    <View>
      {entries.map((entry) => {
        const widthPct = (entry.steps / maxSteps) * 100;
        const isToday = entry.date === todayDate;
        const dayLabel = formatDayLabel(entry.date, todayDate);
        return (
          <View
            key={entry.date}
            style={styles.barRow}
            accessible
            accessibilityLabel={`${dayLabel}, ${formatSteps(entry.steps)} steps`}
          >
            <Text style={[styles.barDateLabel, isToday && styles.barDateLabelToday]}>
              {dayLabel}
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

/** "Mon", "Tue", ... — except today which gets "Today". */
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

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      padding: t.spacing.xl,
      backgroundColor: t.colors.bg,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.spacing.xl,
      backgroundColor: t.colors.bg,
    },
    loadingText: {
      marginTop: t.spacing.md,
      fontSize: 14,
      color: t.colors.textMuted,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: t.spacing.sm,
      marginBottom: t.spacing.xl,
    },
    headerTextCol: {
      flexShrink: 1,
    },
    screenTitle: {
      ...t.typography.screenTitle,
      color: t.colors.text,
    },
    subtitle: {
      fontSize: 13,
      color: t.colors.textMuted,
      marginTop: 2,
    },
    refreshButton: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.lg,
      backgroundColor: t.colors.bgElevated,
      minWidth: 84,
      alignItems: 'center',
      minHeight: MIN_TOUCH_TARGET,
      justifyContent: 'center',
    },
    refreshButtonDisabled: {
      opacity: 0.7,
    },
    refreshButtonText: {
      color: t.colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    todayCard: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
      marginBottom: t.spacing.xxl,
    },
    bigNumberRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingVertical: t.spacing.sm,
    },
    bigNumberLabel: {
      fontSize: 14,
      color: t.colors.textMuted,
      fontWeight: '500',
    },
    bigNumberValue: {
      fontSize: 28,
      fontWeight: '600',
      color: t.colors.text,
    },
    bigNumberValueEmpty: {
      color: t.colors.textMuted,
      fontSize: 24,
    },
    todayDivider: {
      height: 1,
      backgroundColor: t.colors.border,
      marginVertical: t.spacing.xs,
    },
    section: {
      marginBottom: t.spacing.xxl,
    },
    sectionTitle: {
      ...t.typography.sectionHeader,
      color: t.colors.textMuted,
      marginBottom: t.spacing.sm,
    },
    sectionBody: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
    },
    barRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
    },
    barDateLabel: {
      width: 56,
      fontSize: 13,
      color: t.colors.textMuted,
      fontWeight: '500',
    },
    barDateLabelToday: {
      color: t.colors.primary,
      fontWeight: '600',
    },
    barTrack: {
      flex: 1,
      height: 16,
      backgroundColor: t.colors.surfaceMuted,
      borderRadius: 4,
      marginHorizontal: t.spacing.sm,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      backgroundColor: t.colors.primary,
      borderRadius: 4,
    },
    barFillToday: {
      backgroundColor: t.colors.primaryHover,
    },
    barValueLabel: {
      width: 64,
      fontSize: 12,
      color: t.colors.textMuted,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: t.spacing.sm,
      minHeight: MIN_TOUCH_TARGET,
    },
    linkRowLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    linkRowChevron: {
      fontSize: 22,
      color: t.colors.textMuted,
      marginLeft: t.spacing.sm,
    },
    linkRowDivider: {
      height: 1,
      backgroundColor: t.colors.border,
    },
    emptyState: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      padding: t.spacing.xl,
      alignItems: 'center',
    },
    emptyStateTitle: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      marginBottom: t.spacing.sm,
    },
    emptyStateBody: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      textAlign: 'center',
    },
  });
}
