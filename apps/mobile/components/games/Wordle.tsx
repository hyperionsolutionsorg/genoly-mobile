/**
 * Family Wordle — mobile port of src/pages/games/Wordle.tsx (games port,
 * 2026-07-13). Mechanics identical to the web: 6 attempts at a daily
 * hidden first name (4-8 letters, live persons), two-pass hit/present/
 * miss scoring with letter consumption, per-letter keyboard state as the
 * best across guesses, and a localStorage-compatible daily streak
 * (`genoly:wordle:streak:${treeId}` in AsyncStorage — same key + shape,
 * same continuation rules).
 *
 * The daily word hash matches the web exactly (`${YYYY-MM-DD}|${treeId}`
 * via the shared hashString), so web + mobile players guess the SAME
 * name on the same day.
 *
 * RN adaptations: no physical-keyboard listener (on-screen keys only);
 * CSS grid board → flex rows.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from 'convex/react';
import { useRouter, type Href } from 'expo-router';

import { EmptyState, Skeleton, Button } from '../ui';
import { listAllPersonsByTree } from '../../lib/genolyApi';
import { useThemedStyles, type Theme } from '../../theme';
import {
  loadGameState,
  saveGameState,
  normalizeName,
  hashString,
  type GameScreenProps,
} from './common';

const MAX_ATTEMPTS = 6;
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

type LetterState = 'hit' | 'present' | 'miss';

interface DailyStreakState {
  date: string;
  streak: number;
  bestStreak: number;
  lastResult: 'win' | 'lose' | 'in-progress';
}

const EMPTY_STREAK: DailyStreakState = { date: '', streak: 0, bestStreak: 0, lastResult: 'in-progress' };

/** Same daily pick as the web: hash(`${today}|${treeId}`) % candidates. */
function pickDailyWord(candidates: string[], treeId: string): string | null {
  if (candidates.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  return candidates[hashString(`${today}|${treeId}`) % candidates.length];
}

/** Two-pass scoring with letter consumption — identical to the web. */
export function scoreGuess(guess: string, target: string): LetterState[] {
  const states: LetterState[] = Array(guess.length).fill('miss');
  const remaining: Record<string, number> = {};
  for (let i = 0; i < target.length; i++) {
    if (guess[i] === target[i]) {
      states[i] = 'hit';
    } else {
      remaining[target[i]] = (remaining[target[i]] ?? 0) + 1;
    }
  }
  for (let i = 0; i < guess.length; i++) {
    if (states[i] === 'hit') continue;
    const ch = guess[i];
    if (remaining[ch]) {
      states[i] = 'present';
      remaining[ch] -= 1;
    }
  }
  return states;
}

export default function Wordle({ treeId }: GameScreenProps) {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const persons = useQuery(listAllPersonsByTree, { treeId });

  const target = useMemo(() => {
    if (!persons) return null;
    const candidates = persons
      .filter((p) => !p.archivedAt)
      .map((p) => normalizeName(p.preferredName))
      .filter((n) => n.length >= 4 && n.length <= 8);
    return pickDailyWord(candidates, treeId);
  }, [persons, treeId]);

  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [message, setMessage] = useState<{ kind: 'win' | 'lose' | 'info'; text: string } | null>(null);
  const [streak, setStreak] = useState<DailyStreakState>(EMPTY_STREAK);

  const streakKey = `genoly:wordle:streak:${treeId}`;

  useEffect(() => {
    let cancelled = false;
    loadGameState<DailyStreakState>(streakKey).then((s) => {
      if (!cancelled && s) setStreak(s);
    });
    return () => {
      cancelled = true;
    };
  }, [streakKey]);

  const targetLen = target?.length ?? 0;
  const won = target !== null && guesses[guesses.length - 1] === target;
  const lost = !won && guesses.length >= MAX_ATTEMPTS;
  const finished = won || lost;

  const keyboardState = useMemo(() => {
    const out: Record<string, LetterState> = {};
    if (!target) return out;
    for (const g of guesses) {
      const states = scoreGuess(g, target);
      for (let i = 0; i < g.length; i++) {
        const prev = out[g[i]];
        const next = states[i];
        if (prev === 'hit') continue;
        if (prev === 'present' && next === 'miss') continue;
        out[g[i]] = next;
      }
    }
    return out;
  }, [guesses, target]);

  const submitGuess = useCallback(() => {
    if (!target || finished) return;
    if (current.length !== targetLen) {
      setMessage({ kind: 'info', text: `Guess must be ${targetLen} letters` });
      return;
    }
    const nextGuesses = [...guesses, current];
    setGuesses(nextGuesses);
    setCurrent('');

    const isWin = current === target;
    const isLose = !isWin && nextGuesses.length >= MAX_ATTEMPTS;
    if (isWin || isLose) {
      const today = new Date().toISOString().slice(0, 10);
      if (streak.date !== today) {
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        const continuing = isWin && streak.date === yesterday && streak.lastResult === 'win';
        const newStreak = isWin ? (continuing ? streak.streak + 1 : 1) : 0;
        const next: DailyStreakState = {
          date: today,
          streak: newStreak,
          bestStreak: Math.max(streak.bestStreak, newStreak),
          lastResult: isWin ? 'win' : 'lose',
        };
        setStreak(next);
        saveGameState(streakKey, next);
      }
      setMessage(
        isWin
          ? { kind: 'win', text: `Solved in ${nextGuesses.length} ${nextGuesses.length === 1 ? 'try' : 'tries'}!` }
          : { kind: 'lose', text: `The word was ${target.toUpperCase()}` },
      );
    } else {
      setMessage(null);
    }
  }, [current, target, finished, guesses, targetLen, streak, streakKey]);

  const pressKey = (letter: string) => {
    if (finished || !target) return;
    if (letter === 'ENTER') {
      submitGuess();
      return;
    }
    if (letter === 'BACK') {
      setCurrent((c) => c.slice(0, -1));
      return;
    }
    if (current.length < targetLen) setCurrent((c) => c + letter);
  };

  if (!persons) {
    return (
      <View style={styles.loading}>
        <Skeleton height={104} />
        <Skeleton height={280} />
      </View>
    );
  }

  if (!target) {
    return (
      <EmptyState
        icon="🟩"
        title="No playable names yet"
        body="Family Wordle needs at least one person with a 4-8 letter first name. Add more family to unlock it."
        ctaLabel="Add a person"
        onCtaPress={() => router.push('/add-person' as unknown as Href)}
      />
    );
  }

  // Board rows: submitted guesses, then the in-progress row, then blanks.
  const rows: Array<{ letters: string; states: LetterState[] | null; active: boolean }> = [];
  for (const g of guesses) {
    rows.push({ letters: g, states: scoreGuess(g, target), active: false });
  }
  if (!finished && rows.length < MAX_ATTEMPTS) {
    rows.push({ letters: current, states: null, active: true });
  }
  while (rows.length < MAX_ATTEMPTS) {
    rows.push({ letters: '', states: null, active: false });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.subtitle}>
        Guess today's family first name — {targetLen} letters, {MAX_ATTEMPTS} tries.
      </Text>
      <Text style={styles.streakLine}>
        🔥 Streak {streak.streak} · Best {streak.bestStreak}
      </Text>

      <View style={styles.board} accessibilityLabel="Wordle board">
        {rows.map((row, r) => (
          <View key={r} style={styles.boardRow}>
            {Array.from({ length: targetLen }).map((_, c) => {
              const letter = row.letters[c] ?? '';
              const state = row.states?.[c] ?? null;
              return (
                <View
                  key={c}
                  style={[
                    styles.cell,
                    state === 'hit' && styles.cellHit,
                    state === 'present' && styles.cellPresent,
                    state === 'miss' && styles.cellMiss,
                  ]}
                >
                  <Text style={[styles.cellLetter, state !== null && styles.cellLetterScored]}>
                    {letter.toUpperCase()}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {message ? (
        <Text
          style={[
            styles.message,
            message.kind === 'win' && styles.messageWin,
            message.kind === 'lose' && styles.messageLose,
          ]}
        >
          {message.text}
        </Text>
      ) : null}

      <View style={styles.keyboard}>
        {KEY_ROWS.map((rowLetters, i) => (
          <View key={i} style={styles.keyRow}>
            {i === 2 ? (
              <Key styles={styles} label="ENTER" wide onPress={() => pressKey('ENTER')} />
            ) : null}
            {rowLetters.split('').map((letter) => (
              <Key
                key={letter}
                styles={styles}
                label={letter.toUpperCase()}
                state={keyboardState[letter]}
                onPress={() => pressKey(letter)}
              />
            ))}
            {i === 2 ? (
              <Key styles={styles} label="⌫" wide onPress={() => pressKey('BACK')} />
            ) : null}
          </View>
        ))}
      </View>

      {finished ? (
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

type Styles = ReturnType<typeof createStyles>;

function Key({
  styles,
  label,
  state,
  wide,
  onPress,
}: {
  styles: Styles;
  label: string;
  state?: LetterState;
  wide?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.key,
        wide && styles.keyWide,
        state === 'hit' && styles.cellHit,
        state === 'present' && styles.cellPresent,
        state === 'miss' && styles.keyMiss,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === '⌫' ? 'Backspace' : label}
    >
      <Text style={[styles.keyLabel, state && state !== 'miss' && styles.cellLetterScored]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      padding: t.spacing.lg,
      paddingBottom: t.spacing.xxl,
      alignItems: 'center',
    },
    loading: {
      padding: t.spacing.lg,
    },
    subtitle: {
      ...t.typography.subtitle,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginBottom: t.spacing.sm,
    },
    streakLine: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      marginBottom: t.spacing.lg,
    },
    board: {
      marginBottom: t.spacing.lg,
    },
    boardRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: t.spacing.xs,
    },
    cell: {
      width: 40,
      height: 40,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      marginHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.surface,
    },
    cellHit: {
      backgroundColor: '#22c55e',
      borderColor: '#22c55e',
    },
    cellPresent: {
      backgroundColor: '#eab308',
      borderColor: '#eab308',
    },
    cellMiss: {
      backgroundColor: t.colors.textMuted,
      borderColor: t.colors.textMuted,
    },
    cellLetter: {
      ...t.typography.cardTitle,
      color: t.colors.text,
    },
    cellLetterScored: {
      color: '#ffffff',
    },
    message: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      marginBottom: t.spacing.md,
      textAlign: 'center',
    },
    messageWin: {
      color: t.colors.success,
    },
    messageLose: {
      color: t.colors.danger,
    },
    keyboard: {
      alignSelf: 'stretch',
    },
    keyRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: t.spacing.xs,
    },
    key: {
      minWidth: 30,
      height: 44,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 1.5,
      paddingHorizontal: 4,
    },
    keyWide: {
      minWidth: 48,
    },
    keyMiss: {
      backgroundColor: t.colors.border,
      borderColor: t.colors.border,
    },
    keyLabel: {
      ...t.typography.cardDescription,
      color: t.colors.text,
      fontWeight: '600',
    },
    doneButton: {
      marginTop: t.spacing.lg,
      alignSelf: 'stretch',
    },
  });
}
