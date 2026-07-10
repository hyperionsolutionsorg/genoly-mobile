// apps/mobile/app/(auth)/forgot-password.tsx
//
// Two-step OTP reset, mirroring web ForgotPassword.tsx against the same
// ZeptoMail reset provider:
//   1. signIn("password", { flow: "reset", email })            → sends code
//   2. signIn("password", { flow: "reset-verification",
//        email, code, newPassword })                            → sets + signs in
// Demo accounts are blocked server-side. EMAIL_ALLOWLIST gates dev sends.

import { View, Text, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, type Href } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';

import {
  forgotRequestSchema,
  forgotVerifySchema,
  mapMemberAuthError,
  type ForgotRequestForm,
  type ForgotVerifyForm,
} from '../../lib/authSchemas';
import { useThemedStyles, type Theme } from '../../theme';
import { Button, TextField, Banner, toast } from '../../components/ui';
import { GenolyLogo } from '../../components/GenolyLogo';

const TABS_ROUTE = '/(tabs)' as unknown as Href;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const requestForm = useForm<ForgotRequestForm>({
    resolver: zodResolver(forgotRequestSchema),
    defaultValues: { email: '' },
  });

  const verifyForm = useForm<ForgotVerifyForm>({
    resolver: zodResolver(forgotVerifySchema),
    defaultValues: { code: '', newPassword: '', confirmPassword: '' },
  });

  const onRequest = async (data: ForgotRequestForm) => {
    setFormError(null);
    try {
      await signIn('password', { flow: 'reset', email: data.email });
      setEmail(data.email);
      setStep('verify');
      toast.info('If that email has an account, a reset code is on its way.');
    } catch (e: unknown) {
      // Don't reveal whether the account exists — show the neutral
      // success path for not-found-shaped errors, real errors otherwise.
      const message = e instanceof Error ? e.message : '';
      if (/could not send|rate|too many/i.test(message)) {
        setFormError(mapMemberAuthError(e, 'reset'));
      } else {
        setEmail(data.email);
        setStep('verify');
        toast.info('If that email has an account, a reset code is on its way.');
      }
    }
  };

  const onVerify = async (data: ForgotVerifyForm) => {
    setFormError(null);
    try {
      await signIn('password', {
        flow: 'reset-verification',
        email,
        code: data.code,
        newPassword: data.newPassword,
      });
      toast.success('Password updated — welcome back!');
      router.replace(TABS_ROUTE);
    } catch (e: unknown) {
      setFormError(mapMemberAuthError(e, 'reset'));
    }
  };

  if (step === 'request') {
    return (
      <View style={styles.container}>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <GenolyLogo size={30} withWordmark />
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          Reset your password
        </Text>
        <Text style={styles.subtitle}>
          Enter your email and we&apos;ll send you a reset code.
        </Text>
        {formError ? <Banner variant="error" message={formError} /> : null}
        <Controller
          control={requestForm.control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Email"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={!requestForm.formState.isSubmitting}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              error={requestForm.formState.errors.email?.message}
            />
          )}
        />
        <Button
          label="Send reset code"
          onPress={requestForm.handleSubmit(onRequest)}
          loading={requestForm.formState.isSubmitting}
          style={styles.submit}
        />
        <Button
          variant="link"
          label="Back to sign in"
          onPress={() => router.back()}
          style={styles.backLink}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Check your email
      </Text>
      <Text style={styles.subtitle}>
        We sent a code to {email}. Enter it below with your new password.
      </Text>
      {formError ? <Banner variant="error" message={formError} /> : null}
      <Controller
        control={verifyForm.control}
        name="code"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Reset code"
            placeholder="8-character code"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!verifyForm.formState.isSubmitting}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={verifyForm.formState.errors.code?.message}
          />
        )}
      />
      <Controller
        control={verifyForm.control}
        name="newPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="New password"
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete="new-password"
            editable={!verifyForm.formState.isSubmitting}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={verifyForm.formState.errors.newPassword?.message}
          />
        )}
      />
      <Controller
        control={verifyForm.control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Confirm new password"
            placeholder="Same password again"
            secureTextEntry
            autoComplete="new-password"
            editable={!verifyForm.formState.isSubmitting}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={verifyForm.formState.errors.confirmPassword?.message}
          />
        )}
      />
      <Button
        label="Set new password"
        onPress={verifyForm.handleSubmit(onVerify)}
        loading={verifyForm.formState.isSubmitting}
        style={styles.submit}
      />
      <Button
        variant="link"
        label="Use a different email"
        onPress={() => {
          setFormError(null);
          setStep('request');
        }}
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
