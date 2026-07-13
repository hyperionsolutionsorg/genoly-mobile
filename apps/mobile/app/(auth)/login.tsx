// apps/mobile/app/(auth)/login.tsx
//
// C2 rework: signing in acquires BOTH sessions —
//   1. the MEMBER session via Convex Auth (primary; gates the app), and
//   2. the FITNESS bearer token via the HTTP contract (secondary; powers
//      health sync — best-effort, the app works without it).
// After sign-in: MFA challenge if the account has TOTP enabled and the
// session isn't verified yet; else the first-run permissions arm; else tabs.

import { View, Text, StyleSheet, Platform } from 'react-native';
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvex } from 'convex/react';

import { apiClient } from '../../utils/api';
import { getHasRequestedHealthPermissions } from '../../utils/preferences';
import { loginSchema, mapMemberAuthError, type LoginForm } from '../../lib/authSchemas';
import { isCurrentSessionMfaVerified, recordLoginAttempt } from '../../lib/genolyApi';
import { useThemedStyles, type Theme } from '../../theme';
import { Button, TextField, Banner, toast } from '../../components/ui';
import { GenolyLogo } from '../../components/GenolyLogo';

const TABS_ROUTE = '/(tabs)' as unknown as Href;
const PERMISSIONS_ROUTE = '/(auth)/permissions' as unknown as Href;
const MFA_ROUTE = '/(auth)/mfa-challenge' as unknown as Href;
const SIGNUP_ROUTE = '/(auth)/signup' as unknown as Href;
const FORGOT_ROUTE = '/(auth)/forgot-password' as unknown as Href;

export default function LoginScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { signIn } = useAuthActions();
  const convex = useConvex();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginForm) => {
    setFormError(null);

    // 1. Member session (primary).
    try {
      await signIn('password', {
        flow: 'signIn',
        email: data.email,
        password: data.password,
      });
    } catch (e: unknown) {
      convex.mutation(recordLoginAttempt, { email: data.email, success: false }).catch(() => {});
      setFormError(mapMemberAuthError(e, 'signIn'));
      return;
    }
    convex.mutation(recordLoginAttempt, { email: data.email, success: true }).catch(() => {});

    // 2. Fitness bearer token (secondary, best-effort) — same credentials.
    try {
      await apiClient.issueToken({
        email: data.email,
        password: data.password,
        device: {
          platform: Platform.OS as import('@genoly/types').Platform,
          appVersion: Constants.expoConfig?.version,
        },
      });
    } catch (e) {
      // Member session is what matters, but a failed mint means the
      // fitness bearer token is EMPTY until the next full sign-in —
      // health uploads will 401 until then (recovery path is a known
      // follow-up, mobile-sync-architecture.md §3). Don't hide it.
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[login] fitness issueToken failed — health sync will be unauthenticated:', msg);
      }
      toast.info('Signed in, but health sync couldn’t connect. Sign out and back in to retry.');
    }

    // 3. MFA challenge if enrolled and this session isn't verified.
    try {
      const mfa = await convex.query(isCurrentSessionMfaVerified, {});
      if (mfa.mfaEnabled && !mfa.verified) {
        router.replace(MFA_ROUTE);
        return;
      }
    } catch {
      // Status check failed (offline blip) — proceed; admin surfaces
      // don't exist on mobile, so the challenge is parity, not a gate.
    }

    // 4. First-run permissions arm, then tabs.
    const hasRequested = await getHasRequestedHealthPermissions().catch(() => true);
    router.replace(hasRequested ? TABS_ROUTE : PERMISSIONS_ROUTE);
  };

  return (
    <View style={styles.container}>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <GenolyLogo size={30} withWordmark />
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        Welcome back
      </Text>
      <Text style={styles.subtitle}>Sign in to your Genoly family</Text>

      {formError ? <Banner variant="error" message={formError} /> : null}

      <View style={styles.fieldContainer}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Email"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={!isSubmitting}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              error={errors.email?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Password"
              placeholder="Your password"
              secureTextEntry
              autoComplete="password"
              editable={!isSubmitting}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              error={errors.password?.message}
            />
          )}
        />
      </View>
      <Button
        label="Sign in"
        onPress={handleSubmit(onSubmit)}
        loading={isSubmitting}
        accessibilityLabel="Sign in"
      />
      <Button
        variant="link"
        label="Forgot password?"
        onPress={() => router.push(FORGOT_ROUTE)}
        style={styles.linkButton}
      />
      <View style={styles.signupRow}>
        <Text style={styles.signupHint}>New to Genoly?</Text>
        <Button
          variant="link"
          label="Create an account"
          onPress={() => router.push(SIGNUP_ROUTE)}
        />
      </View>
    </View>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      padding: t.spacing.xl,
      justifyContent: 'center',
      backgroundColor: t.colors.bg,
    },
    title: {
      ...t.typography.screenTitle,
      color: t.colors.text,
      textAlign: 'center',
    },
    subtitle: {
      ...t.typography.subtitle,
      color: t.colors.textMuted,
      textAlign: 'center',
      marginTop: t.spacing.xs,
      marginBottom: t.spacing.xl,
    },
    fieldContainer: {
      marginBottom: t.spacing.lg,
    },
    linkButton: {
      marginTop: t.spacing.md,
      alignSelf: 'center',
    },
    signupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: t.spacing.lg,
    },
    signupHint: {
      ...t.typography.body,
      color: t.colors.textMuted,
      marginRight: t.spacing.xs,
    },
  });
}
