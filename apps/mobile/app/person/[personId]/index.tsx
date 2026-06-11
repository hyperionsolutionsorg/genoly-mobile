/**
 * Person profile (wave D) — mobile mirror of web PersonDetail:
 * avatar + name + life dates, summary, immediate family (from the
 * relationship graph), life events, and photos. Member actions: edit,
 * add event, add photo.
 */

import { FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useMemo } from 'react';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQuery } from 'convex/react';
import { Image } from 'expo-image';

import {
  getPerson,
  listEventsByPerson,
  getMediaForTarget,
  getRelationshipGraph,
  type PersonEvent,
} from '../../../lib/genolyApi';
import { useSignedUrl } from '../../../hooks/useSignedUrl';
import { useThemedStyles, type Theme } from '../../../theme';
import { Screen, Section, Button, EmptyState, Skeleton } from '../../../components/ui';

export default function PersonDetailScreen() {
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();

  const detail = useQuery(getPerson, personId ? { personId } : ('skip' as const));
  const person = detail?.person ?? null;
  const treeId = person?.treeId;

  const events = useQuery(listEventsByPerson, personId ? { personId } : ('skip' as const));
  const media = useQuery(
    getMediaForTarget,
    treeId && personId
      ? { treeId, targetType: 'person', targetId: personId }
      : ('skip' as const),
  );
  const graph = useQuery(getRelationshipGraph, treeId ? { treeId } : ('skip' as const));

  const avatarUrl = useSignedUrl(person?.avatarPhotoKey);

  const family = useMemo(() => {
    if (!graph || !personId) return null;
    const nameOf = new Map(graph.persons.map((p) => [p._id, p.preferredName]));
    const resolve = (ids: string[] | undefined) =>
      (ids ?? []).map((id) => ({ id, name: nameOf.get(id) ?? 'Unknown' }));
    return {
      parents: resolve(graph.parents[personId]),
      spouses: resolve(graph.spouses[personId]),
      children: resolve(graph.children[personId]),
    };
  }, [graph, personId]);

  const lifeDates = useMemo(() => {
    if (!events) return null;
    const birth = events.find((event) => event.type === 'birth');
    const death = events.find((event) => event.type === 'death');
    const year = (event: PersonEvent | undefined) =>
      event?.dateStart ? new Date(event.dateStart).getFullYear().toString() : event?.dateOriginal ?? null;
    const born = year(birth);
    const died = year(death);
    if (!born && !died) return null;
    return died ? `${born ?? '?'} – ${died}` : `Born ${born}`;
  }, [events]);

  if (detail === undefined) {
    return (
      <Screen title=" ">
        <Skeleton height={96} rounded={48} width={96} style={{ alignSelf: 'center' }} />
        <Skeleton height={28} width="60%" style={{ alignSelf: 'center' }} />
        <Skeleton height={120} />
      </Screen>
    );
  }

  if (!person) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Person' }} />
        <EmptyState
          icon="🍂"
          title="We couldn't find this person"
          body="They may have been removed, or you may not have access to this tree."
          ctaLabel="Back"
          onCtaPress={() => router.back()}
        />
      </Screen>
    );
  }

  const photoSize = Math.floor((width - 24 * 2 - 8 * 2) / 3);

  return (
    <Screen>
      <Stack.Screen options={{ title: person.preferredName }} />

      {/* Header */}
      <View style={styles.header}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarGlyph}>{person.isLiving ? '🙂' : '🕯️'}</Text>
          </View>
        )}
        <Text accessibilityRole="header" style={styles.name}>
          {person.preferredName}
        </Text>
        {person.nickname ? <Text style={styles.nickname}>“{person.nickname}”</Text> : null}
        {lifeDates ? <Text style={styles.dates}>{lifeDates}</Text> : null}
      </View>

      <View style={styles.actionsRow}>
        <Button
          variant="secondary"
          label="Edit"
          onPress={() => router.push(`/person/${personId}/edit` as unknown as Href)}
          style={styles.actionButton}
        />
        <Button
          variant="secondary"
          label="Add event"
          onPress={() => router.push(`/person/${personId}/add-event` as unknown as Href)}
          style={styles.actionButton}
        />
        <Button
          variant="secondary"
          label="Add photo"
          onPress={() => router.push(`/person/${personId}/add-photo` as unknown as Href)}
          style={styles.actionButton}
        />
      </View>

      {person.summary ? (
        <Section label="About">
          <Text style={styles.summary}>{person.summary}</Text>
        </Section>
      ) : null}

      {/* Immediate family */}
      <Section label="Family">
        {family === null ? (
          <Skeleton height={48} />
        ) : family.parents.length + family.spouses.length + family.children.length === 0 ? (
          <Text style={styles.muted}>
            No relationships recorded yet — add a parent, partner, or child from their profiles.
          </Text>
        ) : (
          <>
            <FamilyGroup styles={styles} label="Parents" entries={family.parents} router={router} />
            <FamilyGroup styles={styles} label="Partners" entries={family.spouses} router={router} />
            <FamilyGroup styles={styles} label="Children" entries={family.children} router={router} />
          </>
        )}
      </Section>

      {/* Life events */}
      <Section label="Life events">
        {events === undefined ? (
          <Skeleton height={64} />
        ) : events.length === 0 ? (
          <Text style={styles.muted}>No events yet. Birthdays, marriages, moves — add the moments that matter.</Text>
        ) : (
          events.map((event) => (
            <View key={event._id} style={styles.eventRow}>
              <Text accessibilityElementsHidden style={styles.eventIcon}>
                {eventEmoji(event.type)}
              </Text>
              <View style={styles.eventCopy}>
                <Text style={styles.eventTitle}>
                  {event.title?.trim() || prettyEventType(event.type)}
                </Text>
                <Text style={styles.eventMeta}>
                  {[
                    event.dateOriginal ??
                      (event.dateStart ? new Date(event.dateStart).getFullYear().toString() : null),
                    event.placeName,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Date unknown'}
                </Text>
              </View>
            </View>
          ))
        )}
      </Section>

      {/* Photos */}
      <Section label="Photos">
        {media === undefined ? (
          <Skeleton height={photoSize} />
        ) : media.length === 0 ? (
          <Text style={styles.muted}>No photos yet — snap one at the next family gathering.</Text>
        ) : (
          <FlatList
            data={media}
            keyExtractor={(item) => item._id}
            numColumns={3}
            scrollEnabled={false}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => (
              <MediaThumb objectKey={item.objectKey} size={photoSize} styles={styles} />
            )}
          />
        )}
      </Section>
    </Screen>
  );
}

function eventEmoji(type: string): string {
  switch (type) {
    case 'birth':
      return '👶';
    case 'death':
      return '🕯️';
    case 'marriage':
      return '💍';
    case 'divorce':
      return '📄';
    case 'residence':
      return '🏠';
    case 'education':
      return '🎓';
    case 'occupation':
      return '💼';
    case 'military':
      return '🎖️';
    case 'immigration':
      return '🧳';
    default:
      return '📌';
  }
}

function prettyEventType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

type Styles = ReturnType<typeof createStyles>;

function FamilyGroup({
  styles,
  label,
  entries,
  router,
}: {
  styles: Styles;
  label: string;
  entries: { id: string; name: string }[];
  router: ReturnType<typeof useRouter>;
}) {
  if (entries.length === 0) return null;
  return (
    <View style={styles.familyGroup}>
      <Text style={styles.familyLabel}>{label}</Text>
      {entries.map((entry) => (
        <Button
          key={entry.id}
          variant="link"
          label={entry.name}
          onPress={() => router.push(`/person/${entry.id}` as unknown as Href)}
          style={styles.familyLink}
          accessibilityLabel={`Open ${entry.name}`}
        />
      ))}
    </View>
  );
}

function MediaThumb({
  objectKey,
  size,
  styles,
}: {
  objectKey: string;
  size: number;
  styles: Styles;
}) {
  const url = useSignedUrl(objectKey);
  if (!url) {
    return <View style={[styles.thumbFallback, { width: size, height: size }]} />;
  }
  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size, borderRadius: 8 }}
      contentFit="cover"
      accessibilityLabel="Family photo"
    />
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    header: {
      alignItems: 'center',
      marginBottom: t.spacing.lg,
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
      marginBottom: t.spacing.md,
    },
    avatarFallback: {
      backgroundColor: t.colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarGlyph: {
      fontSize: 40,
    },
    name: {
      ...t.typography.screenTitle,
      color: t.colors.text,
      textAlign: 'center',
    },
    nickname: {
      ...t.typography.subtitle,
      color: t.colors.textMuted,
    },
    dates: {
      ...t.typography.body,
      color: t.colors.textMuted,
      marginTop: t.spacing.xs,
    },
    actionsRow: {
      flexDirection: 'row',
      marginBottom: t.spacing.xl,
    },
    actionButton: {
      flex: 1,
      marginRight: t.spacing.sm,
    },
    summary: {
      ...t.typography.body,
      color: t.colors.text,
    },
    muted: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
    },
    familyGroup: {
      marginBottom: t.spacing.sm,
    },
    familyLabel: {
      ...t.typography.helper,
      color: t.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    familyLink: {
      alignSelf: 'flex-start',
      paddingHorizontal: 0,
      paddingVertical: t.spacing.xs,
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.spacing.sm,
    },
    eventIcon: {
      fontSize: 20,
      marginRight: t.spacing.md,
    },
    eventCopy: {
      flex: 1,
    },
    eventTitle: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    eventMeta: {
      ...t.typography.helper,
      color: t.colors.textMuted,
    },
    thumbFallback: {
      borderRadius: 8,
      backgroundColor: t.colors.surfaceMuted,
    },
  });
}
