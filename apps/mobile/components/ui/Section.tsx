import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../theme';

export interface SectionProps {
  /** Uppercase letterspaced label above the body (iOS Settings convention). */
  label?: string;
  children: ReactNode;
  testID?: string;
}

/** Grouped section: uppercase label + surface body card (DESIGN.md §4). */
export function Section({ label, children, testID }: SectionProps) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: t.spacing.xxl }} testID={testID}>
      {label ? (
        <Text
          style={[
            t.typography.sectionHeader,
            { color: t.colors.textMuted, marginBottom: t.spacing.sm },
          ]}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: t.colors.surface,
          borderRadius: t.radius.md,
          padding: t.spacing.lg,
        }}
      >
        {children}
      </View>
    </View>
  );
}
