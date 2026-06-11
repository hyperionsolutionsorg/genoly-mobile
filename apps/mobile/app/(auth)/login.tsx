// apps/mobile/app/(auth)/login.tsx
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { apiClient } from '../../utils/api';
import { ApiClientError } from '@genoly/api-client';
import { useThemedStyles, type Theme } from '../../theme';
import { Button, TextField } from '../../components/ui';

const schema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
});

type FormData = z.infer<typeof schema>;

function mapLoginError(e: unknown): string {
  if (e instanceof ApiClientError) {
    switch (e.code) {
      case 'unauthenticated':
        return 'Wrong email or password. Try again.';
      case 'bad_request':
        return 'Please check your email and password.';
      case 'rate_limited':
        return 'Too many sign-in attempts. Wait a minute and try again.';
      case 'token_expired':
        return 'Your session expired. Please sign in again.';
      case 'internal':
        return 'Something went wrong on our end. Please try again.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
  return 'An unexpected error occurred.';
}

export default function LoginScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await apiClient.issueToken({
        email: data.email,
        password: data.password,
        device: {
          platform: Platform.OS as import('@genoly/types').Platform,
          appVersion: Constants.expoConfig?.version,
        },
      });
      router.replace('/(tabs)');
    } catch (e: unknown) {
      const message = mapLoginError(e);
      Alert.alert('Login error', message);
    }
  };

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Log in
      </Text>
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
        label="Log in"
        onPress={handleSubmit(onSubmit)}
        loading={isSubmitting}
        accessibilityLabel="Log in"
      />
      <Button
        variant="link"
        label="Forgot password?"
        onPress={() =>
          Alert.alert('Forgot password', 'Please visit https://genoly.org/forgot-password')
        }
        style={styles.forgot}
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
      marginBottom: t.spacing.xl,
      textAlign: 'center',
    },
    fieldContainer: {
      marginBottom: t.spacing.lg,
    },
    forgot: {
      marginTop: t.spacing.md,
      alignSelf: 'center',
    },
  });
}
