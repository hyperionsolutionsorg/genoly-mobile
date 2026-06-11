import { Screen, EmptyState } from '../../components/ui';

/**
 * Challenges — family walking challenges. Placeholder until wave H lands
 * the challenges hub (create, join, live leaderboard, activity history).
 */
export default function ChallengesScreen() {
  return (
    <Screen title="Challenges">
      <EmptyState
        icon="👟"
        title="Walk with your family"
        body="Create step challenges with your cousins, pool steps toward team goals, and trash-talk your way up the leaderboard. Launching in this release."
      />
    </Screen>
  );
}
