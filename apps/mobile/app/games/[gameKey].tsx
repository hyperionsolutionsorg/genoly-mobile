/**
 * Dynamic game route — resolves the registry entry + active tree, then
 * mounts the matching game component (games port, 2026-07-13).
 *
 * Each game implementation lives in components/games/<Game>.tsx and
 * receives GameScreenProps ({ treeId, treeSlug }); the game fetches its
 * own data. Unknown keys render a not-found state rather than crashing
 * on a deep link.
 */

import type { ComponentType } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { EmptyState, Skeleton } from '../../components/ui';
import { useActiveTree } from '../../hooks/useActiveTree';
import { GAME_BY_KEY } from '../../lib/gameRegistry';
import type { GameScreenProps } from '../../components/games/common';
import Wordle from '../../components/games/Wordle';
import WordSearch from '../../components/games/WordSearch';
import AtlasQuiz from '../../components/games/AtlasQuiz';
import GenerationSprint from '../../components/games/GenerationSprint';
import WhoAmI from '../../components/games/WhoAmI';
import ThisOrThat from '../../components/games/ThisOrThat';
import Connections from '../../components/games/Connections';
import TimelineTap from '../../components/games/TimelineTap';
import { useThemedStyles, type Theme } from '../../theme';

const GAME_COMPONENTS: Record<string, ComponentType<GameScreenProps>> = {
  wordle: Wordle,
  'word-search': WordSearch,
  'atlas-quiz': AtlasQuiz,
  sprint: GenerationSprint,
  'who-am-i': WhoAmI,
  'this-or-that': ThisOrThat,
  'family-connections': Connections,
  'timeline-tap': TimelineTap,
};

export default function GameScreen() {
  const styles = useThemedStyles(createStyles);
  const { gameKey } = useLocalSearchParams<{ gameKey: string }>();
  const { activeTree, isLoading } = useActiveTree();

  const game = gameKey ? GAME_BY_KEY.get(gameKey) : undefined;
  const GameComponent = gameKey ? GAME_COMPONENTS[gameKey] : undefined;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: game ? `${game.icon} ${game.name}` : 'Game' }} />
      {!game || !GameComponent ? (
        <EmptyState
          icon="🎮"
          title="Game not found"
          body="This game doesn't exist (yet). Head back to the games hub."
        />
      ) : isLoading ? (
        <View style={styles.loading}>
          <Skeleton height={104} />
          <Skeleton height={280} />
        </View>
      ) : !activeTree ? (
        <EmptyState
          icon="🌳"
          title="No tree yet"
          body="Games are built from your family tree — join or create a tree to start playing."
        />
      ) : (
        <GameComponent treeId={activeTree._id} treeSlug={activeTree.slug ?? activeTree._id} />
      )}
    </View>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.colors.bg,
    },
    loading: {
      padding: t.spacing.lg,
    },
  });
}
