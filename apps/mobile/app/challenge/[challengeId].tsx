/**
 * Challenge detail (wave H2) — live leaderboard, my progress, time
 * remaining, sync-now, join/leave/cancel, hide-my-activity toggle.
 * The leaderboard is one reactive subscription; "Sync now" pushes fresh
 * health-store counts (forced past the 15-min throttle) and the
 * subscription updates everyone's view.
 */

import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useConvex, useQuery } from 'convex/react';

import {
  getChallengeLeaderboard,
  challengeJoin,
  challengeLeave,
  challengeCancel,
  challengeSetMyVisibility,
} from '../../lib/genolyApi';
import { syncChallengeSteps } from '../../lib/challengeSync';
import { notify } from '../../lib/notifications';
import { useMe } from '../../hooks/useMe';
import { useThemedStyles, type Theme } from '../../theme';
import { Screen, Section, Button, Banner, Skeleton, EmptyState, toast } from '../../components/ui';
import { formatTimeRemaining, windowLabel } from '../(tabs)/challenges';

export default function ChallengeDetailScreen() {
  const { challengeId } = useLocalSearchParams<{ challengeId: string }>();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();
  const { me } = useMe();

  const board = useQuery(
    getChallengeLeaderboard,
    challengeId ? { challengeId } : ('skip' as const),
  );
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Auto-sync on open (throttled) when I'm a joined participant.
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current || !board || !challengeId) return;
    if (board.me?.joined && board.challenge.status === 'active') {
      autoSyncedRef.current = true;
      syncChallengeSteps(convex, {
        _id: challengeId,
        startAt: board.challenge.startAt,
        endAt: board.challenge.endAt,
      }).catch(() => {});
    }
  }, [board, challengeId, convex]);

  // Overtaken nudge (notification scaffold): compare my rank between renders.
  const lastRankRef = useRef<number | null>(null);
  useEffect(() => {
    if (!board || !me) return;
    const myEntry = board.entries.find((entry) => entry.isMe);
    if (!myEntry) return;
    const prev = lastRankRef.current;
    lastRankRef.current = myEntry.rank;
    if (prev !== null && myEntry.rank > prev) {
      notify(
        'overtaken',
        'You got passed!',
        `Someone in the family just overtook you in “${board.challenge.name}”. Time for a walk?`,
      ).catch(() => {});
    }
  }, [board, me]);

  if (!challengeId || board === undefined) {
    return (
      <Screen title=" ">
        <Skeleton height={88} />
        <Skeleton height={200} />
      </Screen>
    );
  }

  if (board === null) {
    return (
      <Screen>
        <EmptyState icon="🍂" title="Challenge not found" ctaLabel="Back" onCtaPress={() => router.back()} />
      </Screen>
    );
  }

  const { challenge } = board;
  const joined = board.me?.joined === true;
  const isCreator = me?._id === challenge.createdByUserId;
  const active = challenge.status === 'active';

  const onSyncNow = async () => {
    setSyncing(true);
    const result = await syncChallengeSteps(
      convex,
      { _id: challengeId, startAt: challenge.startAt, endAt: challenge.endAt },
      { force: true },
    );
    setSyncing(false);
    if (result.status === 'synced') {
      toast.success(`Synced — ${result.currentSteps?.toLocaleString()} steps counted.`);
    } else if (result.status === 'no_data') {
      toast.info('No step data found for this window yet.');
    } else if (result.status === 'unavailable') {
      toast.info('Health sync is off or unavailable — check Settings → Health sync.');
    } else {
      toast.error('Sync didn’t go through. Try again in a moment.');
    }
  };

  const onJoin = async () => {
    setBusy(true);
    try {
      await convex.mutation(challengeJoin, { challengeId });
      toast.success("You're in! Steps start counting now. 👟");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not join right now.');
    } finally {
      setBusy(false);
    }
  };

  const onLeave = () => {
    Alert.alert(
      'Leave challenge',
      'Your steps stop counting from now on. What you already contributed stays on the board.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await convex.mutation(challengeLeave, { challengeId });
              toast.info('You left the challenge.');
            } catch {
              toast.error('Could not leave right now.');
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const onCancel = () => {
    Alert.alert(
      'Cancel challenge',
      'This ends the challenge for everyone. The board stays visible as history.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel challenge',
          style: 'destructive',
          onPress: async () => {
            try {
              await convex.mutation(challengeCancel, { challengeId });
              toast.info('Challenge cancelled.');
            } catch {
              toast.error('Could not cancel right now.');
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const onToggleHide = async (hide: boolean) => {
    try {
      await convex.mutation(challengeSetMyVisibility, { challengeId, hideActivity: hide });
      toast.info(hide ? 'You’re hidden from the leaderboard.' : 'You’re back on the leaderboard.');
    } catch {
      toast.error('Could not change visibility.');
    }
  };

  return (
    <Screen
      title={challenge.name}
      subtitle={`${windowLabel(challenge.windowType)} · ${active ? formatTimeRemaining(challenge.endAt, board.serverTime) : challenge.status === 'cancelled' ? 'Cancelled' : 'Finished'} · ${board.participantCount} walking`}
    >
      <Stack.Screen options={{ title: 'Challenge' }} />

      {challenge.status === 'completed' ? (
        <Banner variant="info" message="This challenge has wrapped up — final results below. 🎉" />
      ) : null}

      {/* Team progress (cooperative) */}
      {challenge.type === 'cooperative' && challenge.goal ? (
        <Section label="Team progress">
          <Text style={styles.teamTotal}>
            {board.teamTotal.toLocaleString()}{' '}
            <Text style={styles.teamGoal}>/ {challenge.goal.toLocaleString()} steps</Text>
          </Text>
          <View
            style={styles.progressTrack}
            accessibilityRole="progressbar"
            accessibilityValue={{ now: Math.round(board.goalProgressPct ?? 0), min: 0, max: 100 }}
          >
            <View style={[styles.progressFill, { width: `${board.goalProgressPct ?? 0}%` }]} />
          </View>
          <Text style={styles.progressPct}>
            {(board.goalProgressPct ?? 0).toFixed(1)}% of the way there — together.
          </Text>
        </Section>
      ) : null}

      {/* My row */}
      {joined ? (
        <Section label="You">
          <View style={styles.meRow}>
            <Text style={styles.meSteps}>{(board.me?.steps ?? 0).toLocaleString()} steps</Text>
            <Button
              variant="secondary"
              label="Sync now"
              onPress={onSyncNow}
              loading={syncing}
              accessibilityLabel="Sync my steps now"
            />
          </View>
          <Text style={styles.syncStamp}>
            {board.me?.lastSyncedAt
              ? `Last synced ${new Date(board.me.lastSyncedAt).toLocaleTimeString()}`
              : 'Not synced yet — tap Sync now'}
          </Text>
          <View style={styles.hideRow}>
            <View style={styles.hideCopy}>
              <Text style={styles.hideLabel}>Hide my activity</Text>
              <Text style={styles.hideHelper}>
                Stay invisible on the board; your steps still count for team totals.
              </Text>
            </View>
            <Switch
              value={board.me?.hideActivity === true}
              onValueChange={onToggleHide}
              accessibilityLabel="Hide my activity"
            />
          </View>
        </Section>
      ) : null}

      {/* Leaderboard */}
      <Section label="Leaderboard">
        {board.entries.length === 0 ? (
          <Text style={styles.muted}>No visible steps yet — be the first to sync a walk.</Text>
        ) : (
          board.entries.map((entry) => (
            <View key={entry.userId} style={styles.boardRow}>
              <Text style={styles.boardRank}>
                {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `${entry.rank}.`}
              </Text>
              <Text
                style={[styles.boardName, entry.isMe && styles.boardNameMe]}
                numberOfLines={1}
              >
                {entry.displayName}
                {entry.isMe ? ' (you)' : ''}
                {entry.left ? ' · left' : ''}
              </Text>
              <Text style={styles.boardSteps}>{entry.steps.toLocaleString()}</Text>
            </View>
          ))
        )}
      </Section>

      {/* Actions */}
      {active && !joined && !challenge.inviteOnly ? (
        <Button label="Join this challenge" onPress={onJoin} loading={busy} />
      ) : null}
      {active && !joined && challenge.inviteOnly ? (
        <Banner variant="info" message="This challenge is invite-only — ask its creator to add you." />
      ) : null}
      {active && joined ? (
        <Button variant="secondary" label="Leave challenge" onPress={onLeave} style={styles.leaveButton} />
      ) : null}
      {active && isCreator ? (
        <Button variant="destructive" label="Cancel challenge" onPress={onCancel} style={styles.cancelButton} />
      ) : null}
    </Screen>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    teamTotal: {
      fontSize: 28,
      fontWeight: '600',
      color: t.colors.text,
      fontVariant: ['tabular-nums'],
    },
    teamGoal: {
      fontSize: 16,
      fontWeight: '400',
      color: t.colors.textMuted,
    },
    progressTrack: {
      height: 10,
      borderRadius: 5,
      backgroundColor: t.colors.surfaceMuted,
      overflow: 'hidden',
      marginVertical: t.spacing.sm,
    },
    progressFill: {
      height: '100%',
      borderRadius: 5,
      backgroundColor: t.colors.success,
    },
    progressPct: {
      ...t.typography.helper,
      color: t.colors.textMuted,
    },
    meRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    meSteps: {
      fontSize: 24,
      fontWeight: '600',
      color: t.colors.text,
      fontVariant: ['tabular-nums'],
    },
    syncStamp: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      marginTop: t.spacing.xs,
    },
    hideRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: t.spacing.md,
    },
    hideCopy: {
      flex: 1,
      marginRight: t.spacing.md,
    },
    hideLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    hideHelper: {
      ...t.typography.helper,
      color: t.colors.textMuted,
    },
    muted: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
    },
    boardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.spacing.sm,
    },
    boardRank: {
      width: 34,
      fontSize: 16,
    },
    boardName: {
      ...t.typography.rowLabel,
      color: t.colors.text,
      flex: 1,
    },
    boardNameMe: {
      color: t.colors.primary,
      fontWeight: '600',
    },
    boardSteps: {
      ...t.typography.rowLabel,
      color: t.colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    leaveButton: {
      marginTop: t.spacing.sm,
    },
    cancelButton: {
      marginTop: t.spacing.sm,
    },
  });
}
