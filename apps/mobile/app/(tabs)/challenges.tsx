/**
 * Challenges — the family walking challenges hub (wave H2).
 *
 * Sections:
 *   - My active challenges (across all my trees) — progress + tap to open
 *   - This tree's challenges (active → join; past → archive)
 *   - Create CTA
 *
 * On mount: best-effort step sync into every joined active challenge
 * (throttled to 15 min per challenge in lib/challengeSync).
 */

import { StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useConvex, useQuery } from 'convex/react';

import {
  listMyActiveChallenges,
  listTreeChallenges,
  challengeJoin,
  type ChallengeSummary,
} from '../../lib/genolyApi';
import { syncAllJoinedChallenges } from '../../lib/challengeSync';
import { useActiveTree } from '../../hooks/useActiveTree';
import { useThemedStyles, type Theme } from '../../theme';
import { Screen, Section, Card, Button, EmptyState, Skeleton, toast } from '../../components/ui';

const CREATE_ROUTE = '/challenge-create' as unknown as Href;

export function formatTimeRemaining(endAt: number, now: number = Date.now()): string {
  const ms = endAt - now;
  if (ms <= 0) return 'Ended';
  const hours = Math.ceil(ms / 3_600_000);
  if (hours <= 36) return `${hours}h left`;
  return `${Math.ceil(ms / 86_400_000)} days left`;
}

export function windowLabel(windowType: ChallengeSummary['windowType']): string {
  return windowType === 'daily' ? 'Daily' : windowType === 'weekly' ? 'Weekly' : 'Monthly';
}

export default function ChallengesScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();
  const { activeTree, isLoading: treeLoading } = useActiveTree();

  const mine = useQuery(listMyActiveChallenges, {});
  const treeChallenges = useQuery(
    listTreeChallenges,
    activeTree ? { treeId: activeTree._id } : ('skip' as const),
  );

  // One sync pass per hub visit (throttled per challenge inside).
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current || !mine || mine.length === 0) return;
    syncedRef.current = true;
    syncAllJoinedChallenges(convex, mine).catch(() => {});
  }, [mine, convex]);

  const openChallenge = (challengeId: string) => {
    router.push(`/challenge/${challengeId}` as unknown as Href);
  };

  const onJoin = async (challengeId: string) => {
    try {
      await convex.mutation(challengeJoin, { challengeId });
      toast.success("You're in! Steps start counting now. 👟");
      openChallenge(challengeId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not join right now.');
    }
  };

  if (treeLoading || mine === undefined) {
    return (
      <Screen title="Challenges">
        <Skeleton height={88} />
        <Skeleton height={88} />
        <Skeleton height={88} />
      </Screen>
    );
  }

  const treeActive = (treeChallenges ?? []).filter((c) => c.status === 'active');
  const treePast = (treeChallenges ?? []).filter((c) => c.status !== 'active');
  const nothingAnywhere = mine.length === 0 && treeActive.length === 0;

  return (
    <Screen title="Challenges" subtitle={activeTree?.name}>
      {nothingAnywhere ? (
        <EmptyState
          icon="👟"
          title="Walk with your family"
          body="Pool steps toward a team goal, or race your cousins to the top. Steps sync from your phone's health app — only for challenges you join."
          ctaLabel="Create the first challenge"
          onCtaPress={() => router.push(CREATE_ROUTE)}
        />
      ) : (
        <>
          {mine.length > 0 ? (
            <Section label="My challenges">
              {mine.map((challenge) => (
                <Card
                  key={challenge._id}
                  title={challenge.name}
                  description={`${challenge.treeName} · ${windowLabel(challenge.windowType)} · ${formatTimeRemaining(challenge.endAt)} · ${challenge.mySteps.toLocaleString()} steps`}
                  onPress={() => openChallenge(challenge._id)}
                  accessibilityLabel={`Open challenge ${challenge.name}`}
                />
              ))}
            </Section>
          ) : null}

          <Section label={activeTree ? `${activeTree.name} challenges` : 'Tree challenges'}>
            {treeChallenges === undefined ? (
              <Skeleton height={64} />
            ) : treeActive.length === 0 ? (
              <Text style={styles.muted}>
                No active challenges on this tree — start one and rally the family.
              </Text>
            ) : (
              treeActive.map((challenge) => (
                <View key={challenge._id} style={styles.treeRow}>
                  <Card
                    title={challenge.name}
                    description={`${windowLabel(challenge.windowType)} · ${formatTimeRemaining(challenge.endAt)}${challenge.type === 'cooperative' && challenge.goal ? ` · team goal ${challenge.goal.toLocaleString()}` : ''}`}
                    onPress={() => openChallenge(challenge._id)}
                    accessibilityLabel={`Open challenge ${challenge.name}`}
                    style={styles.treeCard}
                  />
                  {!challenge.joined && !challenge.inviteOnly ? (
                    <Button
                      variant="secondary"
                      label="Join"
                      onPress={() => onJoin(challenge._id)}
                      accessibilityLabel={`Join ${challenge.name}`}
                      style={styles.joinButton}
                    />
                  ) : null}
                </View>
              ))
            )}
          </Section>

          {treePast.length > 0 ? (
            <Section label="Past challenges">
              {treePast.slice(0, 10).map((challenge) => (
                <Card
                  key={challenge._id}
                  title={challenge.name}
                  description={`${windowLabel(challenge.windowType)} · ${challenge.status === 'cancelled' ? 'Cancelled' : 'Finished'}`}
                  onPress={() => openChallenge(challenge._id)}
                  accessibilityLabel={`Open past challenge ${challenge.name}`}
                />
              ))}
            </Section>
          ) : null}

          <Button label="Create a challenge" onPress={() => router.push(CREATE_ROUTE)} />
        </>
      )}
    </Screen>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    muted: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
    },
    treeRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    treeCard: {
      flex: 1,
    },
    joinButton: {
      marginLeft: t.spacing.sm,
      marginBottom: t.spacing.sm,
    },
  });
}
