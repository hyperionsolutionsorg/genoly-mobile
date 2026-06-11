import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import type { DimensionValue } from 'react-native';

import { useTheme } from '../../theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  /** Border radius override (defaults to small radius). */
  rounded?: number;
  style?: object;
  testID?: string;
}

/**
 * Pulsing placeholder block for loading states (skeletons over spinners —
 * web Goal C standard). Honors reduce-motion: renders static when the OS
 * setting is on.
 */
export function Skeleton({ width = '100%', height = 16, rounded, style, testID }: SkeletonProps) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled || reduced) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
          ]),
        );
        loop.start();
      })
      .catch(() => {
        // If the a11y query fails, stay static — safe default.
      });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: rounded ?? t.radius.sm,
          backgroundColor: t.colors.surfaceMuted,
          opacity,
          marginBottom: t.spacing.sm,
        },
        style,
      ]}
      testID={testID ?? 'skeleton'}
    />
  );
}
