---
type: decision
name: "Mobile payment neutrality — no IAP, web is sole subscription surface"
date_decided: 2026-05-05
status: active
tags: [architecture, mobile, compliance, app-store]
sources: ["[[mobile-sync-architecture]]"]
---

# Mobile payment neutrality

**Definition:** Mobile apps (iOS + Android) are FREE with NO in-app payments. Web (genoly.org/billing) is the sole subscription surface. Server returns `isPaymentNeutral: true` literal as a tripwire.

This is the same decision as documented in `../genoly-family-web/memory-bank/wiki/decisions/mobile-payment-neutrality.md` — but it lives here too because it's THE most-important mobile-side constraint and AI agents working in this repo need to find it without crossing to the web repo.

## The contract

`GET /api/fitness/subscription` returns:
```ts
{
  tier: "free" | "starter" | "pro" | "enterprise",
  expiresAt: number | null,
  isPaymentNeutral: true   // literal
}
```

Hardcoded server-side in `genoly-family-web/convex/fitness/subscription.ts`.

## Mobile-side hard rule

`useSubscription()` hook (per `../genoly-family-web/docs/mobile-sync-architecture.md` §11) THROWS if `isPaymentNeutral` is ever false. Hard fail in dev > App Store rejection in prod.

```ts
export function useSubscription(): SubscriptionStatus | null {
  const sub = useSessionStore(s => s.subscription);
  if (sub && !sub.isPaymentNeutral) {
    throw new Error('Subscription neutrality violation — refusing to render');
  }
  return sub;
}
```

## Allowed UI

- Current tier badge
- Renewal date
- Feature limits
- "Manage subscription" link → `https://genoly.org/billing` (system browser)

## Forbidden UI

- ❌ Plan-comparison tables, pricing
- ❌ "Upgrade Now" buttons
- ❌ Payment forms, Apple Pay, Google Pay, IAP product surfaces
- ❌ Text steering users toward external purchase

"Manage subscription" = acknowledgment (allowed). "Subscribe now" / "Upgrade to Pro" = promotion (banned).

## Why

Apple's 30% cut + anti-steering rules. Same model as Netflix/Spotify. Avoids 30% cost and rejection risk.

## Cross-references

- Mobile architecture §11: `../../../../genoly-family-web/docs/mobile-sync-architecture.md`
- Server-side literal: `../../../../genoly-family-web/convex/fitness/subscription.ts`
- Workspace AGENTS.md §3.6 (shared rule)
- Mobile AGENTS.md §3.1 (hard rule)
- Web repo same decision: `../../../../genoly-family-web/memory-bank/wiki/decisions/mobile-payment-neutrality.md`
