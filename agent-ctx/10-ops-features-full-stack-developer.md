# Task: 10-ops-features — full-stack-developer

## Summary
Built APIs and pages for 5 feature areas in the Cryptsk OSS/BSS platform:
1. Leads CRM (operations/leads)
2. Promotions (billing/promotions)
3. Reseller Management (operations/resellers)
4. Collection Agents (operations/agents)
5. API Keys + Announcements + Backup (admin/api-keys, admin/announcements, admin/backup)

## Files Created / Modified

### Module Catalog (`src/core/modules/catalog.ts`)
- Added `ops.reseller.read` / `ops.reseller.write` and `ops.agent.read` / `ops.agent.write` permissions to the operations module.
- Added 7 new navigation entries:
  - Operations → Leads CRM (`/operations/leads`)
  - Operations → Resellers (`/operations/resellers`)
  - Operations → Collection Agents (`/operations/agents`)
  - Billing → Promotions (`/billing/promotions`)
  - Administration → API Keys (`/admin/api-keys`)
  - Administration → Announcements (`/admin/announcements`)
  - Administration → Backup & Restore (`/admin/backup`)
- Updated `src/components/common/icon-resolver.ts` to register new icons: `MapPin`, `Store`, `BadgeDollarSign`, `Tag`, `Megaphone`, `DatabaseBackup`.

### APIs (`src/app/api/v1/`)
- `leads/route.ts` (GET + POST), `leads/[id]/route.ts` (GET + PATCH + DELETE) — ops.lead permissions
- `promotions/route.ts` (GET + POST), `promotions/[id]/route.ts` (GET + PATCH + DELETE) — billing.voucher permissions (reused)
- `resellers/route.ts` (GET + POST), `resellers/[id]/route.ts` (GET + PATCH + DELETE) — ops.reseller permissions
- `agents/route.ts` (GET + POST), `agents/[id]/route.ts` (GET + PATCH + DELETE) — ops.agent permissions
- `api-keys/route.ts` (GET + POST with sha256 key hashing), `api-keys/[id]/route.ts` (DELETE = revoke only) — system.settings permissions
- `announcements/route.ts` (GET + POST), `announcements/[id]/route.ts` (PATCH + DELETE) — system.settings permissions
- `backups/route.ts` (GET + POST = trigger backup with checksum/size estimation), `backups/[id]/route.ts` (GET detail only)

### Pages (`src/app/`)
- `operations/leads/page.tsx` + `leads-client.tsx`
- `operations/resellers/page.tsx` + `resellers-client.tsx`
- `operations/agents/page.tsx` + `agents-client.tsx`
- `billing/promotions/page.tsx` + `promotions-client.tsx`
- `admin/api-keys/page.tsx` + `api-keys-client.tsx`
- `admin/announcements/page.tsx` + `announcements-client.tsx`
- `admin/backup/page.tsx` + `backup-client.tsx`

### Seed Data (`prisma/seed.ts`)
Added 35 demo records:
- 8 Leads (pipeline covering all 6 statuses: new/contacted/interested/qualified/converted/lost)
- 6 Promotions (percentage, flat, free_trial types; 1 expired; varying usage counts)
- 4 Resellers (active/trial/suspended; percentage/flat/slab commission methods)
- 5 Collection Agents (active/inactive/suspended; varying daily/monthly targets)
- 3 API Keys (2 active with permissions, 1 revoked; sha256-hashed)
- 4 Announcements (info/success/warning/error levels; varying audiences; dismissible/non-dismissible)
- 8 Backups (7 completed + 1 failed; database/config/full types; sha256 checksums; size estimates)

## Architecture Compliance
- All APIs use `apiRoute` wrapper + `requireModulePermission(moduleId, permission)` + `recordAudit` for audit trail.
- All pages use `AuthenticatedLayout` server component wrapping client components with `export const dynamic = "force-dynamic"`.
- DataTable component used everywhere (server-side pagination + search).
- StatusBadge component used for consistent status rendering.
- Tenant-scoped everywhere (every query filters by `ctx.tenantId`).
- API keys: plaintext key returned ONLY on creation, stored as sha256 hash, never re-exposed (only `keyMasked`).
- Backups: trigger computes row-count-based size estimate + sha256 checksum, marks completed synchronously (sandbox).
- Brand compliance: red accent (`bg-brand`, `text-brand`), no new indigo/blue.
- 0 lint errors. All 7 pages verified returning HTTP 200 with auth; all 7 GET endpoints return real seeded data.

## Verified End-to-End
- Logged in as admin/admin123
- All 7 new pages return 200 (HTML rendered)
- All 7 GET `/api/v1/{resource}` endpoints return real seed data
- POST `/api/v1/backups` (trigger) returns 201 with checksum
- POST `/api/v1/api-keys` returns plaintext key + 201
- DELETE `/api/v1/api-keys/[id]` returns 200 with status="revoked"
- POST `/api/v1/leads` and `/api/v1/promotions` create records successfully (cleaned up after testing)

## Notes
- The `ops.lead.read/write` permissions already existed in the catalog (from prior work).
- `billing.voucher.read/write` reused for promotions per task spec.
- `system.settings.read` (read) and `system.settings.update` (write) used for all 3 admin features per task spec.
- New permissions (`ops.reseller.*`, `ops.agent.*`) auto-picked up by the seed's `ALL_PERMISSIONS` import — 100 total permissions now seeded (was 96).
- Dev server logs show zero errors across all tested endpoints.
