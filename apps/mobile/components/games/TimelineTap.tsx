/**
 * Timeline Tap — mobile port of src/pages/games/TimelineTap.tsx (games
 * port, 2026-07-13). Five dated family-event cards, daily-seeded by
 * `${dateUTC}|${treeSlug}|timeline-tap` via the shared lib/dailySeed.ts
 * + lib/timelineTapGame.ts — tap them in chronological order. Correct
 * taps lock into the ordered rail with the year revealed and grow the
 * combo; wrong taps break the combo. Timed mode races a 30s cap
 * (100×combo per correct + 10 pts per full second left on completion);
 * relaxed mode has no clock and scores accuracy %.
 *
 * Daily-idempotent like the web: one scored round per UTC day per tree
 * (snapshot at web-compatible `genoly:timeline-tap:daily:${treeId}`);
 * revisiting shows the result. Practice replays are unscored (fresh
 * seeded variation per run, never recorded). Per-mode personal bests
 * at `genoly:timeline-tap:best:{timed|relaxed}:${treeId}`. Ending the
 * DAILY round (completed or timeout) fires ONE best-effort
 * recordDailyCompletion (perfect = completed with 100% tap accuracy),
 * guarded by the same snapshot; errors console.warn.
 *
 * RN adaptations: prefers-reduced-motion matchMedia →
 * AccessibilityInfo.isReduceMotionEnabled() (+ change listener), which
 * auto-engages relaxed mode; the visible toggle is an RN Switch
 * persisted device-wide; the wrong-tap shake → a 400ms danger-colour
 * flash on the tapped card.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useConvex, useQuery } from 'convex/react';
import { useRouter, type Href } from 'expo-router';

import { Button, EmptyState, Skeleton } from '../ui';
import { getDailySocialStats, getTreeTimeline, recordDailyCompletion } from '../../lib/genolyApi';
import { dailySeedKey, todayUTC } from '../../lib/dailySeed';
import {
  INITIAL_PROGRESS,
  MIN_ITEMS,
  ROUND_SIZE_FULL,
  TIME_LIMIT_MS,
  accuracyPct,
  applyTap,
  buildTimelineItems,
  finalScore,
  pickDailyRound,
  type RoundProgress,
  type TimelineMode,
  type TimelineTier,
} from '../../lib/timelineTapGame';
import { useThemedStyles, type Theme } from '../../theme';
import { loadGameState, saveGameState, type GameScreenProps } from './common';

const GAME_KEY = 'timeline-tap';
/** Toggle preference is per device (not per tree) — "Relaxed mode" switch. */
const RELAXED_PREF_KEY = `genoly:${GAME_KEY}:relaxed`;

/** Finished-day snapshot — persisted so the day can't be re-scored. */
interface DailyState {
  date: string; // YYYY-MM-DD (UTC)
  mode: TimelineMode;
  tier: TimelineTier;
  status: 'completed' | 'timeout';
  score: number;
  accuracy: number;
  placedCount: number;
  total: number;
  /** Solved order (label + year) — self-contained for the result view. */
  items: Array<{ label: string; year: number }>;
}

/** Result of the round that just ended this session (daily OR practice). */
interface EndState {
  status: 'completed' | 'timeout';
  score: number;
  accuracy: number;
  placedCount: number;
}

export default function TimelineTap({ treeId, treeSlug }: GameScreenProps) {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();

  // The one read this game makes — the Tree Timeline page's existing
  // query. asc + cap so very large trees still return oldest-to-newest.
  const rows = useQuery(getTreeTimeline, { treeId, direction: 'asc', limit: 500 });

  // UTC day fixed at mount — a session crossing midnight keeps its round.
  const [today] = useState(() => todayUTC());

  const items = useMemo(() => (rows ? buildTimelineItems(rows) : null), [rows]);

  // ── Relaxed mode: reduce-motion auto-engages; the visible switch
  //    persists per device (web parity: matchMedia → AccessibilityInfo).
  const [reducedMotion, setReducedMotion] = useState(false);
  const [relaxedPref, setRelaxedPref] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReducedMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    loadGameState<string>(RELAXED_PREF_KEY).then((pref) => {
      if (!cancelled) setRelaxedPref(pref === '1');
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  const relaxed = reducedMotion || relaxedPref;
  const mode: TimelineMode = relaxed ? 'relaxed' : 'timed';

  const toggleRelaxed = () => {
    const next = !relaxedPref;
    setRelaxedPref(next);
    void saveGameState(RELAXED_PREF_KEY, next ? '1' : '0');
  };

  // ── Round (daily, or a seeded practice variation after the daily) ──
  const [practiceRun, setPracticeRun] = useState(0);
  const round = useMemo(() => {
    if (!items) return null;
    const base = dailySeedKey(today, treeSlug, GAME_KEY);
    const seedKey = practiceRun === 0 ? base : `${base}|practice|${practiceRun}`;
    return pickDailyRound(seedKey, items);
  }, [items, treeSlug, today, practiceRun]);
  const itemById = useMemo(
    () => new Map((round?.ordered ?? []).map((i) => [i.id, i])),
    [round],
  );

  // ── Daily-idempotent persistence + per-mode bests (async hydrate) ──
  const dailyKey = `genoly:${GAME_KEY}:daily:${treeId}`;
  const bestTimedKey = `genoly:${GAME_KEY}:best:timed:${treeId}`;
  const bestRelaxedKey = `genoly:${GAME_KEY}:best:relaxed:${treeId}`;
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState<DailyState | null>(null);
  const [bestTimed, setBestTimed] = useState<number | null>(null);
  const [bestRelaxed, setBestRelaxed] = useState<number | null>(null);
  // True once today's daily is consumed — the record-once guard.
  const dailyConsumedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadGameState<DailyState>(dailyKey),
      loadGameState<number>(bestTimedKey),
      loadGameState<number>(bestRelaxedKey),
    ]).then(([saved, t, r]) => {
      if (cancelled) return;
      if (saved && saved.date === today) {
        setRestored(saved);
        dailyConsumedRef.current = true;
      }
      if (typeof t === 'number') setBestTimed(t);
      if (typeof r === 'number') setBestRelaxed(r);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [dailyKey, bestTimedKey, bestRelaxedKey, today]);

  // ── Live round state ──
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [progress, setProgress] = useState<RoundProgress>(INITIAL_PROGRESS);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState<number>(0);
  const [endState, setEndState] = useState<EndState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // RN adaptation of the web's shake: flash the tapped card danger.
  const [flashingId, setFlashingId] = useState<string | null>(null);

  // Social stats — skipped until a DAILY result is on screen (practice
  // rounds keep it skipped).
  const dailyResultDay =
    practiceRun !== 0
      ? null
      : restored
        ? restored.date
        : phase === 'done' && endState
          ? today
          : null;
  const social = useQuery(
    getDailySocialStats,
    dailyResultDay ? { treeId, gameKey: GAME_KEY, dayUTC: dailyResultDay } : 'skip',
  );

  // Tick the clock while a timed round runs.
  useEffect(() => {
    if (phase !== 'playing' || relaxed || deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [phase, relaxed, deadline]);

  // Auto-end on timeout.
  useEffect(() => {
    if (phase !== 'playing' || relaxed || deadline === null) return;
    if (now >= deadline) endRound(false, progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- REASON: endRound/progress are stable per tick; mirroring the web page's timeout effect.
  }, [now, phase, relaxed, deadline]);

  // Clear the danger flash after the animation window.
  useEffect(() => {
    if (flashingId === null) return;
    const t = setTimeout(() => setFlashingId(null), 400);
    return () => clearTimeout(t);
  }, [flashingId]);

  function startRound() {
    setProgress(INITIAL_PROGRESS);
    setEndState(null);
    setFlashingId(null);
    setPhase('playing');
    if (!relaxed) {
      const t = Date.now();
      setDeadline(t + TIME_LIMIT_MS);
      setNow(t);
      setMessage(`Go — ${round?.ordered.length ?? 0} events, oldest first. 30 seconds.`);
    } else {
      setDeadline(null);
      setMessage(`Go — ${round?.ordered.length ?? 0} events, oldest first. No clock in relaxed mode.`);
    }
  }

  function endRound(completed: boolean, finalProgress: RoundProgress) {
    if (!round) return;
    const remainingMs =
      !relaxed && deadline !== null ? Math.max(0, deadline - Date.now()) : 0;
    const score = finalScore(mode, finalProgress, { completed, remainingMs });
    const accuracy = accuracyPct(finalProgress.correct, finalProgress.taps);
    const status: EndState['status'] = completed ? 'completed' : 'timeout';
    setPhase('done');
    setEndState({ status, score, accuracy, placedCount: finalProgress.placed });
    if (!completed) {
      setMessage(
        `Time's up — ${finalProgress.placed} of ${round.ordered.length} placed. Score ${score}.`,
      );
    }

    // Practice rounds are unscored — no persistence, no bests.
    if (practiceRun !== 0) return;

    // Persist the daily + record the completion EXACTLY once (ref guard
    // in-session; the hydrated snapshot guards remounts).
    if (!dailyConsumedRef.current) {
      dailyConsumedRef.current = true;
      const snapshot: DailyState = {
        date: today,
        mode,
        tier: round.tier,
        status,
        score,
        accuracy,
        placedCount: finalProgress.placed,
        total: round.ordered.length,
        items: round.ordered.map((i) => ({ label: i.label, year: i.year })),
      };
      void saveGameState(dailyKey, snapshot);
      // PERFECT = every card placed with no wrong taps. Best-effort —
      // the result panel still renders from local state on failure.
      convex
        .mutation(recordDailyCompletion, {
          treeId,
          gameKey: GAME_KEY,
          score,
          perfect: completed && accuracy === 100,
        })
        .catch((err) => {
          console.warn('recordDailyCompletion failed (result stays local):', err);
        });
    }

    // Per-mode personal best (higher is better in both modes).
    const bestKey = mode === 'timed' ? bestTimedKey : bestRelaxedKey;
    const best = mode === 'timed' ? bestTimed : bestRelaxed;
    const setBest = mode === 'timed' ? setBestTimed : setBestRelaxed;
    if (best === null || score > best) {
      setBest(score);
      void saveGameState(bestKey, score);
    }
  }

  function tapCard(id: string) {
    if (!round || phase !== 'playing') return;
    const result = applyTap(round.ordered, progress, id);
    setProgress(result.progress);
    const left = round.ordered.length - result.progress.placed;
    if (result.correct && result.placedItem) {
      setMessage(
        result.finished
          ? `Correct — ${result.placedItem.year}, ${result.placedItem.label}. That's the whole timeline!`
          : `Correct — ${result.placedItem.year}, ${result.placedItem.label}. ${left} to place.`,
      );
      if (result.finished) endRound(true, result.progress);
    } else {
      setFlashingId(id);
      // Relaxed mode has no combo — don't announce one.
      setMessage(
        relaxed
          ? `Not next — try again. ${left} still to place.`
          : `Not next — combo reset. ${left} still to place.`,
      );
    }
  }

  if (!rows || !items || !hydrated) {
    return (
      <View style={styles.loading}>
        <Skeleton height={104} />
        <Skeleton height={280} />
      </View>
    );
  }

  // ── Empty state — fewer than 3 distinct-year events (the unlocking
  //    action is adding a birthday, per the web's copy). ──
  if (!round && !restored) {
    return (
      <EmptyState
        icon="🗓️"
        title="Not enough dated events yet"
        body={`Timeline Tap builds its daily round from dated moments in this tree — birthdays, anniversaries, remembrances. It needs at least ${MIN_ITEMS} events from different years to make a timeline worth racing (${ROUND_SIZE_FULL} unlocks the full round). Add a birth date to a few family members to start playing.`}
        ctaLabel="Add a birthday"
        onCtaPress={() => router.push('/add-person' as unknown as Href)}
      />
    );
  }

  const isPractice = practiceRun !== 0;

  // ── Result view: restored daily (and not mid-practice), or a
  //    just-finished round (daily or practice). ──
  const showRestored = restored !== null && !isPractice && phase !== 'playing';
  if (showRestored || (phase === 'done' && endState)) {
    const view: DailyState = showRestored
      ? restored!
      : {
          date: today,
          mode,
          tier: round!.tier,
          status: endState!.status,
          score: endState!.score,
          accuracy: endState!.accuracy,
          placedCount: endState!.placedCount,
          total: round!.ordered.length,
          items: round!.ordered.map((i) => ({ label: i.label, year: i.year })),
        };
    const best = view.mode === 'timed' ? bestTimed : bestRelaxed;

    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.subtitle}>
          {isPractice
            ? "Practice round — scores don't count."
            : view.status === 'completed'
              ? 'Timeline complete! A new round arrives at midnight UTC.'
              : "Time ran out — here's how the timeline goes. A new round arrives at midnight UTC."}
        </Text>

        {!isPractice && social && social.treeCompletions > 0 ? (
          <Text style={styles.socialLine}>
            {social.treeCompletions >= 2
              ? `${social.treeCompletions} people in your family finished today's round`
              : "You're the first in your family to finish today's round"}
            {social.treeCompletions >= 3 && social.myRankByScore !== null
              ? ` · You're #${social.myRankByScore} of ${social.treeCompletions} by score today`
              : ''}
          </Text>
        ) : null}

        <View style={styles.resultCard}>
          {isPractice ? <Text style={styles.practiceBadge}>Practice</Text> : null}
          <Text style={styles.resultNumber}>{view.score}</Text>
          <Text style={styles.resultUnit}>
            {view.mode === 'relaxed' ? '% accuracy' : 'points'}
          </Text>
          <View style={styles.resultStats}>
            <Text style={styles.resultStat}>
              Placed {view.placedCount} / {view.total}
            </Text>
            <Text style={styles.resultStat}>Accuracy {view.accuracy}%</Text>
            <Text style={styles.resultStat}>
              Mode {view.mode === 'relaxed' ? 'Relaxed' : 'Timed'}
            </Text>
            {!isPractice && best !== null ? (
              <Text style={styles.resultStat}>
                Best ({view.mode}) {best}
                {view.mode === 'relaxed' ? '%' : ''}
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.railTitle}>Today's timeline</Text>
        <View style={styles.rail}>
          {view.items.map((it) => (
            <View key={`${it.year}-${it.label}`} style={styles.railCard}>
              <Text style={styles.railYear}>{it.year}</Text>
              <Text style={styles.railLabel}>{it.label}</Text>
            </View>
          ))}
        </View>

        {/* Practice is only offered while a round can actually be built
            (same item pool as the daily — only the seed varies). */}
        {round !== null ? (
          <Button
            label="Practice round"
            onPress={() => {
              setPracticeRun((n) => n + 1);
              setPhase('idle');
              setProgress(INITIAL_PROGRESS);
              setEndState(null);
              setMessage(null);
            }}
            style={styles.stretchButton}
          />
        ) : null}
        <Button
          label="Back to games"
          variant="secondary"
          onPress={() => router.back()}
          style={styles.stretchButton}
        />
      </ScrollView>
    );
  }

  // round is non-null past here (empty state handled both-null above; a
  // restored day without a round short-circuits in the result view).
  if (!round) return null;

  const total = round.ordered.length;
  const secondsLeft =
    !relaxed && deadline !== null && phase === 'playing'
      ? Math.max(0, Math.ceil((deadline - now) / 1000))
      : null;

  const placedItems = round.ordered.slice(0, progress.placed);
  const placedIds = new Set(placedItems.map((i) => i.id));
  const poolCards = round.displayOrder
    .map((id) => itemById.get(id)!)
    .filter((i) => !placedIds.has(i.id));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.subtitle}>
        Tap the {total} family events in order, oldest first.
        {relaxed
          ? ' Relaxed mode — no clock, accuracy is everything.'
          : ' Beat the 30-second clock; consecutive hits grow your combo.'}
        {isPractice ? " · Practice round — scores don't count." : ''}
      </Text>

      {round.tier === 'short' ? (
        <Text style={styles.tierNote}>
          Smaller tree, shorter timeline — today's round has {total} events. The full{' '}
          {ROUND_SIZE_FULL}-event round unlocks as you add more dated events (birthdays count!).
        </Text>
      ) : null}

      {/* Mode switch — persisted per device; locked on while the OS asks
          for reduced motion; disabled mid-round. */}
      <View style={styles.modeRow}>
        <Switch
          value={relaxed}
          disabled={reducedMotion || phase === 'playing'}
          onValueChange={toggleRelaxed}
          accessibilityLabel="Relaxed mode (no timer)"
        />
        <Text style={styles.modeLabel}>Relaxed mode (no timer)</Text>
      </View>
      {reducedMotion ? (
        <Text style={styles.modeNote}>
          On automatically — your device asks for reduced motion.
        </Text>
      ) : null}

      {phase === 'idle' ? (
        <View style={styles.startPanel}>
          <Text style={styles.startCopy}>
            {relaxed
              ? `Today's round: ${total} events. Take your time — your score is your accuracy.`
              : `Today's round: ${total} events in 30 seconds. 100 points per correct tap, ×2, ×3… for streaks, plus a bonus for time left on the clock.`}
          </Text>
          {bestTimed !== null || bestRelaxed !== null ? (
            <Text style={styles.bestLine}>
              {bestTimed !== null ? `Timed best: ${bestTimed}` : ''}
              {bestTimed !== null && bestRelaxed !== null ? ' · ' : ''}
              {bestRelaxed !== null ? `Relaxed best: ${bestRelaxed}%` : ''}
            </Text>
          ) : null}
          <Button
            label={isPractice ? 'Start practice round' : "Start today's round"}
            onPress={startRound}
            style={styles.stretchButton}
          />
        </View>
      ) : (
        <>
          {/* HUD: clock (timed) + score/accuracy + combo */}
          <View style={styles.hud}>
            {!relaxed && secondsLeft !== null ? (
              <Text
                style={[styles.hudClock, secondsLeft <= 5 && styles.hudClockLow]}
                accessibilityLabel={`${secondsLeft} seconds left`}
              >
                ⏱ {secondsLeft}s
              </Text>
            ) : null}
            <Text style={styles.hudStat}>
              {relaxed
                ? `Accuracy ${accuracyPct(progress.correct, progress.taps)}%`
                : `Score ${progress.score}`}
            </Text>
            {!relaxed && progress.combo > 1 ? (
              <Text style={styles.hudCombo}>×{progress.combo} combo</Text>
            ) : null}
          </View>

          {/* The ordered rail — placed cards with revealed years */}
          <View style={styles.rail} accessibilityLabel="Placed so far, oldest first">
            {placedItems.map((it) => (
              <View key={it.id} style={styles.railCard}>
                <Text style={styles.railYear}>{it.year}</Text>
                <Text style={styles.railLabel}>{it.label}</Text>
              </View>
            ))}
            {placedItems.length === 0 ? (
              <Text style={styles.railEmpty}>Tap the earliest event to start the rail</Text>
            ) : null}
          </View>

          {/* The shuffled pool — ≥44px tap targets */}
          <View style={styles.pool} accessibilityLabel="Events to place">
            {poolCards.map((it) => (
              <TouchableOpacity
                key={it.id}
                style={[styles.poolCard, flashingId === it.id && styles.poolCardWrong]}
                onPress={() => tapCard(it.id)}
                accessibilityRole="button"
                accessibilityLabel={it.label}
              >
                <Text
                  style={[styles.poolCardLabel, flashingId === it.id && styles.poolCardLabelWrong]}
                >
                  {it.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <Text style={styles.message} accessibilityLiveRegion="polite">
        {message ?? ' '}
      </Text>
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
    modeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: t.spacing.xs,
    },
    modeLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
      marginLeft: t.spacing.sm,
    },
    modeNote: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginBottom: t.spacing.sm,
    },
    startPanel: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.surface,
      padding: t.spacing.lg,
      marginTop: t.spacing.sm,
    },
    startCopy: {
      ...t.typography.body,
      color: t.colors.text,
      textAlign: 'center',
      marginBottom: t.spacing.md,
    },
    bestLine: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginBottom: t.spacing.md,
    },
    hud: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: t.spacing.sm,
    },
    hudClock: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      marginRight: t.spacing.lg,
    },
    hudClockLow: {
      color: t.colors.danger,
    },
    hudStat: {
      ...t.typography.cardTitle,
      color: t.colors.text,
    },
    hudCombo: {
      ...t.typography.cardTitle,
      color: t.colors.success,
      marginLeft: t.spacing.lg,
    },
    rail: {
      marginBottom: t.spacing.md,
    },
    railTitle: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      textAlign: 'center',
      marginBottom: t.spacing.sm,
    },
    railCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.colors.success,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.surface,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
      marginBottom: t.spacing.xs,
    },
    railYear: {
      ...t.typography.rowLabel,
      color: t.colors.success,
      fontWeight: '700',
      marginRight: t.spacing.md,
      minWidth: 48,
    },
    railLabel: {
      ...t.typography.body,
      color: t.colors.text,
      flex: 1,
    },
    railEmpty: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      textAlign: 'center',
      fontStyle: 'italic',
      paddingVertical: t.spacing.sm,
    },
    pool: {
      marginBottom: t.spacing.sm,
    },
    poolCard: {
      minHeight: 44,
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      backgroundColor: t.colors.surface,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.md,
      marginBottom: t.spacing.sm,
    },
    poolCardWrong: {
      borderColor: t.colors.danger,
      backgroundColor: t.colors.dangerSurface,
    },
    poolCardLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
      textAlign: 'center',
    },
    poolCardLabelWrong: {
      color: t.colors.danger,
    },
    message: {
      ...t.typography.cardDescription,
      color: t.colors.text,
      fontWeight: '600',
      textAlign: 'center',
      minHeight: 20,
      marginTop: t.spacing.xs,
    },
    resultCard: {
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.md,
      backgroundColor: t.colors.surface,
      padding: t.spacing.lg,
      marginBottom: t.spacing.md,
    },
    practiceBadge: {
      ...t.typography.sectionHeader,
      color: t.colors.warning,
      marginBottom: t.spacing.xs,
    },
    resultNumber: {
      fontSize: 40,
      fontWeight: '700',
      color: t.colors.text,
    },
    resultUnit: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      marginBottom: t.spacing.sm,
    },
    resultStats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    resultStat: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      marginHorizontal: t.spacing.sm,
      marginTop: t.spacing.xs,
    },
    stretchButton: {
      alignSelf: 'stretch',
      marginTop: t.spacing.sm,
    },
  });
}
