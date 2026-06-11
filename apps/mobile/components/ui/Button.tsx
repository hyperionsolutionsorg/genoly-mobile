import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme, MIN_TOUCH_TARGET } from '../../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'link';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Shows an ActivityIndicator INSIDE the button and disables it. */
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ACTIVE_OPACITY: Record<ButtonVariant, number> = {
  primary: 0.85,
  secondary: 0.7,
  destructive: 0.85,
  link: 0.9,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const t = useTheme();
  const isDisabled = disabled || loading;

  const containerStyle: ViewStyle = {
    borderRadius: t.radius.sm,
    paddingVertical: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    ...(variant === 'primary' && { backgroundColor: t.colors.primary }),
    ...(variant === 'secondary' && {
      backgroundColor: t.colors.bgElevated,
      borderWidth: 1,
      borderColor: t.colors.border,
    }),
    ...(variant === 'destructive' && { backgroundColor: t.colors.danger }),
    ...(variant === 'link' && {
      backgroundColor: 'transparent',
      paddingVertical: t.spacing.sm,
    }),
    ...(isDisabled && { opacity: 0.7 }),
  };

  const textColor =
    variant === 'primary' || variant === 'destructive'
      ? t.colors.onPrimary
      : variant === 'link'
        ? t.colors.link
        : t.colors.text;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      activeOpacity={ACTIVE_OPACITY[variant]}
      disabled={isDisabled}
      onPress={onPress}
      style={[containerStyle, style]}
      testID={testID}
    >
      {loading ? (
        <View style={styles.spinnerWrap}>
          <ActivityIndicator color={textColor} testID={testID ? `${testID}-spinner` : undefined} />
        </View>
      ) : (
        <Text
          style={[
            t.typography.button,
            { color: textColor },
            variant === 'secondary' && { fontWeight: '500' },
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  spinnerWrap: {
    minHeight: 19, // matches the button-label line so width doesn't jump
    justifyContent: 'center',
  },
});
