/**
 * Add event (wave D) — creates a life event for this person via
 * events:createEventForPerson (event + participant link in one mutation,
 * same as web AddEvent). Date entry is free-form (dateOriginal) with an
 * optional structured year — the server stores both.
 */

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useConvex, useQuery } from 'convex/react';

import { getPerson, createEventForPerson, type EventType } from '../../../lib/genolyApi';
import { useThemedStyles, type Theme } from '../../../theme';
import { Screen, Button, TextField, toast } from '../../../components/ui';

const EVENT_TYPES: { value: EventType; label: string; emoji: string }[] = [
  { value: 'birth', label: 'Birth', emoji: '👶' },
  { value: 'marriage', label: 'Marriage', emoji: '💍' },
  { value: 'residence', label: 'Moved', emoji: '🏠' },
  { value: 'education', label: 'Education', emoji: '🎓' },
  { value: 'occupation', label: 'Work', emoji: '💼' },
  { value: 'military', label: 'Military', emoji: '🎖️' },
  { value: 'immigration', label: 'Immigration', emoji: '🧳' },
  { value: 'death', label: 'Death', emoji: '🕯️' },
  { value: 'custom', label: 'Other', emoji: '📌' },
];

export default function AddEventScreen() {
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();
  const detail = useQuery(getPerson, personId ? { personId } : ('skip' as const));

  const [type, setType] = useState<EventType>('birth');
  const [title, setTitle] = useState('');
  const [dateText, setDateText] = useState('');
  const [year, setYear] = useState('');
  const [place, setPlace] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    const treeId = detail?.person?.treeId;
    if (!personId || !treeId) return;
    const yearNum = year.trim() === '' ? undefined : Number(year.trim());
    if (yearNum !== undefined && (!Number.isInteger(yearNum) || yearNum < 1000 || yearNum > 2100)) {
      toast.error('That year doesn’t look right.');
      return;
    }
    setSaving(true);
    try {
      await convex.mutation(createEventForPerson, {
        treeId,
        personId,
        type,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        dateOriginal: dateText.trim() || (yearNum ? String(yearNum) : undefined),
        dateStart: yearNum ? Date.UTC(yearNum, 0, 1) : undefined,
        datePrecision: yearNum && !dateText.trim() ? 'approximate' : undefined,
        locationText: place.trim() || undefined,
      });
      toast.success('Event added.');
      router.back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add the event right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Add event" subtitle={detail?.person?.preferredName}>
      <Stack.Screen options={{ title: 'Add event' }} />

      <Text style={styles.fieldLabel}>What happened?</Text>
      <View style={styles.chipRow}>
        {EVENT_TYPES.map((option) => {
          const selected = type === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Event type: ${option.label}`}
              activeOpacity={0.7}
              onPress={() => setType(option.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.emoji} {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {type === 'custom' ? (
        <TextField label="Event name" value={title} onChangeText={setTitle} editable={!saving} />
      ) : null}
      <TextField
        label="When (free-form)"
        placeholder="e.g. March 1985, or summer of '99"
        value={dateText}
        onChangeText={setDateText}
        editable={!saving}
      />
      <TextField
        label="Year (optional)"
        placeholder="e.g. 1985"
        keyboardType="number-pad"
        value={year}
        onChangeText={setYear}
        editable={!saving}
      />
      <TextField
        label="Where (optional)"
        placeholder="City, country"
        value={place}
        onChangeText={setPlace}
        editable={!saving}
      />
      <TextField
        label="Notes (optional)"
        value={description}
        onChangeText={setDescription}
        editable={!saving}
        multiline
        numberOfLines={3}
        style={styles.notesInput}
      />

      <Button label="Add event" onPress={onSave} loading={saving} style={styles.save} />
    </Screen>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    fieldLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
      marginBottom: t.spacing.xs,
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
    notesInput: {
      minHeight: 72,
      textAlignVertical: 'top',
    },
    save: {
      marginTop: t.spacing.md,
    },
  });
}
