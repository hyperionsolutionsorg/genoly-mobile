/**
 * @genoly/types — shared TypeScript types for the genoly-mobile monorepo.
 *
 * Source of truth: genoly-family-web/docs/fitness-api-contract.md.
 * Schema reference: genoly-family-web/convex/schema.ts (fitness_* tables).
 *
 * Phase 0 status: types only, no implementations. Implementations land in Phase 1.
 *
 * Forkability note: this file must NOT import from anywhere outside
 * @genoly/types itself. It's the leaf of the type dependency graph and the
 * stable surface that survives the fitness extraction (per FORK_PROCEDURE.md).
 */

// ──────────────────────────────────────────────────────────────────────────
// Literal unions
// ──────────────────────────────────────────────────────────────────────────

export type Platform = 'ios' | 'android' | 'watch';

export type HealthSource = 'healthkit' | 'health_connect' | 'manual';

export type SubscriptionTier = 'free' | 'premium';

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export type DeviceStatus = 'primary' | 'inactive' | 'revoked';

export type GoalPeriod = 'daily' | 'weekly';

export type GoalMetric = 'steps' | 'calories';

export type TokenScope = 'health:write';

// ──────────────────────────────────────────────────────────────────────────
// Health data
// ──────────────────────────────────────────────────────────────────────────

/**
 * A daily aggregate row. Server-stored shape of a single day for one user.
 * `caloriesBasal` and `distanceMeters` are nullable because iOS HealthKit
 * may not populate them for all users.
 */
export interface HealthEntry {
  date: string; // ISO YYYY-MM-DD in user's local timezone
  dateUtcStart: number; // Unix ms — start of that local day in UTC
  steps: number;
  caloriesActive: number;
  caloriesBasal: number | null;
  distanceMeters: number | null;
  source: HealthSource;
  lastSyncedAt: number; // Unix ms
}

/**
 * Mobile-uploaded entry. Same as HealthEntry minus server-stamped fields.
 * Used as the body shape for POST /api/fitness/sync/daily.
 */
export type HealthEntryUpload = Pick<
  HealthEntry,
  'date' | 'dateUtcStart' | 'steps' | 'caloriesActive' | 'source'
> & {
  caloriesBasal?: number;
  distanceMeters?: number;
};

// ──────────────────────────────────────────────────────────────────────────
// User / device / token
// ──────────────────────────────────────────────────────────────────────────

/**
 * The mobile-visible projection of a Genoly user. The full row lives on the
 * server in fitness_users with a genolyUserId pointing back at the Genoly
 * users table — that indirection is the forkability invariant and is NOT
 * exposed to mobile clients.
 */
export interface FitnessUser {
  id: string; // fitness_users._id
  email: string;
  displayName: string | null;
  avatarPhotoKey: string | null;
  timezone: string | null;
  status: 'active' | 'suspended' | 'deleted';
}

export interface FitnessDevice {
  id: string;
  platform: Platform;
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string | null;
  status: DeviceStatus;
  isCurrent: boolean; // true for the device the calling token belongs to
  registeredAt: number;
  lastSeenAt: number;
}

export interface FitnessTokenIssue {
  token: string; // plaintext bearer — store in expo-secure-store, never log
  tokenPrefix: string; // first 8 chars; UX display only
  expiresAt: number; // Unix ms
}

// ──────────────────────────────────────────────────────────────────────────
// Friendships
// ──────────────────────────────────────────────────────────────────────────

export interface FriendBrief {
  friendshipId: string;
  fitnessUserId: string; // the OTHER user's id
  displayName: string | null;
  avatarPhotoKey: string | null;
  status: FriendshipStatus;
  createdAt: number;
  acceptedAt: number | null;
}

export interface FriendsByStatus {
  accepted: FriendBrief[];
  pendingIncoming: FriendBrief[]; // requests sent TO me
  pendingOutgoing: FriendBrief[]; // requests I sent
  blocked: FriendBrief[]; // users I've blocked
}

export interface LeaderboardRow {
  rank: number; // 1-based; ties share rank
  fitnessUserId: string;
  displayName: string | null;
  avatarPhotoKey: string | null;
  isMe: boolean;
  steps: number | null;
  caloriesActive: number | null;
  caloriesBasal: number | null;
  lastSyncedAt: number | null;
}

export interface Leaderboard {
  date: string;
  rows: LeaderboardRow[];
  myStepGoal: number | null;
  myCalorieGoal: number | null;
}

// ──────────────────────────────────────────────────────────────────────────
// Goals
// ──────────────────────────────────────────────────────────────────────────

export interface Goal {
  id: string;
  period: GoalPeriod;
  metric: GoalMetric;
  target: number; // non-negative integer
  effectiveFrom: number; // Unix ms
  createdAt: number;
}

export interface ArchivedGoal extends Goal {
  archivedAt: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Subscription state (read-only; mobile must not show prices or upgrade UI)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Mobile-side subscription state. The `isPaymentNeutral: true` literal flag
 * is a self-documenting tripwire — its presence is intentionally a
 * code-review reminder that ANY upgrade UI on mobile violates Apple's
 * anti-steering rules. All upgrade flows live exclusively on the web at
 * https://genoly.org/billing.
 */
export interface SubscriptionStatus {
  tier: SubscriptionTier;
  expiresAt: number | null; // null for free tier
  isPaymentNeutral: true; // literal — never false on mobile
}

// ──────────────────────────────────────────────────────────────────────────
// "Who am I" composite — returned by GET /api/fitness/auth/me
// ──────────────────────────────────────────────────────────────────────────

export interface SessionState {
  user: FitnessUser;
  device: Pick<FitnessDevice, 'id' | 'platform' | 'status'>;
  token: {
    expiresAt: number;
    daysUntilExpiry: number;
  };
  subscription: {
    tier: SubscriptionTier;
    expiresAt: number | null;
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Error shape
// ──────────────────────────────────────────────────────────────────────────

export type ApiErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'unauthenticated'
  | 'token_revoked'
  | 'token_expired'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiError;
}
