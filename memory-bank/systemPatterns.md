# System Patterns — fitness

**Last Updated:** 2026-05-02

---

## Critical Rules

1. **Git identity:** `Genoly Projects <git@hyperionsolutions.org>` — per-repo only
2. **No Co-Authored-By** Claude/Anthropic trailers in commits
3. **Health sync code stays in `packages/health-sync/` only** — never in app screens
4. **Never commit secrets** — API tokens and keys in environment config only
5. **`packages/` changes trigger both CI workflows** — test both apps before merging

---

## Module Separation Rule (Most Important)

```
✅ CORRECT
packages/health-sync/healthkit.ts    ← reads HealthKit data
packages/health-sync/sync.ts         ← posts to API
apps/mobile/screens/StatusScreen.tsx ← shows last sync time (UI only)

❌ WRONG
apps/mobile/screens/StatusScreen.tsx ← reads HealthKit AND shows UI
```

Why: `packages/health-sync` will eventually be imported by Genoly mobile.
If health reading code is tangled with fitness app UI, extraction becomes painful.

---

## Sync Pattern

```
Background fetch triggers (every ~60 min)
  → packages/health-sync reads today's totals from HealthKit / Health Connect
  → packages/api-client POSTs to Convex HTTP endpoint
  → Convex upserts health_entry for (userId, date)
  → Web dashboard updates in real time via Convex reactive query
```

- Always **upsert by (userId, date)** — not append. Mobile can POST multiple times safely.
- Store **daily totals only** — not raw granular events.
- Each user has an **API token** stored in the mobile app for authenticating syncs.

---

## Future Genoly Integration (when the time comes)

The path is clean:
1. Publish `packages/health-sync` as a private npm package, OR
2. Copy `packages/health-sync` into the Genoly mobile app directly

No restructuring of the fitness monorepo needed either way.
Design Convex schema with `tenant_id` optional from day one so multi-tenancy can be added without migration.

---

## Design Principles

- Fun and motivating — not clinical
- Mobile-first web layout (friends will check on phones)
- Steps + calories clearly visible at a glance, no scrolling needed
- Consistent visual style with Genoly (CSS variables, warm colors, responsive)
