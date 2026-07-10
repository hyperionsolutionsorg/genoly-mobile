/**
 * Tree — the tree-surfaces shell (mobile port of the web unified explorer,
 * genoly-family-web src/pages/FamilyExplorer.tsx).
 *
 * Layout:
 *   - header: tree picker chips (multi-tree members) + Add-person CTA —
 *     present in every mode
 *   - TreeViewPicker: Explore (DEFAULT) | Register | Fan
 *     (Pedigree Classic removed 2026-07-09 — duplicate of Explore at phone
 *     sizes, operator direction; recoverable from git history / PR #31)
 *   - mode body:
 *       explore  → <ExploreCanvas/>  perspective canvas (svg + pan/pinch)
 *       register → <RegisterTable/>  the person directory as a table —
 *                  absorbs the old hub's directory + debounced search
 *       fan      → <FanView/> radial ancestor wheel (svg + pan/pinch),
 *                  rooted at the shared anchor, its own generation-depth
 *                  state (default 3, hard-capped at 3 — operator saw label
 *                  overlap at 4+ on a real tree; see FanView's header)
 *
 * Data: ONE explorerGraph subscription owned here and passed down (web
 * parity — mode switches never re-fetch), plus the existing
 * listAllPersonsByTree read for Register rows, plus Fan's
 * pedigree:getAncestorTree subscription, skipped unless Fan is active —
 * Explore/Register never pay for either.
 *
 * Anchor state lives here: defaults to the viewer's resolved person
 * (explorerGraph.viewerPersonId), else the first person alphabetically.
 * No URL-sync machinery — mobile has no URL bar (plan §1).
 *
 * Gating: inherits the app-level Pro gate (AuthGate in app/_layout.tsx).
 * No per-surface gate, no upgrade UI — by design (plan §4).
 */

import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useConvex, useQuery } from 'convex/react';
import * as ScreenOrientation from 'expo-screen-orientation';
import Svg, { Path } from 'react-native-svg';

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
import { useTheme, useThemedStyles, type Theme } from '../../theme';
import { Screen, EmptyState, Button, Skeleton } from '../../components/ui';
import { TreeViewPicker, type TreeViewMode } from '../../components/tree/TreeViewPicker';
import { ExploreCanvas, DEFAULT_EXPLORE_RADIUS } from '../../components/tree/ExploreCanvas';
import { RegisterTable } from '../../components/tree/RegisterTable';
import { FanView, DEFAULT_FAN_GENERATIONS } from '../../components/tree/FanView';

const ADD_PERSON_ROUTE = '/add-person' as unknown as Href;
const WELCOME_ROUTE = '/welcome' as unknown as Href;

export default function TreeScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const convex = useConvex();
  const { trees, activeTree, isLoading } = useActiveTree();
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);

  // ── Shell-owned surface state ───────────────────────────────────────
  const [mode, setMode] = useState<TreeViewMode>('explore'); // Explore is the default
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [radius, setRadius] = useState(DEFAULT_EXPLORE_RADIUS);
  const [fanGenerations, setFanGenerations] = useState(DEFAULT_FAN_GENERATIONS);
  // Fullscreen landscape Explore. The expand button opens a Modal (above the
  // tab bar + brand bar) that gives the canvas the WHOLE screen in landscape;
  // in-place rotation kept all the chrome and wasted the space. A programmatic
  // orientation lock overrides the device's auto-rotate setting, so this works
  // even for users who keep rotation-lock ON. Always relock portrait on exit.
  const [fullscreen, setFullscreen] = useState(false);
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
  // Fan's ancestor subscription — only while Fan is the active mode;
  // Explore/Register never pay for it (web parity: mode switches don't
  // re-fetch data the inactive mode doesn't need).
  const fanAncestorTree = useQuery(
    pedigreeGetAncestorTree,
    mode === 'fan' && anchorId
      ? { personId: anchorId, maxGenerations: fanGenerations }
      : ('skip' as const),
  );

  // Lock landscape while the fullscreen Explore modal is open; portrait
  // otherwise. Programmatic lock → works regardless of device auto-rotate.
  // Always relock portrait on unmount (leaving the Tree tab).
  useEffect(() => {
    ScreenOrientation.lockAsync(
      fullscreen
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [fullscreen]);

  // Safety: if the member leaves Explore (mode switch) while somehow still
  // flagged fullscreen, close it.
  useEffect(() => {
    if (mode !== 'explore' && fullscreen) setFullscreen(false);
  }, [mode, fullscreen]);

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
        <View style={styles.canvasWrap}>
          <ExploreCanvas
            graph={graph}
            anchorId={anchorId}
            radius={radius}
            onRadiusChange={setRadius}
            onReAnchor={setAnchorId}
            onOpenPerson={openPerson}
          />
          <TouchableOpacity
            style={styles.rotateBtn}
            onPress={() => setFullscreen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open fullscreen landscape view"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ExpandIcon color={t.colors.text} />
          </TouchableOpacity>
        </View>
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

      {/* Fullscreen landscape Explore — a Modal so it covers the tab bar +
          brand bar and the canvas gets the whole screen. Shares the same
          anchor/radius/graph state, so re-anchoring here persists back to
          the inline view. Pan/pinch/zoom via the canvas's ZoomPanView. */}
      <Modal
        visible={fullscreen}
        animationType="fade"
        // 'portrait' included so the dismissal transition (which happens
        // while the orientation lock flips back to portrait) stays inside
        // the modal's supported mask — iOS raises "Modal was presented with
        // 0x18 orientations mask" and crashes in prod otherwise. The app's
        // Info.plist must also allow landscape (app.json orientation
        // "default" — requires prebuild, not just a JS reload).
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
        onRequestClose={() => setFullscreen(false)}
      >
        <SafeAreaView style={styles.fsRoot} edges={['top', 'bottom', 'left', 'right']}>
          <ExploreCanvas
            graph={graph}
            anchorId={anchorId}
            radius={radius}
            onRadiusChange={setRadius}
            onReAnchor={setAnchorId}
            onOpenPerson={openPerson}
          />
          <TouchableOpacity
            style={styles.fsCloseBtn}
            onPress={() => setFullscreen(false)}
            accessibilityRole="button"
            accessibilityLabel="Exit fullscreen"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <CloseIcon color={t.colors.text} />
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

/**
 * A phone glyph with a curved rotate arrow — the affordance the operator
 * asked for ("a symbol to tell users they can click and it rotates").
 * When already landscape, the phone is drawn on its side so the icon also
 * signals the current state / that tapping returns to portrait.
 */
function ExpandIcon({ color }: { color: string }) {
  // Diagonal expand-arrows with a landscape phone hint — signals "tap to
  // open the big landscape view".
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CloseIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    canvasWrap: {
      flex: 1,
      position: 'relative',
    },
    rotateBtn: {
      position: 'absolute',
      top: t.spacing.sm,
      right: t.spacing.sm,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.bgElevated,
      borderWidth: 1,
      borderColor: t.colors.border,
      // Float above the svg canvas.
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 3,
    },
    fsRoot: {
      flex: 1,
      backgroundColor: t.colors.bg,
    },
    fsCloseBtn: {
      position: 'absolute',
      top: t.spacing.sm,
      right: t.spacing.sm,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.bgElevated,
      borderWidth: 1,
      borderColor: t.colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 3,
    },
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
