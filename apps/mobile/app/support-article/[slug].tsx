/**
 * Support article view (wave G) — renders a KB article body. Articles are
 * stored as markdown-ish plain text; we render paragraphs + simple
 * headings without a markdown dependency (keeps the bundle lean; the
 * articles are short-form help content).
 */

import { StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from 'convex/react';

import { kbGetArticleBySlug } from '../../lib/genolyApi';
import { useThemedStyles, type Theme } from '../../theme';
import { Screen, Skeleton, EmptyState } from '../../components/ui';

export default function SupportArticleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const article = useQuery(kbGetArticleBySlug, slug ? { slug } : ('skip' as const));

  if (article === undefined) {
    return (
      <Screen title=" ">
        <Skeleton height={28} width="70%" />
        <Skeleton height={16} />
        <Skeleton height={16} />
        <Skeleton height={16} width="60%" />
      </Screen>
    );
  }

  if (!article) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Article' }} />
        <EmptyState
          icon="🍂"
          title="Article not found"
          body="It may have moved — try searching the knowledge base."
          ctaLabel="Back to support"
          onCtaPress={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen title={article.title} subtitle={article.category}>
      <Stack.Screen options={{ title: 'Support' }} />
      {renderBody(article.body, styles)}
    </Screen>
  );
}

type Styles = ReturnType<typeof createStyles>;

/** Minimal markdown-lite: ## headings, - bullets, paragraphs. */
function renderBody(body: string, styles: Styles) {
  return body
    .split(/\n{2,}/)
    .map((block, index) => {
      const trimmed = block.trim();
      if (!trimmed) return null;
      if (/^#{1,3}\s/.test(trimmed)) {
        return (
          <Text key={index} accessibilityRole="header" style={styles.heading}>
            {trimmed.replace(/^#{1,3}\s+/, '')}
          </Text>
        );
      }
      if (/^[-*]\s/m.test(trimmed)) {
        return (
          <Text key={index} style={styles.paragraph}>
            {trimmed
              .split('\n')
              .map((line) => line.replace(/^[-*]\s+/, '•  '))
              .join('\n')}
          </Text>
        );
      }
      return (
        <Text key={index} style={styles.paragraph}>
          {trimmed}
        </Text>
      );
    })
    .filter(Boolean);
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    heading: {
      ...t.typography.cardTitle,
      fontSize: 18,
      color: t.colors.text,
      marginTop: t.spacing.lg,
      marginBottom: t.spacing.sm,
    },
    paragraph: {
      ...t.typography.body,
      color: t.colors.text,
      marginBottom: t.spacing.md,
    },
  });
}
