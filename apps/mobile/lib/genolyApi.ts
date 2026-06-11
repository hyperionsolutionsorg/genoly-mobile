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

// ── Onboarding (convex/onboarding.ts — web /welcome wizard) ───────────

export type Gender = 'male' | 'female' | 'nonbinary' | 'other' | 'prefer_not_to_say';

export const completeOnboardingFirstTree = makeFunctionReference<
  'mutation',
  {
    treeName: string;
    treeSlug?: string;
    rootPersonName: string;
    rootGender?: Gender;
    rootBirthYear?: number;
  },
  { treeId: string; treeSlug: string; personId: string; personSlug: string }
>('onboarding:completeOnboardingFirstTree');

export const completeOnboarding = makeFunctionReference<
  'mutation',
  Record<string, never>,
  unknown
>('onboarding:completeOnboarding');

// ── Trees + persons (member-side basics) ─────────────────────────────

export interface MyTree {
  _id: string;
  name: string;
  slug?: string;
  tenantId?: string;
  membershipRole: string;
}

export const listMyTrees = makeFunctionReference<
  'query',
  { tenantId?: string },
  MyTree[]
>('trees:listMyTrees');

export const getTreeBySlug = makeFunctionReference<
  'query',
  { slug: string },
  ({ _id: string; name: string; slug?: string } & Record<string, unknown>) | null
>('trees:getTreeBySlug');

export const createPerson = makeFunctionReference<
  'mutation',
  {
    treeId: string;
    preferredName: string;
    gender?: Gender;
    isLiving: boolean;
  },
  { personId: string } & Record<string, unknown>
>('persons:createPerson');

export const addChildToPerson = makeFunctionReference<
  'mutation',
  {
    treeId: string;
    parentPersonId: string;
    childPersonId: string;
    relationshipType: 'biological' | 'adopted' | 'step' | 'foster';
  },
  unknown
>('families:addChildToPerson');

// ── Dashboard widgets (wave C4) ───────────────────────────────────────

export interface RewardsSummary {
  earnedBadges: number;
  totalBadges: number;
  contributionStreak: number;
  visitStreak: number;
  activeQuestCount: number;
  activeQuestMax: number;
  topQuest: { name: string; progress: number; target: number } | null;
}

export const getMyRewardsSummary = makeFunctionReference<
  'query',
  { treeId: string },
  RewardsSummary
>('rewards:getMyRewardsSummary');

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  avatarKey?: string;
  personSlug?: string;
  score: number;
  rank: number;
}

export interface TreeLeaderboard {
  computedAt: number;
  topQuestsAllTime: LeaderboardEntry[];
  topQuestsThisWeek: LeaderboardEntry[];
  topAchievements: LeaderboardEntry[];
  topStreaks: LeaderboardEntry[];
}

export const getTreeLeaderboard = makeFunctionReference<
  'query',
  { treeId: string },
  TreeLeaderboard | null
>('treeLeaderboards:getTreeLeaderboard');

export const recordVisitToday = makeFunctionReference<
  'mutation',
  Record<string, never>,
  { visitDays: number; visitLastDayUTC: string | null; visitBestDays: number } | null
>('users:recordVisitToday');

export interface AnniversaryItem {
  kind: 'birthday' | 'marriage' | 'death_anniversary';
  occursOn: string;
  daysFromNow: number;
  yearsSince: number;
  personId?: string;
  familyId?: string;
  personName?: string;
  partnerNames?: { p1: string; p2: string };
  originalDate: string;
}

export const getUpcomingAnniversaries = makeFunctionReference<
  'query',
  { treeId: string; windowDays?: number },
  AnniversaryItem[]
>('anniversaries:getUpcomingAnniversaries');

export interface GamesContext {
  totalPersons: number;
  placedPersons: number;
  parentChildLinks: number;
  nameLengths: number[];
  personsWithYearCount: number;
}

export const getGamesContext = makeFunctionReference<
  'query',
  { treeId: string },
  GamesContext
>('games:getGamesContext');

export const recordDailyCompletion = makeFunctionReference<
  'mutation',
  {
    treeId: string;
    gameKey: 'family-connections' | 'timeline-tap';
    score: number;
    perfect: boolean;
  },
  { recorded: boolean; dayUTC: string }
>('gameCompletions:recordDailyCompletion');

export const getDailySocialStats = makeFunctionReference<
  'query',
  { treeId: string; gameKey: string; dayUTC: string },
  { treeCompletions: number; myRankByScore: number | null }
>('gameCompletions:getDailySocialStats');

// ── Demo detection (mirror of web src/App.tsx + convex/lib/demoUsers.ts) ──

export const DEMO_USER_EMAILS = new Set(['demo-admin@genoly.org', 'demo-viewer@genoly.org']);

export function isDemoEmail(email: string | null | undefined): boolean {
  return DEMO_USER_EMAILS.has(email ?? '');
}

export function isAdminRole(role: SiteRole | undefined): boolean {
  return role === 'super_admin' || role === 'site_admin' || role === 'moderator' || role === 'support';
}
