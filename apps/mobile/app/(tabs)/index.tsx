import { Screen, EmptyState } from '../../components/ui';

/**
 * Home — the member dashboard. Placeholder until wave C4 lands the real
 * widgets (streaks, achievements, today's pick, rewards summary, top-3
 * leaderboard, anniversaries).
 */
export default function HomeScreen() {
  return (
    <Screen title="Home">
      <EmptyState
        icon="🌳"
        title="Your family, every day"
        body="Streaks, anniversaries, today's game pick, and your tree's leaderboard are on their way to this screen. Until then, everything lives at genoly.org."
      />
    </Screen>
  );
}
