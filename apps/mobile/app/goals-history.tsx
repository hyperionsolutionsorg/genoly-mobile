/**
 * Goal history — Step 10 of Phase 1.
 *
 * Reads `GET /api/fitness/goals/history` (archived goals, most recently
 * archived first) via `useGoalsData().fetchHistory()`.
 *
 * Why a SEPARATE pushed route instead of a section on `goals.tsx`: the
 * contract's history endpoint returns up to 200 rows (vs. the 4-row
 * active-goals list) and supports its own filters (period/metric/limit).
 * Cramming a filterable, potentially-long list under the 4 goal-slot
 * cards would push the primary "what are my goals right now" view below
 * the fold and mix two different interaction models (edit-in-place vs.
 * a scrolling read-only ledger) on one screen. Same pushed-route
 * precedent as `leaderboard.tsx` / `friends.tsx` off `goals.tsx`'s
 * "History" link row.
 *
 * IA: pushed from `goals.tsx`'s "View goal history" row. Not a tab.
 *
 * Gating: no gate of its own — inherits the app-wide Pro-tenant
 * `AuthGate` (see `friends.tsx` header for the full rationale). No
 * upgrade/pricing UI per AGENTS.md §3.1.
 *
 * Layout (top-to-bottom):
 *   1. Header — screen title + subtitle
 *   2. Filter chips — period (All/Daily/Weekly) and metric
 *      (All/Steps/Calories); changing either re-fetches
 *   3. (Optional) error banner with Retry
 *   4. Entries grouped by month archived ("July 2026", "June 2026", …)
 *      — chronological, most recent month first, matching the server's
 *      most-recently-archived-first ordering within each group. Grouping
 *      by month keeps a phone-sized list scannable instead of a flat
 *      wall of up-to-200 rows.
 *   5. Empty state when there's no history yet (or none matching filters)
 *
 * Per mobile DESIGN.md — no chart library, plain Views, theme tokens only.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import type { ArchivedGoal, GoalMetric, GoalPeriod } from '@genoly/types';

import { useGoalsData } from '../hooks/useGoalsData';
import { useThemedStyles, useTheme, MIN_TOUCH_TARGET, type Theme } from '../theme';
import { Banner } from '../components/ui';

type PeriodFilter = GoalPeriod | 'all';
type MetricFilter = GoalMetric | 'all';

const PERIOD_OPTIONS: Array<{ value: PeriodFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

const METRIC_OPTIONS: Array<{ value: MetricFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'steps', label: 'Steps' },
  { value: 'calories', label: 'Calories' },
];

const METRIC_UNIT: Record<GoalMetric, string> = { steps: 'steps', calories: 'kcal' };
const METRIC_NOUN: Record<GoalMetric, string> = { steps: 'Steps', calories: 'Active calories' };
const PERIOD_NOUN: Record<GoalPeriod, string> = { daily: 'Daily', weekly: 'Weekly' };

/** Groups archived goals by the calendar month of `archivedAt`, preserving
 *  the server's most-recently-archived-first ordering both across and
 *  within groups (the server already sorts; we just partition). Exported
 *  for unit testing. */
export function groupHistoryByMonth(
  goals: ArchivedGoal[],
): Array<{ key: string; label: string; items: ArchivedGoal[] }> {
  const groups: Array<{ key: string; label: string; items: ArchivedGoal[] }> = [];
  const indexByKey = new Map<string, number>();

  for (const goal of goals) {
    const d = new Date(goal.archivedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let idx = indexByKey.get(key);
    if (idx === undefined) {
      const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      idx = groups.length;
      groups.push({ key, label, items: [] });
      indexByKey.set(key, idx);
    }
    groups[idx].items.push(goal);
  }

  return groups;
}

function formatArchivedDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function GoalsHistoryScreen() {
  const t = useTheme();
  const styles = useThemedStyles(createStyles);
  // The active-goals list isn't needed on this screen — only the
  // one-shot history read is. Skip the hook's default on-mount fetch of
  // GET /goals so this screen doesn't make an unused network call.
  const data = useGoalsData({ skipInitialRefresh: true });

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [metricFilter, setMetricFilter] = useState<MetricFilter>('all');

  const load = useCallback(
    (period: PeriodFilter, metric: MetricFilter) => {
      data.fetchHistory({
        period: period === 'all' ? undefined : period,
        metric: metric === 'all' ? undefined : metric,
      });
    },
    // data.fetchHistory is stable via useCallback([]) in the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    load(periodFilter, metricFilter);
    // Re-run whenever a filter changes; `load` itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodFilter, metricFilter]);

  const groups = useMemo(() => groupHistoryByMonth(data.history), [data.history]);

  const onRetry = useCallback(() => load(periodFilter, metricFilter), [load, periodFilter, metricFilter]);

  return (
    <>
      <Stack.Screen options={{ title: 'Goal history' }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={data.historyLoading} onRefresh={onRetry} tintColor={t.colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.headerCol}>
          <Text style={styles.screenTitle}>Goal history</Text>
          <Text style={styles.subtitle}>Past targets, most recently changed first</Text>
        </View>

        {/* Filters */}
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Period</Text>
          <View style={styles.chipRow}>
            {PERIOD_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                styles={styles}
                label={opt.label}
                selected={periodFilter === opt.value}
                onPress={() => setPeriodFilter(opt.value)}
                accessibilityLabel={`Filter by period: ${opt.label}`}
              />
            ))}
          </View>
        </View>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Metric</Text>
          <View style={styles.chipRow}>
            {METRIC_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                styles={styles}
                label={opt.label}
                selected={metricFilter === opt.value}
                onPress={() => setMetricFilter(opt.value)}
                accessibilityLabel={`Filter by metric: ${opt.label}`}
              />
            ))}
          </View>
        </View>

        {/* Error banner */}
        {data.historyError && (
          <Banner variant="error" message={data.historyError} actionLabel="Retry" onAction={onRetry} />
        )}

        {/* Loading — only the initial/filter-change fetch (no cached rows
            to show yet). A refresh with existing rows on screen relies on
            the pull-to-refresh spinner above instead, so the list doesn't
            double up two loading indicators at once. */}
        {data.historyLoading && groups.length === 0 && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={t.colors.primary} />
            <Text style={styles.loadingText}>Loading history…</Text>
          </View>
        )}

        {/* Grouped entries */}
        {!data.historyLoading &&
          groups.map((group) => (
            <View key={group.key} style={styles.section}>
              <Text style={styles.sectionTitle}>{group.label}</Text>
              <View style={styles.sectionBody}>
                {group.items.map((goal, idx) => (
                  <View key={goal.id}>
                    {idx > 0 && <View style={styles.divider} />}
                    <HistoryRow goal={goal} styles={styles} />
                  </View>
                ))}
              </View>
            </View>
          ))}

        {/* Empty state */}
        {!data.historyLoading && !data.historyError && groups.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No history yet</Text>
            <Text style={styles.emptyStateBody}>
              When you change or remove a goal, the old target moves here so you can see how your
              targets evolved over time.
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

type Styles = ReturnType<typeof createStyles>;

// ── Sub-components ───────────────────────────────────────────────────

function FilterChip({
  styles,
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  styles: Styles;
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function HistoryRow({ goal, styles }: { goal: ArchivedGoal; styles: Styles }) {
  const label = `${PERIOD_NOUN[goal.period]} ${METRIC_NOUN[goal.metric].toLowerCase()}`;
  return (
    <View
      style={styles.historyRow}
      accessible
      accessibilityLabel={`${label}, target ${goal.target} ${METRIC_UNIT[goal.metric]}, archived ${formatArchivedDate(goal.archivedAt)}`}
    >
      <View style={styles.historyTextCol}>
        <Text style={styles.historyLabel}>{label}</Text>
        <Text style={styles.historyDate}>Archived {formatArchivedDate(goal.archivedAt)}</Text>
      </View>
      <Text style={styles.historyTarget}>
        {goal.target.toLocaleString()} {METRIC_UNIT[goal.metric]}
      </Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      padding: t.spacing.xl,
      backgroundColor: t.colors.bg,
    },
    headerCol: {
      marginTop: t.spacing.sm,
      marginBottom: t.spacing.lg,
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
    filterGroup: {
      marginBottom: t.spacing.md,
    },
    filterLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: t.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: t.spacing.xs,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.spacing.sm,
    },
    chip: {
      paddingVertical: t.spacing.xs + 2,
      paddingHorizontal: t.spacing.md,
      borderRadius: t.radius.sm,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.bgElevated,
      minHeight: MIN_TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipSelected: {
      backgroundColor: t.colors.primary,
      borderColor: t.colors.primary,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: t.colors.text,
    },
    chipTextSelected: {
      color: t.colors.onPrimary,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      paddingVertical: t.spacing.lg,
    },
    loadingText: {
      fontSize: 14,
      color: t.colors.textMuted,
    },
    section: {
      marginTop: t.spacing.lg,
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
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: t.spacing.sm,
      gap: t.spacing.sm,
    },
    historyTextCol: {
      flexShrink: 1,
    },
    historyLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    historyDate: {
      fontSize: 12,
      color: t.colors.textMuted,
      marginTop: 2,
    },
    historyTarget: {
      fontSize: 16,
      fontWeight: '600',
      color: t.colors.text,
      fontVariant: ['tabular-nums'],
    },
    divider: {
      height: 1,
      backgroundColor: t.colors.border,
      marginVertical: t.spacing.xs,
    },
    emptyState: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      padding: t.spacing.xl,
      alignItems: 'center',
      marginTop: t.spacing.lg,
    },
    emptyStateTitle: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      marginBottom: t.spacing.sm,
      textAlign: 'center',
    },
    emptyStateBody: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      textAlign: 'center',
    },
  });
}
