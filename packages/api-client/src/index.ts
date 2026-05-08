/**
 * @genoly/api-client — HTTP client interface for the genoly-family-web
 * fitness backend (the /api/fitness/* routes documented in
 * genoly-family-web/docs/fitness-api-contract.md).
 *
 * Phase 0 status: interface only. Implementation lands in Phase 1 using
 * fetch + a per-device bearer token stored in expo-secure-store. The
 * concrete client class will throw typed ApiError exceptions on non-2xx
 * responses so callers can switch on `error.code`.
 *
 * Forkability rule: this package only imports from @genoly/types. The
 * concrete fetch client may add expo-secure-store as a peer dep in
 * Phase 1 — that's fine because expo-secure-store is platform-agnostic.
 */

import type {
  ApiError,
  FitnessDevice,
  FitnessTokenIssue,
  FitnessUser,
  FriendBrief,
  FriendsByStatus,
  Goal,
  ArchivedGoal,
  GoalMetric,
  GoalPeriod,
  HealthEntry,
  HealthEntryUpload,
  Leaderboard,
  Platform,
  SessionState,
  SubscriptionStatus,
} from '@genoly/types';

// ──────────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────────

export interface ApiClientConfig {
  /**
   * Base URL of the Convex deployment. Dev is
   * https://robust-oyster-899.convex.site; prod is
   * https://keen-owl-415.convex.site. The mobile app reads the current
   * target from a build-time config constant (per the contract — never
   * hardcoded in components).
   */
  baseUrl: string;

  /**
   * Plaintext bearer token. Null when the user is not signed in. Stored
   * in expo-secure-store by the implementation; never in AsyncStorage
   * and never logged.
   */
  bearerToken: string | null;

  /**
   * App version sent on token issuance for server-side compatibility
   * checks. Read from app.json's expo.version at build time.
   */
  appVersion?: string;
}

/**
 * Thrown by client methods on any non-2xx response. The shape matches
 * `ApiError` from @genoly/types so callers can switch on `code`.
 */
export class ApiClientError extends Error {
  public readonly code: ApiError['code'];
  public readonly status: number; // HTTP status code
  public readonly details?: unknown;

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// The client interface (mirrors fitness-api-contract.md endpoints 1:1)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Method names map directly to endpoints. Comments cite the contract
 * section + HTTP path. All numeric timestamps are Unix milliseconds.
 *
 * Auth model: every method except `issueToken` requires
 * `config.bearerToken` to be non-null at call time. Implementations
 * throw `ApiClientError` with code 'unauthenticated' if it's null.
 */
export interface ApiClient {
  // §1 Authentication ─────────────────────────────────────────────────────

  /** POST /api/fitness/auth/issue-token — first call after sign-in. */
  issueToken(opts: {
    email: string;
    password: string;
    device: {
      platform: Platform;
      deviceModel?: string;
      osVersion?: string;
      appVersion?: string;
    };
    setAsPrimary?: boolean;
  }): Promise<
    FitnessTokenIssue & {
      device: Pick<FitnessDevice, 'id' | 'status'>;
      user: Pick<FitnessUser, 'id' | 'email' | 'displayName' | 'timezone'>;
    }
  >;

  /** POST /api/fitness/auth/revoke. */
  revokeToken(opts: { scope: 'this_token' | 'this_device' | 'all_devices' }): Promise<void>;

  /** GET /api/fitness/auth/me — cold-start check. */
  getSession(): Promise<SessionState>;

  // §2 Daily sync (the hot path) ──────────────────────────────────────────

  /** GET /api/fitness/sync/daily — read self's daily aggregates over a range. */
  getDailyAggregates(opts: {
    from: string; // YYYY-MM-DD
    to: string; // YYYY-MM-DD
  }): Promise<{
    from: string;
    to: string;
    entries: HealthEntry[];
  }>;

  /** POST /api/fitness/sync/daily — idempotent upsert by (userId, date). */
  syncDailyAggregates(entries: HealthEntryUpload[]): Promise<{
    accepted: number;
    rejected: Array<{ index: number; code: string; message: string }>;
    serverTime: number;
  }>;

  // §3 Friends & leaderboard ──────────────────────────────────────────────

  /** GET /api/fitness/friends. */
  getFriends(): Promise<FriendsByStatus>;

  /** GET /api/fitness/friends/leaderboard?date=YYYY-MM-DD. */
  getLeaderboard(opts: { date: string }): Promise<Leaderboard>;

  /** POST /api/fitness/friends/request. */
  requestFriend(opts: { targetEmail: string }): Promise<{
    friendshipId: string;
    status: 'pending';
  }>;

  /** POST /api/fitness/friends/:friendshipId/accept. */
  acceptFriend(friendshipId: string): Promise<{
    status: 'accepted';
    acceptedAt: number;
  }>;

  /** POST /api/fitness/friends/:friendshipId/decline — deletes the row. */
  declineFriend(friendshipId: string): Promise<void>;

  /** DELETE /api/fitness/friends/:friendshipId — unfriend. */
  unfriend(friendshipId: string): Promise<void>;

  /** POST /api/fitness/friends/:friendshipId/block. */
  blockFriend(friendshipId: string): Promise<{
    status: 'blocked';
    blockedAt: number;
  }>;

  // §4 Goals ──────────────────────────────────────────────────────────────

  /** GET /api/fitness/goals — currently active goals (max 4). */
  getGoals(): Promise<{ goals: Goal[] }>;

  /** GET /api/fitness/goals/history. */
  getGoalsHistory(opts?: {
    period?: GoalPeriod;
    metric?: GoalMetric;
    limit?: number;
  }): Promise<{ goals: ArchivedGoal[] }>;

  /** PUT /api/fitness/goals — create-or-update for a (period, metric) pair. */
  upsertGoal(opts: {
    period: GoalPeriod;
    metric: GoalMetric;
    target: number;
  }): Promise<{ id: string; status: 'active'; created: boolean }>;

  /** DELETE /api/fitness/goals/:goalId — archives, doesn't delete. */
  archiveGoal(goalId: string): Promise<void>;

  // §5 Devices ────────────────────────────────────────────────────────────

  /** GET /api/fitness/devices. */
  getDevices(): Promise<{ devices: FitnessDevice[] }>;

  /** POST /api/fitness/devices/:deviceId/primary. */
  setPrimaryDevice(deviceId: string): Promise<{ id: string; status: 'primary' }>;

  /** DELETE /api/fitness/devices/:deviceId — revokes device + its tokens. */
  revokeDevice(deviceId: string): Promise<void>;

  // §6 Subscription state (read-only) ─────────────────────────────────────

  /**
   * GET /api/fitness/subscription. Always read-only on mobile —
   * `isPaymentNeutral: true` is a constant tripwire reminding callers
   * that upgrade UI on mobile violates Apple's anti-steering rules.
   * All upgrade flows live exclusively on the web.
   */
  getSubscription(): Promise<SubscriptionStatus>;
}
