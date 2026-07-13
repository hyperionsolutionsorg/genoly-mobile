/**
 * This or That — mobile port of src/pages/games/ThisOrThat.tsx (games
 * port, 2026-07-13). Mechanics identical to the web: 10 rounds, each a
 * binary pick between two live family members with a comparison
 * question (+1 per correct). All rounds are pre-generated at game start.
 *
 * Eight question kinds, each gated on data availability: older /
 * born-first / more-children / further-north / longer-name /
 * closer-to-me (BFS relationship distance from the person picker's
 * anchor) / alpha-first / more-siblings. Round generation is a faithful
 * port: cross-round memory (usedKinds, usedPairs, prevPairKey), up to
 * 36 pair×kind attempts with prioritised kinds, and a graceful
 * unconstrained fallback so a round is always answerable.
 *
 * Session-random (Math.random) like the web — NOT daily-seeded. Best
 * score persisted under the web-compatible
 * `genoly:thisorthat:best:${treeId}` key. The end-screen emoji strip is
 * display-only (web has no clipboard share here either).
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
  getPersonPickerData,
  type AtlasPersonTime,
} from '../../lib/genolyApi';
import { useThemedStyles, type Theme } from '../../theme';
import { loadGameState, saveGameState, type GameScreenProps } from './common';

const ROUNDS = 10;

type QuestionKind =
  | 'older'
  | 'born-first'
  | 'more-children'
  | 'further-north'
  | 'longer-name'
  | 'closer-to-me'
  | 'alpha-first'
  | 'more-siblings';

interface Person {
  _id: string;
  preferredName: string;
  surname?: string;
}

interface Graph {
  parents: Record<string, string[]>;
  children: Record<string, string[]>;
  spouses: Record<string, string[]>;
}

interface Round {
  a: Person;
  b: Person;
  kind: QuestionKind;
  question: string;
  /** _id of the correct person */
  winnerId: string;
  /** Explanation revealed after answering */
  explanation: string;
}

function fullName(p: Person): string {
  return p.surname ? `${p.preferredName} ${p.surname}` : p.preferredName;
}

/** Canonical pair key — sorted so (a,b) and (b,a) produce the same key. */
function pairKey(id1: string, id2: string): string {
  return [id1, id2].sort().join('|');
}

/** BFS distance between two persons over parent + child + spouse edges. */
function relationshipDistance(
  fromId: string,
  toId: string,
  parents: Record<string, string[]>,
  children: Record<string, string[]>,
  spouses: Record<string, string[]>,
): number | null {
  if (fromId === toId) return 0;
  const seen = new Set<string>([fromId]);
  let frontier: string[] = [fromId];
  let depth = 0;
  while (frontier.length > 0 && depth < 12) {
    const next: string[] = [];
    for (const pid of frontier) {
      const neighbours = [...(parents[pid] ?? []), ...(children[pid] ?? []), ...(spouses[pid] ?? [])];
      for (const n of neighbours) {
        if (seen.has(n)) continue;
        if (n === toId) return depth + 1;
        seen.add(n);
        next.push(n);
      }
    }
    frontier = next;
    depth += 1;
  }
  return null;
}

/** Unique sibling count (other children of any parent, excluding self). */
function countSiblings(
  personId: string,
  parents: Record<string, string[]>,
  children: Record<string, string[]>,
): number {
  const personParents = parents[personId] ?? [];
  if (personParents.length === 0) return 0;
  const siblingSet = new Set<string>();
  for (const parentId of personParents) {
    for (const childId of children[parentId] ?? []) {
      if (childId !== personId) siblingSet.add(childId);
    }
  }
  return siblingSet.size;
}

/**
 * Choose question kinds for the next round using cross-round memory:
 * kinds not yet used this game first (shuffled), then kinds used least
 * recently. Returns an ordered array of kinds to try.
 */
function prioritiseKinds(allKinds: QuestionKind[], usedKinds: QuestionKind[]): QuestionKind[] {
  const unusedKinds = allKinds.filter((k) => !usedKinds.includes(k));
  if (unusedKinds.length > 0) {
    return [...unusedKinds].sort(() => Math.random() - 0.5);
  }
  const lastUsedIndex = new Map<QuestionKind, number>();
  for (let i = 0; i < usedKinds.length; i++) {
    lastUsedIndex.set(usedKinds[i], i);
  }
  return [...allKinds].sort((a, b) => {
    const ia = lastUsedIndex.get(a) ?? -1;
    const ib = lastUsedIndex.get(b) ?? -1;
    return ia - ib; // ascending: used longest ago first
  });
}

/**
 * Builds a random round with cross-round memory to reduce repetition.
 * Tries up to 36 (pair × kind) combinations, then falls back to an
 * unconstrained regeneration so the game never blocks on sparse data.
 */
function generateRound(
  livePersons: Person[],
  personsTime: AtlasPersonTime[],
  graph: Graph,
  focalId: string | null,
  usedKinds: QuestionKind[],
  usedPairs: Set<string>,
  prevPairKey: string | null,
): Round | null {
  const allKinds: QuestionKind[] = [
    'older',
    'born-first',
    'more-children',
    'further-north',
    'longer-name',
    'closer-to-me',
    'alpha-first',
    'more-siblings',
  ];
  const timeById = new Map<string, AtlasPersonTime>();
  for (const t of personsTime) timeById.set(t.personId, t);

  const totalPossiblePairs = (livePersons.length * (livePersons.length - 1)) / 2;
  const allPairsExhausted = usedPairs.size >= totalPossiblePairs;

  const kindPriority = prioritiseKinds(allKinds, usedKinds);

  for (let attempt = 0; attempt < 36; attempt++) {
    // Pick a pair
    const ai = Math.floor(Math.random() * livePersons.length);
    let bi = Math.floor(Math.random() * livePersons.length);
    while (bi === ai && livePersons.length > 1) {
      bi = Math.floor(Math.random() * livePersons.length);
    }
    const a = livePersons[ai];
    const b = livePersons[bi];
    const key = pairKey(a._id, b._id);

    if (!allPairsExhausted && usedPairs.has(key)) continue;
    if (allPairsExhausted && key === prevPairKey) continue;

    const at = timeById.get(a._id);
    const bt = timeById.get(b._id);

    // Try kinds in priority order for this pair
    for (const kind of kindPriority) {
      switch (kind) {
        case 'older':
        case 'born-first': {
          if (!at?.birthYear || !bt?.birthYear || at.birthYear === bt.birthYear) continue;
          const winner = at.birthYear < bt.birthYear ? a : b;
          return {
            a,
            b,
            kind,
            question: kind === 'older' ? 'Who is older?' : 'Who was born first?',
            winnerId: winner._id,
            explanation: `${a.preferredName} was born ${at.birthYear}, ${b.preferredName} was born ${bt.birthYear}.`,
          };
        }
        case 'more-children': {
          const ca = (graph.children[a._id] ?? []).length;
          const cb = (graph.children[b._id] ?? []).length;
          if (ca === cb) continue;
          const winner = ca > cb ? a : b;
          return {
            a,
            b,
            kind,
            question: 'Who has more children?',
            winnerId: winner._id,
            explanation: `${a.preferredName}: ${ca} ${ca === 1 ? 'child' : 'children'} · ${b.preferredName}: ${cb} ${cb === 1 ? 'child' : 'children'}.`,
          };
        }
        case 'further-north': {
          // Prefer birth-place lat (more canonical); fall back to primary lat.
          const aLat = at?.birthLat ?? at?.lat;
          const bLat = bt?.birthLat ?? bt?.lat;
          if (aLat === undefined || bLat === undefined || aLat === null || bLat === null) continue;
          if (Math.abs(aLat - bLat) < 0.5) continue; // too close to call
          const winner = aLat > bLat ? a : b;
          return {
            a,
            b,
            kind,
            question: 'Who lives (or was born) further north?',
            winnerId: winner._id,
            explanation: `${a.preferredName}'s lat ${aLat.toFixed(1)}° vs ${b.preferredName}'s lat ${bLat.toFixed(1)}°.`,
          };
        }
        case 'longer-name': {
          const la = fullName(a).length;
          const lb = fullName(b).length;
          if (la === lb) continue;
          const winner = la > lb ? a : b;
          return {
            a,
            b,
            kind,
            question: 'Who has the longer full name?',
            winnerId: winner._id,
            explanation: `${fullName(a)} (${la} chars) vs ${fullName(b)} (${lb} chars).`,
          };
        }
        case 'closer-to-me': {
          if (!focalId || focalId === a._id || focalId === b._id) continue;
          const da = relationshipDistance(focalId, a._id, graph.parents, graph.children, graph.spouses);
          const db = relationshipDistance(focalId, b._id, graph.parents, graph.children, graph.spouses);
          if (da === null || db === null || da === db) continue;
          const winner = da < db ? a : b;
          return {
            a,
            b,
            kind,
            question: "Who's closer to you on the tree?",
            winnerId: winner._id,
            explanation: `${a.preferredName} is ${da} ${da === 1 ? 'step' : 'steps'} away · ${b.preferredName} is ${db}.`,
          };
        }
        case 'alpha-first': {
          const nameA = fullName(a).toLowerCase();
          const nameB = fullName(b).toLowerCase();
          if (nameA === nameB) continue;
          const winner = nameA < nameB ? a : b;
          return {
            a,
            b,
            kind,
            question: 'Whose name comes first alphabetically?',
            winnerId: winner._id,
            explanation: `"${fullName(a)}" comes ${nameA < nameB ? 'before' : 'after'} "${fullName(b)}" alphabetically.`,
          };
        }
        case 'more-siblings': {
          const sa = countSiblings(a._id, graph.parents, graph.children);
          const sb = countSiblings(b._id, graph.parents, graph.children);
          if (sa === sb) continue;
          const winner = sa > sb ? a : b;
          return {
            a,
            b,
            kind,
            question: 'Who has more siblings in this tree?',
            winnerId: winner._id,
            explanation: `${a.preferredName}: ${sa} ${sa === 1 ? 'sibling' : 'siblings'} · ${b.preferredName}: ${sb} ${sb === 1 ? 'sibling' : 'siblings'}.`,
          };
        }
      }
    }
  }

  // Graceful degrade: sparse tree — retry once with no cross-round
  // constraints so the game never blocks.
  if (usedPairs.size > 0 || usedKinds.length > 0) {
    console.log(
      '[ThisOrThat] Cross-round uniqueness could not be honored — ' +
        'falling back to unconstrained round generation. ' +
        `(usedPairs=${usedPairs.size}, usedKinds=${usedKinds.length})`,
    );
    return generateRound(livePersons, personsTime, graph, focalId, [], new Set(), null);
  }

  return null;
}

export default function ThisOrThat({ treeId, treeSlug: _treeSlug }: GameScreenProps) {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);

  const persons = useQuery(listAllPersonsByTree, { treeId });
  const atlas = useQuery(getAtlasData, { treeId });
  const graph = useQuery(getRelationshipGraph, { treeId });
  // Focal person for "closer to me" — the picker's anchor heuristic.
  const picker = useQuery(getPersonPickerData, { treeId });

  const livePersons: Person[] = useMemo(() => {
    if (!persons) return [];
    return persons
      .filter((p) => !p.archivedAt)
      .map((p) => ({ _id: String(p._id), preferredName: p.preferredName, surname: p.surname }));
  }, [persons]);

  const focalId = picker?.anchorPersonId ? String(picker.anchorPersonId) : null;

  // Pre-generate all rounds at game start. If we can't generate enough
  // distinct rounds we accept duplicates rather than fail.
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [outcomeStrip, setOutcomeStrip] = useState<('hit' | 'miss')[]>([]);
  const [done, setDone] = useState(false);

  function buildGame() {
    if (!atlas || !graph || livePersons.length < 4) return;
    const generated: Round[] = [];
    const usedKinds: QuestionKind[] = [];
    const usedPairs = new Set<string>();
    let prevPair: string | null = null;

    for (let i = 0; i < ROUNDS; i++) {
      const r = generateRound(livePersons, atlas.personsTime, graph, focalId, usedKinds, usedPairs, prevPair);
      if (r) {
        generated.push(r);
        usedKinds.push(r.kind);
        const key = pairKey(r.a._id, r.b._id);
        usedPairs.add(key);
        prevPair = key;
      }
    }
    if (generated.length === 0) {
      setDone(true);
      return;
    }
    setRounds(generated);
    setRoundIndex(0);
    setScore(0);
    setPicked(null);
    setOutcomeStrip([]);
    setDone(false);
  }

  useEffect(() => {
    if (atlas && graph && livePersons.length >= 4 && rounds.length === 0 && !done) {
      buildGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlas, graph, livePersons, focalId]);

  function handlePick(personId: string) {
    if (picked !== null) return;
    setPicked(personId);
    const r = rounds[roundIndex];
    if (!r) return;
    const isHit = personId === r.winnerId;
    if (isHit) setScore((s) => s + 1);
    setOutcomeStrip((s) => [...s, isHit ? 'hit' : 'miss']);
  }

  function nextRound() {
    if (roundIndex + 1 >= rounds.length) {
      setDone(true);
      return;
    }
    setRoundIndex((i) => i + 1);
    setPicked(null);
  }

  // Persist best score per tree (web-compatible key)
  const bestKey = `genoly:thisorthat:best:${treeId}`;
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
        icon="⚖️"
        title="Need at least 4 people to play"
        body="Each round needs two contrasting family members, so the pool has to support variety. Add more family to unlock it."
        ctaLabel="Back to games"
        onCtaPress={() => router.back()}
      />
    );
  }

  if (done) {
    const shareString = outcomeStrip.map((o) => (o === 'hit' ? '🟩' : '⬜')).join('');
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.doneTitle}>Game complete</Text>
        <Text style={styles.subtitle}>
          You scored <Text style={styles.strong}>{score}</Text> / {rounds.length}
          {best !== null ? (
            <>
              {' '}· Best: <Text style={styles.strong}>{best}</Text>
            </>
          ) : null}
        </Text>
        <Text style={styles.shareStrip} accessibilityLabel={`Result: ${score} of ${rounds.length}`}>
          {shareString}
        </Text>
        <Button label="Play again" onPress={buildGame} style={styles.doneButton} />
        <Button
          label="Back to games"
          variant="secondary"
          onPress={() => router.back()}
          style={styles.doneButton}
        />
      </ScrollView>
    );
  }

  const r = rounds[roundIndex];
  if (!r) {
    return (
      <View style={styles.loading}>
        <Skeleton height={104} />
        <Skeleton height={280} />
      </View>
    );
  }
  const lastOutcome = outcomeStrip[outcomeStrip.length - 1];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.subtitle}>
        Round {roundIndex + 1} / {rounds.length} · Score <Text style={styles.strong}>{score}</Text>
      </Text>

      <Text style={styles.question}>{r.question}</Text>

      <View style={styles.pair} accessibilityLabel="Pick one">
        {[r.a, r.b].map((p) => {
          const isWinner = picked !== null && p._id === r.winnerId;
          const isLoser = picked !== null && p._id === picked && p._id !== r.winnerId;
          return (
            <TouchableOpacity
              key={p._id}
              style={[styles.card, isWinner && styles.cardWinner, isLoser && styles.cardLoser]}
              onPress={() => handlePick(p._id)}
              disabled={picked !== null}
              accessibilityRole="button"
              accessibilityLabel={`Pick ${fullName(p)}`}
            >
              <Text style={styles.cardName}>{p.preferredName}</Text>
              {p.surname ? <Text style={styles.cardSurname}>{p.surname}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {picked !== null ? (
        <>
          <Text
            style={[styles.feedback, lastOutcome === 'hit' ? styles.feedbackHit : styles.feedbackMiss]}
            accessibilityLiveRegion="polite"
          >
            {lastOutcome === 'hit' ? '✓ ' : '✗ '}
            {r.explanation}
          </Text>
          <Button
            label={roundIndex + 1 >= rounds.length ? 'See results' : 'Next →'}
            onPress={nextRound}
            style={styles.nextButton}
          />
        </>
      ) : null}

      <View
        style={styles.progress}
        accessibilityLabel={`Progress: round ${Math.min(outcomeStrip.length + 1, rounds.length)} of ${rounds.length}`}
      >
        {Array.from({ length: rounds.length }).map((_, i) => {
          const o = outcomeStrip[i];
          return (
            <View
              key={i}
              style={[styles.progressDot, o === 'hit' && styles.progressDotHit, o === 'miss' && styles.progressDotMiss]}
            />
          );
        })}
      </View>

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
    shareStrip: {
      fontSize: 22,
      textAlign: 'center',
      marginTop: t.spacing.md,
      marginBottom: t.spacing.sm,
    },
    question: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      textAlign: 'center',
      marginBottom: t.spacing.lg,
    },
    pair: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    card: {
      width: '48.5%',
      backgroundColor: t.colors.surface,
      borderWidth: 2,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.xl,
      paddingHorizontal: t.spacing.md,
      alignItems: 'center',
    },
    cardWinner: {
      borderColor: t.colors.success,
    },
    cardLoser: {
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
    feedback: {
      ...t.typography.cardDescription,
      textAlign: 'center',
      marginTop: t.spacing.md,
    },
    feedbackHit: {
      color: t.colors.success,
      fontWeight: '600',
    },
    feedbackMiss: {
      color: t.colors.danger,
    },
    nextButton: {
      marginTop: t.spacing.md,
      alignSelf: 'stretch',
    },
    doneButton: {
      marginTop: t.spacing.md,
      alignSelf: 'stretch',
    },
    progress: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: t.spacing.lg,
    },
    progressDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: t.colors.border,
      marginHorizontal: 3,
    },
    progressDotHit: {
      backgroundColor: t.colors.success,
    },
    progressDotMiss: {
      backgroundColor: t.colors.danger,
    },
    backButton: {
      marginTop: t.spacing.lg,
      alignSelf: 'stretch',
    },
  });
}
