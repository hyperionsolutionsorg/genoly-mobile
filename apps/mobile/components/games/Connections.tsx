/**
 * Family Connections — mobile port of src/pages/games/Connections.tsx
 * (games port, 2026-07-13). NYT-Connections over REAL family members:
 * 16 tiles / 4 hidden groups (3×3 fallback for smaller trees), daily-
 * seeded by `${dateUTC}|${treeSlug}|family-connections` via the shared
 * lib/dailySeed.ts + lib/connectionsPuzzle.ts — web and mobile players
 * get the SAME board on the same day.
 *
 * Daily-idempotent like the web: the finished day persists as a self-
 * contained snapshot under the web-compatible key
 * `genoly:family-connections:daily:${treeId}`; revisiting shows the
 * result panel (no replay until the next UTC day). Personal best
 * (fewest mistakes on a solved day) at `genoly:...:best:${treeId}`.
 * Finishing fires ONE best-effort recordDailyCompletion (score =
 * 100×groups solved + 10×guesses left; perfect = solved w/ 0 mistakes),
 * guarded by the same snapshot; errors console.warn.
 *
 * RN adaptations: CSS grid → chunked flex rows (remaining tiles are
 * always a multiple of groupSize, so rows chunk cleanly); wrong-guess
 * shake → a 400ms danger-colour flash on the selected tiles;
 * clipboard copy → the native share sheet (Share.share); tree name in
 * the share header → treeSlug (the tree name isn't in GameScreenProps).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useConvex, useQuery } from 'convex/react';
import { useRouter, type Href } from 'expo-router';

import { Button, EmptyState, Skeleton } from '../ui';
import {
  getAtlasData,
  getDailySocialStats,
  getRelationshipGraph,
  recordDailyCompletion,
} from '../../lib/genolyApi';
import { createSeededRng, dailySeedKey, seededShuffle, todayUTC } from '../../lib/dailySeed';
import {
  buildConnectionsPersons,
  buildDailyPuzzle,
  buildShareGrid,
  evaluateGuess,
  GROUP_EMOJI,
  MIN_PERSONS_3X3,
  MIN_PERSONS_4X4,
  type ConnectionsPuzzle,
  type ConnectionsTier,
} from '../../lib/connectionsPuzzle';
import { useThemedStyles, type Theme } from '../../theme';
import { loadGameState, saveGameState, type GameScreenProps } from './common';

const GAME_KEY = 'family-connections';
const MAX_MISTAKES = 4;
/** Device-wide (not per tree): has this player ever seen the how-to? */
const HOWTO_SEEN_KEY = 'genoly:family-connections:howto-seen';

/** Solved-group band colours — the web's games.css band tokens
 *  (warning / success / info / primary fallbacks), game-semantic. */
const BAND_COLORS = ['#b45309', '#047857', '#0369a1', '#2563eb'] as const;
/** 16% tint of a band colour (the web's color-mix band background). */
const bandTint = (hex: string) => `${hex}29`;

/** A group as shown on the result panel — self-contained snapshot. */
interface ResultGroup {
  label: string;
  tiles: string[];
  /** Band colour index (0–3) from the original puzzle. */
  bandIndex: number;
  /** True when the player found it (vs revealed at game over). */
  solved: boolean;
}

/** Finished-day state — persisted so the day can't be replayed. */
interface DailyState {
  date: string; // YYYY-MM-DD (UTC)
  tier: ConnectionsTier;
  status: 'won' | 'lost';
  mistakes: number;
  /** Solved groups first (in solve order), then revealed ones. */
  groups: ResultGroup[];
  /** Group index per tile per guess — rebuilds the emoji share grid. */
  guessRows: number[][];
}

function sortedGuessKey(tiles: string[]): string {
  return [...tiles].sort().join('|');
}

/** Solved groups first (in solve order), then revealed ones. */
function buildResultGroups(puzzle: ConnectionsPuzzle, solved: number[]): ResultGroup[] {
  return [
    ...solved,
    ...puzzle.groups.map((_, i) => i).filter((i) => !solved.includes(i)),
  ].map((gi) => ({
    label: puzzle.groups[gi].label,
    tiles: puzzle.groups[gi].tiles,
    bandIndex: gi,
    solved: solved.includes(gi),
  }));
}

/** Module-scoped first-visit decision — same rationale as the web: the
 *  mount effect both writes and reads the seen-flag, so deciding once
 *  per app session pins remounts to the same answer. */
let howtoSeenBeforeThisSession: boolean | null = null;

type Styles = ReturnType<typeof createStyles>;

/** "How to play" collapsible — expanded on the very first visit only;
 *  the first open writes the device-wide seen flag. */
function HowToPlay({ styles, groupSize }: { styles: Styles; groupSize: number }) {
  const [open, setOpen] = useState(
    howtoSeenBeforeThisSession === null ? true : !howtoSeenBeforeThisSession,
  );
  useEffect(() => {
    if (howtoSeenBeforeThisSession !== null) return;
    let cancelled = false;
    loadGameState<boolean>(HOWTO_SEEN_KEY).then((seen) => {
      howtoSeenBeforeThisSession = seen === true;
      if (!howtoSeenBeforeThisSession) void saveGameState(HOWTO_SEEN_KEY, true);
      if (!cancelled && howtoSeenBeforeThisSession) setOpen(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const bullets = [
    `Tap ${groupSize === 3 ? '3' : '4'} names, then Submit to check`,
    'Right: the group locks in and reveals its category',
    `Wrong: you lose one of your 4 guesses ("One away!" means ${groupSize === 3 ? '2 of 3' : '3 of 4'} were right)`,
    'Categories range from obvious (born in the same decade) to sneaky (first names all the same length)',
    "Tip: save your last guess for the group you're least sure about",
  ];

  return (
    <View style={styles.howto}>
      <TouchableOpacity
        style={styles.howtoToggle}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.howtoToggleText}>How to play</Text>
        <Text style={styles.howtoChevron}>{open ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {open ? (
        <View style={styles.howtoList}>
          {bullets.map((b, i) => (
            <Text key={i} style={styles.howtoItem}>
              {'•'} {b}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function Connections({ treeId, treeSlug }: GameScreenProps) {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();

  // The two reads This or That already makes — no new server code.
  const graph = useQuery(getRelationshipGraph, { treeId });
  const atlas = useQuery(getAtlasData, { treeId });

  // The UTC day is fixed at mount — a session crossing midnight keeps
  // its board until remount, which beats the board mutating mid-game.
  const [today] = useState(() => todayUTC());

  const persons = useMemo(() => {
    if (!graph || !atlas) return null;
    return buildConnectionsPersons({
      persons: graph.persons,
      parents: graph.parents,
      children: graph.children,
      spouses: graph.spouses,
      // AtlasPersonTime has birthYear as an OPTIONAL property; the lib
      // wants it present (number | undefined) — re-shape without
      // touching the shared lib.
      personsTime: atlas.personsTime.map((p) => ({
        personId: p.personId,
        birthYear: p.birthYear,
      })),
    });
  }, [graph, atlas]);

  // null = the tree can't seat a fair board → empty state below.
  const puzzle: ConnectionsPuzzle | null = useMemo(() => {
    if (!persons) return null;
    return buildDailyPuzzle(dailySeedKey(today, treeSlug, GAME_KEY), persons);
  }, [persons, treeSlug, today]);

  // ── Daily-idempotent persistence + personal best (async hydrate) ──
  const dailyKey = `genoly:${GAME_KEY}:daily:${treeId}`;
  const bestKey = `genoly:${GAME_KEY}:best:${treeId}`;
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState<DailyState | null>(null);
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadGameState<DailyState>(dailyKey), loadGameState<number>(bestKey)]).then(
      ([saved, savedBest]) => {
        if (cancelled) return;
        if (saved && saved.date === today) setRestored(saved);
        if (typeof savedBest === 'number') setBest(savedBest);
        setHydrated(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dailyKey, bestKey, today]);

  // ── Live game state ──
  const [selected, setSelected] = useState<string[]>([]);
  const [solved, setSolved] = useState<number[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [guessRows, setGuessRows] = useState<number[][]>([]);
  const [wrongGuesses, setWrongGuesses] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  // RN adaptation of the web's shake: flash the selected tiles danger.
  const [flashing, setFlashing] = useState(false);
  // Shuffle re-deals the board cosmetically (seeded counter, like web).
  const [shuffleCount, setShuffleCount] = useState(0);
  const boardTiles = useMemo(() => {
    if (!puzzle) return [];
    if (shuffleCount === 0) return puzzle.tiles;
    return seededShuffle([...puzzle.tiles], createSeededRng(`${today}|shuffle|${shuffleCount}`));
  }, [puzzle, shuffleCount, today]);

  const groupSize = puzzle?.groupSize ?? 4;
  const won = puzzle !== null && solved.length === puzzle.groups.length;
  const lost = mistakes >= MAX_MISTAKES;
  const finished = won || lost;

  // Social stats — skipped until a result panel is actually on screen.
  const resultDay = restored ? restored.date : finished ? today : null;
  const social = useQuery(
    getDailySocialStats,
    resultDay ? { treeId, gameKey: GAME_KEY, dayUTC: resultDay } : 'skip',
  );

  // Persist the finished day exactly once + record the completion.
  // The ref guards the double-fire in-session; the stored-date re-check
  // guards remounts that raced the restore hydrate.
  const completionFiredRef = useRef(false);
  useEffect(() => {
    if (!finished || !puzzle || restored || completionFiredRef.current) return;
    completionFiredRef.current = true;
    const state: DailyState = {
      date: today,
      tier: puzzle.tier,
      status: won ? 'won' : 'lost',
      mistakes,
      groups: buildResultGroups(puzzle, solved),
      guessRows,
    };
    void (async () => {
      const existing = await loadGameState<DailyState>(dailyKey);
      if (existing && existing.date === today) return; // already consumed
      await saveGameState(dailyKey, state);
      // Score: any solve outranks any loss; cleaner solves outrank
      // sloppier ones. Best-effort — the game stays playable client-side.
      const score = solved.length * 100 + (MAX_MISTAKES - mistakes) * 10;
      try {
        await convex.mutation(recordDailyCompletion, {
          treeId,
          gameKey: GAME_KEY,
          score,
          perfect: won && mistakes === 0,
        });
      } catch (err) {
        console.warn('recordDailyCompletion failed (result stays local):', err);
      }
    })();
    // Personal best = fewest mistakes on a SOLVED day.
    if (won && (best === null || mistakes < best)) {
      setBest(mistakes);
      void saveGameState(bestKey, mistakes);
    }
  }, [finished, puzzle, restored, today, won, mistakes, solved, guessRows, best, dailyKey, bestKey, treeId, convex]);

  // Clear the danger flash after the animation window.
  useEffect(() => {
    if (!flashing) return;
    const t = setTimeout(() => setFlashing(false), 400);
    return () => clearTimeout(t);
  }, [flashing]);

  if (!graph || !atlas || !persons || !hydrated) {
    return (
      <View style={styles.loading}>
        <Skeleton height={104} />
        <Skeleton height={280} />
      </View>
    );
  }

  // ── Empty state — tree can't seat a fair board (two variants, per web) ──
  if (!puzzle && !restored) {
    const short = persons.length < MIN_PERSONS_3X3;
    return (
      <EmptyState
        icon="🟨"
        title="Not enough family yet"
        body={
          short
            ? `Family Connections builds its daily puzzle from the people in this tree, and it needs at least ${MIN_PERSONS_3X3} family members to lay out a fair board (${MIN_PERSONS_4X4} unlocks the full-size puzzle). Add a few more relatives to start playing.`
            : 'This tree has people, but not enough variety for a fair puzzle today — groups are built from details like birth years, surnames, and generations. Add more relatives (or fill in birth dates) and the board will appear.'
        }
        ctaLabel="Add a family member"
        onCtaPress={() => router.push('/add-person' as unknown as Href)}
      />
    );
  }

  // ── Finished view (fresh finish or restored from earlier today) ──
  const finalState: DailyState | null = restored
    ? restored
    : finished && puzzle
      ? {
          date: today,
          tier: puzzle.tier,
          status: won ? 'won' : 'lost',
          mistakes,
          groups: buildResultGroups(puzzle, solved),
          guessRows,
        }
      : null;

  if (finalState) {
    const solvedCount = finalState.groups.filter((g) => g.solved).length;
    const totalGroups = finalState.groups.length;
    const shareText =
      `Family Connections · ${treeSlug} · ${finalState.date}\n` +
      `${finalState.status === 'won' ? `Solved with ${finalState.mistakes} ${finalState.mistakes === 1 ? 'mistake' : 'mistakes'}` : `${solvedCount}/${totalGroups} groups found`}\n` +
      buildShareGrid(finalState.guessRows);

    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.subtitle}>
          {finalState.status === 'won'
            ? finalState.mistakes === 0
              ? 'Flawless — every group on the first try!'
              : `Solved today's puzzle with ${finalState.mistakes} ${finalState.mistakes === 1 ? 'mistake' : 'mistakes'}.`
            : "Out of guesses today — here's how the groups fit together."}{' '}
          A new puzzle arrives at midnight UTC.
        </Text>

        {social && social.treeCompletions > 0 ? (
          <Text style={styles.socialLine}>
            {social.treeCompletions >= 2
              ? `${social.treeCompletions} people in your family solved today's puzzle`
              : "You're the first in your family to finish today's puzzle"}
            {social.treeCompletions >= 3 && social.myRankByScore !== null
              ? ` · You're #${social.myRankByScore} of ${social.treeCompletions} by score today`
              : ''}
          </Text>
        ) : null}

        <View style={styles.bands}>
          {finalState.groups.map((group) => (
            <View
              key={group.bandIndex}
              style={[
                styles.band,
                {
                  backgroundColor: bandTint(BAND_COLORS[group.bandIndex]),
                  borderColor: BAND_COLORS[group.bandIndex],
                },
              ]}
            >
              <Text style={styles.bandLabel}>
                {GROUP_EMOJI[group.bandIndex]} {group.label}
                {!group.solved ? <Text style={styles.bandRevealed}> · revealed</Text> : null}
              </Text>
              <Text style={styles.bandTiles}>{group.tiles.join(' · ')}</Text>
            </View>
          ))}
        </View>

        {finalState.guessRows.length > 0 ? (
          <View
            style={styles.shareGrid}
            accessibilityLabel={`Result grid: ${finalState.guessRows.length} ${finalState.guessRows.length === 1 ? 'guess' : 'guesses'}`}
          >
            {finalState.guessRows.map((row, i) => (
              <Text key={i} style={styles.shareRow}>
                {row.map((g) => GROUP_EMOJI[g] ?? '⬜').join('')}
              </Text>
            ))}
          </View>
        ) : null}

        {best !== null ? (
          <Text style={styles.bestLine}>
            Personal best: {best} {best === 1 ? 'mistake' : 'mistakes'}
          </Text>
        ) : null}

        <Button
          label="Share result"
          onPress={() => {
            Share.share({ message: shareText }).catch(() => {
              /* user dismissed the sheet / share unavailable — ignore */
            });
          }}
          style={styles.stretchButton}
        />
        <Button
          label="Back to games"
          variant="secondary"
          onPress={() => router.back()}
          style={styles.stretchButton}
        />
      </ScrollView>
    );
  }

  // finalState is null past here, so puzzle is non-null (the empty state
  // returned when both were missing) — narrow for TS.
  if (!puzzle) return null;

  // ── Playing view ──
  const solvedTiles = new Set(solved.flatMap((gi) => puzzle.groups[gi].tiles));
  const remaining = boardTiles.filter((t) => !solvedTiles.has(t));
  // Remaining count is always a multiple of groupSize — chunk into rows.
  const tileRows: string[][] = [];
  for (let i = 0; i < remaining.length; i += groupSize) {
    tileRows.push(remaining.slice(i, i + groupSize));
  }

  const toggleTile = (tile: string) => {
    setMessage(null);
    setSelected((sel) =>
      sel.includes(tile)
        ? sel.filter((t) => t !== tile)
        : sel.length < groupSize
          ? [...sel, tile]
          : sel,
    );
  };

  const submitGuess = () => {
    if (selected.length !== groupSize) return;
    const guessKey = sortedGuessKey(selected);
    if (wrongGuesses.has(guessKey)) {
      setMessage(`Already guessed — try a different ${groupSize === 3 ? 'three' : 'four'}.`);
      return;
    }
    const result = evaluateGuess(puzzle, selected);
    if (result.solvedGroupIndex !== null) {
      const gi = result.solvedGroupIndex;
      setSolved((s) => [...s, gi]);
      setGuessRows((rows) => [...rows, result.row]);
      setSelected([]);
      setMessage(
        solved.length + 1 === puzzle.groups.length
          ? `Correct — ${puzzle.groups[gi].label}. That's the puzzle!`
          : `Correct — ${puzzle.groups[gi].label}.`,
      );
    } else {
      setWrongGuesses((s) => new Set(s).add(guessKey));
      setGuessRows((rows) => [...rows, result.row]);
      setMistakes((m) => m + 1);
      setFlashing(true);
      const left = MAX_MISTAKES - (mistakes + 1);
      setMessage(
        result.oneAway
          ? `One away! ${left} ${left === 1 ? 'guess' : 'guesses'} left.`
          : left > 0
            ? `Not a group. ${left} ${left === 1 ? 'guess' : 'guesses'} left.`
            : 'Out of guesses.',
      );
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.introHook}>
        {groupSize === 3
          ? 'Nine relatives. Three hidden things they share.'
          : 'Sixteen relatives. Four hidden things they share.'}
      </Text>
      <Text style={styles.subtitle}>
        Tap {groupSize === 3 ? 'three' : 'four'} who belong together, then submit to check your
        hunch. A new puzzle grows from your tree every day at midnight UTC.
        {best !== null ? ` · Best: ${best} ${best === 1 ? 'mistake' : 'mistakes'}` : ''}
      </Text>

      <HowToPlay styles={styles} groupSize={groupSize} />

      {puzzle.tier === '3x3' ? (
        <Text style={styles.tierNote}>
          Smaller tree, smaller board — today's puzzle is 3 groups of 3. The full 4×4 board
          unlocks at {MIN_PERSONS_4X4} family members.
        </Text>
      ) : null}

      {solved.length > 0 ? (
        <View style={styles.bands}>
          {solved.map((gi) => (
            <View
              key={puzzle.groups[gi].id}
              style={[
                styles.band,
                { backgroundColor: bandTint(BAND_COLORS[gi]), borderColor: BAND_COLORS[gi] },
              ]}
            >
              <Text style={styles.bandLabel}>
                {GROUP_EMOJI[gi]} {puzzle.groups[gi].label}
              </Text>
              <Text style={styles.bandTiles}>{puzzle.groups[gi].tiles.join(' · ')}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.grid} accessibilityLabel="Puzzle tiles">
        {tileRows.map((row, r) => (
          <View key={r} style={styles.gridRow}>
            {row.map((tile) => {
              const isSelected = selected.includes(tile);
              return (
                <TouchableOpacity
                  key={tile}
                  style={[
                    styles.tile,
                    isSelected && styles.tileSelected,
                    isSelected && flashing && styles.tileFlash,
                  ]}
                  onPress={() => toggleTile(tile)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    style={[styles.tileLabel, isSelected && styles.tileLabelSelected]}
                    numberOfLines={2}
                  >
                    {tile}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <Text style={styles.message} accessibilityLiveRegion="polite">
        {message ?? ' '}
      </Text>

      <View
        style={styles.mistakesRow}
        accessibilityLabel={`Mistakes remaining: ${MAX_MISTAKES - mistakes} of ${MAX_MISTAKES}`}
      >
        <Text style={styles.mistakesLabel}>Mistakes remaining</Text>
        {Array.from({ length: MAX_MISTAKES }).map((_, i) => (
          <View key={i} style={[styles.dot, i < MAX_MISTAKES - mistakes && styles.dotLeft]} />
        ))}
      </View>

      <View style={styles.actionsRow}>
        <Button
          label="Shuffle"
          variant="secondary"
          onPress={() => setShuffleCount((c) => c + 1)}
          style={styles.actionButton}
        />
        <Button
          label="Deselect"
          variant="secondary"
          onPress={() => setSelected([])}
          disabled={selected.length === 0}
          style={styles.actionButton}
        />
        <Button
          label="Submit"
          onPress={submitGuess}
          disabled={selected.length !== groupSize}
          style={styles.actionButton}
        />
      </View>
    </ScrollView>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      padding: t.spacing.lg,
      paddingBottom: t.spacing.xxl,
    },
    loading: {
      padding: t.spacing.lg,
    },
    introHook: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      textAlign: 'center',
      marginBottom: t.spacing.xs,
    },
    subtitle: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginBottom: t.spacing.md,
    },
    socialLine: {
      ...t.typography.cardDescription,
      color: t.colors.info,
      textAlign: 'center',
      marginBottom: t.spacing.md,
    },
    howto: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.surface,
      marginBottom: t.spacing.md,
    },
    howtoToggle: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
    },
    howtoToggleText: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    howtoChevron: {
      ...t.typography.rowLabel,
      color: t.colors.textMuted,
    },
    howtoList: {
      paddingHorizontal: t.spacing.lg,
      paddingBottom: t.spacing.md,
    },
    howtoItem: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      marginBottom: t.spacing.xs,
    },
    tierNote: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      textAlign: 'center',
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.surfaceMuted,
      padding: t.spacing.sm,
      marginBottom: t.spacing.md,
    },
    bands: {
      marginBottom: t.spacing.sm,
    },
    band: {
      borderRadius: t.radius.sm,
      borderWidth: 1,
      padding: t.spacing.md,
      marginBottom: t.spacing.sm,
      alignItems: 'center',
    },
    bandLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
      fontWeight: '700',
      textAlign: 'center',
    },
    bandRevealed: {
      fontWeight: '400',
      fontStyle: 'italic',
      color: t.colors.textMuted,
    },
    bandTiles: {
      ...t.typography.cardDescription,
      color: t.colors.text,
      textAlign: 'center',
      marginTop: 2,
    },
    grid: {
      marginBottom: t.spacing.sm,
    },
    gridRow: {
      flexDirection: 'row',
      marginBottom: t.spacing.sm,
      marginHorizontal: -t.spacing.xs / 2,
    },
    tile: {
      flex: 1,
      minHeight: 64,
      marginHorizontal: t.spacing.xs / 2,
      borderWidth: 2,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: t.spacing.xs,
      paddingVertical: t.spacing.xs,
    },
    tileSelected: {
      backgroundColor: t.colors.text,
      borderColor: t.colors.text,
    },
    tileFlash: {
      backgroundColor: t.colors.danger,
      borderColor: t.colors.danger,
    },
    tileLabel: {
      ...t.typography.cardDescription,
      color: t.colors.text,
      fontWeight: '600',
      textAlign: 'center',
    },
    tileLabelSelected: {
      color: t.colors.bg,
    },
    message: {
      ...t.typography.cardDescription,
      color: t.colors.text,
      fontWeight: '600',
      textAlign: 'center',
      minHeight: 20,
      marginBottom: t.spacing.sm,
    },
    mistakesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: t.spacing.md,
    },
    mistakesLabel: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      marginRight: t.spacing.sm,
    },
    dot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: t.colors.border,
      marginHorizontal: 3,
    },
    dotLeft: {
      backgroundColor: t.colors.primary,
    },
    actionsRow: {
      flexDirection: 'row',
      marginHorizontal: -t.spacing.xs / 2,
    },
    actionButton: {
      flex: 1,
      marginHorizontal: t.spacing.xs / 2,
    },
    shareGrid: {
      alignItems: 'center',
      marginVertical: t.spacing.md,
    },
    shareRow: {
      fontSize: 22,
      lineHeight: 30,
      letterSpacing: 2,
    },
    bestLine: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginBottom: t.spacing.md,
    },
    stretchButton: {
      alignSelf: 'stretch',
      marginTop: t.spacing.sm,
    },
  });
}
