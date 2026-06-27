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

// ── Persons + events + media (wave D tree essentials) ────────────────

export interface PersonDoc {
  _id: string;
  treeId: string;
  slug?: string | null;
  preferredName: string;
  givenName?: string;
  middleName?: string;
  surname?: string;
  suffix?: string;
  prefix?: string;
  nickname?: string;
  gender?: Gender | null;
  isLiving: boolean;
  summary?: string;
  timezone?: string;
  avatarPhotoKey?: string;
  tags?: string[];
}

export const listAllPersonsByTree = makeFunctionReference<
  'query',
  { treeId: string },
  PersonDoc[]
>('persons:listAllPersonsByTree');

export interface PersonSearchResult {
  _id: string;
  slug: string | null;
  preferredName: string;
  surname: string | null;
  nickname: string | null;
  gender: string | null;
  isLiving: boolean;
}

export const searchPersonsAutocomplete = makeFunctionReference<
  'query',
  { treeId: string; query: string; limit?: number },
  PersonSearchResult[]
>('personSearch:searchPersonsAutocomplete');

export interface PersonDetail {
  person: PersonDoc;
  altNames: { name: string }[];
  noteLinks: unknown[];
  mediaLinks: unknown[];
  adultFamilies: { familyId: string; personId: string }[];
  childFamilies: { familyId: string; childPersonId?: string; personId?: string }[];
}

export const getPerson = makeFunctionReference<
  'query',
  { personId: string },
  PersonDetail | null
>('persons:getPerson');

export const getPersonBySlugOrId = makeFunctionReference<
  'query',
  { treeId: string; ref: string },
  PersonDoc | null
>('persons:getPersonBySlugOrId');

export const updatePerson = makeFunctionReference<
  'mutation',
  {
    personId: string;
    preferredName?: string;
    givenName?: string;
    surname?: string;
    nickname?: string;
    summary?: string;
    isLiving?: boolean;
    gender?: Gender;
  },
  string
>('persons:updatePerson');

export type EventType =
  | 'birth'
  | 'death'
  | 'marriage'
  | 'divorce'
  | 'residence'
  | 'education'
  | 'occupation'
  | 'military'
  | 'immigration'
  | 'custom';

export type DatePrecision = 'exact' | 'approximate' | 'before' | 'after' | 'range' | 'unknown';

export interface PersonEvent {
  _id: string;
  type: string;
  title?: string | null;
  description?: string | null;
  dateOriginal?: string | null;
  dateStart?: number | null;
  datePrecision?: string | null;
  participantRole: string;
  placeName: string | null;
}

export const listEventsByPerson = makeFunctionReference<
  'query',
  { personId: string },
  PersonEvent[]
>('events:listEventsByPerson');

/** Creates the event AND links the person as participant in one call
 *  (the same mutation web AddEvent.tsx uses). */
export const createEventForPerson = makeFunctionReference<
  'mutation',
  {
    treeId: string;
    personId: string;
    type: string;
    title?: string;
    description?: string;
    dateOriginal?: string;
    dateStart?: number;
    dateEnd?: number;
    datePrecision?: DatePrecision;
    locationText?: string;
    isPrivate?: boolean;
  },
  string
>('events:createEventForPerson');

export interface MediaForTarget {
  _id: string;
  objectKey: string;
  originalFileName?: string;
  mimeType: string;
  width?: number;
  height?: number;
  visibility: 'public' | 'members' | 'private';
  isPrimary?: boolean;
  useType: string;
  title?: string;
  caption?: string;
}

export const getMediaForTarget = makeFunctionReference<
  'query',
  { treeId: string; targetType: string; targetId: string },
  MediaForTarget[]
>('media:getMediaForTarget');

export const getDownloadUrl = makeFunctionReference<
  'query',
  { objectKey: string },
  string
>('r2:getDownloadUrl');

export const getUploadUrl = makeFunctionReference<
  'action',
  { fileName: string; contentType: string; treeId: string; tenantId?: string },
  { uploadUrl: string; objectKey: string }
>('r2:getUploadUrl');

export const createMediaMetadata = makeFunctionReference<
  'mutation',
  {
    treeId: string;
    objectKey: string;
    originalFileName: string;
    mimeType: string;
    fileSizeBytes: number;
    title?: string;
    caption?: string;
    width?: number;
    height?: number;
    visibility: 'public' | 'members' | 'private';
    isPrimary: boolean;
  },
  string
>('media:createMediaMetadata');

export const linkMedia = makeFunctionReference<
  'mutation',
  {
    treeId: string;
    mediaId: string;
    targetType: string;
    targetId: string;
    useType: 'avatar' | 'cover' | 'photo' | 'document';
    sortOrder?: number;
  },
  string
>('media:linkMedia');

export interface RelationshipGraph {
  persons: { _id: string; preferredName: string; surname?: string; gender?: string; isLiving: boolean }[];
  parents: Record<string, string[]>;
  children: Record<string, string[]>;
  spouses: Record<string, string[]>;
}

export const getRelationshipGraph = makeFunctionReference<
  'query',
  { treeId: string },
  RelationshipGraph
>('games:getRelationshipGraph');

export const createFamily = makeFunctionReference<
  'mutation',
  {
    treeId: string;
    familyType: 'married' | 'unmarried' | 'partnered' | 'unknown';
    status: 'active' | 'ended' | 'unknown';
    primaryParent1PersonId?: string;
    primaryParent2PersonId?: string;
  },
  string
>('families:createFamily');

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

// ── Family Walking Challenges (wave H — Genoly-side module) ───────────

export type ChallengeType = 'cooperative' | 'individual';
export type ChallengeWindow = 'daily' | 'weekly' | 'monthly';
export type ChallengeStatus = 'active' | 'completed' | 'cancelled';

export interface ChallengeSummary {
  _id: string;
  treeId: string;
  createdByUserId: string;
  name: string;
  type: ChallengeType;
  windowType: ChallengeWindow;
  startAt: number;
  endAt: number;
  goal: number | null;
  inviteOnly: boolean;
  status: ChallengeStatus;
}

export const challengeCreate = makeFunctionReference<
  'mutation',
  {
    treeId: string;
    name: string;
    type: ChallengeType;
    windowType: ChallengeWindow;
    goal?: number;
    inviteOnly?: boolean;
  },
  { challengeId: string }
>('walkingChallenges:create');

export const challengeJoin = makeFunctionReference<
  'mutation',
  { challengeId: string },
  { joined: boolean; already?: boolean; rejoined?: boolean }
>('walkingChallenges:join');

export const challengeLeave = makeFunctionReference<
  'mutation',
  { challengeId: string },
  { left: boolean }
>('walkingChallenges:leave');

export const challengeCancel = makeFunctionReference<
  'mutation',
  { challengeId: string },
  { cancelled: boolean; already?: boolean }
>('walkingChallenges:cancel');

export const challengeAddParticipant = makeFunctionReference<
  'mutation',
  { challengeId: string; userId: string },
  { added: boolean; already?: boolean; rejoined?: boolean }
>('walkingChallenges:addParticipant');

export const challengeSetMyVisibility = makeFunctionReference<
  'mutation',
  { challengeId: string; hideActivity: boolean },
  { hideActivity: boolean }
>('walkingChallenges:setMyVisibility');

export const challengeSyncMySteps = makeFunctionReference<
  'mutation',
  { challengeId: string; days: { date: string; steps: number }[] },
  { accepted: number; currentSteps: number; serverTime: number }
>('walkingChallenges:syncMySteps');

export const listTreeChallenges = makeFunctionReference<
  'query',
  { treeId: string },
  (ChallengeSummary & { joined: boolean; mySteps: number })[]
>('walkingChallenges:listTreeChallenges');

export const listMyActiveChallenges = makeFunctionReference<
  'query',
  Record<string, never>,
  (ChallengeSummary & { treeName: string; mySteps: number; lastSyncedAt: number | null })[]
>('walkingChallenges:listMyActiveChallenges');

export interface ChallengeLeaderboardEntry {
  userId: string;
  displayName: string;
  steps: number;
  left: boolean;
  lastSyncedAt: number | null;
  isMe: boolean;
  rank: number;
}

export interface ChallengeLeaderboard {
  challenge: ChallengeSummary;
  participantCount: number;
  teamTotal: number;
  goalProgressPct: number | null;
  entries: ChallengeLeaderboardEntry[];
  me: {
    joined: boolean;
    steps: number;
    hideActivity: boolean;
    lastSyncedAt: number | null;
  } | null;
  serverTime: number;
}

export const getChallengeLeaderboard = makeFunctionReference<
  'query',
  { challengeId: string },
  ChallengeLeaderboard
>('walkingChallenges:getChallengeLeaderboard');

// ── Support / knowledge base + contact (wave G) ───────────────────────

export interface KbArticleSummary {
  _id: string;
  title: string;
  slug: string;
  category?: string;
  tags?: string[];
  publishedAt?: number;
}

export const kbListPublishedArticles = makeFunctionReference<
  'query',
  Record<string, never>,
  (KbArticleSummary & { viewCount?: number })[]
>('kb:listPublishedArticles');

export const kbGetArticleBySlug = makeFunctionReference<
  'query',
  { slug: string },
  (KbArticleSummary & { body: string }) | null
>('kb:getArticleBySlug');

export const kbSearchArticles = makeFunctionReference<
  'query',
  { query: string },
  KbArticleSummary[]
>('kb:searchArticles');

export const submitContact = makeFunctionReference<
  'mutation',
  { name: string; email: string; subject: string; body: string; userAgent?: string },
  unknown
>('contactSubmissions:submitContact');

export const updateProfile = makeFunctionReference<
  'mutation',
  { fullName?: string; gender?: Gender; bio?: string; phone?: string },
  unknown
>('users:updateProfile');

// ── Demo detection (mirror of web src/App.tsx + convex/lib/demoUsers.ts) ──

export const DEMO_USER_EMAILS = new Set(['demo-admin@genoly.org', 'demo-viewer@genoly.org']);

export function isDemoEmail(email: string | null | undefined): boolean {
  return DEMO_USER_EMAILS.has(email ?? '');
}

export function isAdminRole(role: SiteRole | undefined): boolean {
  return role === 'super_admin' || role === 'site_admin' || role === 'moderator' || role === 'support';
}

// ── Tenant plan access (mobile Pro gate) ─────────────────────────────

export interface TenantRecord {
  _id: string;
  name: string;
  slug: string;
  plan: 'free' | 'starter' | 'pro';
}

/**
 * Returns all tenants the current user can access (owned + invite-accepted).
 * Mirrors web convex/tenants.ts:listMyTenants — keep signatures in sync.
 */
export const listMyTenants = makeFunctionReference<
  'query',
  Record<string, never>,
  TenantRecord[]
>('tenants:listMyTenants');

/**
 * useHasProTenantAccess — React hook that returns whether the current user
 * has access to at least one Pro-plan tenant.  Used by _layout.tsx to gate
 * the full app experience.
 *
 * Returns `null` while loading (splash is still visible), `true` for Pro
 * access, and `false` for paywall.
 */
import { useQuery } from 'convex/react';
import { hasAnyProTenant } from './planChecks';

export function useHasProTenantAccess(): boolean | null {
  const tenants = useQuery(listMyTenants);
  if (tenants === undefined) return null; // loading
  return hasAnyProTenant(tenants);
}
