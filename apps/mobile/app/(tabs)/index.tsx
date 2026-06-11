import { Linking } from 'react-native';
import { useConvex } from 'convex/react';

import { Screen, EmptyState, Banner, Skeleton, toast } from '../../components/ui';
import { useMe } from '../../hooks/useMe';
import { sendVerificationEmailToMe } from '../../lib/genolyApi';

/**
 * Home — the member dashboard. Real widgets (streaks, achievements,
 * today's pick, rewards summary, top-3 leaderboard, anniversaries) land
 * in wave C4; the C2 cut establishes identity-aware framing: greeting,
 * demo banner, admin-on-mobile banner, email-verification nudge.
 */
export default function HomeScreen() {
  const convex = useConvex();
  const { me, isLoading, isDemo, isAdminOnMobile, emailUnverified } = useMe();

  const firstName = me?.fullName?.trim().split(/\s+/)[0];

  const onResendVerification = async () => {
    try {
      const result = await convex.mutation(sendVerificationEmailToMe, {});
      if (result.sent) {
        toast.success('Verification email sent — check your inbox.');
      } else {
        toast.info('A verification email was sent recently. Give it a minute.');
      }
    } catch {
      toast.error('Could not send the verification email. Try again soon.');
    }
  };

  return (
    <Screen
      title={firstName ? `Welcome, ${firstName}` : 'Home'}
      subtitle={me ? 'Your family, every day' : undefined}
    >
      {isLoading ? (
        <>
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={140} />
        </>
      ) : (
        <>
          {isDemo ? (
            <Banner
              variant="info"
              message="You're exploring the Genoly demo. Everything here resets automatically — play freely!"
            />
          ) : null}
          {isAdminOnMobile ? (
            <Banner
              variant="info"
              message="Admin tools live on the web. Open genoly.org to access them — everything member-side works right here."
              actionLabel="Open genoly.org"
              onAction={() => {
                Linking.openURL('https://genoly.org').catch(() => {});
              }}
            />
          ) : null}
          {emailUnverified && !isDemo ? (
            <Banner
              variant="warning"
              message="Please verify your email — tap the link we sent you. Some features stay limited until then."
              actionLabel="Resend email"
              onAction={onResendVerification}
            />
          ) : null}
          <EmptyState
            icon="🌳"
            title="Your family, every day"
            body="Streaks, anniversaries, today's game pick, and your tree's leaderboard are on their way to this screen. Until then, everything lives at genoly.org."
          />
        </>
      )}
    </Screen>
  );
}
