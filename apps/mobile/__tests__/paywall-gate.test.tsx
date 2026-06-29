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
