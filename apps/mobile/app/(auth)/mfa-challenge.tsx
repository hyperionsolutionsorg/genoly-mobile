// apps/mobile/app/(auth)/mfa-challenge.tsx
//
// Two-factor challenge after sign-in, mirroring web /mfa-challenge:
// accepts a 6-digit TOTP code OR a XXXXX-XXXXX backup code via
// mfa:verifyMfaForSession. The session window (8h) is server-tracked.
// Mobile has no admin surfaces, so this is parity + account hygiene,
// not an admin gate — but we still honor it for enrolled accounts.

import { View, Text, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, type Href } from 'expo-router';
import { useConvex } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';

import { Alert } from 'react-native';

import { mfaCodeSchema, type MfaCodeForm } from '../../lib/authSchemas';
import { verifyMfaForSession, requestMfaRecovery } from '../../lib/genolyApi';
import { getHasRequestedHealthPermissions } from '../../utils/preferences';
import { useThemedStyles, type Theme } from '../../theme';
import { Button, TextField, Banner, toast } from '../../components/ui';
import { GenolyLogo } from '../../components/GenolyLogo';

const TABS_ROUTE = '/(tabs)' as unknown as Href;
const PERMISSIONS_ROUTE = '/(auth)/permissions' as unknown as Href;
const LOGIN_ROUTE = '/(auth)/login' as unknown as Href;

export default function MfaChallengeScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();
  const { signOut } = useAuthActions();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MfaCodeForm>({
    resolver: zodResolver(mfaCodeSchema),
    defaultValues: { code: '' },
  });

  const onSubmit = async (data: MfaCodeForm) => {
    setFormError(null);
    try {
      const result = await convex.mutation(verifyMfaForSession, { code: data.code.trim() });
      if (!result.verified) {
        setFormError('That code did not work. Try again.');
        return;
      }
      if (result.usedBackup) {
        toast.info(
          `Backup code used — ${result.backupCodesRemaining ?? 0} remaining. You can regenerate them in Settings on the web.`,
        );
      }
      const hasRequested = await getHasRequestedHealthPermissions().catch(() => true);
      router.replace(hasRequested ? TABS_ROUTE : PERMISSIONS_ROUTE);
    } catch {
      setFormError('That code did not work. Double-check it and try again.');
    }
  };

  const onLostAuthenticator = () => {
    // Web's MFA Option 2: a 72-hour cool-down before MFA auto-disables,
    // with an email notice + cancel link — gives a phone-loss escape
    // hatch without letting an attacker instantly strip 2FA.
    Alert.alert(
      'Lost your authenticator?',
      "We'll start a 72-hour security wait. After it passes, two-factor turns off so you can sign in again. We'll email you a cancel link in case this wasn't you.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start 72-hour wait',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await convex.mutation(requestMfaRecovery, {});
              if (result.requested) {
                toast.info(
                  `Recovery started — two-factor disables in ${result.hoursUntilDisable ?? 72} hours unless cancelled from the email we just sent.`,
                );
              }
            } catch {
              toast.error('Could not start recovery. Please try again or contact support@genoly.org.');
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const onUseDifferentAccount = async () => {
    try {
      await signOut();
    } finally {
      router.replace(LOGIN_ROUTE);
    }
  };

  return (
    <View style={styles.container}>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <GenolyLogo size={30} withWordmark />
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        Two-factor check
      </Text>
      <Text style={styles.subtitle}>
        Enter the 6-digit code from your authenticator app, or one of your backup codes.
      </Text>

      {formError ? <Banner variant="error" message={formError} /> : null}

      <Controller
        control={control}
        name="code"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Code"
            placeholder="123456 or XXXXX-XXXXX"
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType="default"
            editable={!isSubmitting}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={errors.code?.message}
          />
        )}
      />
      <Button
        label="Verify"
        onPress={handleSubmit(onSubmit)}
        loading={isSubmitting}
        style={styles.submit}
      />
      <Button
        variant="link"
        label="Lost your authenticator?"
        onPress={onLostAuthenticator}
        style={styles.backLink}
      />
      <Button
        variant="link"
        label="Sign in with a different account"
        onPress={onUseDifferentAccount}
        style={styles.backLink}
      />
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
    submit: {
      marginTop: t.spacing.md,
    },
    backLink: {
      marginTop: t.spacing.md,
      alignSelf: 'center',
    },
  });
}
