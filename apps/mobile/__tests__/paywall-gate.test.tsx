/**
 * paywall-gate.test.tsx — pure logic tests for the mobile Pro plan gate.
 *
 * These tests cover the planChecks.ts utilities independently of the React
 * tree so they remain fast (no RN component rendering needed).
 *
 * Tests for the AuthGate routing behavior are intentionally omitted — the
 * expo-router component stack requires real-device / Expo Go verification
 * (see testPathIgnorePatterns in jest.config.js for precedent).
 */

import {
  hasAnyProTenant,
  filterProTenants,
  DOWNGRADE_GRACE_MS,
  computeDowngradeDeadline,
  getGraceRemainingMs,
  type TenantSummary,
} from '../lib/planChecks';

const free: TenantSummary = { _id: 'tid1', plan: 'free' };
const starter: TenantSummary = { _id: 'tid2', plan: 'starter' };
const pro: TenantSummary = { _id: 'tid3', plan: 'pro' };

describe('hasAnyProTenant', () => {
  it('returns false for an empty list', () => {
    expect(hasAnyProTenant([])).toBe(false);
  });

  it('returns false when all tenants are Free', () => {
    expect(hasAnyProTenant([free])).toBe(false);
  });

  it('returns false when all tenants are Starter', () => {
    expect(hasAnyProTenant([starter])).toBe(false);
  });

  it('returns false for a mix of Free and Starter', () => {
    expect(hasAnyProTenant([free, starter])).toBe(false);
  });

  it('returns true when at least one tenant is Pro', () => {
    expect(hasAnyProTenant([free, starter, pro])).toBe(true);
  });

  it('returns true for a Pro-only list', () => {
    expect(hasAnyProTenant([pro])).toBe(true);
  });

  it('returns true for multiple Pro tenants', () => {
    const pro2: TenantSummary = { _id: 'tid4', plan: 'pro' };
    expect(hasAnyProTenant([pro, pro2])).toBe(true);
  });
});

describe('filterProTenants', () => {
  it('returns empty array from an empty list', () => {
    expect(filterProTenants([])).toEqual([]);
  });

  it('filters out Free and Starter, keeps Pro', () => {
    const result = filterProTenants([free, starter, pro]);
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe('tid3');
  });

  it('returns all items when all are Pro', () => {
    const pro2: TenantSummary = { _id: 'tid4', plan: 'pro' };
    expect(filterProTenants([pro, pro2])).toHaveLength(2);
  });
});

describe('DOWNGRADE_GRACE_MS', () => {
  it('is 5 minutes', () => {
    expect(DOWNGRADE_GRACE_MS).toBe(5 * 60 * 1000);
  });
});

// F2 regression coverage — 2026-07-09 pro-gating audit: the downgrade grace
// deadline must be anchored ONCE at detection time and must NOT be
// recomputed from "now" on every call, otherwise re-anchoring on each
// re-render (e.g. in-app navigation) would silently extend the grace
// window indefinitely.
describe('computeDowngradeDeadline', () => {
  it('adds exactly DOWNGRADE_GRACE_MS to the detection timestamp', () => {
    const detectedAt = 1_000_000;
    expect(computeDowngradeDeadline(detectedAt)).toBe(detectedAt + DOWNGRADE_GRACE_MS);
  });

  it('is a pure function of its input — same input always yields the same deadline', () => {
    const detectedAt = 42;
    expect(computeDowngradeDeadline(detectedAt)).toBe(computeDowngradeDeadline(detectedAt));
  });

  it('does not depend on when it is called (only on the detection timestamp passed in)', () => {
    const detectedAt = 5_000;
    const first = computeDowngradeDeadline(detectedAt);
    // Simulate time passing / a later re-render re-deriving the deadline
    // from the SAME anchor timestamp — must be identical, not "now + grace".
    const second = computeDowngradeDeadline(detectedAt);
    expect(second).toBe(first);
  });
});

describe('getGraceRemainingMs', () => {
  it('returns the full grace window when now equals the detection time', () => {
    const detectedAt = 10_000;
    const deadline = computeDowngradeDeadline(detectedAt);
    expect(getGraceRemainingMs(deadline, detectedAt)).toBe(DOWNGRADE_GRACE_MS);
  });

  it('shrinks linearly as time passes toward the deadline', () => {
    const detectedAt = 10_000;
    const deadline = computeDowngradeDeadline(detectedAt);
    const halfwayElapsed = detectedAt + DOWNGRADE_GRACE_MS / 2;
    expect(getGraceRemainingMs(deadline, halfwayElapsed)).toBe(DOWNGRADE_GRACE_MS / 2);
  });

  it('is zero exactly at the deadline', () => {
    const deadline = computeDowngradeDeadline(0);
    expect(getGraceRemainingMs(deadline, deadline)).toBe(0);
  });

  it('clamps to zero once the deadline has already passed (never negative)', () => {
    const deadline = computeDowngradeDeadline(0);
    expect(getGraceRemainingMs(deadline, deadline + 60_000)).toBe(0);
  });

  it('recomputing remaining time from the same fixed deadline at different "now"s never resets past the anchor', () => {
    // This is the crux of the F2 fix: if an effect re-runs multiple times
    // (e.g. because a navigation-driven re-render fired it again) but the
    // deadline itself is unchanged, each recomputed "remaining" must keep
    // shrinking toward the SAME original deadline — never jump back up to
    // a fresh full grace window.
    const detectedAt = 100_000;
    const deadline = computeDowngradeDeadline(detectedAt);

    const remainingAtT1 = getGraceRemainingMs(deadline, detectedAt + 1_000);
    const remainingAtT2 = getGraceRemainingMs(deadline, detectedAt + 2_000);

    expect(remainingAtT2).toBeLessThan(remainingAtT1);
    expect(remainingAtT1).toBeLessThanOrEqual(DOWNGRADE_GRACE_MS);
  });
});
