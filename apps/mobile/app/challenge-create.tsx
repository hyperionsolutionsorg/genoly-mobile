/**
 * Create a walking challenge (wave H2) — name, type (cooperative team
 * goal vs individual race), window (daily/weekly/monthly), optional
 * invite-only. The creator auto-joins server-side.
 */

import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { Stack, useRouter, type Href } from 'expo-router';
import { useConvex } from 'convex/react';

import { challengeCreate, type ChallengeType, type ChallengeWindow } from '../lib/genolyApi';
import { useActiveTree } from '../hooks/useActiveTree';
import { useThemedStyles, type Theme } from '../theme';
import { Screen, Button, TextField, toast } from '../components/ui';

const TYPE_OPTIONS: { value: ChallengeType; label: string; blurb: string }[] = [
  { value: 'cooperative', label: '🤝 Team goal', blurb: 'Everyone’s steps pool toward one goal' },
  { value: 'individual', label: '🏆 Race', blurb: 'Highest individual step count wins' },
];

const WINDOW_OPTIONS: { value: ChallengeWindow; label: string }[] = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This week' },
  { value: 'monthly', label: 'This month' },
];

export default function ChallengeCreateScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();
  const { activeTree } = useActiveTree();

  const [name, setName] = useState('');
  const [type, setType] = useState<ChallengeType>('cooperative');
  const [windowType, setWindowType] = useState<ChallengeWindow>('weekly');
  const [goal, setGoal] = useState('');
  const [inviteOnly, setInviteOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  const onCreate = async () => {
    if (!activeTree) return;
    if (!name.trim()) {
      toast.error('Give your challenge a name.');
      return;
    }
    let goalNum: number | undefined;
    if (type === 'cooperative') {
      goalNum = Number(goal.replace(/[^\d]/g, ''));
      if (!Number.isFinite(goalNum) || goalNum <= 0) {
        toast.error('Set a team step goal — e.g. 386,000 to walk to the moon.');
        return;
      }
    }
    setSaving(true);
    try {
      const { challengeId } = await convex.mutation(challengeCreate, {
        treeId: activeTree._id,
        name: name.trim(),
        type,
        windowType,
        goal: goalNum,
        inviteOnly,
      });
      toast.success('Challenge created — time to rally the family! 🎉');
      router.replace(`/challenge/${challengeId}` as unknown as Href);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the challenge.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="New challenge" subtitle={activeTree?.name}>
      <Stack.Screen options={{ title: 'New challenge' }} />

      <TextField
        label="Name"
        placeholder="Walk to the moon 🌕"
        value={name}
        onChangeText={setName}
        editable={!saving}
      />

      <Text style={styles.fieldLabel}>Challenge type</Text>
      {TYPE_OPTIONS.map((option) => {
        const selected = type === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            activeOpacity={0.7}
            onPress={() => setType(option.value)}
            style={[styles.typeCard, selected && styles.typeCardSelected]}
          >
            <Text style={[styles.typeLabel, selected && styles.typeLabelSelected]}>
              {option.label}
            </Text>
            <Text style={styles.typeBlurb}>{option.blurb}</Text>
          </TouchableOpacity>
        );
      })}

      {type === 'cooperative' ? (
        <TextField
          label="Team step goal"
          placeholder="386000"
          keyboardType="number-pad"
          value={goal}
          onChangeText={setGoal}
          editable={!saving}
          helper="386,000 steps ≈ the distance to walk to the moon. Okay, not really — but it sounds epic."
        />
      ) : null}

      <Text style={styles.fieldLabel}>Window</Text>
      <View style={styles.chipRow}>
        {WINDOW_OPTIONS.map((option) => {
          const selected = windowType === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Window: ${option.label}`}
              activeOpacity={0.7}
              onPress={() => setWindowType(option.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchLabel}>Invite only</Text>
          <Text style={styles.switchHelper}>Only you can add participants</Text>
        </View>
        <Switch value={inviteOnly} onValueChange={setInviteOnly} disabled={saving} accessibilityLabel="Invite only" />
      </View>

      <Text style={styles.privacyNote}>
        Steps only count for people who join — nothing is shared without opting in, and anyone
        can leave at any time.
      </Text>

      <Button label="Create challenge" onPress={onCreate} loading={saving} />
    </Screen>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    fieldLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
      marginBottom: t.spacing.xs,
      marginTop: t.spacing.sm,
    },
    typeCard: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      borderWidth: 1.5,
      borderColor: t.colors.border,
      padding: t.spacing.lg,
      marginBottom: t.spacing.sm,
    },
    typeCardSelected: {
      borderColor: t.colors.primary,
    },
    typeLabel: {
      ...t.typography.cardTitle,
      color: t.colors.text,
    },
    typeLabelSelected: {
      color: t.colors.primary,
    },
    typeBlurb: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      marginTop: 2,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: t.spacing.sm,
    },
    chip: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.lg,
      marginRight: t.spacing.sm,
      marginBottom: t.spacing.sm,
      backgroundColor: t.colors.bgElevated,
      minHeight: 44,
      justifyContent: 'center',
    },
    chipSelected: {
      backgroundColor: t.colors.primary,
      borderColor: t.colors.primary,
    },
    chipText: {
      fontSize: 15,
      fontWeight: '500',
      color: t.colors.text,
    },
    chipTextSelected: {
      color: t.colors.onPrimary,
      fontWeight: '600',
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: t.spacing.md,
    },
    switchCopy: {
      flex: 1,
      marginRight: t.spacing.md,
    },
    switchLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    switchHelper: {
      ...t.typography.helper,
      color: t.colors.textMuted,
    },
    privacyNote: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      marginBottom: t.spacing.lg,
    },
  });
}
