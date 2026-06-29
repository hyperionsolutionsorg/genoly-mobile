/**
 * planChecks.ts — tenant-plan resolution helpers for mobile.
 *
 * The mobile app enforces a Pro-only gate: users must belong to at least one
 * Pro-plan tenant to access the full app.  This module owns that logic so
 * _layout.tsx stays focused on routing and tests can import it independently.
 *
 * Per the 2026-06-26 plan model decision:
 *   - A user invited to a Pro tenant DOES get mobile access while on that tenant.
 *   - The tree picker surfaces only trees under Pro tenants.
 *   - Downgrade is reactive: when the Convex query flips, the gate fires.
 */

export type TenantPlan = "free" | "starter" | "pro";

export interface TenantSummary {
  _id: string;
  plan: TenantPlan;
}

/** Returns true if any tenant in the list has plan === "pro". */
export function hasAnyProTenant(tenants: TenantSummary[]): boolean {
  return tenants.some((t) => t.plan === "pro");
}

/** Filters a tenant list to Pro-plan tenants only. */
export function filterProTenants(tenants: TenantSummary[]): TenantSummary[] {
  return tenants.filter((t) => t.plan === "pro");
}

/**
 * Grace period (ms) before a hard redirect fires after a Pro tenant is lost.
 * Gives the user time to finish what they're doing when their tenant downgrades.
 */
export const DOWNGRADE_GRACE_MS = 5 * 60 * 1000; // 5 minutes
