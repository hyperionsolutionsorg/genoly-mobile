/**
 * authSchemas.ts — zod schemas + error mapping for the auth screens.
 * Pure module (no react-native / expo-router imports) so it stays fully
 * unit-testable under Node.
 */

import { z } from 'zod';

// Mirrors the web signup form + server-side validatePasswordRequirements
// (8+ chars). The RFC-6761 reserved-TLD block is enforced server-side on
// every email send path; we add a cheap client hint for the worst case.
const RESERVED_TLDS = ['.test', '.example', '.invalid', '.localhost'];

export const emailSchema = z
  .email({ message: 'Invalid email address' })
  .refine((value) => !RESERVED_TLDS.some((tld) => value.toLowerCase().endsWith(tld)), {
    message: 'Please use a real email address — this domain cannot receive mail.',
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
});

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, { message: 'Please tell us your name' }),
    email: emailSchema,
    password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
    confirmPassword: z.string(),
    acceptedLegal: z.literal(true, {
      message: 'Please accept the Terms of Service and Privacy Policy to continue.',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const forgotRequestSchema = z.object({
  email: emailSchema,
});

export const forgotVerifySchema = z
  .object({
    code: z.string().trim().min(6, { message: 'Enter the code from your email' }),
    newPassword: z.string().min(8, { message: 'Password must be at least 8 characters' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const mfaCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, { message: 'Enter your 6-digit code or a backup code' })
    .max(11, { message: 'That looks too long for a code' }),
});

export type LoginForm = z.infer<typeof loginSchema>;
export type SignupForm = z.infer<typeof signupSchema>;
export type ForgotRequestForm = z.infer<typeof forgotRequestSchema>;
export type ForgotVerifyForm = z.infer<typeof forgotVerifySchema>;
export type MfaCodeForm = z.infer<typeof mfaCodeSchema>;

/**
 * Maps Convex Auth sign-in/sign-up failures to warm, human copy
 * (tone per DESIGN.md §1). Convex Auth surfaces most credential problems
 * as a generic InvalidSecret/InvalidAccountId error — don't leak which
 * field was wrong.
 */
export function mapMemberAuthError(e: unknown, flow: 'signIn' | 'signUp' | 'reset'): string {
  const message = e instanceof Error ? e.message : String(e ?? '');
  if (/acceptedLegal|legal/i.test(message)) {
    return 'Please accept the Terms of Service and Privacy Policy to continue.';
  }
  if (/password.*requirement|at least|too short/i.test(message)) {
    return 'Password must be at least 8 characters.';
  }
  if (/already exists|already registered|account.*exists/i.test(message)) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (/rate|too many/i.test(message)) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (/network|fetch|timeout|offline/i.test(message)) {
    return 'We could not reach Genoly. Check your connection and try again.';
  }
  switch (flow) {
    case 'signUp':
      return 'We could not create your account. Please check your details and try again.';
    case 'reset':
      return 'That code did not work. Double-check it and try again.';
    default:
      return 'Wrong email or password. Try again.';
  }
}
