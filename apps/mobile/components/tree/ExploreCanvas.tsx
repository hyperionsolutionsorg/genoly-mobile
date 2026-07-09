/**
 * ExploreCanvas — the perspective Explore view, the Tree tab's DEFAULT mode.
 *
 * RN rewrite of the web PerspectiveCanvas (genoly-family-web
 * src/components/explorer/perspective/PerspectiveCanvas.tsx): the pure
 * scope/layout/label passes are the PORTED modules under lib/tree/ — this file
 * only renders their output with react-native-svg inside the shared
 * ZoomPanView pan/pinch viewport (replacing @xyflow/react).
 *
 * Read-only by construction (no mutations):
 *   - tap a card → re-anchor the perspective to that person;
 *   - long-press a card → open their profile page;
 *   - married-in cards with an off-canvas family show the twin-diamond swap
 *     handle (informational on mobile — tap already re-anchors);
 *   - "+N" pills mark collapsed kin; intermarriage chips (⇄) re-anchor.
 *
 * Default generation radius is ±2 on mobile (svg render budget — the web
 * defaults to ±3 with viewport culling ReactFlow provides and we don't);
 * the control allows up to ±4. The server clamps at ±5.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import type { ExplorerGraphResult } from '../../lib/tree/explorerTypes';
import { computePerspectiveScope } from '../../lib/tree/perspectiveScope';
import {
  computePerspectiveLayout,
  unionNodeId,
  type LaidHubNode,
  type LaidPersonNode,
} from '../../lib/tree/perspectiveLayout';
import {
  computeRelationshipLabel,
  type RelationshipGraph,
} from '../../lib/tree/relationshipCore';
import { buildRelationshipGraph } from '../../lib/tree/listHelpers';
import { useTheme, useThemedStyles, type Theme } from '../../theme';
import { Banner, EmptyState, Skeleton } from '../../components/ui';
import { ZoomPanView } from './ZoomPanView';

/** Mobile radius policy (plan §2.1): default ±2, control up to ±4. */
export const DEFAULT_EXPLORE_RADIUS = 2;
export const MAX_EXPLORE_RADIUS = 4;
/** The server's own ceiling (explorerGraph MAX_RADIUS). */
const RADIUS_CEILING = 5;

const CANVAS_PAD = 48;

export interface ExploreCanvasProps {
  graph: ExplorerGraphResult | undefined;
  anchorId: string | null;
  radius: number;
  onRadiusChange: (radius: number) => void;
  onReAnchor: (personId: string) => void;
  onOpenPerson: (personId: string) => void;
}

function formatLifespan(p: { isLiving: boolean; birthYear?: number; deathYear?: number }): string {
  if (p.isLiving) return p.birthYear ? `b. ${p.birthYear}` : '';
  if (p.birthYear || p.deathYear) return `${p.birthYear ?? '?'}–${p.deathYear ?? '?'}`;
  return '';
}

function clampName(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/** Viewer-framed "Your X" labels for every non-viewer person (web parity). */
function computeLabels(
  graph: ExplorerGraphResult,
): Map<string, { label: string; muted: boolean }> {
  const out = new Map<string, { label: string; muted: boolean }>();
  const viewer = graph.viewerPersonId;
  if (!viewer) return out;
  const relGraph: RelationshipGraph = buildRelationshipGraph(graph.persons, graph.familyEdges);
  const muted = graph.viewerConfidence !== 'linked';
  for (const p of graph.persons) {
    if (p._id === viewer) continue;
    const framed = computeRelationshipLabel(viewer, p._id, relGraph, {
      confidence: graph.viewerConfidence,
    });
    if (framed.kind !== 'none') out.set(p._id, { label: framed.label, muted });
  }
  return out;
}

export function ExploreCanvas({
  graph,
  anchorId,
  radius,
  onRadiusChange,
  onReAnchor,
  onOpenPerson,
}: ExploreCanvasProps) {
  const t = useTheme();
  const styles = useThemedStyles(createStyles);

  const computed = useMemo(() => {
    if (!graph || graph.persons.length === 0 || !anchorId) return null;
    const scope = computePerspectiveScope({
      anchorId,
      persons: graph.persons,
      familyEdges: graph.familyEdges,
    });
    const layout = computePerspectiveLayout(scope);
    const labels = computeLabels(graph);
    const personById = new Map(graph.persons.map((p) => [p._id, p]));

    // Normalize the (negative-coordinate) layout into a 0-based viewBox.
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const n of layout.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    const originX = minX - CANVAS_PAD;
    const originY = minY - CANVAS_PAD;
    const width = maxX - minX + CANVAS_PAD * 2;
    const height = maxY - minY + CANVAS_PAD * 2;

    return { scope, layout, labels, personById, originX, originY, width, height };
  }, [graph, anchorId]);

  // ── Loading / empty ──────────────────────────────────────────────────
  if (graph === undefined) {
    return (
      <View style={styles.fill} testID="explore-loading">
        <Skeleton height={44} />
        <Skeleton height={220} />
      </View>
    );
  }
  if (!computed) {
    return (
      <EmptyState
        icon="🌱"
        title="No one to explore yet"
        body="People added to this tree will appear here. Tap a person's card to see the family from their side."
        testID="explore-empty"
      />
    );
  }

  const { scope, layout, labels, personById, originX, originY, width, height } = computed;
  const viewerPersonId = graph.viewerPersonId;
  const hitCeiling = graph.caps.hitRadiusCeiling;

  const centerOn = {
    x: layout.anchorCenter.x - originX,
    y: layout.anchorCenter.y - originY,
  };

  const personNodes = layout.nodes.filter((n): n is LaidPersonNode => n.kind === 'person');
  const hubNodes = layout.nodes.filter((n): n is LaidHubNode => n.kind === 'hub');

  return (
    <View style={styles.fill} testID="explore-canvas">
      {/* Controls row: generation radius + back-to-me. */}
      <View style={styles.controlsRow}>
        <View style={styles.radiusRow}>
          <Text style={styles.radiusLabel}>Generations</Text>
          {Array.from({ length: MAX_EXPLORE_RADIUS }, (_, i) => i + 1).map((r) => {
            const selected = r === radius;
            return (
              <TouchableOpacity
                key={r}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show ${r} generation${r === 1 ? '' : 's'} each way`}
                activeOpacity={0.7}
                onPress={() => onRadiusChange(r)}
                style={[styles.radiusChip, selected && styles.radiusChipSelected]}
              >
                <Text style={[styles.radiusChipText, selected && styles.radiusChipTextSelected]}>
                  ±{r}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {viewerPersonId && anchorId !== viewerPersonId ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back to my family"
            activeOpacity={0.7}
            onPress={() => onReAnchor(viewerPersonId)}
            style={styles.backToMe}
          >
            <Text style={styles.backToMeText}>◎ Me</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ZoomPanView
        contentWidth={width}
        contentHeight={height}
        centerOn={centerOn}
        centerKey={`${anchorId}~${radius}`}
        accessibilityLabel="Family perspective canvas. Tap a person to see the family from their side; long-press to open their profile."
      >
        <Svg width={width} height={height} viewBox={`${originX} ${originY} ${width} ${height}`}>
          {/* Connectors under the cards. */}
          {layout.edges.map((e) => (
            <Polyline
              key={e.id}
              points={e.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={e.kind === 'couple' ? t.colors.textMuted : t.colors.border}
              strokeWidth={e.kind === 'couple' ? 2 : 1.5}
            />
          ))}

          {/* Union rings. */}
          {hubNodes.map((n) => {
            const cx = n.x + n.width / 2;
            const cy = n.y + n.height / 2;
            const dashed = n.familyType === 'unmarried' || n.familyType === 'partnered';
            const ended = n.status === 'ended';
            const badge = scope.badges.get(unionNodeId(n.familyId)) ?? 0;
            const chipId = n.linkedSpouseId;
            const chipName = chipId ? (personById.get(chipId)?.preferredName ?? null) : null;
            return (
              <G key={n.id} opacity={ended ? 0.5 : 1}>
                {n.isCouple ? (
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={n.width / 2}
                    fill={n.isPrimary ? t.colors.surfaceMuted : t.colors.bg}
                    stroke={t.colors.textMuted}
                    strokeWidth={1.5}
                    strokeDasharray={dashed ? '3,3' : undefined}
                  />
                ) : null}
                {n.isDetached ? (
                  <Circle cx={cx} cy={cy} r={2.5} fill={t.colors.textMuted} />
                ) : null}
                {chipId && chipName ? (
                  <G onPress={() => onReAnchor(chipId)}>
                    <SvgText
                      x={cx}
                      y={cy - n.height / 2 - 6}
                      fontSize={11}
                      fill={t.colors.link}
                      textAnchor="middle"
                    >
                      {`⇄ ${clampName(chipName, 14)}`}
                    </SvgText>
                  </G>
                ) : null}
                {badge > 0 ? (
                  <SvgText
                    x={cx + n.width / 2 + 4}
                    y={cy + 4}
                    fontSize={11}
                    fontWeight="600"
                    fill={t.colors.info}
                  >
                    {`+${badge}`}
                  </SvgText>
                ) : null}
              </G>
            );
          })}

          {/* Person cards. */}
          {personNodes.map((n) => {
            const p = personById.get(n.id);
            const isAnchor = n.id === anchorId;
            const isViewer = n.id === viewerPersonId;
            const name = clampName(
              `${p?.preferredName ?? 'Unknown'}${p?.surname ? ` ${p.surname}` : ''}`,
              isAnchor ? 22 : 19,
            );
            const rel = labels.get(n.id);
            const lifespan = p ? formatLifespan(p) : '';
            const badge = scope.badges.get(n.id) ?? 0;
            const hasHandle = scope.handles.has(n.id);
            const cx = n.x + n.width / 2;
            const a11y = [
              p?.preferredName ?? 'Unknown person',
              rel?.label,
              lifespan,
              isAnchor ? 'current focus — long-press to open profile' : 'tap to see their family',
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <G
                key={n.id}
                onPress={() => (isAnchor ? onOpenPerson(n.id) : onReAnchor(n.id))}
                onLongPress={() => onOpenPerson(n.id)}
                accessible
                accessibilityLabel={a11y}
              >
                <Rect
                  x={n.x}
                  y={n.y}
                  width={n.width}
                  height={n.height}
                  rx={10}
                  fill={t.colors.bgElevated}
                  stroke={isAnchor ? t.colors.primary : isViewer ? t.colors.info : t.colors.border}
                  strokeWidth={isAnchor || isViewer ? 2 : 1}
                />
                <SvgText
                  x={cx}
                  y={n.y + (isAnchor ? 40 : 36)}
                  fontSize={isAnchor ? 16 : 14}
                  fontWeight="600"
                  fill={t.colors.text}
                  textAnchor="middle"
                >
                  {name}
                </SvgText>
                {rel ? (
                  <SvgText
                    x={cx}
                    y={n.y + (isAnchor ? 62 : 56)}
                    fontSize={12}
                    fill={rel.muted ? t.colors.textMuted : t.colors.info}
                    textAnchor="middle"
                  >
                    {clampName(rel.label, 26)}
                  </SvgText>
                ) : isViewer ? (
                  <SvgText
                    x={cx}
                    y={n.y + (isAnchor ? 62 : 56)}
                    fontSize={12}
                    fill={t.colors.info}
                    textAnchor="middle"
                  >
                    You
                  </SvgText>
                ) : null}
                {lifespan ? (
                  <SvgText
                    x={cx}
                    y={n.y + (isAnchor ? 84 : 76)}
                    fontSize={11}
                    fill={t.colors.textMuted}
                    textAnchor="middle"
                  >
                    {lifespan}
                  </SvgText>
                ) : null}
                {hasHandle ? (
                  // Twin-diamond swap handle (Genoly's own mark — two families
                  // joined here). Informational on mobile; tap re-anchors.
                  <G>
                    <Path
                      d={`M ${cx - 7} ${n.y - 8} l 5 -5 l 5 5 l -5 5 z`}
                      fill={t.colors.primary}
                    />
                    <Path
                      d={`M ${cx + 1} ${n.y - 8} l 5 -5 l 5 5 l -5 5 z`}
                      fill="none"
                      stroke={t.colors.primary}
                      strokeWidth={1.5}
                    />
                  </G>
                ) : null}
                {badge > 0 ? (
                  <G>
                    <Rect
                      x={n.x + n.width - 30}
                      y={n.y - 9}
                      width={34}
                      height={18}
                      rx={9}
                      fill={t.colors.primary}
                    />
                    <SvgText
                      x={n.x + n.width - 13}
                      y={n.y + 4}
                      fontSize={11}
                      fontWeight="600"
                      fill={t.colors.onPrimary}
                      textAnchor="middle"
                    >
                      {`+${badge}`}
                    </SvgText>
                  </G>
                ) : null}
              </G>
            );
          })}
        </Svg>
      </ZoomPanView>

      {/* No-silent-caps strip (web parity). */}
      {hitCeiling ? (
        <View style={styles.ceilingStrip}>
          <Banner
            variant="info"
            message={
              radius >= RADIUS_CEILING
                ? `Showing ±${RADIUS_CEILING} generations around this perspective — tap a card (or a +N pill) to travel further.`
                : 'More generations exist beyond this range — raise "Generations" to widen the view.'
            }
          />
        </View>
      ) : null}
    </View>
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
    radiusRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    radiusLabel: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      marginRight: t.spacing.sm,
    },
    radiusChip: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.xs,
      paddingHorizontal: t.spacing.sm,
      marginRight: t.spacing.xs,
      backgroundColor: t.colors.bgElevated,
      minHeight: 28,
      justifyContent: 'center',
    },
    radiusChipSelected: {
      backgroundColor: t.colors.primary,
      borderColor: t.colors.primary,
    },
    radiusChipText: {
      fontSize: 12,
      fontWeight: '500',
      color: t.colors.text,
    },
    radiusChipTextSelected: {
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
    ceilingStrip: {
      marginTop: t.spacing.sm,
    },
  });
}
