// apps/mobile/app/(auth)/signup.tsx
//
// Mirrors web /signup: name + email + password + REQUIRED legal-acceptance
// checkbox. The server enforces acceptedLegal === true in
// createOrUpdateUser (web convex/auth.ts) and records the append-only
// userAgreements row — the checkbox here is UX, the gate is server-side.
// Reserved-TLD emails are blocked client-side as a hint; the server's
// RFC-6761 block on send paths is the real wall.

import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { useAuthActions } from '@convex-dev/auth/react';
import { ScrollView } from 'react-native';

import { apiClient } from '../../utils/api';
import { signupSchema, mapMemberAuthError, type SignupForm } from '../../lib/authSchemas';
import { useTheme, useThemedStyles, type Theme } from '../../theme';
import { Button, TextField, Banner, toast } from '../../components/ui';

const PERMISSIONS_ROUTE = '/(auth)/permissions' as unknown as Href;
const LOGIN_ROUTE = '/(auth)/login' as unknown as Href;

export default function SignupScreen() {
  const router = useRouter();
  const t = useTheme();
  const styles = useThemedStyles(createStyles);
  const { signIn } = useAuthActions();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptedLegal: undefined as unknown as true,
    },
  });

  const onSubmit = async (data: SignupForm) => {
    setFormError(null);
    try {
      await signIn('password', {
        flow: 'signUp',
        email: data.email,
        password: data.password,
        name: data.name,
        acceptedLegal: 'true',
      });
    } catch (e: unknown) {
      setFormError(mapMemberAuthError(e, 'signUp'));
      return;
    }

    // Fitness bearer token (best-effort — health sync re-auths later).
    try {
      await apiClient.issueToken({
        email: data.email,
        password: data.password,
        device: {
          platform: Platform.OS as import('@genoly/types').Platform,
          appVersion: Constants.expoConfig?.version,
        },
      });
    } catch {
      // Non-fatal.
    }

    toast.success('Welcome to Genoly! Check your inbox to verify your email.');
    // New device + new account → permissions explainer is always next.
    router.replace(PERMISSIONS_ROUTE);
  };

  const openLegal = (path: 'terms' | 'privacy') => {
    Linking.openURL(`https://genoly.org/${path}`).catch(() => {});
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.bg }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="header" style={styles.title}>
        Create your account
      </Text>
      <Text style={styles.subtitle}>Your family's story starts here</Text>

      {formError ? <Banner variant="error" message={formError} /> : null}

      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Name"
            placeholder="Your full name"
            autoComplete="name"
            editable={!isSubmitting}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={errors.name?.message}
          />
        )}
      />
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
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete="new-password"
            editable={!isSubmitting}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={errors.password?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Confirm password"
            placeholder="Same password again"
            secureTextEntry
            autoComplete="new-password"
            editable={!isSubmitting}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={errors.confirmPassword?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="acceptedLegal"
        render={({ field: { onChange, value } }) => (
          <View style={styles.legalBlock}>
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityState={{ checked: value === true }}
              accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
              activeOpacity={0.7}
              onPress={() => onChange(value === true ? (undefined as unknown as true) : true)}
              style={styles.legalRow}
            >
              <View style={[styles.checkbox, value === true && styles.checkboxChecked]}>
                {value === true ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
              <Text style={styles.legalText}>
                I agree to the{' '}
                <Text style={styles.legalLink} onPress={() => openLegal('terms')}>
                  Terms of Service
                </Text>{' '}
                and{' '}
                <Text style={styles.legalLink} onPress={() => openLegal('privacy')}>
                  Privacy Policy
                </Text>
                .
              </Text>
            </TouchableOpacity>
            {errors.acceptedLegal ? (
              <Text style={styles.legalError}>{errors.acceptedLegal.message}</Text>
            ) : null}
          </View>
        )}
      />

      <Button
        label="Create account"
        onPress={handleSubmit(onSubmit)}
        loading={isSubmitting}
        accessibilityLabel="Create account"
      />
      <View style={styles.loginRow}>
        <Text style={styles.loginHint}>Already have an account?</Text>
        <Button variant="link" label="Sign in" onPress={() => router.replace(LOGIN_ROUTE)} />
      </View>

      <Text style={styles.disclosure}>
        Genoly is a product of Hyperion Solutions LLC, an Illinois limited liability company.
      </Text>
    </ScrollView>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      padding: t.spacing.xl,
      justifyContent: 'center',
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
    legalBlock: {
      marginTop: t.spacing.sm,
      marginBottom: t.spacing.lg,
    },
    legalRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      minHeight: 44,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: t.colors.border,
      backgroundColor: t.colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: t.spacing.md,
      marginTop: 2,
    },
    checkboxChecked: {
      backgroundColor: t.colors.primary,
      borderColor: t.colors.primary,
    },
    checkboxMark: {
      color: t.colors.onPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    legalText: {
      ...t.typography.body,
      color: t.colors.text,
      flex: 1,
    },
    legalLink: {
      color: t.colors.link,
      textDecorationLine: 'underline',
    },
    legalError: {
      ...t.typography.helper,
      color: t.colors.danger,
      marginTop: t.spacing.xs,
      marginLeft: 22 + t.spacing.md,
    },
    loginRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: t.spacing.lg,
    },
    loginHint: {
      ...t.typography.body,
      color: t.colors.textMuted,
      marginRight: t.spacing.xs,
    },
    disclosure: {
      ...t.typography.legal,
      color: t.colors.text,
      textAlign: 'center',
      marginTop: t.spacing.xl,
    },
  });
}
