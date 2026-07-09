/**
 * Tree — the tree-surfaces shell (mobile port of the web unified explorer,
 * genoly-family-web src/pages/FamilyExplorer.tsx).
 *
 * Layout:
 *   - header: tree picker chips (multi-tree members) + Add-person CTA —
 *     present in every mode
 *   - TreeViewPicker: Explore (DEFAULT) | Register | Pedigree | Fan
 *   - mode body:
 *       explore  → <ExploreCanvas/>  perspective canvas (svg + pan/pinch)
 *       register → <RegisterTable/>  the person directory as a table —
 *                  absorbs the old hub's directory + debounced search
 *       pedigree → <PedigreeClassic/> ancestor chart (svg + pan/pinch),
 *                  rooted at the shared anchor (Task B)
 *       fan      → <FanView/> radial ancestor wheel (svg + pan/pinch),
 *                  same shared anchor + query as Pedigree, its own
 *                  generation-depth state (default 4, hard-capped at 5 —
 *                  Task C; see FanView's header for the legibility analysis)
 *
 * Data: ONE explorerGraph subscription owned here and passed down (web
 * parity — mode switches never re-fetch), plus the existing
 * listAllPersonsByTree read for Register rows, plus TWO
 * pedigree:getAncestorTree subscriptions (Pedigree's and Fan's — same
 * pinned query, different `maxGenerations`, so they can't share one
 * subscription instance) each skipped unless its own mode is active —
 * Explore/Register never pay for either.
 *
 * Anchor state lives here: defaults to the viewer's resolved person
 * (explorerGraph.viewerPersonId), else the first person alphabetically.
 * No URL-sync machinery — mobile has no URL bar (plan §1).
 *
 * Gating: inherits the app-level Pro gate (AuthGate in app/_layout.tsx).
 * No per-surface gate, no upgrade UI — by design (plan §4).
 */

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useConvex, useQuery } from 'convex/react';

import {
  explorerGraph,
  listAllPersonsByTree,
  pedigreeGetAncestorTree,
  searchPersonsAutocomplete,
  type PersonSearchResult,
} from '../../lib/genolyApi';
import type { SortKey } from '../../lib/tree/listHelpers';
import { DEFAULT_REGISTER_UI } from '../../lib/tree/registerUi';
import { useActiveTree } from '../../hooks/useActiveTree';
import { setLastVisitedTreeSlug } from '../../utils/preferences';
import { useThemedStyles, type Theme } from '../../theme';
import { Screen, EmptyState, Button, Skeleton } from '../../components/ui';
import { TreeViewPicker, type TreeViewMode } from '../../components/tree/TreeViewPicker';
import { ExploreCanvas, DEFAULT_EXPLORE_RADIUS } from '../../components/tree/ExploreCanvas';
import { RegisterTable } from '../../components/tree/RegisterTable';
import {
  PedigreeClassic,
  DEFAULT_PEDIGREE_GENERATIONS,
} from '../../components/tree/PedigreeClassic';
import { FanView, DEFAULT_FAN_GENERATIONS } from '../../components/tree/FanView';

const ADD_PERSON_ROUTE = '/add-person' as unknown as Href;
const WELCOME_ROUTE = '/welcome' as unknown as Href;

export default function TreeScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();
  const { trees, activeTree, isLoading } = useActiveTree();
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);

  // ── Shell-owned surface state ───────────────────────────────────────
  const [mode, setMode] = useState<TreeViewMode>('explore'); // Explore is the default
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [radius, setRadius] = useState(DEFAULT_EXPLORE_RADIUS);
  const [pedigreeGenerations, setPedigreeGenerations] = useState(DEFAULT_PEDIGREE_GENERATIONS);
  const [fanGenerations, setFanGenerations] = useState(DEFAULT_FAN_GENERATIONS);
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_REGISTER_UI.sortKey);
  const [search, setSearch] = useState(DEFAULT_REGISTER_UI.searchQuery);
  const [results, setResults] = useState<PersonSearchResult[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tree = useMemo(() => {
    if (selectedTreeId && trees) {
      return trees.find((candidate) => candidate._id === selectedTreeId) ?? activeTree;
    }
    return activeTree;
  }, [selectedTreeId, trees, activeTree]);

  // ── Data: one graph subscription + the register's person rows ────────
  const persons = useQuery(listAllPersonsByTree, tree ? { treeId: tree._id } : ('skip' as const));
  const graph = useQuery(
    explorerGraph,
    tree ? { treeId: tree._id, anchorId: anchorId ?? undefined, radius } : ('skip' as const),
  );
  // Only subscribed while Pedigree is the active mode — Explore/Register
  // never pay for this query (web parity: mode switches don't re-fetch
  // data the inactive mode doesn't need).
  const ancestorTree = useQuery(
    pedigreeGetAncestorTree,
    mode === 'pedigree' && anchorId
      ? { personId: anchorId, maxGenerations: pedigreeGenerations }
      : ('skip' as const),
  );
  // Fan's own subscription (same query, different depth) — only while Fan
  // is the active mode; Explore/Register/Pedigree never pay for it.
  const fanAncestorTree = useQuery(
    pedigreeGetAncestorTree,
    mode === 'fan' && anchorId
      ? { personId: anchorId, maxGenerations: fanGenerations }
      : ('skip' as const),
  );

  // Reset per-tree state when the member switches trees.
  const treeId = tree?._id ?? null;
  useEffect(() => {
    setAnchorId(null);
    setSearch('');
    setResults(null);
  }, [treeId]);

  // Default anchor: the viewer's resolved person, else the first person A→Z.
  useEffect(() => {
    if (anchorId !== null || !graph) return;
    if (graph.viewerPersonId) {
      setAnchorId(graph.viewerPersonId);
      return;
    }
    if (persons && persons.length > 0) {
      const first = [...persons].sort((a, b) =>
        a.preferredName.localeCompare(b.preferredName),
      )[0];
      setAnchorId(first._id);
    }
  }, [anchorId, graph, persons]);

  // Debounced one-shot search (no per-keystroke subscriptions — kept from
  // the old hub; the field now lives in Register).
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

  const onPickTree = (nextTreeId: string) => {
    setSelectedTreeId(nextTreeId);
    const picked = trees?.find((candidate) => candidate._id === nextTreeId);
    if (picked?.slug) {
      setLastVisitedTreeSlug(picked.slug).catch(() => {});
    }
  };

  const openPerson = (personId: string) => {
    router.push(`/person/${personId}` as unknown as Href);
  };

  const explorePerson = (personId: string) => {
    setAnchorId(personId);
    setMode('explore');
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

  return (
    <Screen title="Tree" subtitle={tree.name} noScroll>
      {/* Shell header: tree picker + Add person — present in every mode. */}
      <View style={styles.headerRow}>
        <View style={styles.pickerRow}>
          {trees && trees.length > 1
            ? trees.map((candidate) => {
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
              })
            : null}
        </View>
        <Button
          variant="link"
          label="+ Add person"
          onPress={() => router.push(ADD_PERSON_ROUTE)}
          accessibilityLabel="Add a person to the tree"
        />
      </View>

      <TreeViewPicker mode={mode} onChange={setMode} />

      {mode === 'explore' ? (
        <ExploreCanvas
          graph={graph}
          anchorId={anchorId}
          radius={radius}
          onRadiusChange={setRadius}
          onReAnchor={setAnchorId}
          onOpenPerson={openPerson}
        />
      ) : mode === 'pedigree' ? (
        <PedigreeClassic
          ancestorTree={ancestorTree}
          personId={anchorId}
          viewerPersonId={graph?.viewerPersonId}
          generations={pedigreeGenerations}
          onGenerationsChange={setPedigreeGenerations}
          onReAnchor={setAnchorId}
          onOpenPerson={openPerson}
        />
      ) : mode === 'fan' ? (
        <FanView
          ancestorTree={fanAncestorTree}
          personId={anchorId}
          viewerPersonId={graph?.viewerPersonId}
          generations={fanGenerations}
          onGenerationsChange={setFanGenerations}
          onReAnchor={setAnchorId}
          onOpenPerson={openPerson}
        />
      ) : (
        <RegisterTable
          persons={persons}
          graph={graph}
          search={search}
          onSearchChange={setSearch}
          searchResults={results}
          sortKey={sortKey}
          onSortChange={setSortKey}
          onOpenPerson={openPerson}
          onExplorePerson={explorePerson}
          onAddPerson={() => router.push(ADD_PERSON_ROUTE)}
        />
      )}
    </Screen>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: t.spacing.sm,
    },
    pickerRow: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
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
  });
}
