/**
 * useActiveTree — resolves the member's "current" tree for tree-scoped
 * dashboard widgets: the most-recently-visited tree (AsyncStorage mirror
 * of the web's lastVisitedTree pattern), else the first tree.
 */

import { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';

import { listMyTrees, type MyTree } from '../lib/genolyApi';
import { getLastVisitedTreeSlug } from '../utils/preferences';

export interface UseActiveTreeResult {
  trees: MyTree[] | undefined;
  activeTree: MyTree | null;
  isLoading: boolean;
}

export function useActiveTree(): UseActiveTreeResult {
  const trees = useQuery(listMyTrees, {});
  const [lastSlug, setLastSlug] = useState<string | null>(null);
  const [slugLoaded, setSlugLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLastVisitedTreeSlug()
      .then((slug) => {
        if (!cancelled) setLastSlug(slug);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSlugLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = trees === undefined || !slugLoaded;
  let activeTree: MyTree | null = null;
  if (trees && trees.length > 0) {
    activeTree = (lastSlug && trees.find((tree) => tree.slug === lastSlug)) || trees[0];
  }

  return { trees, activeTree, isLoading };
}
