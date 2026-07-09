/**
 * RegisterTable — the Register view of the Tree tab: the person directory as a
 * TABLE (name / relationship / lifespan + sort + search).
 *
 * RN rewrite of the web ListView's table layout (genoly-family-web
 * src/components/explorer/ListView.tsx) over the PORTED pure helpers in
 * lib/tree/listHelpers.ts. This view ABSORBS the old Tree-tab person
 * directory + debounced search (the table IS the directory).
 *
 * Data: rows from persons:listAllPersonsByTree; the relationship + lifespan
 * columns come from the shared explorerGraph payload (no per-row query) —
 * people outside the anchor's loaded neighborhood render "—" (surfaced, not
 * silently dropped; web parity).
 *
 * Row tap → person profile. The ⇄ affordance on each row re-anchors the
 * Explore view to that person ("see their family").
 */

import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';

import type { PersonDoc, PersonSearchResult } from '../../lib/genolyApi';
import type { ExplorerGraphResult } from '../../lib/tree/explorerTypes';
import {
  buildGenerationMap,
  buildRelationshipGraph,
  filterPersons,
  makeRelationshipResolver,
  sortPersons,
  DEFAULT_FILTERS,
  SORT_LABELS,
  type ListPerson,
  type SortKey,
} from '../../lib/tree/listHelpers';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { genderAccents, useTheme, useThemedStyles, type Theme } from '../../theme';
import { EmptyState, Skeleton, TextField } from '../../components/ui';

const SORT_KEYS: SortKey[] = ['relationship', 'name', 'year'];

export interface RegisterTableProps {
  /** All persons on the tree (persons:listAllPersonsByTree). */
  persons: PersonDoc[] | undefined;
  /** Shared explorerGraph payload (relationship + lifespan columns). */
  graph: ExplorerGraphResult | undefined;
  search: string;
  onSearchChange: (query: string) => void;
  /** Debounced one-shot autocomplete results (null = not searching). */
  searchResults: PersonSearchResult[] | null;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  onOpenPerson: (personId: string) => void;
  /** "See their family" — re-anchor Explore to this person. */
  onExplorePerson: (personId: string) => void;
  onAddPerson: () => void;
}

const LIST_GENDERS = new Set(['male', 'female', 'nonbinary', 'unknown', 'other']);

export function RegisterTable({
  persons,
  graph,
  search,
  onSearchChange,
  searchResults,
  sortKey,
  onSortChange,
  onOpenPerson,
  onExplorePerson,
  onAddPerson,
}: RegisterTableProps) {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const generationByPerson = useMemo(
    () => buildGenerationMap(graph?.persons ?? []),
    [graph],
  );

  const resolveRelationship = useMemo(() => {
    if (!graph) return () => null;
    const relGraph = buildRelationshipGraph(graph.persons, graph.familyEdges);
    return makeRelationshipResolver(relGraph, graph.viewerPersonId, graph.viewerConfidence);
  }, [graph]);

  const rows = useMemo(() => {
    if (!persons) return null;
    const yearsById = new Map(
      (graph?.persons ?? []).map((p) => [p._id, { birthYear: p.birthYear, deathYear: p.deathYear }]),
    );
    const searchIds = searchResults === null ? null : new Set(searchResults.map((r) => r._id));
    const base: ListPerson[] = persons
      .filter((p) => searchIds === null || searchIds.has(p._id))
      .map((p) => ({
        _id: p._id,
        slug: p.slug ?? undefined,
        preferredName: p.preferredName,
        surname: p.surname,
        gender:
          p.gender && LIST_GENDERS.has(p.gender)
            ? (p.gender as ListPerson['gender'])
            : undefined,
        isLiving: p.isLiving,
        birthYear: yearsById.get(p._id)?.birthYear,
        deathYear: yearsById.get(p._id)?.deathYear,
      }));
    return sortPersons(
      filterPersons(base, DEFAULT_FILTERS, generationByPerson),
      sortKey,
      generationByPerson,
    );
  }, [persons, graph, searchResults, sortKey, generationByPerson]);

  const personById = useMemo(
    () => new Map((persons ?? []).map((p) => [p._id, p])),
    [persons],
  );

  const searching = searchResults !== null;

  return (
    <View style={styles.fill} testID="register-table">
      <TextField
        label="Find someone"
        placeholder="Search by name…"
        value={search}
        onChangeText={onSearchChange}
        autoCorrect={false}
      />

      {/* Sort control. */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort</Text>
        {SORT_KEYS.map((key) => {
          const selected = key === sortKey;
          return (
            <TouchableOpacity
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Sort by ${SORT_LABELS[key]}`}
              activeOpacity={0.7}
              onPress={() => onSortChange(key)}
              style={[styles.sortChip, selected && styles.sortChipSelected]}
            >
              <Text style={[styles.sortChipText, selected && styles.sortChipTextSelected]}>
                {SORT_LABELS[key]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList<ListPerson>
        data={rows ?? []}
        keyExtractor={(item) => item._id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          rows && rows.length > 0 ? (
            <View>
              <Text style={styles.countLabel}>
                {searching
                  ? `${rows.length} match${rows.length === 1 ? '' : 'es'}`
                  : `${rows.length} ${rows.length === 1 ? 'person' : 'people'}`}
              </Text>
              {/* Column headers. */}
              <View style={styles.headerRow} accessibilityElementsHidden>
                <Text style={[styles.headerCell, styles.nameCol]}>Name</Text>
                <Text style={[styles.headerCell, styles.relCol]}>Relationship</Text>
                <Text style={[styles.headerCell, styles.yearsCol]}>Years</Text>
                <View style={styles.actionCol} />
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          rows === null ? (
            <View>
              <Skeleton height={56} />
              <Skeleton height={56} />
              <Skeleton height={56} />
            </View>
          ) : (
            <EmptyState
              icon={searching ? '🔍' : '🌱'}
              title={searching ? 'No one by that name yet' : 'The tree is waiting'}
              body={
                searching
                  ? 'Try another spelling — or add them.'
                  : 'Add your first relative and watch the branches grow.'
              }
              ctaLabel="Add person"
              onCtaPress={onAddPerson}
            />
          )
        }
        renderItem={({ item }) => (
          <RegisterRow
            styles={styles}
            person={item}
            avatarKey={personById.get(item._id)?.avatarPhotoKey}
            accent={
              item.gender === 'male'
                ? genderAccents.male
                : item.gender === 'female'
                  ? genderAccents.female
                  : t.colors.border
            }
            relationship={resolveRelationship(item._id)?.label ?? null}
            relationshipMuted={graph?.viewerConfidence !== 'linked'}
            onPress={() => onOpenPerson(item._id)}
            onExplore={() => onExplorePerson(item._id)}
          />
        )}
      />
    </View>
  );
}

type Styles = ReturnType<typeof createStyles>;

function formatYears(p: ListPerson): string {
  if (p.isLiving) return p.birthYear ? `b. ${p.birthYear}` : '—';
  if (p.birthYear || p.deathYear) return `${p.birthYear ?? '?'}–${p.deathYear ?? '?'}`;
  return '—';
}

function RegisterRow({
  styles,
  person,
  avatarKey,
  accent,
  relationship,
  relationshipMuted,
  onPress,
  onExplore,
}: {
  styles: Styles;
  person: ListPerson;
  avatarKey: string | undefined;
  accent: string;
  relationship: string | null;
  relationshipMuted: boolean;
  onPress: () => void;
  onExplore: () => void;
}) {
  const avatarUrl = useSignedUrl(avatarKey);
  const initials = person.preferredName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const years = formatYears(person);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Open ${person.preferredName}${relationship ? `, ${relationship}` : ''}`}
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
      <View style={styles.nameCol}>
        <Text style={styles.personName} numberOfLines={1}>
          {person.preferredName}
        </Text>
        {person.surname ? (
          <Text style={styles.personMeta} numberOfLines={1}>
            {person.surname}
          </Text>
        ) : null}
      </View>
      <Text
        style={[styles.relCell, styles.relCol, relationshipMuted && styles.relCellMuted]}
        numberOfLines={2}
      >
        {relationship ?? '—'}
      </Text>
      <Text style={[styles.yearsCell, styles.yearsCol]} numberOfLines={1}>
        {years}
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`See ${person.preferredName}'s family in Explore`}
        activeOpacity={0.7}
        onPress={onExplore}
        style={styles.actionCol}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.exploreGlyph}>⇄</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    fill: {
      flex: 1,
    },
    sortRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginBottom: t.spacing.sm,
    },
    sortLabel: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      marginRight: t.spacing.sm,
    },
    sortChip: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.xs,
      paddingHorizontal: t.spacing.sm,
      marginRight: t.spacing.xs,
      marginBottom: t.spacing.xs,
      backgroundColor: t.colors.bgElevated,
      minHeight: 28,
      justifyContent: 'center',
    },
    sortChipSelected: {
      backgroundColor: t.colors.primary,
      borderColor: t.colors.primary,
    },
    sortChipText: {
      fontSize: 12,
      fontWeight: '500',
      color: t.colors.text,
    },
    sortChipTextSelected: {
      color: t.colors.onPrimary,
      fontWeight: '600',
    },
    countLabel: {
      ...t.typography.sectionHeader,
      color: t.colors.textMuted,
      marginTop: t.spacing.sm,
      marginBottom: t.spacing.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: t.spacing.lg,
      paddingLeft: t.spacing.lg + 40 + t.spacing.md, // align past the avatar
      marginBottom: t.spacing.xs,
    },
    headerCell: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    nameCol: {
      flex: 1,
      paddingRight: t.spacing.sm,
    },
    relCol: {
      width: 108,
      paddingRight: t.spacing.sm,
    },
    yearsCol: {
      width: 76,
    },
    actionCol: {
      width: 28,
      alignItems: 'center',
      justifyContent: 'center',
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
    personName: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    personMeta: {
      ...t.typography.helper,
      color: t.colors.textMuted,
    },
    relCell: {
      fontSize: 12,
      color: t.colors.info,
    },
    relCellMuted: {
      color: t.colors.textMuted,
    },
    yearsCell: {
      fontSize: 12,
      color: t.colors.textMuted,
    },
    exploreGlyph: {
      fontSize: 16,
      color: t.colors.link,
    },
  });
}
