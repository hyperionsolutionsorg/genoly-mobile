/**
 * GenolyLogo — the Genoly brand mark on react-native-svg. Exact port of the
 * web mark (genoly-family-web src/components/Logo.tsx / public/favicon.svg):
 * a downward-branching family tree — root node at top, gradient trunk to the
 * center person, branching to children and grandchildren in the member
 * colors. Optionally renders the "Genoly" wordmark beside it.
 *
 * The node/gradient colors are the BRAND's own fixed palette (identical on
 * web in all three themes) — deliberately NOT theme tokens; only the
 * wordmark text uses the theme. gradientUnits="userSpaceOnUse" is REQUIRED:
 * the trunk line is vertical (x1=x2), and the default objectBoundingBox
 * space has zero width for a vertical stroke, so the gradient collapses and
 * the trunk paints transparent (web Logo.tsx, diagnosed 2026-06-08).
 */

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Stop } from 'react-native-svg';

import { useTheme } from '../theme';

export interface GenolyLogoProps {
  /** Mark height/width in pt. Default 24. */
  size?: number;
  /** Render the "Genoly" wordmark next to the mark. */
  withWordmark?: boolean;
  accessibilityLabel?: string;
}

export function GenolyLogo({
  size = 24,
  withWordmark = false,
  accessibilityLabel = 'Genoly',
}: GenolyLogoProps) {
  const t = useTheme();

  const mark = (
    <Svg width={size} height={size} viewBox="0 0 60 60" fill="none">
      <Defs>
        <LinearGradient id="glft" gradientUnits="userSpaceOnUse" x1="30" y1="8" x2="30" y2="30">
          <Stop offset="0" stopColor="#8B6914" />
          <Stop offset="1" stopColor="#3b82f6" />
        </LinearGradient>
        <LinearGradient id="glfb" gradientUnits="userSpaceOnUse" x1="30" y1="30" x2="30" y2="50">
          <Stop offset="0" stopColor="#3b82f6" />
          <Stop offset="1" stopColor="#8b5cf6" />
        </LinearGradient>
        <LinearGradient id="glfl" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="52">
          <Stop offset="0" stopColor="#8b5cf6" />
          <Stop offset="1" stopColor="#10b981" />
        </LinearGradient>
      </Defs>
      <Line x1="30" y1="8" x2="30" y2="30" stroke="url(#glft)" strokeWidth={4} strokeLinecap="round" />
      <Line x1="30" y1="30" x2="18" y2="42" stroke="url(#glfb)" strokeWidth={3} strokeLinecap="round" />
      <Line x1="30" y1="30" x2="42" y2="42" stroke="url(#glfb)" strokeWidth={3} strokeLinecap="round" />
      <Line x1="18" y1="42" x2="10" y2="50" stroke="url(#glfl)" strokeWidth={2.5} strokeLinecap="round" />
      <Line x1="18" y1="42" x2="22" y2="52" stroke="url(#glfl)" strokeWidth={2.5} strokeLinecap="round" />
      <Line x1="42" y1="42" x2="38" y2="52" stroke="url(#glfl)" strokeWidth={2.5} strokeLinecap="round" />
      <Line x1="42" y1="42" x2="50" y2="50" stroke="url(#glfl)" strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx="30" cy="8" r="3.5" fill="#8B6914" />
      <Circle cx="30" cy="30" r="4" fill="#3b82f6" />
      <Circle cx="18" cy="42" r="3.5" fill="#8b5cf6" />
      <Circle cx="42" cy="42" r="3.5" fill="#ec4899" />
      <Circle cx="10" cy="50" r="3" fill="#f59e0b" />
      <Circle cx="22" cy="52" r="3" fill="#10b981" />
      <Circle cx="38" cy="52" r="3" fill="#10b981" />
      <Circle cx="50" cy="50" r="3" fill="#f59e0b" />
    </Svg>
  );

  if (!withWordmark) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        {mark}
      </View>
    );
  }

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {mark}
      <Text
        style={[
          styles.wordmark,
          { color: t.colors.text, fontSize: Math.round(size * 0.75) },
        ]}
      >
        Genoly
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wordmark: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
