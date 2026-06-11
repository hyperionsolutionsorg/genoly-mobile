/**
 * useMe — the member-side current user (Genoly users:me via the Convex
 * reactive client). Returns undefined while loading, null when signed out.
 *
 * One subscription app-wide is the budget (bandwidth diet): mount this in
 * screens that need identity; Convex dedupes identical subscriptions on
 * the same client, so multiple consumers share one watch.
 */

import { useQuery } from 'convex/react';

import { usersMe, isDemoEmail, isAdminRole, type Me } from '../lib/genolyApi';

export interface UseMeResult {
  me: Me | null | undefined;
  isLoading: boolean;
  isDemo: boolean;
  isAdminOnMobile: boolean;
  emailUnverified: boolean;
}

export function useMe(): UseMeResult {
  const me = useQuery(usersMe, {});
  return {
    me,
    isLoading: me === undefined,
    isDemo: me ? isDemoEmail(me.email) : false,
    isAdminOnMobile: me ? isAdminRole(me.siteRole) : false,
    emailUnverified: me ? me.emailVerified !== true : false,
  };
}
