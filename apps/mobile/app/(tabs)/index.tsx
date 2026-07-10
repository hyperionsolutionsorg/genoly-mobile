/**
 * Home — the member dashboard (wave C4).
 *
 * Widgets (mirroring the web /dashboard):
 *   - Welcome-back banner (visit streak ≥ 3)
 *   - Streaks tile (🔥 contribution + 👋 visit)
 *   - Rewards summary (badges earned, active quests, top quest progress)
 *   - Today's Pick (client-side daily rotation — zero server reads)
 *   - Top 3 this week (treeLeaderboardCache read — zero recompute cost)
 *   - Today in your family (anniversaries, 14-day window)
 * Identity banners from C2 (demo / admin-on-mobile / verify email) stay.
 *
 * Bandwidth: one subscription per widget, all small indexed reads or
 * cached tables; the visit-streak credit is gated to once per UTC day.
 */

import { Linking, StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useConvex, useQuery } from 'convex/react';

import { Screen, EmptyState, Banner, Skeleton, Card, Section, Button, toast } from '../../components/ui';
import { useMe } from '../../hooks/useMe';
import { useActiveTree } from '../../hooks/useActiveTree';
import { useRecordVisit } from '../../hooks/useRecordVisit';
import {
  sendVerificationEmailToMe,
  getMyRewardsSummary,
  getTreeLeaderboard,
  getUpcomingAnniversaries,
} from '../../lib/genolyApi';
import { pickTodaysGame } from '../../lib/gameRegistry';
import { medalFor, annivEmoji, annivTitle, annivWhen } from '../../lib/dashboardFormat';
import { useThemedStyles, type Theme } from '../../theme';

const WELCOME_ROUTE = '/welcome' as unknown as Href;
const TREE_TAB_ROUTE = '/(tabs)/tree' as unknown as Href;

export default function HomeScreen() {
  const convex = useConvex();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { me, isLoading, isDemo, isAdminOnMobile, emailUnverified } = useMe();
  const { activeTree, trees, isLoading: treeLoading } = useActiveTree();

  useRecordVisit(Boolean(me));

  // First-run onboarding mirror of web: dashboard hands brand-new members
  // to the /welcome wizard until users.onboardingCompletedAt is stamped.
  useEffect(() => {
    if (me && !me.onboardingCompletedAt && !isDemo) {
      router.replace(WELCOME_ROUTE);
    }
  }, [me, isDemo, router]);

  const treeArgs = activeTree ? { treeId: activeTree._id } : ('skip' as const);
  const rewards = useQuery(getMyRewardsSummary, treeArgs);
  const leaderboard = useQuery(getTreeLeaderboard, treeArgs);
  const anniversaries = useQuery(
    getUpcomingAnniversaries,
    activeTree ? { treeId: activeTree._id, windowDays: 14 } : ('skip' as const),
  );

  const firstName = me?.fullName?.trim().split(/\s+/)[0];
  const visitStreak = rewards?.visitStreak ?? me?.visitDays ?? 0;
  const contributionStreak = rewards?.contributionStreak ?? me?.streakDays ?? 0;
  const todaysPick = pickTodaysGame();

  const onResendVerification = async () => {
    try {
      const result = await convex.mutation(sendVerificationEmailToMe, {});
      if (result.sent) {
        toast.success('Verification email sent — check your inbox.');
      } else {
        toast.info('A verification email was sent recently. Give it a minute.');
      }
    } catch {
      toast.error('Could not send the verification email. Try again soon.');
    }
  };

  if (isLoading || treeLoading) {
    return (
      <Screen title="Home">
        <Skeleton height={72} />
        <Skeleton height={104} />
        <Skeleton height={104} />
        <Skeleton height={140} />
      </Screen>
    );
  }

  return (
    <Screen
      title={firstName ? `Welcome, ${firstName}` : 'Home'}
      subtitle={activeTree ? activeTree.name : 'Your family, every day'}
    >
      {isDemo ? (
        <Banner
          variant="info"
          message="You're exploring the Genoly demo. Everything here resets automatically — play freely!"
        />
      ) : null}
      {isAdminOnMobile ? (
        <Banner
          variant="info"
          message="Admin tools live on the web. Open genoly.org to access them — everything member-side works right here."
          actionLabel="Open genoly.org"
          onAction={() => {
            Linking.openURL('https://genoly.org').catch(() => {});
          }}
        />
      ) : null}
      {emailUnverified && !isDemo ? (
        <Banner
          variant="warning"
          message="Please verify your email — tap the link we sent you. Some features stay limited until then."
          actionLabel="Resend email"
          onAction={onResendVerification}
        />
      ) : null}
      {visitStreak >= 3 ? (
        <Banner
          variant="success"
          message={`Welcome back! That's ${visitStreak} days in a row — your family missed you. 👋`}
        />
      ) : null}

      {trees && trees.length === 0 ? (
        <EmptyState
          icon="🌳"
          title="Plant your first tree"
          body="Your family's story starts with one name — yours."
          ctaLabel="Start now"
          onCtaPress={() => router.push(WELCOME_ROUTE)}
        />
      ) : (
        <>
          {/* Streaks */}
          <Section label="Streaks">
            <View style={styles.streakRow}>
              <StreakTile
                styles={styles}
                emoji="🔥"
                value={contributionStreak}
                label="Contribution"
              />
              <View style={styles.streakDivider} />
              <StreakTile styles={styles} emoji="👋" value={visitStreak} label="Visits" />
            </View>
          </Section>

          {/* Rewards summary */}
          <Section label="Rewards">
            {rewards === undefined ? (
              <Skeleton height={64} />
            ) : (
              <>
                <View style={styles.rewardsRow}>
                  <Text style={styles.rewardsStat}>
                    🏅 {rewards.earnedBadges}/{rewards.totalBadges} badges
                  </Text>
                  <Text style={styles.rewardsStat}>
                    🗺️ {rewards.activeQuestCount}/{rewards.activeQuestMax} quests
                  </Text>
                </View>
                {rewards.topQuest ? (
                  <View style={styles.questBlock}>
                    <Text style={styles.questName}>{rewards.topQuest.name}</Text>
                    <ProgressBar
                      styles={styles}
                      progress={rewards.topQuest.progress}
                      target={rewards.topQuest.target}
                    />
                    <Text style={styles.questProgressLabel}>
                      {rewards.topQuest.progress} of {rewards.topQuest.target}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.mutedNote}>
                    New quests are waiting on your tree's Rewards page.
                  </Text>
                )}
              </>
            )}
          </Section>

          {/* Today's pick */}
          <Section label="Today's pick">
            <Card
              title={`${todaysPick.emoji} ${todaysPick.name}`}
              description={`${todaysPick.blurb} · ~${todaysPick.minutes} min`}
              onPress={() => {
                toast.info('Games are coming to mobile soon — play today’s pick on genoly.org!');
              }}
              accessibilityLabel={`Today's pick: ${todaysPick.name}`}
            />
          </Section>

          {/* Top 3 this week */}
          <Section label="Top 3 this week">
            {leaderboard === undefined ? (
              <Skeleton height={96} />
            ) : leaderboard === null || leaderboard.topQuestsThisWeek.length === 0 ? (
              <Text style={styles.mutedNote}>
                No quest activity yet this week — be the first on the board!
              </Text>
            ) : (
              leaderboard.topQuestsThisWeek.slice(0, 3).map((entry) => (
                <View key={entry.userId} style={styles.leaderRow}>
                  <Text style={styles.leaderRank}>{medalFor(entry.rank)}</Text>
                  <Text
                    style={[styles.leaderName, entry.userId === me?._id && styles.leaderNameSelf]}
                    numberOfLines={1}
                  >
                    {entry.displayName}
                    {entry.userId === me?._id ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.leaderScore}>{entry.score}</Text>
                </View>
              ))
            )}
          </Section>

          {/* Anniversaries */}
          <Section label="Today in your family">
            {anniversaries === undefined ? (
              <Skeleton height={64} />
            ) : anniversaries.length === 0 ? (
              <Text style={styles.mutedNote}>
                No birthdays or anniversaries in the next two weeks.
              </Text>
            ) : (
              anniversaries.slice(0, 4).map((item, index) => (
                <View
                  key={`${item.kind}-${item.personId ?? item.familyId ?? index}`}
                  style={styles.annivRow}
                >
                  <Text accessibilityElementsHidden style={styles.annivIcon}>
                    {annivEmoji(item)}
                  </Text>
                  <View style={styles.annivCopy}>
                    <Text style={styles.annivTitle} numberOfLines={1}>
                      {annivTitle(item)}
                    </Text>
                    <Text style={styles.annivWhen}>{annivWhen(item)}</Text>
                  </View>
                </View>
              ))
            )}
          </Section>

          <Button
            variant="secondary"
            label="Explore your tree"
            onPress={() => router.push(TREE_TAB_ROUTE)}
          />
        </>
      )}
    </Screen>
  );
}

// ── Widget sub-components ─────────────────────────────────────────────

type Styles = ReturnType<typeof createStyles>;

function StreakTile({
  styles,
  emoji,
  value,
  label,
}: {
  styles: Styles;
  emoji: string;
  value: number;
  label: string;
}) {
  return (
    <View style={styles.streakTile}>
      <Text accessibilityElementsHidden style={styles.streakEmoji}>
        {emoji}
      </Text>
      <Text
        style={styles.streakValue}
        accessibilityLabel={`${label} streak: ${value} day${value === 1 ? '' : 's'}`}
      >
        {value}
      </Text>
      <Text style={styles.streakLabel}>{label}</Text>
    </View>
  );
}

function ProgressBar({
  styles,
  progress,
  target,
}: {
  styles: Styles;
  progress: number;
  target: number;
}) {
  const pct = target > 0 ? Math.min(100, (progress / target) * 100) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct}%` }]} />
    </View>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    streakRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    streakTile: {
      flex: 1,
      alignItems: 'center',
    },
    streakDivider: {
      width: 1,
      alignSelf: 'stretch',
      backgroundColor: t.colors.border,
    },
    streakEmoji: {
      fontSize: 22,
    },
    streakValue: {
      fontSize: 28,
      fontWeight: '600',
      color: t.colors.text,
      fontVariant: ['tabular-nums'],
    },
    streakLabel: {
      ...t.typography.helper,
      color: t.colors.textMuted,
    },
    rewardsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: t.spacing.sm,
    },
    rewardsStat: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    questBlock: {
      marginTop: t.spacing.xs,
    },
    questName: {
      ...t.typography.cardDescription,
      color: t.colors.text,
      marginBottom: t.spacing.xs,
    },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: t.colors.surfaceMuted,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 4,
      backgroundColor: t.colors.primary,
    },
    questProgressLabel: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      marginTop: t.spacing.xs,
    },
    mutedNote: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
    },
    leaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.spacing.sm,
    },
    leaderRank: {
      width: 32,
      fontSize: 16,
    },
    leaderName: {
      ...t.typography.rowLabel,
      color: t.colors.text,
      flex: 1,
    },
    leaderNameSelf: {
      color: t.colors.primary,
      fontWeight: '600',
    },
    leaderScore: {
      ...t.typography.rowLabel,
      color: t.colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    annivRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.spacing.sm,
    },
    annivIcon: {
      fontSize: 20,
      marginRight: t.spacing.md,
    },
    annivCopy: {
      flex: 1,
    },
    annivTitle: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    annivWhen: {
      ...t.typography.helper,
      color: t.colors.textMuted,
    },
  });
}
