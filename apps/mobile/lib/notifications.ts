/**
 * notifications.ts — challenge-notification SCAFFOLDING (brief §6.6).
 *
 * The gating logic (master toggle, quiet hours, per-category daily caps)
 * is real and tested; the TRANSPORT is a __DEV__ log statement until the
 * operator has push/notification credentials (hard constraint: never
 * auto-fire notifications during development). When expo-notifications
 * is configured, swap `deliver()` for a scheduleNotificationAsync call —
 * nothing else changes.
 */

import {
  getNotificationsEnabled,
  getNotificationCount,
  setNotificationCount,
} from '../utils/preferences';

export type NotificationCategory =
  | 'goal_progress' // "1,000 steps to your daily goal!"
  | 'overtaken' // "You've been passed on the leaderboard"
  | 'challenge_invite' // "A new challenge invites you"
  | 'challenge_result'; // "The challenge ended — see the results"

const MAX_PER_DAY_PER_CATEGORY = 3;
const QUIET_START_HOUR = 22; // 10pm user-local
const QUIET_END_HOUR = 7; // 7am user-local

export function isQuietHours(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

function isoDayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export interface NotifyResult {
  delivered: boolean;
  reason?: 'disabled' | 'quiet_hours' | 'capped';
}

/**
 * Gate + (scaffold-)deliver a local notification.
 * All opt-in: master toggle default ON but user-controlled in Settings.
 */
export async function notify(
  category: NotificationCategory,
  title: string,
  body: string,
  now: Date = new Date(),
): Promise<NotifyResult> {
  if (!(await getNotificationsEnabled())) {
    return { delivered: false, reason: 'disabled' };
  }
  if (isQuietHours(now)) {
    return { delivered: false, reason: 'quiet_hours' };
  }
  const day = isoDayUtc(now.getTime());
  const count = await getNotificationCount(category, day);
  if (count >= MAX_PER_DAY_PER_CATEGORY) {
    return { delivered: false, reason: 'capped' };
  }
  await setNotificationCount(category, day, count + 1);
  deliver(category, title, body);
  return { delivered: true };
}

/**
 * Transport. SCAFFOLD: log-only (constraint — no live notifications
 * until the operator provisions APNs/FCM credentials). Replace the body
 * with expo-notifications' scheduleNotificationAsync at that point.
 */
function deliver(category: NotificationCategory, title: string, body: string): void {
  if (__DEV__) {
    console.log(`[notify:${category}] ${title} — ${body}`);
  }
}
