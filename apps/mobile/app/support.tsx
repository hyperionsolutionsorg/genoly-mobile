/**
 * Support (wave G) — knowledge-base search + article browsing + contact
 * form, consuming the same 38-article KB the web serves at /support.
 * Search is debounced one-shot (no per-keystroke subscriptions).
 */

import { StyleSheet, Text } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, type Href } from 'expo-router';
import { useConvex, useQuery } from 'convex/react';

import {
  kbListPublishedArticles,
  kbSearchArticles,
  submitContact,
  type KbArticleSummary,
} from '../lib/genolyApi';
import { useMe } from '../hooks/useMe';
import { useThemedStyles, type Theme } from '../theme';
import { Screen, Section, Card, Button, TextField, Skeleton, EmptyState, toast } from '../components/ui';

export default function SupportScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();
  const { me } = useMe();

  const articles = useQuery(kbListPublishedArticles, {});
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<KbArticleSummary[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showContact, setShowContact] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = search.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      convex
        .query(kbSearchArticles, { query: term })
        .then(setResults)
        .catch(() => setResults(null));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, convex]);

  const openArticle = (slug: string) => {
    router.push(`/support-article/${slug}` as unknown as Href);
  };

  const onSendContact = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error('Please add a subject and a message.');
      return;
    }
    setSending(true);
    try {
      await convex.mutation(submitContact, {
        name: me?.fullName ?? 'Genoly member',
        email: me?.email ?? '',
        subject: subject.trim(),
        body: body.trim(),
        userAgent: 'genoly-mobile',
      });
      toast.success("Message sent — we'll get back to you by email.");
      setSubject('');
      setBody('');
      setShowContact(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send right now.');
    } finally {
      setSending(false);
    }
  };

  const grouped = groupByCategory(results ?? articles ?? []);
  const searching = results !== null;

  return (
    <Screen title="Support" subtitle="Answers, guides, and a human if you need one">
      <Stack.Screen options={{ title: 'Support' }} />

      <TextField
        label="Search the knowledge base"
        placeholder="e.g. invite, pedigree, billing…"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
      />

      {articles === undefined && !searching ? (
        <>
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </>
      ) : (results ?? articles ?? []).length === 0 ? (
        <EmptyState
          icon="🔍"
          title={searching ? "Didn't find your answer?" : 'No articles yet'}
          body="Write to us — a real person reads every message."
          ctaLabel="Contact support"
          onCtaPress={() => setShowContact(true)}
        />
      ) : (
        grouped.map(([category, items]) => (
          <Section key={category} label={category}>
            {items.map((article) => (
              <Card
                key={article._id}
                title={article.title}
                onPress={() => openArticle(article.slug)}
                accessibilityLabel={`Open article ${article.title}`}
              />
            ))}
          </Section>
        ))
      )}

      {/* Contact */}
      <Section label="Still stuck?">
        {showContact ? (
          <>
            <TextField label="Subject" value={subject} onChangeText={setSubject} editable={!sending} />
            <TextField
              label="Message"
              value={body}
              onChangeText={setBody}
              editable={!sending}
              multiline
              numberOfLines={4}
              style={styles.messageInput}
            />
            <Button label="Send message" onPress={onSendContact} loading={sending} />
          </>
        ) : (
          <>
            <Text style={styles.contactBlurb}>
              Didn&apos;t find your answer? Write to us — replies go to {me?.email ?? 'your email'}.
            </Text>
            <Button
              variant="secondary"
              label="Contact support"
              onPress={() => setShowContact(true)}
              style={styles.contactButton}
            />
          </>
        )}
      </Section>
    </Screen>
  );
}

function groupByCategory(items: KbArticleSummary[]): [string, KbArticleSummary[]][] {
  const groups = new Map<string, KbArticleSummary[]>();
  for (const article of items) {
    const category = article.category?.trim() || 'General';
    const list = groups.get(category) ?? [];
    list.push(article);
    groups.set(category, list);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    messageInput: {
      minHeight: 96,
      textAlignVertical: 'top',
    },
    contactBlurb: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      marginBottom: t.spacing.md,
    },
    contactButton: {
      marginTop: t.spacing.xs,
    },
  });
}
