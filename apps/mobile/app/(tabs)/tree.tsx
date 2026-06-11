import { Screen, EmptyState } from '../../components/ui';

/**
 * Tree — family-tree exploration hub. Placeholder until wave D lands the
 * tree picker, members list, person profiles, pedigree chart, and chat.
 */
export default function TreeScreen() {
  return (
    <Screen title="Tree">
      <EmptyState
        icon="🧭"
        title="Explore your family tree"
        body="Browse relatives, open person profiles, and wander the pedigree chart — coming to mobile in this release. Your trees are waiting at genoly.org meanwhile."
      />
    </Screen>
  );
}
