import { forwardRef } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { useTheme } from '../../theme';

export interface TextFieldProps extends TextInputProps {
  /** Visible label above the input. Also feeds accessibilityLabel. */
  label?: string;
  /** Validation error rendered under the field (sets aria-invalid equivalent). */
  error?: string;
  /** Helper text under the field when there's no error. */
  helper?: string;
}

/**
 * Themed TextInput with label + error slot. Wire forms through
 * react-hook-form's <Controller> (DESIGN.md §4) — this component is the
 * presentational half.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, helper, style, ...inputProps },
  ref,
) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: t.spacing.sm }}>
      {label ? (
        <Text
          style={[
            t.typography.rowLabel,
            { color: t.colors.text, marginBottom: t.spacing.xs },
          ]}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        accessibilityLabel={inputProps.accessibilityLabel ?? label ?? inputProps.placeholder}
        accessibilityState={error ? { disabled: inputProps.editable === false } : undefined}
        placeholderTextColor={t.colors.textMuted}
        style={[
          t.typography.input,
          {
            borderWidth: 1,
            borderColor: error ? t.colors.danger : t.colors.border,
            borderRadius: t.radius.sm,
            padding: t.spacing.md,
            color: t.colors.text,
            backgroundColor: t.colors.bgElevated,
          },
          style,
        ]}
        {...inputProps}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[t.typography.helper, { color: t.colors.danger, marginTop: t.spacing.xs }]}
        >
          {error}
        </Text>
      ) : helper ? (
        <Text style={[t.typography.helper, { color: t.colors.textMuted, marginTop: t.spacing.xs }]}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
});
