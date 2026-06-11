// apps/mobile/app/welcome.tsx
//
// 5-step welcome wizard — mobile mirror of web /welcome (PR #81 design):
//   1. Welcome        — warm intro
//   2. Name your tree — skipped for members who already belong to a tree
//   3. Add yourself   — COMMIT: onboarding:completeOnboardingFirstTree
//                       (atomic tree + membership + root person + birth year)
//   4. Add a parent   — optional; persons:createPerson + families:addChildToPerson
//   5. Pick a style   — pedigree chart theme (local pref, like web localStorage)
// Finish + every Skip path call onboarding:completeOnboarding (idempotent
// stamp of users.onboardingCompletedAt).

import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useMemo, useState } from 'react';
import { useRouter, Stack, type Href } from 'expo-router';
import { useConvex, useQuery } from 'convex/react';

import {
  completeOnboarding,
  completeOnboardingFirstTree,
  createPerson,
  addChildToPerson,
  listMyTrees,
} from '../lib/genolyApi';
import { setPedigreeTheme, type PedigreeTheme } from '../utils/preferences';
import { useTheme, useThemedStyles, type Theme } from '../theme';
import { Button, TextField, Banner } from '../components/ui';

const TABS_ROUTE = '/(tabs)' as unknown as Href;

type Step = 'welcome' | 'tree' | 'self' | 'parent' | 'style';

const PEDIGREE_STYLES: { value: PedigreeTheme; label: string; blurb: string }[] = [
  { value: 'classic', label: 'Classic', blurb: 'Clean boxes and clear lines' },
  { value: 'heritage', label: 'Heritage', blurb: 'Warm, heirloom feel' },
  { value: 'bubble', label: 'Bubble', blurb: 'Friendly rounded portraits' },
  { value: 'matrix', label: 'Matrix', blurb: 'A constellation of your family' },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const t = useTheme();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();
  const myTrees = useQuery(listMyTrees, {});

  const [step, setStep] = useState<Step>('welcome');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [treeName, setTreeName] = useState('');
  const [rootName, setRootName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [created, setCreated] = useState<{ treeId: string; treeSlug: string; personId: string } | null>(
    null,
  );
  const [parentName, setParentName] = useState('');
  const [addedParents, setAddedParents] = useState<string[]>([]);
  const [styleChoice, setStyleChoice] = useState<PedigreeTheme>('classic');

  // Invited members already belong to a tree — the create-a-tree steps
  // would be confusing, so they go welcome → style → finish.
  const hasTrees = (myTrees?.length ?? 0) > 0;

  const stepOrder = useMemo<Step[]>(
    () => (hasTrees ? ['welcome', 'style'] : ['welcome', 'tree', 'self', 'parent', 'style']),
    [hasTrees],
  );
  const stepIndex = stepOrder.indexOf(step);

  const finishOnboarding = async (navigate = true) => {
    try {
      await convex.mutation(completeOnboarding, {});
    } catch {
      // Idempotent stamp — if it fails offline, the next app start
      // will land back here; don't block the user now.
    }
    if (navigate) router.replace(TABS_ROUTE);
  };

  const onSkipAll = async () => {
    setBusy(true);
    await finishOnboarding();
  };

  const onCommitSelf = async () => {
    if (!treeName.trim() || !rootName.trim()) {
      setError('Please fill in your tree name and your name.');
      return;
    }
    const yearNum = birthYear.trim() === '' ? undefined : Number(birthYear.trim());
    if (yearNum !== undefined && (!Number.isInteger(yearNum) || yearNum < 1850 || yearNum > new Date().getFullYear())) {
      setError('That birth year doesn’t look right.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await convex.mutation(completeOnboardingFirstTree, {
        treeName: treeName.trim(),
        rootPersonName: rootName.trim(),
        rootBirthYear: yearNum,
      });
      setCreated(res);
      setStep('parent');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onAddParent = async (kind: 'father' | 'mother') => {
    if (!created || !parentName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const parent = await convex.mutation(createPerson, {
        treeId: created.treeId,
        preferredName: parentName.trim(),
        gender: kind === 'father' ? 'male' : 'female',
        isLiving: true,
      });
      await convex.mutation(addChildToPerson, {
        treeId: created.treeId,
        parentPersonId: parent.personId,
        childPersonId: created.personId,
        relationshipType: 'biological',
      });
      setAddedParents((prev) => [...prev, parentName.trim()]);
      setParentName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add them right now.');
    } finally {
      setBusy(false);
    }
  };

  const onFinish = async () => {
    setBusy(true);
    setError(null);
    await setPedigreeTheme(styleChoice).catch(() => {});
    await finishOnboarding();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Welcome', headerShown: false }} />
      <ScrollView
        style={{ backgroundColor: t.colors.bg }}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step dots */}
        <View style={styles.dotsRow}>
          {stepOrder.map((s, i) => (
            <View
              key={s}
              style={[styles.dot, i <= stepIndex ? styles.dotActive : null]}
            />
          ))}
        </View>

        {error ? <Banner variant="error" message={error} /> : null}

        {step === 'welcome' && (
          <View>
            <Text accessibilityElementsHidden style={styles.hero}>
              🌳
            </Text>
            <Text accessibilityRole="header" style={styles.title}>
              Welcome to Genoly
            </Text>
            <Text style={styles.body}>
              This is where your family's story lives — the people, the photos, the
              anniversaries, even the walking challenges with your cousins.
            </Text>
            <Text style={styles.body}>
              {hasTrees
                ? 'Your family tree is already waiting for you. Let’s make it feel like home.'
                : 'Let’s plant your family tree. It takes about a minute.'}
            </Text>
            <Button
              label={hasTrees ? 'Make it mine' : 'Plant my tree'}
              onPress={() => setStep(hasTrees ? 'style' : 'tree')}
              style={styles.cta}
            />
            <Button variant="link" label="Skip for now" onPress={onSkipAll} disabled={busy} style={styles.skip} />
          </View>
        )}

        {step === 'tree' && (
          <View>
            <Text accessibilityRole="header" style={styles.title}>
              Name your tree
            </Text>
            <Text style={styles.body}>
              Most families use their surname — "The Bennett Family" — but it's yours to name.
            </Text>
            <TextField
              label="Tree name"
              placeholder="The Bennett Family"
              value={treeName}
              onChangeText={setTreeName}
              editable={!busy}
            />
            <Button
              label="Continue"
              onPress={() => {
                if (!treeName.trim()) {
                  setError('Give your tree a name to continue.');
                  return;
                }
                setError(null);
                setStep('self');
              }}
              style={styles.cta}
            />
            <Button variant="link" label="Skip for now" onPress={onSkipAll} disabled={busy} style={styles.skip} />
          </View>
        )}

        {step === 'self' && (
          <View>
            <Text accessibilityRole="header" style={styles.title}>
              Add yourself
            </Text>
            <Text style={styles.body}>You're the first leaf on the tree. Everyone else connects to you.</Text>
            <TextField
              label="Your name"
              placeholder="As your family knows you"
              value={rootName}
              onChangeText={setRootName}
              editable={!busy}
            />
            <TextField
              label="Birth year (optional)"
              placeholder="e.g. 1985"
              keyboardType="number-pad"
              value={birthYear}
              onChangeText={setBirthYear}
              editable={!busy}
            />
            <Button label="Create my tree" onPress={onCommitSelf} loading={busy} style={styles.cta} />
            <Button variant="link" label="Skip for now" onPress={onSkipAll} disabled={busy} style={styles.skip} />
          </View>
        )}

        {step === 'parent' && (
          <View>
            <Text accessibilityRole="header" style={styles.title}>
              Add a parent
            </Text>
            <Text style={styles.body}>
              Trees grow upward first. Add a parent now, or do it later from the Tree tab.
            </Text>
            {addedParents.length > 0 ? (
              <Banner variant="success" message={`Added: ${addedParents.join(', ')}`} />
            ) : null}
            <TextField
              label="Parent's name"
              placeholder="Their name"
              value={parentName}
              onChangeText={setParentName}
              editable={!busy}
            />
            <View style={styles.parentButtons}>
              <Button
                variant="secondary"
                label="Add as father"
                onPress={() => onAddParent('father')}
                disabled={busy || !parentName.trim()}
                style={styles.parentButton}
              />
              <Button
                variant="secondary"
                label="Add as mother"
                onPress={() => onAddParent('mother')}
                disabled={busy || !parentName.trim()}
                style={styles.parentButton}
              />
            </View>
            <Button label="Continue" onPress={() => setStep('style')} style={styles.cta} />
          </View>
        )}

        {step === 'style' && (
          <View>
            <Text accessibilityRole="header" style={styles.title}>
              Pick your tree's style
            </Text>
            <Text style={styles.body}>How should your pedigree chart feel? You can change this anytime.</Text>
            {PEDIGREE_STYLES.map((option) => {
              const selected = styleChoice === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${option.label} style`}
                  activeOpacity={0.7}
                  onPress={() => setStyleChoice(option.value)}
                  style={[styles.styleCard, selected && styles.styleCardSelected]}
                >
                  <Text style={[styles.styleLabel, selected && styles.styleLabelSelected]}>
                    {option.label}
                  </Text>
                  <Text style={styles.styleBlurb}>{option.blurb}</Text>
                </TouchableOpacity>
              );
            })}
            <Button label="Finish" onPress={onFinish} loading={busy} style={styles.cta} />
          </View>
        )}
      </ScrollView>
    </>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      padding: t.spacing.xl,
      justifyContent: 'center',
    },
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: t.spacing.xl,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: t.colors.surfaceMuted,
      marginHorizontal: t.spacing.xs,
    },
    dotActive: {
      backgroundColor: t.colors.primary,
    },
    hero: {
      fontSize: 56,
      textAlign: 'center',
      marginBottom: t.spacing.lg,
    },
    title: {
      ...t.typography.screenTitle,
      color: t.colors.text,
      textAlign: 'center',
      marginBottom: t.spacing.md,
    },
    body: {
      ...t.typography.body,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginBottom: t.spacing.lg,
    },
    cta: {
      marginTop: t.spacing.md,
    },
    skip: {
      marginTop: t.spacing.sm,
      alignSelf: 'center',
    },
    parentButtons: {
      flexDirection: 'row',
      marginTop: t.spacing.xs,
    },
    parentButton: {
      flex: 1,
      marginRight: t.spacing.sm,
    },
    styleCard: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      borderWidth: 1.5,
      borderColor: t.colors.border,
      padding: t.spacing.lg,
      marginBottom: t.spacing.sm,
    },
    styleCardSelected: {
      borderColor: t.colors.primary,
    },
    styleLabel: {
      ...t.typography.cardTitle,
      color: t.colors.text,
    },
    styleLabelSelected: {
      color: t.colors.primary,
    },
    styleBlurb: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      marginTop: 2,
    },
  });
}
