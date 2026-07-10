/**
 * FanView — the Fan view of the Tree tab (radial ancestor wheel, RN rewrite
 * of the web FanChart: genoly-family-web
 * src/components/explorer/fan/FanChart.tsx).
 *
 * Architecture-scout verdict (tree-surfaces-plan.md §5): GO, with
 * constraints. The geometry is deterministic (`lib/tree/fanGeometry.ts`,
 * ported verbatim). The scout's analytical estimate had 4 generations as
 * comfortable, but the 2026-07-09 device pass on a REAL tree (Nalluri,
 * long Telugu names) showed label overlap already at 4-5 — analytical
 * average-name-length legibility underestimated real names. Operator
 * direction: restrict to 3. That's why this view:
 *   - defaults to 3 generations (DEFAULT_FAN_GENERATIONS);
 *   - hard-caps at 3 (MAX_FAN_GENERATIONS) — the generation control never
 *     offers 4 or higher, and the render loop clamps defensively even if a
 *     caller passed a larger value;
 *   - requires pinch-to-zoom (the shared ZoomPanView, same as
 *     Explore/Pedigree) — that's the mitigation the web Fan doesn't need
 *     but this one does; it's what tips gen 4/5 outer labels from
 *     "borderline" to legible on demand.
 *
 * Simplifications vs. the web FanChart (mirrored the Pedigree Classic
 * precedent, which shipped in PR #31 and was removed 2026-07-09):
 *   - no hover-path highlight (`isOnAncestralPath` still ships — and is
 *     unit-tested — but this view doesn't wire it up: touch has no hover,
 *     and long-press is already spoken for by "open profile", so there's no
 *     gesture left to drive a highlight without colliding with re-anchor/
 *     open-profile — plan §2.4 calls this an acceptable drop);
 *   - no roving-tabindex keyboard nav (a touch/VoiceOver concept, not a
 *     hardware-keyboard one — VoiceOver still reads each wedge via its own
 *     `accessibilityLabel` in DOM/paint order);
 *   - tap a wedge → re-anchor the fan on that ancestor; long-press a wedge,
 *     or tap/long-press the centre disc → open that person's profile
 *     (mirrors ExploreCanvas/PedigreeClassic's gesture convention).
 *
 * Data: `pedigree:getAncestorTree` (the SAME nested-shape query Pedigree
 * Classic uses — no new query, plan §2.4). Rooted at the shell's shared
 * anchor; re-anchoring here moves that shared anchor, so switching back to
 * Explore/Register/Pedigree reflects the new anchor too.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText, TSpan } from 'react-native-svg';

import type { AncestorNode } from '../../lib/tree/explorerTypes';
import {
  ancestorRelationship,
  annularSectorPath,
  extractYear,
  fanSize,
  flattenAncestors,
  innerArcPath,
  labelTransform,
  ringRadii,
  slotFraction,
} from '../../lib/tree/fanGeometry';
import { genderAccents, useTheme, useThemedStyles, type Theme } from '../../theme';
import { EmptyState, Skeleton } from '../../components/ui';
import { ZoomPanView } from './ZoomPanView';

/**
 * Mobile generation-depth policy (tree-surfaces-plan.md §5 — the fan
 * legibility analysis). Default 4 (comfortably legible at native scale),
 * hard cap 5 (borderline — relies on pinch-zoom). 6-7 are NEVER offered on
 * mobile; the web's `gens` range of 2-7 does not apply here.
 */
export const DEFAULT_FAN_GENERATIONS = 3;
export const MIN_FAN_GENERATIONS = 2;
export const MAX_FAN_GENERATIONS = 3;

/** Fallback square size before the viewport reports its own layout (first paint). */
const FALLBACK_FAN_SIZE = 390;

function clampGenerations(g: number): number {
  return Math.max(MIN_FAN_GENERATIONS, Math.min(MAX_FAN_GENERATIONS, Math.round(g)));
}

function slotKey(generation: number, slotIndex: number): string {
  return `${generation}:${slotIndex}`;
}

/** Truncate long names so a rotated label stays inside its wedge (web parity). */
function clampName(name: string, generation: number): string {
  const max = generation <= 2 ? 18 : generation <= 4 ? 12 : 9;
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function formatLifespan(p: { isLiving: boolean; birthYear?: number; deathYear?: number }): string {
  if (p.isLiving) return p.birthYear ? `b. ${p.birthYear}` : '';
  if (p.birthYear || p.deathYear) return `${p.birthYear ?? '?'}–${p.deathYear ?? '?'}`;
  return '';
}

function genderAccent(gender: string | undefined, theme: Theme): string {
  if (gender === 'male') return genderAccents.male;
  if (gender === 'female') return genderAccents.female;
  return theme.colors.border;
}

interface Cell {
  generation: number;
  slotIndex: number;
}
interface PersonArc extends Cell {
  kind: 'person';
  node: AncestorNode;
}
interface EmptyArc extends Cell {
  kind: 'empty';
}
type Arc = PersonArc | EmptyArc;

export interface FanViewProps {
  /** `pedigree:getAncestorTree` result: undefined = loading, null = person not found. */
  ancestorTree: AncestorNode | null | undefined;
  /** The person the fan is currently rooted at (the shell's shared anchor). */
  personId: string | null;
  /** The viewer's resolved person, for the "Back to me" affordance. */
  viewerPersonId?: string | null;
  generations: number;
  onGenerationsChange: (generations: number) => void;
  /** Re-anchor the fan on this person (writes back to the shared anchor). */
  onReAnchor: (personId: string) => void;
  onOpenPerson: (personId: string) => void;
}

export function FanView({
  ancestorTree,
  personId,
  viewerPersonId,
  generations,
  onGenerationsChange,
  onReAnchor,
  onOpenPerson,
}: FanViewProps) {
  const t = useTheme();
  const styles = useThemedStyles(createStyles);
  const gens = clampGenerations(generations);

  // Fixed logical-pt square (plan §5: fanSize(390,844) clamps to 360 — the
  // wheel nearly fills a phone's width). Unlike Explore/Pedigree's
  // data-dependent bounding box, the wheel's own size is what matters here,
  // so a stable fallback estimate is fine — ZoomPanView's pan/pinch handles
  // the rest regardless of the exact viewport the device reports.
  const size = fanSize(FALLBACK_FAN_SIZE, FALLBACK_FAN_SIZE * 2);
  const cx = size / 2;
  const cy = size / 2;
  const centerRadius = size * 0.12;
  const maxRadius = size / 2 - 6;

  const { arcs } = useMemo(() => {
    const present = flattenAncestors(ancestorTree ?? null);
    const map = new Map<string, AncestorNode>();
    for (const d of present) {
      if (d.generation >= 1) map.set(slotKey(d.generation, d.slotIndex), d.node);
    }

    const built: Arc[] = [];
    for (let g = 1; g <= gens; g++) {
      const count = 2 ** g;
      for (let s = 0; s < count; s++) {
        const node = map.get(slotKey(g, s));
        if (node) {
          built.push({ kind: 'person', generation: g, slotIndex: s, node });
          continue;
        }
        // Draw an empty wedge only for a *present* person's unknown parent —
        // never expand into wholly-unknown branches (keeps the wheel honest).
        const parentPresent = g === 1 || map.has(slotKey(g - 1, s >> 1));
        if (parentPresent) built.push({ kind: 'empty', generation: g, slotIndex: s });
      }
    }
    return { arcs: built };
  }, [ancestorTree, gens]);

  // ── No anchor yet ────────────────────────────────────────────────────
  if (!personId) {
    return (
      <EmptyState
        icon="🎡"
        title="No one to fan out from"
        body="Once people are added to this tree, their ancestors will radiate out from the centre here."
        testID="fan-empty"
      />
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────
  if (ancestorTree === undefined) {
    return (
      <View style={styles.fill} testID="fan-loading">
        <Skeleton height={44} />
        <Skeleton height={220} />
      </View>
    );
  }

  // ── Error / not found (query returned null — e.g. stale/removed anchor) ─
  if (ancestorTree === null) {
    return (
      <EmptyState
        icon="❓"
        title="Couldn't build the fan"
        body="This person may have been removed. Pick someone else from Register and try again."
        testID="fan-error"
      />
    );
  }

  const anchor = ancestorTree;
  const anchorName = `${anchor.preferredName}${anchor.surname ? ` ${anchor.surname}` : ''}`;
  const anchorLifespan = formatLifespan({
    isLiving: anchor.isLiving,
    birthYear: extractYear(anchor.birthDate),
    deathYear: extractYear(anchor.deathDate),
  });

  const centerOn = { x: cx, y: cy };

  return (
    <View style={styles.fill} testID="fan-view">
      {/* Controls row: generation-depth control + back-to-me. */}
      <View style={styles.controlsRow}>
        <View style={styles.generationsRow}>
          <Text style={styles.generationsLabel}>Generations</Text>
          {Array.from(
            { length: MAX_FAN_GENERATIONS - MIN_FAN_GENERATIONS + 1 },
            (_, i) => i + MIN_FAN_GENERATIONS,
          ).map((g) => {
            const selected = g === gens;
            return (
              <TouchableOpacity
                key={g}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show ${g} generations of ancestors`}
                activeOpacity={0.7}
                onPress={() => onGenerationsChange(g)}
                style={[styles.generationsChip, selected && styles.generationsChipSelected]}
              >
                <Text
                  style={[
                    styles.generationsChipText,
                    selected && styles.generationsChipTextSelected,
                  ]}
                >
                  {g}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {viewerPersonId && personId !== viewerPersonId ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Fan out from me"
            activeOpacity={0.7}
            onPress={() => onReAnchor(viewerPersonId)}
            style={styles.backToMe}
          >
            <Text style={styles.backToMeText}>◎ Me</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ZoomPanView
        contentWidth={size}
        contentHeight={size}
        centerOn={centerOn}
        centerKey={`${personId}~${gens}`}
        centerScale={1}
        accessibilityLabel="Radial ancestor fan. The centre is the current focus; tap an ancestor wedge to make them the new focus, or long-press any wedge (or the centre) to open their profile."
      >
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {arcs.map((arc) => {
            const { start, end } = slotFraction(arc.generation, arc.slotIndex);
            const { inner, outer } = ringRadii(arc.generation, gens, centerRadius, maxRadius);
            const path = annularSectorPath({
              cx,
              cy,
              innerR: inner,
              outerR: outer,
              startFraction: start,
              endFraction: end,
            });
            const key = slotKey(arc.generation, arc.slotIndex);

            if (arc.kind === 'empty') {
              return (
                <Path
                  key={`empty-${key}`}
                  d={path}
                  fill={t.colors.surfaceMuted}
                  fillOpacity={0.28}
                  stroke={t.colors.border}
                  strokeWidth={1}
                  strokeDasharray="3,3"
                />
              );
            }

            return (
              <PersonWedge
                key={`person-${key}`}
                arc={arc}
                cx={cx}
                cy={cy}
                inner={inner}
                outer={outer}
                start={start}
                end={end}
                path={path}
                theme={t}
                onPress={() => onReAnchor(arc.node._id)}
                onLongPress={() => onOpenPerson(arc.node._id)}
              />
            );
          })}

          {/* Centre disc — the anchor. */}
          <G
            onPress={() => onOpenPerson(personId)}
            onLongPress={() => onOpenPerson(personId)}
            accessible
            accessibilityLabel={`${anchorName}, you${anchorLifespan ? `, ${anchorLifespan}` : ''}. Tap or long-press to open their profile.`}
          >
            <Circle
              cx={cx}
              cy={cy}
              r={centerRadius}
              fill={t.colors.surface}
              stroke={t.colors.primary}
              strokeWidth={3}
            />
            <SvgText x={cx} y={cy} textAnchor="middle">
              <TSpan
                x={cx}
                dy={anchorLifespan ? -14 : -4}
                fontSize={10}
                fontWeight="700"
                letterSpacing={1}
                fill={t.colors.primary}
              >
                YOU
              </TSpan>
              <TSpan x={cx} dy={16} fontSize={13} fontWeight="600" fill={t.colors.text}>
                {clampName(anchor.preferredName, 1)}
              </TSpan>
              {anchorLifespan ? (
                <TSpan x={cx} dy={15} fontSize={11} fill={t.colors.textMuted}>
                  {anchorLifespan}
                </TSpan>
              ) : null}
            </SvgText>
          </G>
        </Svg>
      </ZoomPanView>

      <Text style={styles.hint}>
        Tap any ancestor to re-centre the fan on them. Long-press to open their profile. Pinch to
        zoom in on outer-ring labels.
      </Text>
    </View>
  );
}

function PersonWedge({
  arc,
  cx,
  cy,
  inner,
  outer,
  start,
  end,
  path,
  theme,
  onPress,
  onLongPress,
}: {
  arc: PersonArc;
  cx: number;
  cy: number;
  inner: number;
  outer: number;
  start: number;
  end: number;
  path: string;
  theme: Theme;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { node, generation } = arc;
  const ringFill = generation % 2 === 0 ? theme.colors.surface : theme.colors.surfaceMuted;
  const relationship = ancestorRelationship(generation, node.gender);
  const fullName = `${node.preferredName}${node.surname ? ` ${node.surname}` : ''}`;
  const lifespan = formatLifespan({
    isLiving: node.isLiving,
    birthYear: extractYear(node.birthDate),
    deathYear: extractYear(node.deathDate),
  });
  const midF = (start + end) / 2;
  const midR = (inner + outer) / 2;
  const a11y = [
    fullName,
    `generation ${generation} ancestor`,
    relationship,
    lifespan,
    'tap to make them the new focus; long-press to open their profile',
  ]
    .filter(Boolean)
    .join(', ');
  const hasSubLabel = generation <= 2 && !!lifespan;

  return (
    <G onPress={onPress} onLongPress={onLongPress} accessible accessibilityLabel={a11y}>
      <Path d={path} fill={ringFill} stroke={theme.colors.border} strokeWidth={1.5} />
      <Path
        d={innerArcPath({ cx, cy, innerR: inner, startFraction: start, endFraction: end })}
        fill="none"
        stroke={genderAccent(node.gender, theme)}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <SvgText
        transform={labelTransform(cx, cy, midR, midF)}
        textAnchor="middle"
        opacity={!node.isLiving ? 0.82 : 1}
      >
        <TSpan x={0} dy={hasSubLabel ? -6 : 0} fontSize={12} fill={theme.colors.text}>
          {clampName(node.preferredName, generation)}
        </TSpan>
        {hasSubLabel ? (
          <TSpan x={0} dy={14} fontSize={10} fill={theme.colors.textMuted}>
            {lifespan}
          </TSpan>
        ) : null}
      </SvgText>
    </G>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    fill: {
      flex: 1,
    },
    controlsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: t.spacing.sm,
    },
    generationsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    generationsLabel: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      marginRight: t.spacing.sm,
    },
    generationsChip: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.xs,
      paddingHorizontal: t.spacing.sm,
      marginRight: t.spacing.xs,
      backgroundColor: t.colors.bgElevated,
      minHeight: 28,
      minWidth: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    generationsChipSelected: {
      backgroundColor: t.colors.primary,
      borderColor: t.colors.primary,
    },
    generationsChipText: {
      fontSize: 12,
      fontWeight: '500',
      color: t.colors.text,
    },
    generationsChipTextSelected: {
      color: t.colors.onPrimary,
      fontWeight: '600',
    },
    backToMe: {
      paddingVertical: t.spacing.xs,
      paddingHorizontal: t.spacing.sm,
      minHeight: 28,
      justifyContent: 'center',
    },
    backToMeText: {
      fontSize: 13,
      fontWeight: '600',
      color: t.colors.link,
    },
    hint: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginTop: t.spacing.sm,
    },
  });
}
