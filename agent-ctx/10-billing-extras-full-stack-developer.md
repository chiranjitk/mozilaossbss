# Task 10-billing-extras — Work Record

## Summary

Built 7 billing/operations extension features for the Cryptsk OSS/BSS platform.
All features follow the project's vertical-slice architecture (UI → API →
audit → DB → seed). Each feature exposes a tenant-scoped REST API guarded by
`requireModulePermission` and a server-rendered page wrapped in
`AuthenticatedLayout`.

## Files Created (26 new files)

### Module catalog & icon resolver
- `src/core/modules/catalog.ts` — added 5 billing nav entries (grace-periods,
  add-ons, top-ups, charge-overrides, credit-notes) + 2 operations nav entries
  (referrals, loyalty). No new permissions needed (reuses `billing.invoice.*`,
  `billing.voucher.*`, `ops.complaint.*`).
- `src/components/common/icon-resolver.ts` — registered 6 new icons
  (`CalendarClock`, `Zap`, `SlidersHorizontal`, `FileMinus`, `Gift`, `Award`).

### APIs (14 route files across 7 resources)
1. `src/app/api/v1/grace-periods/route.ts` — GET (paginated, subscriber join) + POST
2. `src/app/api/v1/grace-periods/[id]/route.ts` — PATCH + DELETE
3. `src/app/api/v1/add-on-services/route.ts` — GET + POST
4. `src/app/api/v1/add-on-services/[id]/route.ts` — GET + PATCH + DELETE
5. `src/app/api/v1/top-ups/route.ts` — GET + POST
6. `src/app/api/v1/top-ups/[id]/route.ts` — PATCH + DELETE
7. `src/app/api/v1/charge-overrides/route.ts` — GET + POST
8. `src/app/api/v1/charge-overrides/[id]/route.ts` — PATCH + DELETE
9. `src/app/api/v1/credit-notes/route.ts` — GET + POST (with invoice existence
   check and amount-vs-invoice-total validation)
10. `src/app/api/v1/credit-notes/[id]/route.ts` — GET + PATCH (no DELETE —
    credit notes are immutable financial records; cancelled status is the
    equivalent)
11. `src/app/api/v1/referrals/route.ts` — GET + POST (code uniqueness,
    referrer/referee validation)
12. `src/app/api/v1/referrals/[id]/route.ts` — PATCH + DELETE
13. `src/app/api/v1/loyalty/route.ts` — GET (joins with subscribers since
    LoyaltyMember.subscriberId is a global @unique without a relation)
14. `src/app/api/v1/loyalty/[id]/route.ts` — GET + PATCH (auto-bumps
    totalEarned when points are added)

### Pages (7 pages × 2 files = 14 files)
1. `src/app/billing/grace-periods/page.tsx` + `grace-periods-client.tsx`
2. `src/app/billing/add-ons/page.tsx` + `add-ons-client.tsx`
3. `src/app/billing/top-ups/page.tsx` + `top-ups-client.tsx`
4. `src/app/billing/charge-overrides/page.tsx` + `charge-overrides-client.tsx`
5. `src/app/billing/credit-notes/page.tsx` + `credit-notes-client.tsx`
6. `src/app/operations/referrals/page.tsx` + `referrals-client.tsx`
7. `src/app/operations/loyalty/page.tsx` + `loyalty-client.tsx`

### Seed data (`prisma/seed.ts` — appended a new section)
- 4 grace periods (1 expired, 1 cancelled, 2 active)
- 5 add-on services (1 disabled, 4 active; flat / per_day / per_gb / per_month)
- 5 top-ups across data / time / speed_boost (1 used, 1 expired, 1 cancelled,
  2 active)
- 4 charge overrides (3 active discounts/surcharges, 1 expired discount;
  percentage + flat)
- 3 credit notes against the seeded INV-2025-0001 (applied / issued / cancelled)
- 5 referral codes (RAHUL50, PRIYA15PCT, AMITFREEMONTH, SUMMER25, OLDCODE99)
- 3 loyalty members (gold / silver / bronze with realistic point totals)

## Architecture & Patterns

- All API handlers use `apiRoute` wrapper + `requireModulePermission` +
  `recordAudit` + `parsePagination` from established core modules.
- All mutations write to the audit log with `oldValue` / `newValue` JSON.
- All lists are tenant-scoped (`tenantId: ctx.tenantId`).
- All pages use `AuthenticatedLayout` + `DataTable` + `StatusBadge` +
  `PageHeader` from established components.
- Forms share a single component between create and edit (keyed on id for
  clean re-mount), per existing project pattern.
- For models without an explicit Prisma relation (GracePeriod, TopUp,
  ChargeOverride, LoyaltyMember → Subscriber), the API joins by fetching
  subscribers in a single query and merging client-side.
- Credit notes enforce immutability: only `status` and `reason` can be
  patched. Backend validates that amount cannot exceed invoice total.
- Loyalty auto-tracks `totalEarned` when points are added (delta computation
  server-side).
- Referrals support null referrer/referee (open codes).
- Charge overrides cap percentage value at 100% (validated client-side and
  server-side).

## Verification

- `bun run lint` passes with **0 errors**.
- `bun run db:seed` runs cleanly and is idempotent (all new seed writes
  check for existing records by unique key before creating).
- Dev server healthy across all 7 new pages and 14 new API routes.
- E2E smoke test (via curl, logged in as admin):
  - GET all 7 list endpoints → HTTP 200, returned seeded counts (4/5/5/4/3/5/3)
  - POST all 5 create endpoints → HTTP 201 with audit-trail entries
  - GET + PATCH + DELETE add-on-services/[id] → 200/200/200
  - DELETE top-ups + charge-overrides → 200/200
  - PATCH credit-notes/[id] → status → cancelled, HTTP 200
  - PATCH referrals/[id] → status → completed, HTTP 200
  - DELETE referrals/[id] → 200
  - GET + PATCH loyalty/[id] → added 100 points, totalEarned auto-bumped
    by 100, tier preserved → 200/200
- All test records cleaned up after verification.

## Brand & UI Compliance

- Red accent only (`bg-brand`, `text-brand`) — no indigo/blue.
- Stat tiles use semantic colors (success / warning / info / brand) consistent
  with the rest of the platform.
- Mobile-responsive grids (2 cols mobile, 4 cols desktop).
- All forms include inline icons + contextual hints (computed end date,
  reward preview, points delta warning).
- AlertDialog with destructive styling on every delete action.
- Toast notifications via sonner for every mutation.
- DataTable server-side pagination + search preserved.

## What's Next

The Phase 10-era features (billing extras + operations extras + AAA extras)
are now complete. The recommended next phase is Production Hardening:
- E2E Playwright tests for the new flows.
- Performance audit (N+1 query review on list endpoints that join subscribers).
- Backup & restore verification (current Backup API is a row-count stub).
