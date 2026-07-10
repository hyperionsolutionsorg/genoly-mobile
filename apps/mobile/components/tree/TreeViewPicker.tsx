/**
 * TreeViewPicker — the Tree tab's mode strip (mirror of the web
 * src/components/ViewPicker.tsx role): a pure presentational segmented
 * control; mode state lives with the caller (the tree shell).
 *
 * Task A shipped Explore (default) + Register; Task C added Fan (defaults
 * to 3 generations, hard-capped at 3 — see components/tree/FanView.tsx).
 * Task B's Pedigree (Classic) was REMOVED 2026-07-09 by operator direction:
 * at phone sizes it read as a duplicate of Explore. Recoverable from git
 * history (PR #31) if a distinct mobile pedigree treatment is ever wanted.
 *
 * No lock icons on any tab by design: all tree surfaces inherit the app-level
 * Pro gate (AuthGate in app/_layout.tsx); a non-Pro user never reaches this
 * screen, so there is no per-surface gating UI.
 */

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useThemedStyles, type Theme } from '../../theme';

export type TreeViewMode = 'explore' | 'register' | 'fan';

export interface TreeViewOption {
  mode: TreeViewMode;
  label: string;
}

/** The modes currently shipped. */
export const AVAILABLE_TREE_VIEWS: TreeViewOption[] = [
  { mode: 'explore', label: 'Explore' },
  { mode: 'register', label: 'Register' },
  { mode: 'fan', label: 'Fan' }, // Task C
];

export interface TreeViewPickerProps {
  mode: TreeViewMode;
  onChange: (mode: TreeViewMode) => void;
  options?: TreeViewOption[];
}

export function TreeViewPicker({
  mode,
  onChange,
  options = AVAILABLE_TREE_VIEWS,
}: TreeViewPickerProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.row} accessibilityRole="tablist" testID="tree-view-picker">
      {options.map((option) => {
        const selected = option.mode === mode;
        return (
          <TouchableOpacity
            key={option.mode}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label} view`}
            activeOpacity={0.7}
            onPress={() => onChange(option.mode)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      backgroundColor: t.colors.surfaceMuted,
      borderRadius: t.radius.sm,
      padding: t.spacing.xs,
      marginBottom: t.spacing.md,
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: t.spacing.sm,
      borderRadius: t.radius.sm - 2,
      minHeight: 36,
      justifyContent: 'center',
    },
    segmentSelected: {
      backgroundColor: t.colors.bgElevated,
    },
    segmentText: {
      fontSize: 14,
      fontWeight: '500',
      color: t.colors.textMuted,
    },
    segmentTextSelected: {
      color: t.colors.text,
      fontWeight: '600',
    },
  });
}
