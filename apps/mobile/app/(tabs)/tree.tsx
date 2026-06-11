/**
 * Tree — family-tree exploration hub (wave D).
 *
 * Layout:
 *   - Tree picker chips (when the member belongs to multiple trees;
 *     selection persists as the last-visited tree)
 *   - Search (debounced ONE-SHOT autocomplete queries — typing must not
 *     open a live subscription per keystroke; bandwidth diet)
 *   - Person directory (single listAllPersonsByTree read, sorted by name)
 *   - Add person CTA
 */

import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useConvex, useQuery } from 'convex/react';
import { Image } from 'expo-image';

import {
  listAllPersonsByTree,
  searchPersonsAutocomplete,
  type PersonDoc,
  type PersonSearchResult,
} from '../../lib/genolyApi';
import { useActiveTree } from '../../hooks/useActiveTree';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { setLastVisitedTreeSlug } from '../../utils/preferences';
import { genderAccents, useTheme, useThemedStyles, type Theme } from '../../theme';
import { Screen, EmptyState, TextField, Button, Skeleton } from '../../components/ui';

const ADD_PERSON_ROUTE = '/add-person' as unknown as Href;
const WELCOME_ROUTE = '/welcome' as unknown as Href;

export default function TreeScreen() {
  const router = useRouter();
  const t = useTheme();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();
  const { trees, activeTree, isLoading } = useActiveTree();
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<PersonSearchResult[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tree = useMemo(() => {
    if (selectedTreeId && trees) {
      return trees.find((candidate) => candidate._id === selectedTreeId) ?? activeTree;
    }
    return activeTree;
  }, [selectedTreeId, trees, activeTree]);

  const persons = useQuery(listAllPersonsByTree, tree ? { treeId: tree._id } : ('skip' as const));

  // Debounced one-shot search (no per-keystroke subscriptions).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = search.trim();
    if (!tree || term.length < 2) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      convex
        .query(searchPersonsAutocomplete, { treeId: tree._id, query: term, limit: 12 })
        .then(setResults)
        .catch(() => setResults(null));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, tree, convex]);

  const onPickTree = (treeId: string) => {
    setSelectedTreeId(treeId);
    const picked = trees?.find((candidate) => candidate._id === treeId);
    if (picked?.slug) {
      setLastVisitedTreeSlug(picked.slug).catch(() => {});
    }
  };

  const openPerson = (personId: string) => {
    router.push(`/person/${personId}` as unknown as Href);
  };

  if (isLoading) {
    return (
      <Screen title="Tree">
        <Skeleton height={44} />
        <Skeleton height={72} />
        <Skeleton height={72} />
        <Skeleton height={72} />
      </Screen>
    );
  }

  if (!tree) {
    return (
      <Screen title="Tree">
        <EmptyState
          icon="🌳"
          title="No tree yet"
          body="Plant your family tree and start adding the people you love."
          ctaLabel="Start your tree"
          onCtaPress={() => router.push(WELCOME_ROUTE)}
        />
      </Screen>
    );
  }

  const sortedPersons = (persons ?? [])
    .slice()
    .sort((a, b) => a.preferredName.localeCompare(b.preferredName));

  const showingSearch = results !== null;

  return (
    <Screen title="Tree" subtitle={tree.name} noScroll>
      {/* Tree picker */}
      {trees && trees.length > 1 ? (
        <View style={styles.pickerRow}>
          {trees.map((candidate) => {
            const selected = candidate._id === tree._id;
            return (
              <TouchableOpacity
                key={candidate._id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Switch to ${candidate.name}`}
                activeOpacity={0.7}
                onPress={() => onPickTree(candidate._id)}
                style={[styles.treeChip, selected && styles.treeChipSelected]}
              >
                <Text
                  style={[styles.treeChipText, selected && styles.treeChipTextSelected]}
                  numberOfLines={1}
                >
                  {candidate.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <TextField
        label="Find someone"
        placeholder="Search by name…"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
      />

      <FlatList<PersonDoc | PersonSearchResult>
        data={showingSearch ? (results ?? []) : sortedPersons}
        keyExtractor={(item) => item._id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.listLabel}>
              {showingSearch
                ? `${results?.length ?? 0} match${(results?.length ?? 0) === 1 ? '' : 'es'}`
                : `${sortedPersons.length} ${sortedPersons.length === 1 ? 'person' : 'people'}`}
            </Text>
            <Button
              variant="link"
              label="+ Add person"
              onPress={() => router.push(ADD_PERSON_ROUTE)}
              accessibilityLabel="Add a person to the tree"
            />
          </View>
        }
        ListEmptyComponent={
          persons === undefined && !showingSearch ? (
            <Skeleton height={72} />
          ) : (
            <EmptyState
              icon={showingSearch ? '🔍' : '🌱'}
              title={showingSearch ? 'No one by that name yet' : 'The tree is waiting'}
              body={
                showingSearch
                  ? 'Try another spelling — or add them.'
                  : 'Add your first relative and watch the branches grow.'
              }
              ctaLabel="Add person"
              onCtaPress={() => router.push(ADD_PERSON_ROUTE)}
            />
          )
        }
        renderItem={({ item }) => (
          <PersonRow
            styles={styles}
            person={item}
            accent={
              item.gender === 'male'
                ? genderAccents.male
                : item.gender === 'female'
                  ? genderAccents.female
                  : t.colors.border
            }
            onPress={() => openPerson(item._id)}
          />
        )}
      />
    </Screen>
  );
}

type Styles = ReturnType<typeof createStyles>;

function PersonRow({
  styles,
  person,
  accent,
  onPress,
}: {
  styles: Styles;
  person: PersonDoc | PersonSearchResult;
  accent: string;
  onPress: () => void;
}) {
  const avatarKey = 'avatarPhotoKey' in person ? person.avatarPhotoKey : undefined;
  const avatarUrl = useSignedUrl(avatarKey);
  const initials = person.preferredName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Open ${person.preferredName}`}
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.personRow}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { borderColor: accent }]}>
          <Text style={styles.avatarInitials}>{initials || '?'}</Text>
        </View>
      )}
      <View style={styles.personCopy}>
        <Text style={styles.personName} numberOfLines={1}>
          {person.preferredName}
        </Text>
        {'nickname' in person && person.nickname ? (
          <Text style={styles.personMeta} numberOfLines={1}>
            “{person.nickname}”
          </Text>
        ) : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    pickerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: t.spacing.md,
    },
    treeChip: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.md,
      marginRight: t.spacing.sm,
      marginBottom: t.spacing.sm,
      backgroundColor: t.colors.bgElevated,
      maxWidth: 220,
    },
    treeChipSelected: {
      backgroundColor: t.colors.primary,
      borderColor: t.colors.primary,
    },
    treeChipText: {
      fontSize: 14,
      fontWeight: '500',
      color: t.colors.text,
    },
    treeChipTextSelected: {
      color: t.colors.onPrimary,
      fontWeight: '600',
    },
    listHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: t.spacing.sm,
    },
    listLabel: {
      ...t.typography.sectionHeader,
      color: t.colors.textMuted,
    },
    personRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      marginBottom: t.spacing.sm,
      minHeight: 44,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: t.spacing.md,
    },
    avatarFallback: {
      backgroundColor: t.colors.surfaceMuted,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: {
      fontSize: 14,
      fontWeight: '600',
      color: t.colors.textMuted,
    },
    personCopy: {
      flex: 1,
    },
    personName: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    personMeta: {
      ...t.typography.helper,
      color: t.colors.textMuted,
    },
    chevron: {
      color: t.colors.textMuted,
      fontSize: 18,
      marginLeft: t.spacing.sm,
    },
  });
}
