/**
 * Games hub — mobile mirror of the web /tree/:slug/games hub (games
 * port, 2026-07-13).
 *
 * Flat multi-category model (W1 2026-07-06): one section per non-empty
 * category in GAME_CATEGORY_ORDER; a game tagged with N categories
 * appears in N sections; a single-select chip strip filters to one
 * category. Card lock state comes from games.getGamesContext via
 * checkPlayable() — locked cards show what's missing instead of
 * navigating.
 *
 * IA: pushed screen (from the Home "Games" section), not a 6th tab.
 * Inherits the app-wide Pro-tenant gate from AuthGate; the games
 * backend itself is viewer-level (no extra gating here).
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQuery } from 'convex/react';

import { Card, EmptyState, Section, Skeleton } from '../../components/ui';
import { useActiveTree } from '../../hooks/useActiveTree';
import { getGamesContext } from '../../lib/genolyApi';
import {
  GAME_CATEGORY_META,
  GAMES,
  checkPlayable,
  gamesByCategory,
  pickTodaysGame,
  type GameCategory,
} from '../../lib/gameRegistry';
import { useThemedStyles, type Theme } from '../../theme';

export default function GamesHubScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { activeTree, isLoading: treeLoading } = useActiveTree();
  const [filter, setFilter] = useState<GameCategory | null>(null);

  const ctx = useQuery(
    getGamesContext,
    activeTree ? { treeId: activeTree._id } : ('skip' as const),
  );

  if (treeLoading || (activeTree && ctx === undefined)) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Skeleton height={44} />
        <Skeleton height={104} />
        <Skeleton height={104} />
        <Skeleton height={104} />
      </ScrollView>
    );
  }

  if (!activeTree) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="No tree yet"
          body="Games are built from your family tree — join or create a tree to start playing."
        />
      </View>
    );
  }

  const sections = gamesByCategory(GAMES).filter(
    (section) => filter === null || section.category === filter,
  );
  const nonEmptyCategories = gamesByCategory(GAMES).map((s) => s.category);
  const todaysPick = pickTodaysGame();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Filter strip — single-select chips, "All" resets. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipStrip}>
        <Chip
          styles={styles}
          label="All"
          active={filter === null}
          onPress={() => setFilter(null)}
        />
        {nonEmptyCategories.map((category) => (
          <Chip
            key={category}
            styles={styles}
            label={`${GAME_CATEGORY_META[category].icon} ${GAME_CATEGORY_META[category].label}`}
            active={filter === category}
            onPress={() => setFilter(filter === category ? null : category)}
          />
        ))}
      </ScrollView>

      {sections.map(({ category, games }) => (
        <Section
          key={category}
          label={`${GAME_CATEGORY_META[category].icon} ${GAME_CATEGORY_META[category].label}`}
        >
          {games.map((game) => {
            const lockReason = ctx ? checkPlayable(game, ctx) : null;
            const isToday = game.key === todaysPick.key;
            if (lockReason) {
              return (
                <View key={`${category}:${game.key}`} style={styles.lockedCard}>
                  <Text style={styles.lockedTitle}>
                    {game.icon} {game.name} 🔒
                  </Text>
                  <Text style={styles.lockedReason}>{lockReason}</Text>
                </View>
              );
            }
            return (
              <Card
                key={`${category}:${game.key}`}
                title={`${game.icon} ${game.name}${isToday ? '  ⭐ Today' : ''}`}
                description={`${game.description} · ~${game.playTimeMin} min`}
                onPress={() => router.push(`/games/${game.key}` as unknown as Href)}
                accessibilityLabel={`Play ${game.name}`}
              />
            );
          })}
        </Section>
      ))}
    </ScrollView>
  );
}

type Styles = ReturnType<typeof createStyles>;

function Chip({
  styles,
  label,
  active,
  onPress,
}: {
  styles: Styles;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      padding: t.spacing.lg,
      paddingBottom: t.spacing.xxl,
      backgroundColor: t.colors.bg,
      flexGrow: 1,
    },
    chipStrip: {
      marginBottom: t.spacing.lg,
      flexGrow: 0,
    },
    chip: {
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.sm,
      borderRadius: 999,
      backgroundColor: t.colors.surface,
      marginRight: t.spacing.sm,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    chipActive: {
      backgroundColor: t.colors.primary,
      borderColor: t.colors.primary,
    },
    chipLabel: {
      ...t.typography.cardDescription,
      color: t.colors.text,
    },
    chipLabelActive: {
      color: t.colors.onPrimary,
    },
    lockedCard: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.sm,
      padding: t.spacing.lg,
      marginBottom: t.spacing.sm,
      opacity: 0.6,
    },
    lockedTitle: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      marginBottom: t.spacing.xs,
    },
    lockedReason: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
    },
  });
}
