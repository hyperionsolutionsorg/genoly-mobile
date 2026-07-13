/**
 * Generation Sprint — mobile port of src/pages/games/GenerationSprint.tsx
 * (games port, 2026-07-13). Mechanics identical to the web: a 90-second
 * time-attack race up the ancestor chain from a random starting person
 * (anyone with a recorded parent). Each correct parent advances one
 * generation; hitting a person with no recorded parents ends the run at
 * the root. Score = depth² × 100 × time bonus (bonus floored at 0.2),
 * including the web's explicit-depth fix for the stale-closure "root"
 * path (score was always 0 before 2026-06-02). Best score persists at
 * `genoly:sprint:best:${treeId}` in AsyncStorage — same key + number
 * shape as the web's localStorage.
 *
 * Validation is always against the SELECTED person's id being in the
 * focal's parent list — never string equality on the typed text — so
 * "Pavani" matches "Pavani Veeramachaneni" properly.
 *
 * RN adaptations: the web's combobox (arrow keys + Enter + blur-timing
 * hacks) becomes a TextInput with up to 8 tappable suggestion rows
 * rendered inline below it — no dropdown overlay, no focus juggling.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from 'convex/react';
import { useRouter, type Href } from 'expo-router';

import { EmptyState, Skeleton, Button } from '../ui';
import { getRelationshipGraph, type RelationshipGraph } from '../../lib/genolyApi';
import { useThemedStyles, type Theme } from '../../theme';
import { loadGameState, saveGameState, type GameScreenProps } from './common';

const ROUND_SECONDS = 90;
const MAX_SUGGESTIONS = 8;

type Person = RelationshipGraph['persons'][number];

function fullName(p: Person | undefined): string {
  if (!p) return '';
  return p.surname ? `${p.preferredName} ${p.surname}` : p.preferredName;
}

/** Web-identical match normalization — keeps spaces (unlike the word
 *  games' normalizeName) so multi-word queries behave the same. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export default function GenerationSprint({ treeId, treeSlug: _treeSlug }: GameScreenProps) {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const graph = useQuery(getRelationshipGraph, { treeId });

  // Eligible starting people = anyone who has at least one parent recorded
  // (so we have something to race upward from).
  const startCandidates = useMemo(() => {
    if (!graph) return [];
    return graph.persons.filter((p) => (graph.parents[String(p._id)] ?? []).length > 0);
  }, [graph]);

  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [chain, setChain] = useState<Person[]>([]); // including the starting person
  const [done, setDone] = useState<{ reason: 'time' | 'root'; finalScore: number } | null>(null);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'miss' | 'hit'; text: string } | null>(null);

  // Best score per tree — hydrated async (AsyncStorage), refreshed on save.
  const bestKey = `genoly:sprint:best:${treeId}`;
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

  // Tick the clock once per 250ms while running
  useEffect(() => {
    if (!running || startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running, startedAt]);

  function startRound() {
    if (startCandidates.length === 0) return;
    const start = startCandidates[Math.floor(Math.random() * startCandidates.length)];
    setChain([start]);
    setStartedAt(Date.now());
    setNow(Date.now());
    setRunning(true);
    setDone(null);
    setInput('');
    setFeedback(null);
  }

  /**
   * @param explicitDepth — optional depth to score against. REQUIRED when
   * the caller is inside a setTimeout / async callback that holds a stale
   * closure over `chain` (the React state). The "time" path can rely on
   * `chain.length` because it fires synchronously from a render. The
   * "root" path is fired from inside `pick()` after `setChain()`, where
   * `chain` is the PRE-update value — we have to pass the post-update
   * depth in explicitly. (Web bug fixed 2026-06-02 — score was always 0.)
   */
  function endRound(reason: 'time' | 'root', explicitDepth?: number) {
    if (!startedAt) return;
    const elapsed = (Date.now() - startedAt) / 1000;
    const depth = explicitDepth ?? chain.length - 1; // starting person doesn't count
    // Score: depth² × 100 × time bonus (faster = more). Depth ≥ 1 always
    // means a non-zero score because the user did succeed at one generation.
    const timeFraction = Math.max(0.2, 1 - elapsed / ROUND_SECONDS);
    const finalScore = Math.round(depth * depth * 100 * timeFraction);
    setDone({ reason, finalScore });
    setRunning(false);

    // Persist best score per tree — read fresh (like the web reads
    // localStorage inside endRound) so a stale `best` closure can't
    // clobber a higher score.
    void loadGameState<number>(bestKey).then((prev) => {
      if (prev === null || finalScore > Number(prev)) {
        saveGameState(bestKey, finalScore);
        setBest(finalScore);
      }
    });
  }

  // Auto-end when timer runs out. `endRound` is a plain per-render
  // function (same as the web page) — intentionally not a dependency.
  useEffect(() => {
    if (!running || startedAt === null || done) return;
    const elapsed = (now - startedAt) / 1000;
    if (elapsed >= ROUND_SECONDS) endRound('time');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, running, startedAt, done]);

  // Current focal — the most-recently-added link in the chain
  const focal = chain[chain.length - 1];
  const focalParentIds = useMemo(() => {
    if (!graph || !focal) return [] as string[];
    return graph.parents[focal._id] ?? [];
  }, [graph, focal]);

  // Suggestions — up to 8 matches on the normalized typed substring
  const suggestions = useMemo(() => {
    if (!graph || !running) return [];
    const q = normalize(input);
    if (!q) return [];
    return graph.persons.filter((p) => normalize(fullName(p)).includes(q)).slice(0, MAX_SUGGESTIONS);
  }, [graph, input, running]);

  function pick(p: Person) {
    if (!focal) return;
    if (focalParentIds.includes(p._id)) {
      const nextChain = [...chain, p];
      setChain(nextChain);
      setInput('');
      setFeedback({ kind: 'hit', text: `✓ ${fullName(p)} is correct` });
      // If the just-added person has no parents, end the round (we hit the root)
      const nextParents = graph?.parents[p._id] ?? [];
      if (nextParents.length === 0) {
        // Defer end so the user briefly sees the success state. Pass the
        // depth derived from nextChain explicitly — endRound's closure
        // over `chain` is stale by the time the timeout fires.
        const depth = nextChain.length - 1;
        setTimeout(() => endRound('root', depth), 800);
      }
    } else {
      // Clear the input on a wrong pick so the suggestion list collapses
      // and the feedback line is unmissable. Re-typing is a one-key cost.
      setInput('');
      setFeedback({ kind: 'miss', text: `✗ ${fullName(p)} is not a parent of ${fullName(focal)}` });
    }
  }

  if (!graph) {
    return (
      <View style={styles.loading}>
        <Skeleton height={104} />
        <Skeleton height={280} />
      </View>
    );
  }

  if (startCandidates.length === 0) {
    return (
      <EmptyState
        icon="⏱️"
        title="No parent links yet"
        body="Generation Sprint needs at least one parent-child relationship to race up. Add a parent to unlock it."
        ctaLabel="Add a person"
        onCtaPress={() => router.push('/add-person' as unknown as Href)}
      />
    );
  }

  const secondsLeft =
    running && startedAt ? Math.max(0, ROUND_SECONDS - (now - startedAt) / 1000) : ROUND_SECONDS;
  const depth = chain.length - 1;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.subtitle}>
        Race up the tree. {ROUND_SECONDS} seconds. Name each generation's parent before the
        clock runs out.
      </Text>

      <View style={styles.statsRow} accessibilityLabel="Game stats">
        <View style={styles.statsCell}>
          <Text style={styles.statsValue}>{Math.max(0, depth)}</Text>
          <Text style={styles.statsLabel}>Generations</Text>
        </View>
        <View style={styles.statsCell}>
          <Text style={styles.statsValue}>{Math.ceil(secondsLeft)}</Text>
          <Text style={styles.statsLabel}>Seconds left</Text>
        </View>
        <View style={styles.statsCell}>
          <Text style={styles.statsValue}>{best ?? '—'}</Text>
          <Text style={styles.statsLabel}>Best score</Text>
        </View>
      </View>

      {!running && !done ? (
        <Button label="Start Sprint" onPress={startRound} style={styles.actionButton} />
      ) : null}

      {done ? (
        <Text
          style={[styles.message, done.reason === 'root' && styles.messageWin]}
          accessibilityLiveRegion="polite"
        >
          {done.reason === 'root'
            ? `You reached the root in ${depth} generations! Score: ${done.finalScore}`
            : `Time! ${depth} generations · Score: ${done.finalScore}`}
        </Text>
      ) : null}
      {done ? (
        <>
          <Button label="Try again" onPress={startRound} style={styles.actionButton} />
          <Button
            label="Back to games"
            variant="secondary"
            onPress={() => router.back()}
            style={styles.actionButton}
          />
        </>
      ) : null}

      {running && focal ? (
        <View style={styles.stage}>
          <Text style={styles.stageLabel}>Current generation</Text>
          <Text style={styles.stageName}>{fullName(focal)}</Text>
          <Text style={styles.stagePrompt}>Who is their parent?</Text>

          {/* Feedback rendered ABOVE the input (web parity) so the
              suggestion list below can never obscure it. */}
          {feedback ? (
            <Text
              style={[
                styles.feedback,
                feedback.kind === 'hit' ? styles.feedbackHit : styles.feedbackMiss,
              ]}
              accessibilityLiveRegion="polite"
            >
              {feedback.text}
            </Text>
          ) : null}

          <TextInput
            style={styles.input}
            value={input}
            placeholder="Type a parent's name…"
            placeholderTextColor={styles.placeholder.color}
            onChangeText={(text) => {
              setInput(text);
              setFeedback(null);
            }}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Parent name"
          />
          {suggestions.length > 0 ? (
            <View style={styles.suggestionList} accessibilityRole="list">
              {suggestions.map((p) => (
                <TouchableOpacity
                  key={p._id}
                  style={styles.suggestionRow}
                  onPress={() => pick(p)}
                  accessibilityRole="button"
                  accessibilityLabel={fullName(p)}
                >
                  <Text style={styles.suggestionText}>{fullName(p)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {chain.length > 0 ? (
        <View style={styles.chain} accessibilityLabel="Chain of generations">
          {chain.map((p, i) => (
            <View key={`${p._id}-${i}`} style={styles.chainLink}>
              <Text style={styles.chainLinkText}>{fullName(p)}</Text>
            </View>
          ))}
        </View>
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
    statsRow: {
      flexDirection: 'row',
      marginBottom: t.spacing.lg,
    },
    statsCell: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.md,
      marginHorizontal: t.spacing.xs,
    },
    statsValue: {
      ...t.typography.screenTitle,
      fontSize: 22,
      color: t.colors.text,
    },
    statsLabel: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      marginTop: t.spacing.xs,
    },
    actionButton: {
      alignSelf: 'stretch',
      marginBottom: t.spacing.md,
    },
    message: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      textAlign: 'center',
      marginBottom: t.spacing.md,
    },
    messageWin: {
      color: t.colors.success,
    },
    stage: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
      marginBottom: t.spacing.lg,
    },
    stageLabel: {
      ...t.typography.sectionHeader,
      color: t.colors.textMuted,
      marginBottom: t.spacing.xs,
    },
    stageName: {
      ...t.typography.screenTitle,
      fontSize: 24,
      color: t.colors.text,
      marginBottom: t.spacing.sm,
    },
    stagePrompt: {
      ...t.typography.body,
      color: t.colors.textMuted,
      marginBottom: t.spacing.md,
    },
    feedback: {
      ...t.typography.cardDescription,
      fontWeight: '600',
      marginBottom: t.spacing.sm,
    },
    feedbackHit: {
      color: t.colors.success,
    },
    feedbackMiss: {
      color: t.colors.danger,
    },
    input: {
      ...t.typography.input,
      color: t.colors.text,
      backgroundColor: t.colors.bgElevated,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.md,
    },
    placeholder: {
      color: t.colors.textMuted,
    },
    suggestionList: {
      marginTop: t.spacing.sm,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.bgElevated,
      overflow: 'hidden',
    },
    suggestionRow: {
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    suggestionText: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    chain: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    chainLink: {
      backgroundColor: t.colors.surfaceMuted,
      borderRadius: t.radius.sm,
      paddingHorizontal: t.spacing.sm,
      paddingVertical: t.spacing.xs,
      margin: t.spacing.xs,
    },
    chainLinkText: {
      ...t.typography.cardDescription,
      color: t.colors.text,
    },
  });
}
