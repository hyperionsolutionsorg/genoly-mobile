import type { ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme, MIN_TOUCH_TARGET } from '../../theme';

export interface CardProps {
  title?: string;
  description?: string;
  /** When set, the card becomes pressable and shows a chevron affordance. */
  onPress?: () => void;
  accessibilityLabel?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Surface card (metric-row / list-item flavor). Pressable cards get a chevron, not hover. */
export function Card({
  title,
  description,
  onPress,
  accessibilityLabel,
  children,
  style,
  testID,
}: CardProps) {
  const t = useTheme();

  const body = (
    <>
      <View style={{ flex: 1 }}>
        {title ? (
          <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{title}</Text>
        ) : null}
        {description ? (
          <Text
            style={[
              t.typography.cardDescription,
              { color: t.colors.textMuted, marginTop: title ? t.spacing.xs : 0 },
            ]}
          >
            {description}
          </Text>
        ) : null}
        {children}
      </View>
      {onPress ? (
        <Text style={{ color: t.colors.textMuted, fontSize: 18, marginLeft: t.spacing.sm }}>
          ›
        </Text>
      ) : null}
    </>
  );

  const baseStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.sm,
    paddingVertical: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    marginBottom: t.spacing.sm,
    minHeight: onPress ? MIN_TOUCH_TARGET : undefined,
  };

  if (onPress) {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        activeOpacity={0.7}
        onPress={onPress}
        style={[baseStyle, style]}
        testID={testID}
      >
        {body}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[baseStyle, style]} testID={testID}>
      {body}
    </View>
  );
}
