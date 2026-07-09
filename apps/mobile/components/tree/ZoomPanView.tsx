/**
 * ZoomPanView — the shared pan/pinch viewport for the tree canvases
 * (Explore now; Pedigree Classic + Fan reuse it in Tasks B/C).
 *
 * Replaces the web's viewport owners (@xyflow/react for Explore, d3-zoom for
 * Pedigree): a react-native-gesture-handler pan+pinch pair drives a
 * react-native-reanimated shared transform over absolutely-sized content
 * (typically a react-native-svg <Svg> of the layout's bounding box).
 *
 * Coordinate contract: children live in a [0..contentWidth]×[0..contentHeight]
 * space (callers normalize negative layout coordinates into the viewBox).
 * `centerOn` is a point in that space; the view centers it deterministically
 * on mount and whenever `centerKey` changes — the RN replacement for the web
 * canvas's `setCenter` (no fitView guesswork).
 *
 * RN transforms compose around the view's center C, so for translation t and
 * scale s a content point p lands at screen(p) = t + C·(1−s) + s·p. All the
 * math below (centering, pinch-focal anchoring) inverts that mapping.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useThemedStyles, type Theme } from '../../theme';

export interface ZoomPanViewProps {
  /** Content bounding-box size (the child Svg's width/height). */
  contentWidth: number;
  contentHeight: number;
  /** Point (content coordinates) to center when `centerKey` changes. */
  centerOn?: { x: number; y: number } | null;
  /** Identity of the centering target (e.g. `${anchorId}~${radius}`). */
  centerKey?: string;
  minScale?: number;
  maxScale?: number;
  /** Scale applied when (re)centering. */
  centerScale?: number;
  /** Accessibility description of the canvas for screen readers. */
  accessibilityLabel?: string;
  children: ReactNode;
}

function clampWorklet(value: number, lo: number, hi: number): number {
  'worklet';
  return Math.min(hi, Math.max(lo, value));
}

export function ZoomPanView({
  contentWidth,
  contentHeight,
  centerOn,
  centerKey,
  minScale = 0.2,
  maxScale = 2.5,
  centerScale = 0.85,
  accessibilityLabel,
  children,
}: ZoomPanViewProps) {
  const styles = useThemedStyles(createStyles);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);

  const scale = useSharedValue(centerScale);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  // Gesture-start snapshots.
  const startScale = useSharedValue(centerScale);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setViewport({ width, height });
  };

  // Deterministic centering: place `centerOn` at the viewport center whenever
  // the centering target (anchor/radius) or the viewport size changes.
  useEffect(() => {
    if (!viewport || !centerOn) return;
    const s = clampWorklet(centerScale, minScale, maxScale);
    const cX = contentWidth / 2;
    const cY = contentHeight / 2;
    // screen(p) = t + C(1-s) + s·p  ⇒  t = K − C(1−s) − s·p  (K = viewport center)
    const nextTx = viewport.width / 2 - cX * (1 - s) - s * centerOn.x;
    const nextTy = viewport.height / 2 - cY * (1 - s) - s * centerOn.y;
    scale.value = withTiming(s, { duration: 220 });
    tx.value = withTiming(nextTx, { duration: 220 });
    ty.value = withTiming(nextTy, { duration: 220 });
    // Recenter on anchor/radius identity + viewport readiness, not on the
    // center object's reference (it changes with every layout recompute).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey, viewport?.width, viewport?.height, contentWidth, contentHeight]);

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onStart(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = startTx.value + e.translationX;
      ty.value = startTy.value + e.translationY;
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      const next = clampWorklet(startScale.value * e.scale, minScale, maxScale);
      // Keep the content point under the pinch focal fixed on screen.
      // p = (q − t − C(1−s)) / s ; then t' = q − C(1−s') − s'·p
      const s0 = startScale.value;
      const cX = contentWidth / 2;
      const cY = contentHeight / 2;
      const px = (e.focalX - startTx.value - cX * (1 - s0)) / s0;
      const py = (e.focalY - startTy.value - cY * (1 - s0)) / s0;
      scale.value = next;
      tx.value = e.focalX - cX * (1 - next) - next * px;
      ty.value = e.focalY - cY * (1 - next) - next * py;
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.viewport}
        onLayout={onLayout}
        accessible={false}
        accessibilityLabel={accessibilityLabel}
        testID="zoom-pan-view"
      >
        <Animated.View
          style={[{ width: contentWidth, height: contentHeight }, animatedStyle]}
        >
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    viewport: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: t.colors.surfaceMuted,
      borderRadius: t.radius.md,
    },
  });
}
