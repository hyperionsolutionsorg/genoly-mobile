/**
 * Leaderboard tab — Step 8 of Phase 1.
 *
 * Daily friends-and-me activity standings. Reads from
 * `apiClient.getLeaderboard({ date })` (today, local TZ) via the
 * `useLeaderboardData` hook.
 *
 * Layout (top-to-bottom):
 *   1. Header — "Today's leaderboard" + last-synced + Refresh button
 *   2. (Optional) Error banner with Retry
 *   3. My-row callout (current user, highlighted as "YOU")
 *   4. Friends list (ranked)
 *   5. Empty state when no friends yet
 *
 * Visual treatment per mobile DESIGN.md: rank-numbered rows in a card,
 * "YOU" badge on self row with the primary-color ring, gender-coded
 * accents would be next-step (not in Phase 1 data — server returns
 * displayName + step count only).
 */

import { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { LeaderboardRow } from '@genoly/types';
import { useLeaderboardData } from '../../hooks/useLeaderboardData';

export default function LeaderboardScreen() {
  const data = useLeaderboardData();

  const onRefresh = useCallback(() => {
    data.refresh();
  }, [data]);

  if (data.initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066ff" />
        <Text style={styles.loadingText}>Loading leaderboard…</Text>
      </View>
    );
  }

  const myRow = data.rows.find((r) => r.isMe) ?? null;
  const others = data.rows.filter((r) => !r.isMe);

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
            <ActivityIndicator size="small" color="#0066ff" />
          ) : (
            <Text style={styles.refreshButtonText}>Refresh</Text>
          )}
        </TouchableOpacity>
      </View>

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

      {/* My row — highlighted */}
      {myRow && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>You</Text>
          <View style={styles.myRowCard}>
            <LeaderboardRowView row={myRow} isMe />
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
                <LeaderboardRowView row={row} />
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
            Add friends from the Friends tab (coming soon) to see how you stack up.
            For now, it&apos;s just you keeping yourself honest.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function LeaderboardRowView({ row, isMe }: { row: LeaderboardRow; isMe?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.rankCol}>
        <Text style={[styles.rankNumber, isMe && styles.rankNumberMe]}>
          #{row.rank}
        </Text>
      </View>
      <View style={styles.nameCol}>
        <View style={styles.nameRow}>
          <Text style={[styles.displayName, isMe && styles.displayNameMe]}>
            {row.displayName ?? 'Anonymous'}
          </Text>
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
  // Compare against local-tz today.
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
  section: {
    marginBottom: 24,
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
    padding: 4,
  },
  myRowCard: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#0066ff',
    borderRadius: 12,
    padding: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  rankCol: {
    width: 50,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  rankNumberMe: {
    color: '#0066ff',
    fontSize: 18,
  },
  nameCol: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  displayName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  displayNameMe: {
    fontWeight: '600',
  },
  youBadge: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    color: '#ffffff',
    backgroundColor: '#0066ff',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  statsCol: {
    alignItems: 'flex-end',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 12,
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
    textAlign: 'center',
  },
  emptyStateBody: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
