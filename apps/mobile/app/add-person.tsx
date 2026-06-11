/**
 * Add person (wave D) — creates a person in the active tree via
 * persons:createPerson, with optional relationship to an existing person
 * (parent / child via families:addChildToPerson — the same smart helper
 * the web uses; partner links are deferred to a later wave).
 */

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, type Href } from 'expo-router';
import { useConvex } from 'convex/react';

import {
  createPerson,
  addChildToPerson,
  searchPersonsAutocomplete,
  type Gender,
  type PersonSearchResult,
} from '../lib/genolyApi';
import { useActiveTree } from '../hooks/useActiveTree';
import { useThemedStyles, type Theme } from '../theme';
import { Screen, Button, TextField, toast } from '../components/ui';

type RelationKind = 'none' | 'childOf' | 'parentOf';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'nonbinary', label: 'Nonbinary' },
  { value: 'other', label: 'Other' },
];

export default function AddPersonScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();
  const { activeTree } = useActiveTree();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [isLiving, setIsLiving] = useState(true);
  const [relation, setRelation] = useState<RelationKind>('none');
  const [relatedSearch, setRelatedSearch] = useState('');
  const [relatedResults, setRelatedResults] = useState<PersonSearchResult[]>([]);
  const [relatedPerson, setRelatedPerson] = useState<PersonSearchResult | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced one-shot relative search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = relatedSearch.trim();
    if (!activeTree || term.length < 2 || relatedPerson) {
      setRelatedResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      convex
        .query(searchPersonsAutocomplete, { treeId: activeTree._id, query: term, limit: 6 })
        .then(setRelatedResults)
        .catch(() => setRelatedResults([]));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [relatedSearch, activeTree, relatedPerson, convex]);

  const onSave = async () => {
    if (!activeTree) return;
    if (!name.trim()) {
      toast.error('A name is required.');
      return;
    }
    if (relation !== 'none' && !relatedPerson) {
      toast.error('Pick who they are related to, or choose "No link yet".');
      return;
    }
    setSaving(true);
    try {
      const created = await convex.mutation(createPerson, {
        treeId: activeTree._id,
        preferredName: name.trim(),
        gender,
        isLiving,
      });
      if (relation !== 'none' && relatedPerson) {
        await convex.mutation(addChildToPerson, {
          treeId: activeTree._id,
          parentPersonId: relation === 'parentOf' ? created.personId : relatedPerson._id,
          childPersonId: relation === 'parentOf' ? relatedPerson._id : created.personId,
          relationshipType: 'biological',
        });
      }
      toast.success(`${name.trim()} joined the tree. 🌳`);
      router.replace(`/person/${created.personId}` as unknown as Href);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add them right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Add person" subtitle={activeTree?.name}>
      <Stack.Screen options={{ title: 'Add person' }} />

      <TextField label="Name" placeholder="Their full name" value={name} onChangeText={setName} editable={!saving} />

      <Text style={styles.fieldLabel}>Gender (optional)</Text>
      <View style={styles.chipRow}>
        {GENDER_OPTIONS.map((option) => {
          const selected = gender === option.value;
          return (
            <Chip
              key={option.value}
              styles={styles}
              label={option.label}
              selected={selected}
              onPress={() => setGender(selected ? undefined : option.value)}
            />
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>Are they living?</Text>
      <View style={styles.chipRow}>
        <Chip styles={styles} label="Living" selected={isLiving} onPress={() => setIsLiving(true)} />
        <Chip styles={styles} label="Passed away" selected={!isLiving} onPress={() => setIsLiving(false)} />
      </View>

      <Text style={styles.fieldLabel}>How do they connect?</Text>
      <View style={styles.chipRow}>
        <Chip styles={styles} label="No link yet" selected={relation === 'none'} onPress={() => setRelation('none')} />
        <Chip styles={styles} label="Child of…" selected={relation === 'childOf'} onPress={() => setRelation('childOf')} />
        <Chip styles={styles} label="Parent of…" selected={relation === 'parentOf'} onPress={() => setRelation('parentOf')} />
      </View>

      {relation !== 'none' ? (
        relatedPerson ? (
          <View style={styles.relatedPicked}>
            <Text style={styles.relatedPickedText}>
              {relation === 'childOf' ? 'Child of ' : 'Parent of '}
              <Text style={styles.relatedPickedName}>{relatedPerson.preferredName}</Text>
            </Text>
            <Button variant="link" label="Change" onPress={() => setRelatedPerson(null)} />
          </View>
        ) : (
          <>
            <TextField
              label={relation === 'childOf' ? 'Search for the parent' : 'Search for the child'}
              placeholder="Type a name…"
              value={relatedSearch}
              onChangeText={setRelatedSearch}
              autoCorrect={false}
              editable={!saving}
            />
            {relatedResults.map((result) => (
              <TouchableOpacity
                key={result._id}
                accessibilityRole="button"
                accessibilityLabel={`Select ${result.preferredName}`}
                activeOpacity={0.7}
                onPress={() => setRelatedPerson(result)}
                style={styles.resultRow}
              >
                <Text style={styles.resultName}>{result.preferredName}</Text>
              </TouchableOpacity>
            ))}
          </>
        )
      ) : null}

      <Button label="Add to tree" onPress={onSave} loading={saving} style={styles.save} />
    </Screen>
  );
}

type Styles = ReturnType<typeof createStyles>;

function Chip({
  styles,
  label,
  selected,
  onPress,
}: {
  styles: Styles;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
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
    relatedPicked: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.sm,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.sm,
      marginBottom: t.spacing.sm,
    },
    relatedPickedText: {
      ...t.typography.body,
      color: t.colors.textMuted,
    },
    relatedPickedName: {
      color: t.colors.text,
      fontWeight: '600',
    },
    resultRow: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      marginBottom: t.spacing.xs,
      minHeight: 44,
      justifyContent: 'center',
    },
    resultName: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    save: {
      marginTop: t.spacing.lg,
    },
  });
}
