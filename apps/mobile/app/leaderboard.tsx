/**
 * Leaderboard — Step 8 salvage (cherry-picked from `origin/feat/step-8-leaderboard`,
 * `e630ba3`, adapted to today's architecture — see memory-bank/log.md 2026-07-09).
 *
 * Daily friends-and-me activity standings. Reads from
 * `apiClient.getLeaderboard({ date })` (today, local TZ) via the
 * `useLeaderboardData` hook — same drain-then-fetch shape as
 * `useDashboardData` / `(tabs)/activity.tsx`, whose visual conventions
 * this screen mirrors (hand-rolled themed styles + shared `Banner`).
 *
 * IA: this is a PUSHED screen, not a tab — reached from a "Friends
 * leaderboard" row on the Activity tab. Same top-level-route pattern as
 * `challenge/[challengeId].tsx` and `person/[personId]/index.tsx`. The
 * member app stays fixed at 5 tabs (Home/Tree/Challenges/Activity/
 * Settings); this salvage does not add a 6th.
 *
 * Gating: this route carries no gate of its own. It inherits the
 * app-wide Pro-tenant gate enforced in `app/_layout.tsx`'s `AuthGate`,
 * which redirects any authenticated-but-non-Pro-tenant user to
 * `/(gated)/paywall` before they reach ANY top-level route — tabs and
 * pushed screens alike. A non-Pro user never sees the Activity tab (or
 * this screen); they only see the Paywall's "Upgrade your tree" /
 * "Continue on web" CTAs, both of which open the system browser to
 * genoly.org (no in-app payment surface — mobile payment neutrality
 * per AGENTS.md §3.1). This screen adds no upgrade/pricing UI of its own.
 *
 * Layout (top-to-bottom):
 *   1. Header — screen title + last-fetched-date subtitle + Refresh button
 *   2. (Optional) Error banner with Retry
 *   3. My-row callout (current user, highlighted as "YOU")
 *   4. Friends list (ranked)
 *   5. Empty state when no friends yet
 *
 * Per mobile DESIGN.md — no chart library, plain Views, theme tokens only.
 */

import { useCallback } from 'react';
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
import type { LeaderboardRow } from '@genoly/types';

import { useLeaderboardData } from '../hooks/useLeaderboardData';
import { useThemedStyles, useTheme, MIN_TOUCH_TARGET, type Theme } from '../theme';
import { Banner } from '../components/ui';

export default function LeaderboardScreen() {
  const t = useTheme();
  const styles = useThemedStyles(createStyles);
  const data = useLeaderboardData();

  const onRefresh = useCallback(() => {
    data.refresh();
  }, [data]);

  if (data.initialLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Leaderboard' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={t.colors.primary} />
          <Text style={styles.loadingText}>Loading leaderboard…</Text>
        </View>
      </>
    );
  }

  const myRow = data.rows.find((r) => r.isMe) ?? null;
  const others = data.rows.filter((r) => !r.isMe);

  return (
    <>
      <Stack.Screen options={{ title: 'Leaderboard' }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={data.refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={styles.screenTitle}>Today&apos;s leaderboard</Text>
            <Text style={styles.subtitle}>{formatDateDisplay(data.date)}</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Refresh leaderboard"
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

        {/* My row — highlighted */}
        {myRow && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>You</Text>
            <View style={styles.myRowCard}>
              <LeaderboardRowView row={myRow} isMe styles={styles} />
            </View>
          </View>
        )}

        {/* Friends list */}
        {others.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Friends</Text>
            <View style={styles.sectionBody}>
              {others.map((row, idx) => (
                <View key={`${row.fitnessUserId}-${row.rank}`}>
                  {idx > 0 && <View style={styles.divider} />}
                  <LeaderboardRowView row={row} styles={styles} />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Empty state */}
        {others.length === 0 && !data.error && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No friends on the board yet</Text>
            <Text style={styles.emptyStateBody}>
              Add friends from the Friends tab (coming soon) to see how you stack up. For now,
              it&apos;s just you keeping yourself honest.
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

type Styles = ReturnType<typeof createStyles>;

// ── Sub-components ───────────────────────────────────────────────────

function LeaderboardRowView({
  row,
  isMe,
  styles,
}: {
  row: LeaderboardRow;
  isMe?: boolean;
  styles: Styles;
}) {
  const name = row.displayName ?? 'Anonymous';
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Rank ${row.rank}, ${name}${isMe ? ', you' : ''}, ${formatSteps(row.steps)} steps`}
    >
      <View style={styles.rankCol}>
        <Text style={[styles.rankNumber, isMe && styles.rankNumberMe]}>#{row.rank}</Text>
      </View>
      <View style={styles.nameCol}>
        <View style={styles.nameRow}>
          <Text style={[styles.displayName, isMe && styles.displayNameMe]}>{name}</Text>
          {isMe && <Text style={styles.youBadge}>YOU</Text>}
        </View>
      </View>
      <View style={styles.statsCol}>
        <Text style={styles.statValue}>{formatSteps(row.steps)}</Text>
        <Text style={styles.statLabel}>steps</Text>
      </View>
    </View>
  );
}

// ── Formatters ──────────────────────────────────────────────────────

function formatSteps(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString();
}

/** "Today" if date matches local-tz today, else "Mon, May 29" style. */
function formatDateDisplay(date: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  if (date === `${yyyy}-${mm}-${dd}`) return 'Today';
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
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
      padding: t.spacing.xs,
    },
    myRowCard: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.primary,
      borderRadius: t.radius.md,
      padding: t.spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.md,
    },
    rankCol: {
      width: 44,
    },
    rankNumber: {
      fontSize: 16,
      fontWeight: '600',
      color: t.colors.textMuted,
    },
    rankNumberMe: {
      color: t.colors.primary,
      fontSize: 18,
    },
    nameCol: {
      flex: 1,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
    },
    displayName: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    displayNameMe: {
      fontWeight: '600',
    },
    youBadge: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 1,
      color: t.colors.onPrimary,
      backgroundColor: t.colors.primary,
      paddingVertical: 2,
      paddingHorizontal: t.spacing.xs + 2,
      borderRadius: 4,
      overflow: 'hidden',
    },
    statsCol: {
      alignItems: 'flex-end',
    },
    statValue: {
      fontSize: 16,
      fontWeight: '600',
      color: t.colors.text,
      fontVariant: ['tabular-nums'],
    },
    statLabel: {
      fontSize: 11,
      color: t.colors.textMuted,
    },
    divider: {
      height: 1,
      backgroundColor: t.colors.border,
      marginHorizontal: t.spacing.md,
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
      textAlign: 'center',
    },
    emptyStateBody: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      textAlign: 'center',
    },
  });
}
