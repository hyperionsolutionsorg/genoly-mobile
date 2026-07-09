/**
 * PedigreeClassic — the Pedigree view of the Tree tab (Classic style only;
 * Heritage/Bubble/Matrix are out of scope, see the porting plan §2.3).
 *
 * RN rewrite of the web ClassicTree's rendering (genoly-family-web
 * src/components/ClassicTree.tsx): the pure layout pass (`hierarchy()` +
 * `tree()` + the ancestor y-inversion) is the PORTED module
 * lib/tree/classicLayout.ts — this file only renders its output with
 * react-native-svg inside the shared ZoomPanView pan/pinch viewport
 * (replacing d3-zoom + d3-selection).
 *
 * Deliberately simplified from the web's "vintage" aesthetic (oval
 * portraits, Georgia serif, sepia palette) to plain themed boxes + lines —
 * DESIGN.md tokens only, no bespoke desktop-poster styling, no canvas text
 * measurement (Hermes-safe, deterministic). Ancestor-only (descendant mode
 * is out for v1, matching the plan).
 *
 * Gestures (mirrors ExploreCanvas's conventions):
 *   - tap an ancestor box → re-root the pedigree on that person;
 *   - tap the focus (root) box → open their profile (same tap semantics as
 *     ExploreCanvas's anchor card);
 *   - long-press any box → open that person's profile.
 *
 * Data: `pedigree:getAncestorTree` (the NESTED shape — never
 * `explorerGraph:getAncestorTree`, see lib/genolyApi.ts). Rooted at the
 * shell's shared anchor person; re-rooting here just moves that shared
 * anchor, so switching back to Explore/Register reflects the new anchor too.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { G, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import type { AncestorNode } from '../../lib/tree/explorerTypes';
import { computeClassicLayout, type ClassicLayoutNode } from '../../lib/tree/classicLayout';
import { useTheme, useThemedStyles, type Theme } from '../../theme';
import { EmptyState, Skeleton } from '../../components/ui';
import { ZoomPanView } from './ZoomPanView';

/** Mobile generation-depth policy: default smaller than the web's 4 (phone
 *  screen real estate), same control range as the web's gens <select> (2-5). */
export const DEFAULT_PEDIGREE_GENERATIONS = 3;
export const MIN_PEDIGREE_GENERATIONS = 2;
export const MAX_PEDIGREE_GENERATIONS = 5;

const CANVAS_PAD = 40;

export interface PedigreeClassicProps {
  /** `pedigree:getAncestorTree` result: undefined = loading, null = person not found. */
  ancestorTree: AncestorNode | null | undefined;
  /** The person the tree is currently rooted at (the shell's shared anchor). */
  personId: string | null;
  /** The viewer's resolved person, for the "Back to me" affordance. */
  viewerPersonId?: string | null;
  generations: number;
  onGenerationsChange: (generations: number) => void;
  /** Re-root the pedigree on this person (writes back to the shared anchor). */
  onReAnchor: (personId: string) => void;
  onOpenPerson: (personId: string) => void;
}

function clampName(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export function PedigreeClassic({
  ancestorTree,
  personId,
  viewerPersonId,
  generations,
  onGenerationsChange,
  onReAnchor,
  onOpenPerson,
}: PedigreeClassicProps) {
  const t = useTheme();
  const styles = useThemedStyles(createStyles);

  const computed = useMemo(() => {
    if (!ancestorTree) return null;
    const layout = computeClassicLayout(ancestorTree);
    const originX = layout.minX - CANVAS_PAD;
    const originY = layout.minY - CANVAS_PAD;
    const width = layout.width + CANVAS_PAD * 2;
    const height = layout.height + CANVAS_PAD * 2;
    return { layout, originX, originY, width, height };
  }, [ancestorTree]);

  // ── No anchor yet ────────────────────────────────────────────────────
  if (!personId) {
    return (
      <EmptyState
        icon="🌳"
        title="No one to chart yet"
        body="Once people are added to this tree, pick someone to see their ancestors here."
        testID="pedigree-empty"
      />
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────
  if (ancestorTree === undefined) {
    return (
      <View style={styles.fill} testID="pedigree-loading">
        <Skeleton height={44} />
        <Skeleton height={220} />
      </View>
    );
  }

  // ── Error / not found (query returned null — e.g. stale/removed anchor) ─
  if (ancestorTree === null || !computed) {
    return (
      <EmptyState
        icon="❓"
        title="Couldn't load their ancestors"
        body="This person may have been removed. Pick someone else from Register and try again."
        testID="pedigree-error"
      />
    );
  }

  const { layout, originX, originY, width, height } = computed;
  const centerOn = {
    x: layout.rootCenter.x - originX,
    y: layout.rootCenter.y - originY,
  };

  return (
    <View style={styles.fill} testID="pedigree-classic">
      {/* Controls row: generation-depth control + back-to-me. */}
      <View style={styles.controlsRow}>
        <View style={styles.generationsRow}>
          <Text style={styles.generationsLabel}>Generations</Text>
          {Array.from(
            { length: MAX_PEDIGREE_GENERATIONS - MIN_PEDIGREE_GENERATIONS + 1 },
            (_, i) => i + MIN_PEDIGREE_GENERATIONS,
          ).map((g) => {
            const selected = g === generations;
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
            accessibilityLabel="Chart my own ancestors"
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
        centerKey={`${personId}~${generations}`}
        accessibilityLabel="Pedigree chart. The person at the bottom is the current focus; tap an ancestor to make them the new focus, or long-press any person to open their profile."
      >
        <Svg width={width} height={height} viewBox={`${originX} ${originY} ${width} ${height}`}>
          {/* Connectors under the boxes. */}
          {layout.edges.map((e) => (
            <Polyline
              key={e.id}
              points={e.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={t.colors.border}
              strokeWidth={1.5}
            />
          ))}

          {layout.nodes.map((n) => (
            <PersonBox
              key={n.id}
              node={n}
              theme={t}
              onPress={() => (n.isFocus ? onOpenPerson(n.id) : onReAnchor(n.id))}
              onLongPress={() => onOpenPerson(n.id)}
            />
          ))}
        </Svg>
      </ZoomPanView>
    </View>
  );
}

function PersonBox({
  node,
  theme,
  onPress,
  onLongPress,
}: {
  node: ClassicLayoutNode;
  theme: Theme;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const cx = node.x + node.width / 2;
  const name = clampName(
    `${node.preferredName}${node.surname ? ` ${node.surname}` : ''}`,
    node.isFocus ? 22 : 18,
  );
  const a11y = [
    node.preferredName,
    node.lifespan,
    node.isFocus
      ? 'current focus — tap or long-press to open profile'
      : 'tap to make them the new focus; long-press to open profile',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <G onPress={onPress} onLongPress={onLongPress} accessible accessibilityLabel={a11y}>
      <Rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={10}
        fill={theme.colors.bgElevated}
        stroke={node.isFocus ? theme.colors.primary : theme.colors.border}
        strokeWidth={node.isFocus ? 2 : 1}
      />
      <SvgText
        x={cx}
        y={node.y + (node.lifespan ? 26 : 36)}
        fontSize={node.isFocus ? 14 : 13}
        fontWeight="600"
        fill={theme.colors.text}
        textAnchor="middle"
      >
        {name}
      </SvgText>
      {node.lifespan ? (
        <SvgText
          x={cx}
          y={node.y + 46}
          fontSize={11}
          fill={theme.colors.textMuted}
          textAnchor="middle"
        >
          {node.lifespan}
        </SvgText>
      ) : null}
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
  });
}
