/**
 * Who Am I? — mobile port of src/pages/games/WhoAmI.tsx (games port,
 * 2026-07-13). Mechanics identical to the web: 5 rounds, each a 4-card
 * lineup of live persons with one secret target. Clues reveal one at a
 * time (max 4); a correct pick scores by hints used at guess time
 * (100/80/60/40/20). Wrong picks flag + disable that card; the round
 * ends on a correct pick or once all 3 distractors are eliminated.
 *
 * Clue building/ranking is a faithful port: each clue carries an
 * `appliesTo` predicate so `rankCluesForLineup` can order clues by how
 * uniquely they identify the target among the visible cards, and
 * `startRound` retries up to 12 pairings until the target has at least
 * one uniquely-identifying clue (else the game ends gracefully).
 *
 * Session-random (Math.random) like the web — NOT daily-seeded. Best
 * total persisted under the web-compatible `genoly:whoami:best:${treeId}`
 * key (web stores `String(score)`; JSON.stringify(number) matches).
 */

import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';

import { EmptyState, Skeleton, Button } from '../ui';
import {
  listAllPersonsByTree,
  getAtlasData,
  getRelationshipGraph,
  type AtlasPersonTime,
} from '../../lib/genolyApi';
import { useThemedStyles, type Theme } from '../../theme';
import { loadGameState, saveGameState, type GameScreenProps } from './common';

const ROUNDS_PER_GAME = 5;
const MAX_HINTS = 4;
// Points awarded based on how many hints the user had revealed at the time
// of their correct guess. Index 0 = no hints (solo guess), index 4 = all 4.
const POINTS_BY_HINTS_USED = [100, 80, 60, 40, 20];

interface Person {
  _id: string;
  preferredName: string;
  surname?: string;
  isLiving?: boolean;
}

type Adjacency = Record<string, string[]>;

function fullName(p: Person | undefined): string {
  if (!p) return 'Unknown';
  return p.surname ? `${p.preferredName} ${p.surname}` : p.preferredName;
}

function pickRandom<T>(arr: T[], n: number, exclude: Set<string>, idKey: (t: T) => string): T[] {
  const pool = arr.filter((t) => !exclude.has(idKey(t)));
  const out: T[] = [];
  const used = new Set<number>();
  while (out.length < n && used.size < pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(pool[i]);
  }
  return out;
}

/** Continent-bucketing for "born in <continent>" — lat ranges roughly. */
function continentForLatLng(lat: number, lng: number): string | null {
  if (lat > 35 && lng > -10 && lng < 60) return 'Europe';
  if (lat > 0 && lng > 60 && lng < 150) return 'Asia';
  if (lat > 0 && lng > -130 && lng < -50) return 'North America';
  if (lat < 0 && lng > -90 && lng < -30) return 'South America';
  if (lat < 35 && lat > -35 && lng > -20 && lng < 55) return 'Africa';
  if (lat < 0 && lng > 110 && lng < 180) return 'Oceania';
  return null;
}

/**
 * A clue tagged with a predicate so we can rank clues by how well they
 * discriminate THIS target from the rest of the lineup (a surname clue
 * is useless against a lineup where 3 of 4 cards share the surname).
 */
interface Clue {
  text: string;
  /** Returns true if this fact also applies to the candidate. */
  appliesTo: (candidate: Person) => boolean;
}

/** Builds the candidate clue pool for `target` — same generators as web. */
function buildClues(
  target: Person,
  personById: Map<string, Person>,
  personsTime: AtlasPersonTime[],
  parents: Adjacency,
  children: Adjacency,
  spouses: Adjacency,
): Clue[] {
  const clues: Clue[] = [];
  const meta = personsTime.find((p) => p.personId === String(target._id));

  if (meta?.birthYear) {
    const decade = Math.floor(meta.birthYear / 10) * 10;
    clues.push({
      text: `Born in the ${decade}s`,
      appliesTo: (other) => {
        const o = personsTime.find((p) => p.personId === String(other._id));
        return !!o?.birthYear && Math.floor(o.birthYear / 10) * 10 === decade;
      },
    });
  }

  if (meta?.birthLat !== null && meta?.birthLat !== undefined && meta?.birthLng !== null && meta?.birthLng !== undefined) {
    const continent = continentForLatLng(meta.birthLat, meta.birthLng);
    if (continent) {
      clues.push({
        text: `Born in ${continent}`,
        appliesTo: (other) => {
          const o = personsTime.find((p) => p.personId === String(other._id));
          if (o?.birthLat == null || o?.birthLng == null) return false;
          return continentForLatLng(o.birthLat, o.birthLng) === continent;
        },
      });
    }
  }

  // Surname clue — the ranker deprioritizes it when the lineup shares it.
  if (target.surname) {
    const targetSurname = target.surname;
    clues.push({
      text: `Their surname is ${targetSurname}`,
      appliesTo: (other) => other.surname === targetSurname,
    });
  }

  const childIds = children[String(target._id)] ?? [];
  if (childIds.length === 1) {
    const c = personById.get(childIds[0]);
    if (c) {
      const childId = childIds[0];
      clues.push({
        text: `Parent of ${c.preferredName}`,
        appliesTo: (other) => (children[String(other._id)] ?? []).includes(childId),
      });
    }
  } else if (childIds.length > 1) {
    clues.push({
      text: `Has ${childIds.length} children in this tree`,
      appliesTo: (other) => (children[String(other._id)] ?? []).length === childIds.length,
    });
  }

  const spouseIds = spouses[String(target._id)] ?? [];
  if (spouseIds.length > 0) {
    const s = personById.get(spouseIds[0]);
    if (s) {
      const spouseId = spouseIds[0];
      clues.push({
        text: `Spouse of ${s.preferredName}`,
        appliesTo: (other) => (spouses[String(other._id)] ?? []).includes(spouseId),
      });
    }
  }

  const parentIds = parents[String(target._id)] ?? [];
  if (parentIds.length > 0) {
    const p = personById.get(parentIds[0]);
    if (p) {
      const parentId = parentIds[0];
      clues.push({
        text: `Child of ${p.preferredName}`,
        appliesTo: (other) => (parents[String(other._id)] ?? []).includes(parentId),
      });
    }
  }

  if (target.isLiving === false) {
    clues.push({
      text: 'No longer living',
      appliesTo: (other) => other.isLiving === false,
    });
  }

  return clues;
}

/**
 * Ranks clues by how UNIQUELY they identify the target among the lineup
 * (fewest other matches first; random jitter tiebreak so replays don't
 * repeat the same clue sequence). Returns the top MAX_HINTS clue texts.
 */
function rankCluesForLineup(clues: Clue[], lineup: Person[], target: Person): string[] {
  const others = lineup.filter((p) => p._id !== target._id);
  const scored = clues.map((c) => ({
    text: c.text,
    sharedWith: others.filter((o) => c.appliesTo(o)).length,
    jitter: Math.random(),
  }));
  scored.sort((a, b) =>
    a.sharedWith !== b.sharedWith ? a.sharedWith - b.sharedWith : a.jitter - b.jitter,
  );
  return scored.map((s) => s.text).slice(0, MAX_HINTS);
}

export default function WhoAmI({ treeId, treeSlug: _treeSlug }: GameScreenProps) {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);

  const persons = useQuery(listAllPersonsByTree, { treeId });
  const atlas = useQuery(getAtlasData, { treeId });
  const graph = useQuery(getRelationshipGraph, { treeId });

  // Live persons only (skip archived)
  const livePersons: Person[] = useMemo(() => {
    if (!persons) return [];
    return persons
      .filter((p) => !p.archivedAt)
      .map((p) => ({ _id: String(p._id), preferredName: p.preferredName, surname: p.surname, isLiving: p.isLiving }));
  }, [persons]);

  const personById = useMemo(() => {
    const m = new Map<string, Person>();
    for (const p of livePersons) m.set(p._id, p);
    return m;
  }, [livePersons]);

  const [roundIndex, setRoundIndex] = useState(0);
  const [target, setTarget] = useState<Person | null>(null);
  const [clues, setClues] = useState<string[]>([]);
  const [cluesRevealed, setCluesRevealed] = useState(0);
  const [lineup, setLineup] = useState<Person[]>([]);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<{ kind: 'hit' | 'miss'; text: string } | null>(null);
  const [done, setDone] = useState(false);
  /** Wrong picks this round — flagged red so the guess trail stays visible. */
  const [wrongPicks, setWrongPicks] = useState<Set<string>>(new Set());

  function startRound(nextIndex: number) {
    if (!atlas || !graph || livePersons.length < 4) return;

    // Try up to 12 random (target, distractor-set) pairings until the
    // target has at least ONE clue unique within the lineup — otherwise
    // the first clue would apply to multiple cards (coin-flip round).
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidatesWithFacts = livePersons.filter((p) => {
        const facts = buildClues(p, personById, atlas.personsTime, graph.parents, graph.children, graph.spouses);
        return facts.length >= 2;
      });
      if (candidatesWithFacts.length === 0) break;
      const t = candidatesWithFacts[Math.floor(Math.random() * candidatesWithFacts.length)];
      const distractors = pickRandom(livePersons, 3, new Set([t._id]), (p) => p._id);
      const lineupCards = [t, ...distractors].sort(() => Math.random() - 0.5);
      const tClueObjs = buildClues(t, personById, atlas.personsTime, graph.parents, graph.children, graph.spouses);
      const others = lineupCards.filter((p) => p._id !== t._id);
      const hasUniqueClue = tClueObjs.some((c) => others.filter((o) => c.appliesTo(o)).length === 0);
      if (!hasUniqueClue && attempt < 11) continue;
      const orderedClues = rankCluesForLineup(tClueObjs, lineupCards, t);

      setTarget(t);
      setClues(orderedClues);
      setCluesRevealed(0);
      setLineup(lineupCards);
      setFeedback(null);
      setWrongPicks(new Set());
      setRoundIndex(nextIndex);
      return;
    }
    // Couldn't find a discriminating-enough round — likely sparse data.
    setDone(true);
  }

  // Kick off round 1 when data is ready
  useEffect(() => {
    if (atlas && graph && livePersons.length >= 4 && target === null && !done) {
      startRound(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlas, graph, livePersons]);

  function handleGuess(p: Person) {
    if (!target || feedback?.kind === 'hit') return;
    if (p._id === target._id) {
      const points = POINTS_BY_HINTS_USED[cluesRevealed] ?? 20;
      setScore((s) => s + points);
      if (cluesRevealed === 0) {
        setFeedback({ kind: 'hit', text: `Right! +${points} pts — solo guess!` });
      } else {
        setFeedback({
          kind: 'hit',
          text: `Right! +${points} pts (used ${cluesRevealed} ${cluesRevealed === 1 ? 'hint' : 'hints'})`,
        });
      }
    } else {
      // Wrong — flag this card visually; do NOT auto-reveal the next hint
      setWrongPicks((prev) => {
        const next = new Set(prev);
        next.add(p._id);
        return next;
      });
      const newWrongPicks = new Set(wrongPicks);
      newWrongPicks.add(p._id);
      const nonTargetIds = lineup.filter((lp) => lp._id !== target._id).map((lp) => lp._id);
      const allNonTargetPicked = nonTargetIds.every((id) => newWrongPicks.has(id));
      if (allNonTargetPicked) {
        setFeedback({ kind: 'miss', text: `Out of guesses. It was ${fullName(target)}.` });
      } else {
        setFeedback({ kind: 'miss', text: "Not quite — try again, or tap 'Get a hint' for help." });
      }
    }
  }

  function nextRound() {
    const ni = roundIndex + 1;
    if (ni >= ROUNDS_PER_GAME) {
      setDone(true);
      return;
    }
    startRound(ni);
  }

  function playAgain() {
    setDone(false);
    setScore(0);
    setRoundIndex(0);
    setTarget(null);
    setClues([]);
    setCluesRevealed(0);
    setLineup([]);
    setFeedback(null);
    // useEffect kicks off round 1 once target becomes null
  }

  // Persist best total per tree (web-compatible key)
  const bestKey = `genoly:whoami:best:${treeId}`;
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadGameState<number>(bestKey).then((v) => {
      if (!cancelled && v !== null) setBest(v);
    });
    return () => {
      cancelled = true;
    };
  }, [bestKey]);
  useEffect(() => {
    if (!done) return;
    if (best === null || score > best) {
      setBest(score);
      saveGameState(bestKey, score);
    }
  }, [done, score, best, bestKey]);

  if (!persons || !atlas || !graph) {
    return (
      <View style={styles.loading}>
        <Skeleton height={104} />
        <Skeleton height={280} />
      </View>
    );
  }

  if (livePersons.length < 4) {
    return (
      <EmptyState
        icon="🕵️"
        title="Need at least 4 people to play"
        body="Each round picks 4 names as the lineup, so the pool has to support a fair shuffle. Add more family to unlock it."
        ctaLabel="Back to games"
        onCtaPress={() => router.back()}
      />
    );
  }

  if (done) {
    const tier =
      score >= 400 ? 'Family expert ★★★'
        : score >= 250 ? 'Solid family knowledge ★★'
          : score >= 100 ? 'Getting there ★'
            : 'Time to study up';
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.doneTitle}>Game complete</Text>
        <Text style={styles.subtitle}>
          Final: <Text style={styles.strong}>{score}</Text> / {ROUNDS_PER_GAME * 100} · {tier}
          {best !== null && best > 0 ? (
            <>
              {' '}· Best: <Text style={styles.strong}>{best}</Text>
            </>
          ) : null}
        </Text>
        <Button label="Play again" onPress={playAgain} style={styles.doneButton} />
        <Button
          label="Back to games"
          variant="secondary"
          onPress={() => router.back()}
          style={styles.doneButton}
        />
      </ScrollView>
    );
  }

  const nonTargetIds = lineup.filter((lp) => lp._id !== target?._id).map((lp) => lp._id);
  // Guard on lineup.length so the pre-first-round frame ([] .every → true)
  // doesn't flash the round-over UI while startRound is still pending.
  const lineupExhausted = lineup.length > 0 && nonTargetIds.every((id) => wrongPicks.has(id));
  const roundOver = feedback?.kind === 'hit' || lineupExhausted;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.subtitle}>
        Round {roundIndex + 1} / {ROUNDS_PER_GAME} · Score <Text style={styles.strong}>{score}</Text>
      </Text>

      {cluesRevealed > 0 ? (
        <View style={styles.clues} accessibilityLabel="Hints">
          {clues.slice(0, cluesRevealed).map((c, i) => (
            <View key={i} style={styles.clueRow}>
              <Text style={styles.clueNum}>H{i + 1}</Text>
              <Text style={styles.clueText}>{c}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.prompt}>Who is this person?</Text>
      )}

      {feedback ? (
        <Text
          style={[styles.feedback, feedback.kind === 'hit' ? styles.feedbackHit : styles.feedbackMiss]}
          accessibilityLiveRegion="polite"
        >
          {feedback.text}
        </Text>
      ) : null}

      <View style={styles.lineup} accessibilityLabel="Pick the person">
        {lineup.map((p) => {
          const isTarget = target?._id === p._id;
          const isWrong = wrongPicks.has(p._id);
          const showHit = roundOver && isTarget;
          const showMiss = isWrong;
          return (
            <TouchableOpacity
              key={p._id}
              style={[styles.card, showHit && styles.cardHit, showMiss && styles.cardMiss]}
              onPress={() => handleGuess(p)}
              disabled={feedback?.kind === 'hit' || isWrong || lineupExhausted}
              accessibilityRole="button"
              accessibilityLabel={
                showHit
                  ? `${fullName(p)} — correct answer`
                  : showMiss
                    ? `${fullName(p)} — your wrong pick`
                    : `Pick ${fullName(p)}`
              }
            >
              <Text style={styles.cardName}>{p.preferredName}</Text>
              {p.surname ? <Text style={styles.cardSurname}>{p.surname}</Text> : null}
              {showHit ? <Text style={styles.badgeHit}>✓ Correct</Text> : null}
              {showMiss ? <Text style={styles.badgeMiss}>✗ Picked</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {!roundOver ? (
        <View style={styles.hintBar}>
          <Button
            label={cluesRevealed >= clues.length ? 'No more hints' : 'Get a hint'}
            variant="secondary"
            onPress={() => setCluesRevealed((n) => Math.min(n + 1, clues.length))}
            disabled={cluesRevealed >= clues.length}
            style={styles.hintButton}
          />
          {cluesRevealed > 0 ? (
            <Text style={styles.hintsUsed}>
              {cluesRevealed} {cluesRevealed === 1 ? 'hint' : 'hints'} used
            </Text>
          ) : null}
        </View>
      ) : (
        <Button
          label={roundIndex + 1 >= ROUNDS_PER_GAME ? 'See results' : 'Next round →'}
          onPress={nextRound}
          style={styles.nextButton}
        />
      )}

      <Button
        label="Back to games"
        variant="secondary"
        onPress={() => router.back()}
        style={styles.backButton}
      />
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
    strong: {
      color: t.colors.text,
      fontWeight: '600',
    },
    doneTitle: {
      ...t.typography.screenTitle,
      color: t.colors.text,
      textAlign: 'center',
      marginBottom: t.spacing.sm,
    },
    clues: {
      marginBottom: t.spacing.lg,
    },
    clueRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
      marginBottom: t.spacing.xs,
    },
    clueNum: {
      ...t.typography.cardDescription,
      color: t.colors.primary,
      fontWeight: '700',
      marginRight: t.spacing.sm,
    },
    clueText: {
      ...t.typography.cardDescription,
      color: t.colors.text,
      flex: 1,
    },
    prompt: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      textAlign: 'center',
      marginBottom: t.spacing.lg,
    },
    feedback: {
      ...t.typography.cardDescription,
      textAlign: 'center',
      marginBottom: t.spacing.md,
    },
    feedbackHit: {
      color: t.colors.success,
      fontWeight: '600',
    },
    feedbackMiss: {
      color: t.colors.danger,
    },
    lineup: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    card: {
      width: '48.5%',
      backgroundColor: t.colors.surface,
      borderWidth: 2,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.lg,
      paddingHorizontal: t.spacing.md,
      marginBottom: t.spacing.sm,
      alignItems: 'center',
    },
    cardHit: {
      borderColor: t.colors.success,
    },
    cardMiss: {
      borderColor: t.colors.danger,
      opacity: 0.6,
    },
    cardName: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      textAlign: 'center',
    },
    cardSurname: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      textAlign: 'center',
    },
    badgeHit: {
      ...t.typography.helper,
      color: t.colors.success,
      fontWeight: '700',
      marginTop: t.spacing.xs,
    },
    badgeMiss: {
      ...t.typography.helper,
      color: t.colors.danger,
      fontWeight: '700',
      marginTop: t.spacing.xs,
    },
    hintBar: {
      alignItems: 'center',
      marginTop: t.spacing.md,
    },
    hintButton: {
      alignSelf: 'stretch',
    },
    hintsUsed: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      marginTop: t.spacing.sm,
    },
    nextButton: {
      marginTop: t.spacing.md,
      alignSelf: 'stretch',
    },
    backButton: {
      marginTop: t.spacing.lg,
      alignSelf: 'stretch',
    },
    doneButton: {
      marginTop: t.spacing.md,
      alignSelf: 'stretch',
    },
  });
}
