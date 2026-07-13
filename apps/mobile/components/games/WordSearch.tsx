/**
 * Family Word Search — mobile port of src/pages/games/WordSearch.tsx
 * (games port, 2026-07-13). Mechanics identical to the web: 15×15 grid,
 * up to 12 family names (preferredName + surname, 3-15 letters, live
 * placement in 8 directions), two-tap selection (start cell, then end
 * cell on a straight line), forwards-or-backwards matching, and a
 * per-tree best time (`genoly:wordsearch:best:${treeId}` in
 * AsyncStorage — same key + number shape as the web's localStorage).
 *
 * The weekly seed matches the web exactly
 * (`${floor(now / 7 days)}|${treeId}` through the same mulberry32 PRNG),
 * so web + mobile players hunt the SAME grid in the same 7-day window.
 *
 * RN adaptations: no mouse-hover line preview (the web highlights the
 * prospective line while hovering) — the first-tapped cell stays
 * highlighted until the second tap; the timer starts on the first tap
 * instead of page mount (mobile mounts can sit unseen behind
 * navigation); cell size is computed from the measured board width.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from 'convex/react';
import { useRouter, type Href } from 'expo-router';

import { EmptyState, Skeleton, Button } from '../ui';
import { listAllPersonsByTree } from '../../lib/genolyApi';
import { useThemedStyles, spacing, type Theme } from '../../theme';
import {
  loadGameState,
  saveGameState,
  normalizeName,
  type GameScreenProps,
} from './common';

const GRID = 15;
const MAX_WORDS = 12;
const DIRECTIONS: Array<[number, number]> = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [1, 1], [-1, -1], [1, -1], [-1, 1],
];

/** Mulberry32 — deterministic small PRNG seeded from a string (web-identical). */
function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (const ch of seed) {
    h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PlacedWord {
  word: string;
  row: number;
  col: number;
  dr: number;
  dc: number;
}

/**
 * Builds the puzzle — 80 placement attempts per word, shorter words
 * first, leftover cells filled with random letters. Ported verbatim so
 * the same seed yields the same grid as the web.
 */
function buildPuzzle(rawNames: string[], seed: string) {
  const rand = seededRng(seed);
  const shuffled = [...rawNames].sort(() => rand() - 0.5);
  const grid: string[][] = Array.from({ length: GRID }, () => Array(GRID).fill(''));
  const placed: PlacedWord[] = [];

  function tryPlace(word: string): boolean {
    if (word.length > GRID) return false;
    for (let attempt = 0; attempt < 80; attempt++) {
      const [dr, dc] = DIRECTIONS[Math.floor(rand() * DIRECTIONS.length)];
      const maxRow = dr === 0 ? GRID : dr > 0 ? GRID - word.length : word.length - 1;
      const minRow = dr === 0 ? 0 : dr > 0 ? 0 : word.length - 1;
      const maxCol = dc === 0 ? GRID : dc > 0 ? GRID - word.length : word.length - 1;
      const minCol = dc === 0 ? 0 : dc > 0 ? 0 : word.length - 1;
      const r0 = minRow + Math.floor(rand() * (maxRow - minRow));
      const c0 = minCol + Math.floor(rand() * (maxCol - minCol));
      let ok = true;
      for (let i = 0; i < word.length; i++) {
        const r = r0 + dr * i;
        const c = c0 + dc * i;
        if (r < 0 || r >= GRID || c < 0 || c >= GRID) { ok = false; break; }
        if (grid[r][c] !== '' && grid[r][c] !== word[i]) { ok = false; break; }
      }
      if (!ok) continue;
      for (let i = 0; i < word.length; i++) {
        grid[r0 + dr * i][c0 + dc * i] = word[i];
      }
      placed.push({ word, row: r0, col: c0, dr, dc });
      return true;
    }
    return false;
  }

  // Deduplicate, prefer shorter first (easier to place), cap at MAX_WORDS
  const unique = Array.from(new Set(shuffled.filter((w) => w.length >= 3 && w.length <= GRID)));
  unique.sort((a, b) => a.length - b.length);
  for (const w of unique) {
    if (placed.length >= MAX_WORDS) break;
    tryPlace(w);
  }

  // Fill empties with random letters
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (grid[r][c] === '') {
        grid[r][c] = ALPHA[Math.floor(rand() * 26)];
      }
    }
  }

  return { grid, placed };
}

/** Returns the cells between two endpoints (inclusive) if they lie on a
 *  straight line in one of the 8 directions; otherwise null. */
function cellsBetween(
  start: [number, number],
  end: [number, number],
): Array<[number, number]> | null {
  const [r0, c0] = start;
  const [r1, c1] = end;
  const dr = r1 - r0;
  const dc = c1 - c0;
  const len = Math.max(Math.abs(dr), Math.abs(dc));
  if (len === 0) return null;
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const stepR = Math.sign(dr);
  const stepC = Math.sign(dc);
  const cells: Array<[number, number]> = [];
  for (let i = 0; i <= len; i++) {
    cells.push([r0 + stepR * i, c0 + stepC * i]);
  }
  return cells;
}

/** Week-stable stamp: floor(now / 7 days) — same for everyone this window. */
function weekStamp(): string {
  return String(Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)));
}

export default function WordSearch({ treeId, treeSlug: _treeSlug }: GameScreenProps) {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const persons = useQuery(listAllPersonsByTree, { treeId });

  const puzzle = useMemo(() => {
    if (!persons) return null;
    const names: string[] = [];
    for (const p of persons) {
      if (p.archivedAt) continue;
      const n = normalizeName(p.preferredName).toUpperCase();
      if (n.length >= 3 && n.length <= GRID) names.push(n);
      if (p.surname) {
        const s = normalizeName(p.surname).toUpperCase();
        if (s.length >= 3 && s.length <= GRID) names.push(s);
      }
    }
    if (names.length === 0) return null;
    const seed = `${weekStamp()}|${treeId}`;
    return buildPuzzle(names, seed);
  }, [persons, treeId]);

  const [start, setStart] = useState<[number, number] | null>(null);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [foundCells, setFoundCells] = useState<Set<string>>(new Set());
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [completedAt, setCompletedAt] = useState<number | null>(null);
  const [boardWidth, setBoardWidth] = useState(
    () => Dimensions.get('window').width - spacing.lg * 2,
  );

  // Best time stored per-tree (same key + shape as the web's localStorage).
  const bestKey = `genoly:wordsearch:best:${treeId}`;
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadGameState<number>(bestKey).then((b) => {
      if (!cancelled && b !== null) setBest(Number(b));
    });
    return () => {
      cancelled = true;
    };
  }, [bestKey]);
  useEffect(() => {
    if (completedAt === null || startedAt === null) return;
    const elapsed = completedAt - startedAt;
    if (best === null || elapsed < best) {
      setBest(elapsed);
      saveGameState(bestKey, elapsed);
    }
  }, [completedAt, startedAt, best, bestKey]);

  function handleCellTap(r: number, c: number) {
    if (!puzzle || completedAt) return;
    if (startedAt === null) setStartedAt(Date.now());
    if (start === null) {
      setStart([r, c]);
      return;
    }
    const cells = cellsBetween(start, [r, c]);
    if (!cells) {
      // Invalid line — restart selection at the new cell.
      setStart([r, c]);
      return;
    }
    const word = cells.map(([rr, cc]) => puzzle.grid[rr][cc]).join('');
    const reverseWord = word.split('').reverse().join('');
    const match = puzzle.placed.find(
      (p) =>
        !foundWords.includes(p.word) &&
        (p.word === word || p.word === reverseWord),
    );
    if (match) {
      const next = [...foundWords, match.word];
      setFoundWords(next);
      const updated = new Set(foundCells);
      for (const [rr, cc] of cells) updated.add(`${rr},${cc}`);
      setFoundCells(updated);
      if (next.length >= puzzle.placed.length) {
        setCompletedAt(Date.now());
      }
    }
    setStart(null);
  }

  if (!persons) {
    return (
      <View style={styles.loading}>
        <Skeleton height={104} />
        <Skeleton height={280} />
      </View>
    );
  }

  if (!puzzle || puzzle.placed.length === 0) {
    return (
      <EmptyState
        icon="🔎"
        title="Not enough names yet"
        body="Add at least 4 people with 3-letter-or-longer names to unlock this puzzle."
        ctaLabel="Add a person"
        onCtaPress={() => router.push('/add-person' as unknown as Href)}
      />
    );
  }

  const cellSize = Math.max(1, Math.floor(boardWidth / GRID));
  const letterSize = Math.max(10, Math.floor(cellSize * 0.55));
  const allFound = foundWords.length >= puzzle.placed.length;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.subtitle}>
        Tap a starting letter, then tap the ending letter to mark a word. Words run in any of
        the 8 directions, forwards or backwards.
      </Text>

      <View
        style={styles.gridWrap}
        onLayout={(e) => setBoardWidth(e.nativeEvent.layout.width)}
        accessibilityLabel="Word search grid"
      >
        {puzzle.grid.map((row, r) => (
          <View key={r} style={styles.gridRow}>
            {row.map((letter, c) => {
              const k = `${r},${c}`;
              const isFound = foundCells.has(k);
              const isStart = !isFound && start !== null && start[0] === r && start[1] === c;
              return (
                <TouchableOpacity
                  key={k}
                  style={[
                    styles.cell,
                    { width: cellSize, height: cellSize },
                    isStart && styles.cellSelecting,
                    isFound && styles.cellFound,
                  ]}
                  onPress={() => handleCellTap(r, c)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`Cell ${r},${c} letter ${letter}`}
                >
                  <Text
                    style={[
                      styles.cellLetter,
                      { fontSize: letterSize },
                      (isStart || isFound) && styles.cellLetterMarked,
                    ]}
                  >
                    {letter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <Text style={styles.wordsTitle}>
        Find ({foundWords.length}/{puzzle.placed.length})
      </Text>
      <View style={styles.wordList} accessibilityLabel="Words to find">
        {puzzle.placed.map((p) => {
          const isFound = foundWords.includes(p.word);
          return (
            <View key={p.word} style={[styles.wordChip, isFound && styles.wordChipFound]}>
              <Text style={[styles.wordChipText, isFound && styles.wordChipTextFound]}>
                {p.word}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={[styles.stats, allFound && styles.statsWin]}>
        {allFound && completedAt !== null && startedAt !== null
          ? `✅ Solved in ${Math.round((completedAt - startedAt) / 1000)}s${
              best !== null ? ` · Best ${Math.round(best / 1000)}s` : ''
            }`
          : best !== null
            ? `Best time: ${Math.round(best / 1000)}s`
            : 'Find all words to log a time'}
      </Text>

      {allFound ? (
        <Button
          label="Back to games"
          variant="secondary"
          onPress={() => router.back()}
          style={styles.doneButton}
        />
      ) : null}
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
    subtitle: {
      ...t.typography.subtitle,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginBottom: t.spacing.lg,
    },
    gridWrap: {
      alignSelf: 'stretch',
      marginBottom: t.spacing.lg,
    },
    gridRow: {
      flexDirection: 'row',
    },
    cell: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    cellSelecting: {
      backgroundColor: t.colors.primary,
      borderColor: t.colors.primary,
    },
    cellFound: {
      // Same "solved" green as Wordle's hit tiles — game-semantic constant.
      backgroundColor: '#22c55e',
      borderColor: '#22c55e',
    },
    cellLetter: {
      color: t.colors.text,
      fontWeight: '600',
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    },
    cellLetterMarked: {
      color: '#ffffff',
    },
    wordsTitle: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      marginBottom: t.spacing.sm,
    },
    wordList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: t.spacing.md,
    },
    wordChip: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.surface,
      paddingHorizontal: t.spacing.sm,
      paddingVertical: t.spacing.xs,
      marginRight: t.spacing.sm,
      marginBottom: t.spacing.sm,
    },
    wordChipFound: {
      backgroundColor: t.colors.surfaceMuted,
    },
    wordChipText: {
      ...t.typography.cardDescription,
      color: t.colors.text,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    wordChipTextFound: {
      color: t.colors.textMuted,
      textDecorationLine: 'line-through',
    },
    stats: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      textAlign: 'center',
    },
    statsWin: {
      color: t.colors.success,
      fontWeight: '600',
    },
    doneButton: {
      marginTop: t.spacing.lg,
      alignSelf: 'stretch',
    },
  });
}
