/**
 * genolyApi.ts — typed function references into the Genoly Convex backend.
 *
 * The web repo's `convex/_generated/api` can't be imported here (separate
 * repo; EAS builds only see genoly-mobile), so we declare references by
 * name with hand-maintained arg/return types. The web backend is the
 * source of truth — when a signature changes there, update it here.
 * Names follow Convex's "file/path:export" convention.
 *
 * Keep this file SMALL and member-side only. Fitness endpoints stay on
 * the HTTP bearer contract (`@genoly/api-client`) — do not add fitness
 * references here (forkability decision 2026-06-11).
 */

import { makeFunctionReference } from 'convex/server';

// ── users ─────────────────────────────────────────────────────────────

export type SiteRole = 'super_admin' | 'site_admin' | 'moderator' | 'support' | 'member';

/** Subset of Doc<"users"> the mobile app consumes (see web convex/schema.ts). */
export interface Me {
  _id: string;
  email: string;
  fullName?: string;
  avatarPhotoKey?: string;
  status: 'active' | 'invited' | 'deleted';
  siteRole?: SiteRole;
  timezone?: string;
  mfaEnabled?: boolean;
  emailVerified?: boolean;
  onboardingCompletedAt?: number;
  // Contribution streak (🔥)
  streakDays?: number;
  streakLastDayUTC?: string;
  streakBestDays?: number;
  // Visit streak (👋)
  visitDays?: number;
  visitLastDayUTC?: string;
  visitBestDays?: number;
}

export const usersMe = makeFunctionReference<'query', Record<string, never>, Me | null>(
  'users:me',
);

// ── auth telemetry (web Login.tsx parity) ─────────────────────────────

export const recordLoginAttempt = makeFunctionReference<
  'mutation',
  { email: string; success: boolean },
  unknown
>('lib/authRateLimit:recordLoginAttempt');

// ── MFA (convex/mfa.ts) ───────────────────────────────────────────────

export const isCurrentSessionMfaVerified = makeFunctionReference<
  'query',
  Record<string, never>,
  { mfaEnabled: boolean; verified: boolean; lastVerifiedAt?: number | null; windowMs?: number }
>('mfa:isCurrentSessionMfaVerified');

export const verifyMfaForSession = makeFunctionReference<
  'mutation',
  { code: string },
  { verified: boolean; usedBackup?: boolean; backupCodesRemaining?: number }
>('mfa:verifyMfaForSession');

export const getMfaStatus = makeFunctionReference<
  'query',
  Record<string, never>,
  {
    enabled: boolean;
    enrolledAt?: number | null;
    backupCodesRemaining?: number;
    siteRole?: SiteRole;
    requiresMfa?: boolean;
    graceExpiresAt?: number | null;
    inGracePeriod?: boolean;
  }
>('mfa:getMfaStatus');

export const requestMfaRecovery = makeFunctionReference<
  'mutation',
  Record<string, never>,
  { requested: boolean; expiresAt?: number; hoursUntilDisable?: number }
>('mfa:requestMfaRecovery');

// ── Email verification (convex/emailVerification.ts) ─────────────────

export const sendVerificationEmailToMe = makeFunctionReference<
  'mutation',
  Record<string, never>,
  { sent: boolean; reason?: string }
>('emailVerification:sendVerificationEmailToMe');

export const getMyVerificationStatus = makeFunctionReference<
  'query',
  Record<string, never>,
  { verified: boolean; email?: string; lastSentAt?: number | null; tokenExpiresAt?: number | null }
>('emailVerification:getMyVerificationStatus');

// ── Demo detection (mirror of web src/App.tsx + convex/lib/demoUsers.ts) ──

export const DEMO_USER_EMAILS = new Set(['demo-admin@genoly.org', 'demo-viewer@genoly.org']);

export function isDemoEmail(email: string | null | undefined): boolean {
  return DEMO_USER_EMAILS.has(email ?? '');
}

export function isAdminRole(role: SiteRole | undefined): boolean {
  return role === 'super_admin' || role === 'site_admin' || role === 'moderator' || role === 'support';
}
