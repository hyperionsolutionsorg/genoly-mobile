/**
 * Atlas Quiz — mobile port of src/pages/games/AtlasQuiz.tsx (games port,
 * 2026-07-13). Geoguessr-for-relatives: 5 rounds, tap the world map where
 * you think each family member was born, scored by great-circle distance
 * on the web's tiered scale (1000/800/600/400/250/100/25/0). Best total
 * persists under the web-compatible `genoly:atlasquiz:best:${treeId}` key.
 *
 * Pool = persons with a FINITE recorded birth-event location ONLY —
 * timezone-derived "current" locations are deliberately excluded because
 * the prompt is "Where was X born?", and answering with someone's current
 * location would be misleading (e.g. born in India, living in the US —
 * see the 2026-06-02 bug report noted in the web source). Per-session
 * seeded Fisher–Yates shuffle (LCG), ported verbatim.
 *
 * RN adaptations: d3-geo + world-atlas TopoJSON are pure JS, so the map
 * renders through react-native-svg. The web's mouse clientX/rect math
 * becomes Pressable locationX/Y scaled into the 960x500 viewBox and
 * pushed through projection.invert (with a reprojection round-trip check
 * to reject taps outside the sphere).
 */

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { geoEqualEarth, geoPath, type GeoSphere } from 'd3-geo';

import { EmptyState, Skeleton, Button } from '../ui';
import { getAtlasData } from '../../lib/genolyApi';
import { useTheme, useThemedStyles, type Theme } from '../../theme';
import { loadGameState, saveGameState, type GameScreenProps } from './common';

const ROUNDS = 5;
/** Internal SVG coordinate space — all projection math happens here and
 *  the viewBox scales it to whatever width the screen gives us. */
const MAP_W = 960;
const MAP_H = 500;

const SPHERE: GeoSphere = { type: 'Sphere' };

// Build the world ONCE at module level — the topology, projection, and
// path strings are static (only their colors are themed at render time).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- REASON: world-atlas ships raw JSON; require keeps it Metro-bundlable and mirrors common.ts's lazy-require style.
const worldTopo = require('world-atlas/countries-110m.json') as unknown as Topology & {
  objects: { countries: GeometryCollection };
};
const COUNTRIES = feature(worldTopo, worldTopo.objects.countries);

const projection = geoEqualEarth().fitSize([MAP_W, MAP_H], SPHERE);
const pathGen = geoPath(projection);
const SPHERE_PATH = pathGen(SPHERE) ?? '';
// All land merged into ONE path string — one native SVG node instead of
// ~175 keeps react-native-svg fast; country borders still stroke per
// subpath.
const LAND_PATH = COUNTRIES.features.map((f) => pathGen(f) ?? '').join(' ');

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Tiered scoring — thresholds identical to the web. */
function scoreFromDistance(km: number): number {
  if (km < 50) return 1000;
  if (km < 200) return 800;
  if (km < 500) return 600;
  if (km < 1000) return 400;
  if (km < 2500) return 250;
  if (km < 5000) return 100;
  if (km < 10000) return 25;
  return 0;
}

interface RoundResult {
  personId: string;
  name: string;
  actualLat: number;
  actualLng: number;
  guessLat: number;
  guessLng: number;
  distanceKm: number;
  points: number;
}

export default function AtlasQuiz({ treeId }: GameScreenProps) {
  const router = useRouter();
  const t = useTheme();
  const styles = useThemedStyles(createStyles);
  const atlas = useQuery(getAtlasData, { treeId });

  // Stable per-session shuffle seed (fixed at mount) so the seeded
  // Fisher–Yates below stays pure across re-renders — same as the web.
  const [shuffleSeed] = useState<number>(() => Math.floor(Math.random() * 1_000_000));

  // Candidate pool — ONLY persons with a recorded birth-event place
  // (birthLat/birthLng); see the header comment for why current-location
  // fallbacks are excluded. Deterministic LCG shuffle keyed by shuffleSeed.
  const pool = useMemo(() => {
    if (!atlas) return null;
    const placed = atlas.personsTime.filter(
      (p) =>
        p.birthLat !== null &&
        p.birthLng !== null &&
        Number.isFinite(p.birthLat) &&
        Number.isFinite(p.birthLng),
    );
    let h = shuffleSeed | 0;
    const next = () => {
      h = Math.imul(h, 16807) % 2147483647;
      return (h & 0x7fffffff) / 2147483647;
    };
    const a = placed.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, [atlas, shuffleSeed]);

  const [roundIndex, setRoundIndex] = useState(0);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [currentGuess, setCurrentGuess] = useState<{ lat: number; lng: number } | null>(null);
  const [mapSize, setMapSize] = useState<{ width: number; height: number } | null>(null);

  const target = pool && pool.length > 0 ? pool[roundIndex % pool.length] : null;
  const finished = roundIndex >= ROUNDS;
  const totalScore = roundResults.reduce((s, r) => s + r.points, 0);

  // Best total persisted per tree — same key + number shape as the web's
  // localStorage entry.
  const bestKey = `genoly:atlasquiz:best:${treeId}`;
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadGameState<number>(bestKey).then((b) => {
      if (!cancelled && b !== null && Number.isFinite(b)) setBest(b);
    });
    return () => {
      cancelled = true;
    };
  }, [bestKey]);
  useEffect(() => {
    if (!finished) return;
    if (best === null || totalScore > best) {
      setBest(totalScore);
      saveGameState(bestKey, totalScore);
    }
  }, [finished, totalScore, best, bestKey]);

  // After lock-in, the result for THIS round stays visible until "Next"
  // advances roundIndex — same identity trick as the web (currentGuess is
  // intentionally NOT cleared on lock-in).
  const lastResult = roundResults[roundResults.length - 1];
  const lockedThisRound =
    !!target && !!lastResult && lastResult.personId === String(target.personId);

  const onMapLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setMapSize({ width, height });
  };

  /** Tap → geo: scale the touch point into viewBox space, invert the
   *  projection, and reject anything outside the sphere (invert on Equal
   *  Earth extrapolates, so we round-trip the coords to verify). */
  const handleMapPress = (e: GestureResponderEvent) => {
    if (!mapSize || mapSize.width <= 0 || mapSize.height <= 0) return;
    if (finished || !target) return;
    if (currentGuess) return; // already placed this round; wait for Next
    const svgX = (e.nativeEvent.locationX / mapSize.width) * MAP_W;
    const svgY = (e.nativeEvent.locationY / mapSize.height) * MAP_H;
    const inverted = projection.invert?.([svgX, svgY]);
    if (!inverted) return;
    const [lng, lat] = inverted;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const roundTrip = projection([lng, lat]);
    if (!roundTrip) return;
    if (Math.abs(roundTrip[0] - svgX) > 0.5 || Math.abs(roundTrip[1] - svgY) > 0.5) {
      return; // tapped the ocean-of-nothing outside the projection sphere
    }
    setCurrentGuess({ lat, lng });
  };

  const lockInGuess = () => {
    if (!currentGuess || !target) return;
    // BIRTH coords for the "where was X born" prompt — non-null by virtue
    // of the pool filter; ?? fallback kept for parity with the web.
    const actualLat = target.birthLat ?? target.lat;
    const actualLng = target.birthLng ?? target.lng;
    const km = haversineKm(currentGuess.lat, currentGuess.lng, actualLat, actualLng);
    const result: RoundResult = {
      personId: String(target.personId),
      name: target.name,
      actualLat,
      actualLng,
      guessLat: currentGuess.lat,
      guessLng: currentGuess.lng,
      distanceKm: km,
      points: scoreFromDistance(km),
    };
    setRoundResults((rs) => [...rs, result]);
  };

  const nextRound = () => {
    setCurrentGuess(null);
    setRoundIndex((i) => i + 1);
  };

  const playAgain = () => {
    setRoundIndex(0);
    setRoundResults([]);
    setCurrentGuess(null);
  };

  if (!atlas) {
    return (
      <View style={styles.loading}>
        <Skeleton height={104} />
        <Skeleton height={280} />
      </View>
    );
  }

  if (!pool || pool.length < 2) {
    const qualifyingCount = pool?.length ?? 0;
    return (
      <EmptyState
        icon="🗺️"
        title="Not enough birthplaces yet"
        body={`Need at least 2 family members with a geocoded birth location. Currently ${qualifyingCount} qualify. Add a birth event with a place that auto-completes from the place picker — no birth date required.`}
        ctaLabel="Back to games"
        onCtaPress={() => router.back()}
      />
    );
  }

  if (finished) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.endTitle}>Round complete</Text>
        <Text style={styles.subtitle}>
          Final score: <Text style={styles.strong}>{totalScore}</Text> / {ROUNDS * 1000}
          {best !== null ? (
            <Text>
              {' '}· Best: <Text style={styles.strong}>{best}</Text>
            </Text>
          ) : null}
        </Text>
        <View style={styles.resultList}>
          {roundResults.map((r, i) => (
            <View key={i} style={styles.resultRow}>
              <Text style={styles.resultName} numberOfLines={1}>
                <Text style={styles.strong}>{r.name}</Text> — {Math.round(r.distanceKm)} km off
              </Text>
              <Text style={styles.resultPoints}>{r.points} pts</Text>
            </View>
          ))}
        </View>
        <Button label="Play again" onPress={playAgain} style={styles.actionButton} />
        <Button
          label="Back to games"
          variant="secondary"
          onPress={() => router.back()}
          style={styles.actionButton}
        />
      </ScrollView>
    );
  }

  const projGuess = currentGuess ? projection([currentGuess.lng, currentGuess.lat]) : null;
  // Truth marker draws from the LAST result's actual coords so it matches
  // whatever data source generated the round (birth-only or fallback).
  const projActual =
    lockedThisRound && lastResult
      ? projection([lastResult.actualLng, lastResult.actualLat])
      : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.subtitle}>
        Tap the map to guess where each family member was born. Closer = more points.
      </Text>

      <View style={styles.promptRow}>
        <View style={styles.promptText}>
          <Text style={styles.meta}>
            Round {roundIndex + 1} / {ROUNDS} · Score {totalScore}
          </Text>
          <Text style={styles.targetLine}>
            Where was <Text style={styles.strong}>{target?.name}</Text>
            {target?.birthYear ? ` (b. ${target.birthYear})` : ''} born?
          </Text>
        </View>
        <View style={styles.progressRow}>
          {Array.from({ length: ROUNDS }).map((_, i) => (
            <View
              key={i}
              style={[styles.progressDot, i < roundResults.length && styles.progressDotDone]}
            />
          ))}
        </View>
      </View>

      <Pressable
        style={styles.mapWrap}
        onLayout={onMapLayout}
        onPress={handleMapPress}
        accessibilityLabel="World map — tap to place your guess"
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          pointerEvents="none"
        >
          <Path d={SPHERE_PATH} fill={t.colors.surfaceMuted} />
          <Path d={LAND_PATH} fill={t.colors.bgElevated} stroke={t.colors.border} strokeWidth={0.5} />
          {projGuess ? (
            <Circle
              cx={projGuess[0]}
              cy={projGuess[1]}
              r={7}
              fill={t.colors.primary}
              stroke={t.colors.bg}
              strokeWidth={1.5}
            />
          ) : null}
          {lockedThisRound && projActual && projGuess ? (
            <>
              <Line
                x1={projGuess[0]}
                y1={projGuess[1]}
                x2={projActual[0]}
                y2={projActual[1]}
                stroke={t.colors.danger}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <Circle
                cx={projActual[0]}
                cy={projActual[1]}
                r={7}
                fill={t.colors.success}
                stroke={t.colors.bg}
                strokeWidth={1.5}
              />
            </>
          ) : null}
        </Svg>
      </Pressable>

      <View style={styles.actions}>
        {!lockedThisRound && currentGuess ? (
          <Button label="Lock in this spot" onPress={lockInGuess} style={styles.actionButton} />
        ) : null}
        {!lockedThisRound && !currentGuess ? (
          <Text style={styles.meta}>Tap anywhere on the map to place your guess.</Text>
        ) : null}
        {lockedThisRound && lastResult ? (
          <>
            <Text style={styles.resultLine}>
              {Math.round(lastResult.distanceKm)} km off · {lastResult.points} pts
            </Text>
            <Button
              label={roundIndex + 1 >= ROUNDS ? 'See results' : 'Next round →'}
              onPress={nextRound}
              style={styles.actionButton}
            />
          </>
        ) : null}
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
    subtitle: {
      ...t.typography.subtitle,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginBottom: t.spacing.lg,
    },
    strong: {
      fontWeight: '700',
      color: t.colors.text,
    },
    promptRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: t.spacing.md,
      gap: t.spacing.md,
    },
    promptText: {
      flex: 1,
    },
    meta: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
    },
    targetLine: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      marginTop: t.spacing.xs,
    },
    progressRow: {
      flexDirection: 'row',
      gap: t.spacing.xs,
    },
    progressDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: t.colors.border,
    },
    progressDotDone: {
      backgroundColor: t.colors.primary,
    },
    mapWrap: {
      width: '100%',
      aspectRatio: MAP_W / MAP_H,
      borderRadius: t.radius.md,
      overflow: 'hidden',
      backgroundColor: t.colors.surface,
    },
    actions: {
      marginTop: t.spacing.lg,
      alignItems: 'center',
      gap: t.spacing.sm,
    },
    actionButton: {
      alignSelf: 'stretch',
      marginTop: t.spacing.sm,
    },
    resultLine: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      textAlign: 'center',
    },
    endTitle: {
      ...t.typography.screenTitle,
      color: t.colors.text,
      textAlign: 'center',
      marginBottom: t.spacing.sm,
    },
    resultList: {
      marginTop: t.spacing.md,
      marginBottom: t.spacing.md,
    },
    resultRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
      gap: t.spacing.md,
    },
    resultName: {
      ...t.typography.body,
      color: t.colors.text,
      flex: 1,
    },
    resultPoints: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
  });
}
