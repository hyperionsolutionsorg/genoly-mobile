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

/**
 * Computes the absolute epoch-ms deadline for the downgrade grace period,
 * anchored at the moment a downgrade is first detected.
 *
 * Callers must compute this exactly ONCE per downgrade event and reuse the
 * returned deadline across re-renders/navigation. Recomputing it on every
 * render (e.g. `Date.now() + DOWNGRADE_GRACE_MS` inline in an effect with a
 * large dependency array) is the bug this helper exists to prevent: an
 * unrelated re-render — such as a route change — must not push the eviction
 * time further into the future.
 */
export function computeDowngradeDeadline(detectedAtMs: number): number {
  return detectedAtMs + DOWNGRADE_GRACE_MS;
}

/**
 * Remaining ms until a previously computed downgrade deadline, clamped to
 * zero. Used to (re)schedule the eviction timer from the fixed deadline
 * rather than from a fresh full grace window, so the timer stays correct
 * even if the effect that owns it re-runs for unrelated reasons.
 */
export function getGraceRemainingMs(deadlineMs: number, nowMs: number): number {
  return Math.max(0, deadlineMs - nowMs);
}
