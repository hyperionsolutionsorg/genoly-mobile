/**
 * Goals — Step 10 of Phase 1.
 *
 * Set/edit/archive the caller's fitness goals and jump to their history.
 * Reads/writes via the 3 mutating `apiClient` goals methods (plus the
 * list read) through the `useGoalsData` hook (`hooks/useGoalsData.ts`).
 *
 * IA: this is a PUSHED screen, not a tab — reached from a "Goals" row on
 * the Activity tab, alongside "Manage friends" / "Friends leaderboard"
 * (Step 9). Same top-level-route pattern as `friends.tsx` / `leaderboard.tsx`.
 * The member app stays fixed at 5 tabs.
 *
 * Gating: this route carries no gate of its own. It inherits the app-wide
 * Pro-tenant gate enforced in `app/_layout.tsx`'s `AuthGate` (same
 * rationale as `friends.tsx` / `leaderboard.tsx` — see those files'
 * headers). This screen adds no upgrade/pricing UI of its own — payment
 * neutrality per AGENTS.md §3.1.
 *
 * Model: the contract caps active goals at 4 — one per (period, metric)
 * pair, `period ∈ {daily, weekly}` × `metric ∈ {steps, calories}`. Rather
 * than a freeform "add a goal" flow, this screen renders those 4 fixed
 * slots as cards ("Daily steps", "Daily active calories", "Weekly steps",
 * "Weekly active calories") — each either shows its current target or an
 * empty "Not set" state with a "Set goal" button. This matches how the
 * contract's PUT /goals is scoped (idempotent upsert keyed by the pair,
 * not a general list) and avoids the confusing case of two active goals
 * for the same (period, metric).
 *
 * Layout (top-to-bottom):
 *   1. Header — screen title + Refresh button
 *   2. (Optional) list-load error banner with Retry
 *   3. 4 goal slot cards (Daily steps / Daily calories / Weekly steps /
 *      Weekly calories) — each with inline edit-in-place form
 *      (react-hook-form + zod, mirrors `friends.tsx`'s add-friend form)
 *   4. "History" — link row to the pushed `/goals-history` screen
 *
 * Confirmations: archiving an active goal uses native `Alert.alert()`
 * (destructive style) per DESIGN.md §4 "Confirmations" — it's a real,
 * if reversible-by-re-setting, action the user should confirm, same
 * treatment as `friends.tsx`'s Unfriend/Block.
 *
 * Per mobile DESIGN.md — no chart library, plain Views, theme tokens only.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Goal, GoalMetric, GoalPeriod } from '@genoly/types';

import { useGoalsData, goalKey, type UpsertGoalResult } from '../hooks/useGoalsData';
import { useThemedStyles, useTheme, MIN_TOUCH_TARGET, type Theme } from '../theme';
import { Banner, Button, TextField, toast } from '../components/ui';

// Typed-routes union lags new top-level routes until `expo start`
// regenerates .expo/types — same cast pattern as friends.tsx / activity.tsx.
const GOALS_HISTORY_ROUTE = '/goals-history' as unknown as Href;

// ── Fixed goal slots (the contract's 4-slot model) ──────────────────

interface GoalSlot {
  period: GoalPeriod;
  metric: GoalMetric;
  label: string;
  unit: string;
  placeholder: string;
  helper: string;
}

const GOAL_SLOTS: GoalSlot[] = [
  {
    period: 'daily',
    metric: 'steps',
    label: 'Daily steps',
    unit: 'steps',
    placeholder: '10000',
    helper: 'How many steps you want to hit each day.',
  },
  {
    period: 'daily',
    metric: 'calories',
    label: 'Daily active calories',
    unit: 'kcal',
    placeholder: '500',
    helper: 'Active calories burned, not counting resting/basal burn.',
  },
  {
    period: 'weekly',
    metric: 'steps',
    label: 'Weekly steps',
    unit: 'steps',
    placeholder: '70000',
    helper: 'Total steps across the week.',
  },
  {
    period: 'weekly',
    metric: 'calories',
    label: 'Weekly active calories',
    unit: 'kcal',
    placeholder: '3500',
    helper: 'Total active calories across the week.',
  },
];

// Validated as a string (react-hook-form + TextField both work in
// strings) rather than z.coerce.number() — zod v4's coerce schemas have
// a mismatched input/output type (`unknown` in, `number` out) that
// zodResolver's generic can't reconcile with a plain `useForm<T>()`.
// Parsing to a number happens explicitly at submit time instead.
const goalTargetSchema = z.object({
  target: z
    .string()
    .trim()
    .min(1, { message: 'Enter a target' })
    .regex(/^\d+$/, { message: 'Enter a whole number, no decimals' })
    .refine((v) => Number(v) <= 1_000_000, {
      message: 'That target seems too high — try a smaller number',
    }),
});
type GoalTargetForm = z.infer<typeof goalTargetSchema>;

export default function GoalsScreen() {
  const t = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const data = useGoalsData();
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // Surface action failures as a toast — the hook clears actionError at
  // the start of every new action, so this fires once per failure. Same
  // pattern as friends.tsx (direct return-value checks drive success
  // toasts, since those are never stale).
  useEffect(() => {
    if (data.actionError) {
      toast.error(data.actionError);
    }
  }, [data.actionError]);

  const onRefresh = useCallback(() => {
    data.refresh();
  }, [data]);

  const findGoal = useCallback(
    (slot: GoalSlot): Goal | null =>
      data.goals.find((g) => g.period === slot.period && g.metric === slot.metric) ?? null,
    [data.goals],
  );

  const onSubmitSlot = useCallback(
    async (slot: GoalSlot, target: number) => {
      const result: UpsertGoalResult = await data.upsertGoal({
        period: slot.period,
        metric: slot.metric,
        target,
      });
      if (result.ok) {
        setEditingKey(null);
        toast.success(
          result.created
            ? `${slot.label} goal set to ${target.toLocaleString()} ${slot.unit}.`
            : `${slot.label} goal is already ${target.toLocaleString()} ${slot.unit}.`,
        );
      }
      return result.ok;
    },
    [data],
  );

  const onArchive = useCallback(
    (slot: GoalSlot, goal: Goal) => {
      Alert.alert(
        'Remove this goal?',
        `${slot.label} will no longer show a target. Your past targets stay in History.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              const ok = await data.archiveGoal(goal.id);
              if (ok) toast.info(`${slot.label} goal removed.`);
            },
          },
        ],
        { cancelable: true },
      );
    },
    [data],
  );

  if (data.initialLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Goals' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={t.colors.primary} />
          <Text style={styles.loadingText}>Loading your goals…</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Goals' }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={data.refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={styles.screenTitle}>Goals</Text>
            <Text style={styles.subtitle}>Set targets for steps and active calories</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Refresh goals"
            style={[styles.refreshButton, data.refreshing && styles.refreshButtonDisabled]}
            onPress={onRefresh}
            disabled={data.refreshing}
          >
            {data.refreshing ? (
              <ActivityIndicator size="small" color={t.colors.primary} />
            ) : (
              <Text style={styles.refreshButtonText}>Refresh</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* List-load error banner */}
        {data.error && (
          <Banner variant="error" message={data.error} actionLabel="Retry" onAction={onRefresh} />
        )}

        {/* Goal slots */}
        <View style={styles.section}>
          {GOAL_SLOTS.map((slot, idx) => {
            const goal = findGoal(slot);
            const key = goalKey(slot.period, slot.metric);
            const busy = data.busyGoalKey === key || (goal !== null && data.busyGoalKey === goal.id);
            return (
              <View key={key}>
                {idx > 0 && <View style={styles.divider} />}
                <GoalSlotCard
                  styles={styles}
                  slot={slot}
                  goal={goal}
                  editing={editingKey === key}
                  busy={busy}
                  disabled={data.busyGoalKey !== null && !busy}
                  onStartEdit={() => setEditingKey(key)}
                  onCancelEdit={() => setEditingKey(null)}
                  onSubmit={(target) => onSubmitSlot(slot, target)}
                  onArchive={goal ? () => onArchive(slot, goal) : undefined}
                />
              </View>
            );
          })}
        </View>

        {/* History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>History</Text>
          <View style={styles.sectionBody}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="View goal history"
              accessibilityHint="Shows your past goal targets, most recently changed first"
              style={styles.linkRow}
              onPress={() => router.push(GOALS_HISTORY_ROUTE)}
            >
              <Text style={styles.linkRowLabel}>View goal history</Text>
              <Text style={styles.linkRowChevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

type Styles = ReturnType<typeof createStyles>;

// ── Sub-components ───────────────────────────────────────────────────

function GoalSlotCard({
  styles,
  slot,
  goal,
  editing,
  busy,
  disabled,
  onStartEdit,
  onCancelEdit,
  onSubmit,
  onArchive,
}: {
  styles: Styles;
  slot: GoalSlot;
  goal: Goal | null;
  editing: boolean;
  busy: boolean;
  disabled: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (target: number) => Promise<boolean>;
  onArchive?: () => void;
}) {
  if (editing) {
    return (
      <GoalSlotForm
        styles={styles}
        slot={slot}
        goal={goal}
        busy={busy}
        onCancel={onCancelEdit}
        onSubmit={onSubmit}
      />
    );
  }

  const valueLabel = goal ? `${goal.target.toLocaleString()} ${slot.unit}` : 'Not set';

  return (
    <View style={styles.slotRow} accessible accessibilityLabel={`${slot.label}: ${valueLabel}`}>
      <View style={styles.slotTextCol}>
        <Text style={styles.slotLabel}>{slot.label}</Text>
        <Text style={[styles.slotValue, !goal && styles.slotValueEmpty]}>{valueLabel}</Text>
      </View>
      <View style={styles.slotActions}>
        {busy && <ActivityIndicator size="small" style={styles.slotSpinner} />}
        <Button
          variant="secondary"
          label={goal ? 'Edit' : 'Set goal'}
          onPress={onStartEdit}
          disabled={disabled || busy}
          accessibilityLabel={`${goal ? 'Edit' : 'Set'} ${slot.label} goal`}
          style={styles.slotButton}
        />
        {onArchive && (
          <Button
            variant="link"
            label="Remove"
            onPress={onArchive}
            disabled={disabled || busy}
            accessibilityLabel={`Remove ${slot.label} goal`}
          />
        )}
      </View>
    </View>
  );
}

function GoalSlotForm({
  styles,
  slot,
  goal,
  busy,
  onCancel,
  onSubmit,
}: {
  styles: Styles;
  slot: GoalSlot;
  goal: Goal | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (target: number) => Promise<boolean>;
}) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<GoalTargetForm>({
    resolver: zodResolver(goalTargetSchema),
    defaultValues: { target: goal ? String(goal.target) : '' },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit(Number(values.target));
  });

  return (
    <View style={styles.slotFormCol}>
      <Text style={styles.slotLabel}>{slot.label}</Text>
      <Controller
        control={control}
        name="target"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label={`Target (${slot.unit})`}
            placeholder={slot.placeholder}
            helper={errors.target ? undefined : slot.helper}
            keyboardType="number-pad"
            editable={!busy}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value ?? ''}
            error={errors.target?.message}
            autoFocus
          />
        )}
      />
      <View style={styles.slotFormActions}>
        <Button
          label="Save"
          onPress={submit}
          loading={busy}
          accessibilityLabel={`Save ${slot.label} goal`}
          style={styles.slotButton}
        />
        <Button
          variant="secondary"
          label="Cancel"
          onPress={onCancel}
          disabled={busy}
          accessibilityLabel={`Cancel editing ${slot.label} goal`}
          style={styles.slotButton}
        />
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      padding: t.spacing.xl,
      backgroundColor: t.colors.bg,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.spacing.xl,
      backgroundColor: t.colors.bg,
    },
    loadingText: {
      marginTop: t.spacing.md,
      fontSize: 14,
      color: t.colors.textMuted,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: t.spacing.sm,
      marginBottom: t.spacing.xl,
    },
    headerTextCol: {
      flexShrink: 1,
    },
    screenTitle: {
      ...t.typography.screenTitle,
      color: t.colors.text,
    },
    subtitle: {
      fontSize: 13,
      color: t.colors.textMuted,
      marginTop: 2,
    },
    refreshButton: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.lg,
      backgroundColor: t.colors.bgElevated,
      minWidth: 84,
      alignItems: 'center',
      minHeight: MIN_TOUCH_TARGET,
      justifyContent: 'center',
    },
    refreshButtonDisabled: {
      opacity: 0.7,
    },
    refreshButtonText: {
      color: t.colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    section: {
      marginBottom: t.spacing.xxl,
    },
    sectionTitle: {
      ...t.typography.sectionHeader,
      color: t.colors.textMuted,
      marginBottom: t.spacing.sm,
    },
    sectionBody: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
    },
    slotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
      marginBottom: t.spacing.sm,
      gap: t.spacing.sm,
    },
    slotTextCol: {
      flexShrink: 1,
    },
    slotLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
      marginBottom: 2,
    },
    slotValue: {
      fontSize: 20,
      fontWeight: '600',
      color: t.colors.text,
    },
    slotValueEmpty: {
      color: t.colors.textMuted,
      fontWeight: '500',
      fontSize: 15,
    },
    slotActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.xs,
    },
    slotSpinner: {
      marginRight: t.spacing.xs,
    },
    slotButton: {
      minWidth: 84,
    },
    slotFormCol: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
      marginBottom: t.spacing.sm,
    },
    slotFormActions: {
      flexDirection: 'row',
      gap: t.spacing.sm,
      marginTop: t.spacing.xs,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: t.spacing.sm,
      minHeight: MIN_TOUCH_TARGET,
    },
    linkRowLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    linkRowChevron: {
      fontSize: 22,
      color: t.colors.textMuted,
      marginLeft: t.spacing.sm,
    },
    divider: {
      height: 1,
      backgroundColor: 'transparent',
    },
  });
}
