import { Text, View } from 'react-native';

import { useTheme } from '../../theme';
import { Button } from './Button';

export interface EmptyStateProps {
  /** Emoji glyph (cheap, theme-proof). */
  icon?: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  testID?: string;
}

/**
 * Encouraging empty state — mirrors the web's F-007 pattern: never a blank
 * page, always a next step. Copy should invite, not punish absence.
 */
export function EmptyState({ icon, title, body, ctaLabel, onCtaPress, testID }: EmptyStateProps) {
  const t = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: t.spacing.xxl,
        paddingHorizontal: t.spacing.xl,
      }}
      testID={testID}
    >
      {icon ? (
        <Text accessibilityElementsHidden style={{ fontSize: 44, marginBottom: t.spacing.lg }}>
          {icon}
        </Text>
      ) : null}
      <Text
        accessibilityRole="header"
        style={[
          t.typography.cardTitle,
          { color: t.colors.text, textAlign: 'center', marginBottom: t.spacing.sm },
        ]}
      >
        {title}
      </Text>
      {body ? (
        <Text
          style={[
            t.typography.body,
            { color: t.colors.textMuted, textAlign: 'center', marginBottom: t.spacing.lg },
          ]}
        >
          {body}
        </Text>
      ) : null}
      {ctaLabel && onCtaPress ? <Button label={ctaLabel} onPress={onCtaPress} /> : null}
    </View>
  );
}
