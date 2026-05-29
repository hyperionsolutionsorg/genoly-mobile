// apps/mobile/app/(auth)/login.tsx
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { apiClient } from '../../utils/api';
import { ApiClientError } from '@genoly/api-client';

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
      <Text style={styles.title}>Log in</Text>
        <View style={styles.fieldContainer}>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <>
                <TextInput
                  placeholder="Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                  editable={!isSubmitting}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
                {errors.email && <Text style={styles.error}>{errors.email.message}</Text>}
              </>
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <>
                <TextInput
                  placeholder="Password"
                  secureTextEntry
                  style={styles.input}
                  editable={!isSubmitting}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
                {errors.password && <Text style={styles.error}>{errors.password.message}</Text>}
              </>
            )}
          />
        </View>
      <TouchableOpacity style={styles.button} onPress={handleSubmit(onSubmit)} disabled={isSubmitting}>
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Log In</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => Alert.alert('Forgot password', 'Please visit https://genoly.org/forgot-password')}>
        <Text style={styles.forgot}>Forgot password?</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#fefefe',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  },
  fieldContainer: {
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#0066ff',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#d00',
    fontSize: 12,
    marginBottom: 4,
  },
  forgot: {
    marginTop: 12,
    textAlign: 'center',
    color: '#0066ff',
    textDecorationLine: 'underline',
  },
});
