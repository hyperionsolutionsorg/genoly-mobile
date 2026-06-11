import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useTheme } from '../../theme';

export interface ScreenProps {
  /** Screen title rendered at the top (DESIGN.md §4 screen layout). Omit for custom headers. */
  title?: string;
  /** One-line subtitle under the title, in muted color. */
  subtitle?: string;
  children: ReactNode;
  /** Center content vertically (form screens like Login). */
  centered?: boolean;
  /** Disable the ScrollView (for screens that own their own list, e.g. FlatList). */
  noScroll?: boolean;
  testID?: string;
}

/**
 * Base screen shell: bg-colored ScrollView with screen padding, optional
 * title block. Every new screen starts here so spacing stays uniform.
 */
export function Screen({ title, subtitle, children, centered, noScroll, testID }: ScreenProps) {
  const t = useTheme();

  const header = (title || subtitle) && (
    <View style={{ marginTop: t.spacing.sm, marginBottom: t.spacing.xl }}>
      {title ? (
        <Text accessibilityRole="header" style={[t.typography.screenTitle, { color: t.colors.text }]}>
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text
          style={[
            t.typography.subtitle,
            { color: t.colors.textMuted, marginTop: t.spacing.xs },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (noScroll) {
    return (
      <View
        style={{ flex: 1, padding: t.spacing.xl, backgroundColor: t.colors.bg }}
        testID={testID}
      >
        {header}
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        padding: t.spacing.xl,
        ...(centered ? { justifyContent: 'center' as const } : null),
      }}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      {header}
      {children}
    </ScrollView>
  );
}
