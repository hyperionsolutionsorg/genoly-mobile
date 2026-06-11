import { Text, View } from 'react-native';

import { useTheme } from '../../theme';
import { Button } from './Button';

export type BannerVariant = 'error' | 'warning' | 'info' | 'success';

export interface BannerProps {
  variant: BannerVariant;
  message: string;
  /** Optional inline action (e.g. Retry, Clear). */
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

/** Inline status banner (dead-letter, sync errors, demo notice, admin notice). */
export function Banner({ variant, message, actionLabel, onAction, testID }: BannerProps) {
  const t = useTheme();

  const accent =
    variant === 'error'
      ? t.colors.danger
      : variant === 'warning'
        ? t.colors.warning
        : variant === 'success'
          ? t.colors.success
          : t.colors.info;

  const background = variant === 'error' ? t.colors.dangerSurface : t.colors.surfaceMuted;

  return (
    <View
      accessibilityRole={variant === 'error' ? 'alert' : undefined}
      style={{
        backgroundColor: background,
        borderLeftWidth: 3,
        borderLeftColor: accent,
        borderRadius: t.radius.sm,
        padding: t.spacing.md,
        marginBottom: t.spacing.lg,
      }}
      testID={testID}
    >
      <Text style={[t.typography.body, { color: t.colors.text }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Button
          variant="link"
          label={actionLabel}
          onPress={onAction}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
        />
      ) : null}
    </View>
  );
}
