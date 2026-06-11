/**
 * Edit person (wave D) — name, nickname, surname, gender, living flag,
 * summary. Mirrors the member-editable subset of web PersonDetail's
 * editor via persons:updatePerson.
 */

import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useConvex, useQuery } from 'convex/react';

import { getPerson, updatePerson, type Gender } from '../../../lib/genolyApi';
import { useThemedStyles, type Theme } from '../../../theme';
import { Screen, Button, TextField, Skeleton, toast } from '../../../components/ui';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'nonbinary', label: 'Nonbinary' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export default function EditPersonScreen() {
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();
  const detail = useQuery(getPerson, personId ? { personId } : ('skip' as const));

  const [loaded, setLoaded] = useState(false);
  const [preferredName, setPreferredName] = useState('');
  const [nickname, setNickname] = useState('');
  const [surname, setSurname] = useState('');
  const [summary, setSummary] = useState('');
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [isLiving, setIsLiving] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (detail?.person && !loaded) {
      const p = detail.person;
      setPreferredName(p.preferredName);
      setNickname(p.nickname ?? '');
      setSurname(p.surname ?? '');
      setSummary(p.summary ?? '');
      setGender((p.gender as Gender) ?? undefined);
      setIsLiving(p.isLiving);
      setLoaded(true);
    }
  }, [detail, loaded]);

  const onSave = async () => {
    if (!personId) return;
    if (!preferredName.trim()) {
      toast.error('A name is required.');
      return;
    }
    setSaving(true);
    try {
      await convex.mutation(updatePerson, {
        personId,
        preferredName: preferredName.trim(),
        nickname: nickname.trim() || undefined,
        surname: surname.trim() || undefined,
        summary: summary.trim() || undefined,
        gender,
        isLiving,
      });
      toast.success('Saved.');
      router.back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save right now.');
    } finally {
      setSaving(false);
    }
  };

  if (detail === undefined || !loaded) {
    return (
      <Screen title="Edit person">
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </Screen>
    );
  }

  return (
    <Screen title="Edit person">
      <Stack.Screen options={{ title: 'Edit person' }} />
      <TextField label="Name" value={preferredName} onChangeText={setPreferredName} editable={!saving} />
      <TextField label="Nickname" value={nickname} onChangeText={setNickname} editable={!saving} />
      <TextField label="Surname" value={surname} onChangeText={setSurname} editable={!saving} />
      <TextField
        label="About"
        value={summary}
        onChangeText={setSummary}
        editable={!saving}
        multiline
        numberOfLines={4}
        style={styles.summaryInput}
      />

      <Text style={styles.fieldLabel}>Gender</Text>
      <View style={styles.chipRow}>
        {GENDER_OPTIONS.map((option) => {
          const selected = gender === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Gender: ${option.label}`}
              activeOpacity={0.7}
              onPress={() => setGender(selected ? undefined : option.value)}
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
        <Text style={styles.fieldLabel}>Living</Text>
        <Switch
          value={isLiving}
          onValueChange={setIsLiving}
          disabled={saving}
          accessibilityLabel="Living"
        />
      </View>

      <Button label="Save changes" onPress={onSave} loading={saving} style={styles.save} />
    </Screen>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    summaryInput: {
      minHeight: 96,
      textAlignVertical: 'top',
    },
    fieldLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
      marginBottom: t.spacing.xs,
      marginTop: t.spacing.sm,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    chip: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
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
      fontSize: 14,
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
    save: {
      marginTop: t.spacing.md,
    },
  });
}
