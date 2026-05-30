import type { ApiClient, ApiClientConfig } from './index';
import { ApiClientError } from './index';
import type { TokenStore } from './token-store';
import type {
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
  ApiError,
} from '@genoly/types';

export interface FetchApiClientOptions {
  tokenStore: TokenStore;
  baseUrl: string;
  appVersion?: string;
  fetch?: typeof fetch;
}

export class FetchApiClient implements ApiClient {
  private tokenStore: TokenStore;
  private baseUrl: string;
  private appVersion?: string;
  private customFetch: typeof fetch;

  constructor(opts: FetchApiClientOptions) {
    this.tokenStore = opts.tokenStore;
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.appVersion = opts.appVersion;
    this.customFetch = opts.fetch || fetch.bind(globalThis);
  }

  /**
   * Helper to make authenticated/unauthenticated fetch calls with parsing,
   * exponential backoff retries on GET, and custom error mapping.
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    options: { requiresAuth?: boolean; signal?: AbortSignal } = {}
  ): Promise<T> {
    const { requiresAuth = true, signal } = options;
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (requiresAuth) {
      const token = await this.tokenStore.getToken();
      if (!token) {
        throw new ApiClientError(
          { code: 'unauthenticated', message: 'No bearer token available' },
          401
        );
      }
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (this.appVersion) {
      headers['x-app-version'] = this.appVersion;
    }

    const fetchOpts: RequestInit = {
      method,
      headers,
      signal,
    };

    if (body !== undefined) {
      fetchOpts.body = JSON.stringify(body);
    }

    const isGet = method === 'GET';
    const maxAttempts = isGet ? 3 : 1;
    let lastError: ApiClientError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1 && isGet) {
          // Exponential backoff delays: Attempt 2 -> 1s, Attempt 3 -> 3s, with jitter
          const baseDelay = attempt === 2 ? 1000 : 3000;
          const jitter = (Math.random() * 400) - 200; // ±200ms
          const delay = Math.max(0, baseDelay + jitter);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const startTime = Date.now();
        const response = await this.customFetch(url, fetchOpts);
        const duration = Date.now() - startTime;

        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(`[FetchApiClient] ${method} ${path} -> ${response.status} (${duration}ms)`);
        }

        if (response.ok) {
          return (await response.json()) as T;
        }

        // Parse custom error body
        let apiError: ApiError;
        try {
          const bodyText = await response.text();
          const parsed = JSON.parse(bodyText);
          apiError = parsed?.error || {
            code: 'internal',
            message: bodyText || 'Unknown response error',
          };
        } catch {
          apiError = { code: 'internal', message: `HTTP ${response.status} response` };
        }

        const clientError = new ApiClientError(apiError, response.status);

        // Retries on 5xx or 429
        if (isGet && (response.status >= 500 || response.status === 429)) {
          lastError = clientError;
          if (response.status === 429 && attempt < maxAttempts) {
            const retryAfterHeader = response.headers.get('Retry-After');
            if (retryAfterHeader) {
              const seconds = parseInt(retryAfterHeader, 10);
              if (!isNaN(seconds)) {
                await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
                continue;
              }
            }
            // Standard backoff if header is missing
            const delayOptions = [5000, 15000, 30000];
            const delay = delayOptions[attempt - 1] || 5000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
          continue;
        }

        throw clientError;
      } catch (err: unknown) {
        if (err instanceof ApiClientError) {
          throw err;
        }

        const errMsg = err instanceof Error ? err.message : 'Network request failed';

        // Network error retry check
        const clientError = new ApiClientError(
          { code: 'internal', message: errMsg, details: err },
          500
        );

        if (isGet && attempt < maxAttempts) {
          lastError = clientError;
          continue;
        }

        throw clientError;
      }
    }

    throw lastError;
  }

  // §1 Authentication ─────────────────────────────────────────────────────

  /** POST /api/fitness/auth/issue-token — first call after sign-in. */
  async issueToken(opts: {
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
  > {
    const res = await this.request<
      FitnessTokenIssue & {
        device: Pick<FitnessDevice, 'id' | 'status'>;
        user: Pick<FitnessUser, 'id' | 'email' | 'displayName' | 'timezone'>;
      }
    >('POST', '/api/fitness/auth/issue-token', opts, { requiresAuth: false });

    // Store securely
    await this.tokenStore.setToken(res.token, res.expiresAt);
    return res;
  }

  /** POST /api/fitness/auth/revoke. Used by Settings → Sign out flow. */
  async revokeToken(opts: { scope: 'this_token' | 'this_device' | 'all_devices' }): Promise<void> {
    // Note: server expects { scope } in the body. The bearer token in the
    // Authorization header identifies the caller; the scope picks which
    // tokens to invalidate. On success the server returns 204 No Content
    // (our request<T>() helper handles empty-body responses by treating
    // anything 2xx-without-JSON as void).
    await this.request<void>('POST', '/api/fitness/auth/revoke', opts);
    // Clear the local token regardless of scope so the next cold start
    // routes through login. For 'this_device' or 'all_devices' scopes the
    // local clear is required; for 'this_token' it's still the right call
    // because we just invalidated the one we have.
    await this.tokenStore.clearToken();
  }

  /** GET /api/fitness/auth/me — cold-start check. */
  async getSession(): Promise<SessionState> {
    return this.request<SessionState>('GET', '/api/fitness/auth/me');
  }

  // §2 Daily sync (the hot path) ──────────────────────────────────────────

  /** GET /api/fitness/sync/daily — read self's daily aggregates over a range. */
  async getDailyAggregates(opts: { from: string; to: string }): Promise<{
    from: string;
    to: string;
    entries: HealthEntry[];
  }> {
    // Server expects query params, not a body.
    const qs = new URLSearchParams({ from: opts.from, to: opts.to }).toString();
    return this.request<{ from: string; to: string; entries: HealthEntry[] }>(
      'GET',
      `/api/fitness/sync/daily?${qs}`,
    );
  }

  /** POST /api/fitness/sync/daily — idempotent upsert by (userId, date). */
  async syncDailyAggregates(entries: HealthEntryUpload[]): Promise<{
    accepted: number;
    rejected: Array<{ index: number; code: string; message: string }>;
    serverTime: number;
  }> {
    return this.request<{
      accepted: number;
      rejected: Array<{ index: number; code: string; message: string }>;
      serverTime: number;
    }>('POST', '/api/fitness/sync/daily', { entries });
  }

  // §3 Friends & leaderboard ──────────────────────────────────────────────

  /** GET /api/fitness/friends. */
  async getFriends(): Promise<FriendsByStatus> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }

  /**
   * GET /api/fitness/friends/leaderboard?date=YYYY-MM-DD — daily activity
   * standings across accepted friends + self.
   *
   * Server returns `{date, rows: LeaderboardRow[], myStepGoal, myCalorieGoal}`
   * sorted by step count desc with ties sharing rank. Self always present;
   * is flagged via `isMe: true`.
   */
  async getLeaderboard(opts: { date: string }): Promise<Leaderboard> {
    const qs = new URLSearchParams({ date: opts.date }).toString();
    return this.request<Leaderboard>(
      'GET',
      `/api/fitness/friends/leaderboard?${qs}`,
    );
  }

  /** POST /api/fitness/friends/request. */
  async requestFriend(opts: { targetEmail: string }): Promise<{
    friendshipId: string;
    status: 'pending';
  }> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }

  /** POST /api/fitness/friends/:friendshipId/accept. */
  async acceptFriend(friendshipId: string): Promise<{
    status: 'accepted';
    acceptedAt: number;
  }> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }

  /** POST /api/fitness/friends/:friendshipId/decline — deletes the row. */
  async declineFriend(friendshipId: string): Promise<void> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }

  /** DELETE /api/fitness/friends/:friendshipId — unfriend. */
  async unfriend(friendshipId: string): Promise<void> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }

  /** POST /api/fitness/friends/:friendshipId/block. */
  async blockFriend(friendshipId: string): Promise<{
    status: 'blocked';
    blockedAt: number;
  }> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }

  // §4 Goals ──────────────────────────────────────────────────────────────

  /** GET /api/fitness/goals — currently active goals (max 4). */
  async getGoals(): Promise<{ goals: Goal[] }> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }

  /** GET /api/fitness/goals/history. */
  async getGoalsHistory(opts?: {
    period?: GoalPeriod;
    metric?: GoalMetric;
    limit?: number;
  }): Promise<{ goals: ArchivedGoal[] }> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }

  /** PUT /api/fitness/goals — create-or-update for a (period, metric) pair. */
  async upsertGoal(opts: {
    period: GoalPeriod;
    metric: GoalMetric;
    target: number;
  }): Promise<{ id: string; status: 'active'; created: boolean }> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }

  /** DELETE /api/fitness/goals/:goalId — archives, doesn't delete. */
  async archiveGoal(goalId: string): Promise<void> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }

  // §5 Devices ────────────────────────────────────────────────────────────

  /** GET /api/fitness/devices. */
  async getDevices(): Promise<{ devices: FitnessDevice[] }> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }

  /** POST /api/fitness/devices/:deviceId/primary. */
  async setPrimaryDevice(deviceId: string): Promise<{ id: string; status: 'primary' }> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }

  /** DELETE /api/fitness/devices/:deviceId — revokes device + its tokens. */
  async revokeDevice(deviceId: string): Promise<void> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }

  // §6 Subscription state (read-only) ─────────────────────────────────────

  /** GET /api/fitness/subscription. */
  async getSubscription(): Promise<SubscriptionStatus> {
    throw new ApiClientError({ code: 'bad_request', message: 'not_implemented' }, 400);
  }
}
