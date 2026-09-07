# Cryptsk OSS/BSS — Master Worklog

> Single source of truth for all agents working on Cryptsk.
> Read this before starting work. Append (never overwrite) when finishing a task.

## Project Identity
- **Product**: Cryptsk — Universal OSS/BSS + AAA/RADIUS Access Gateway
- **Reference products**: Antslabs, High8, 24online (ISP/BSP platforms)
- **Architecture authority**: `/home/z/my-project/upload/Cryptsk_OSS_BSS_MASTER_ARCHITECTURE_FINAL.md`
- **Stack**: Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind 4 · shadcn/ui · Prisma + SQLite (dev) / PostgreSQL-ready · NextAuth v4 · TanStack Query/Table · React Hook Form · Zod · Recharts · next-intl · Bun

## Non-Negotiable Rules
1. NO prototypes, NO hardcoded dashboard data, NO fake payment/auth success.
2. Modular Monolith + Selective Workers (NOT microservices).
3. Disabled modules MUST consume ~0 runtime (no workers, no nav, no polling, no connections).
4. Brand: Red (accent only) / Black / White / Neutral. NO teal/green branding.
5. 4 GB RAM sandbox — phase-by-phase, no concurrent heavy processes.
6. Business logic NEVER in React components, page files, or API handlers. Layer: UI → API → Application Service → Domain → Repository.
7. Server-side pagination everywhere. Never load huge datasets into the browser.
8. Backend enforces RBAC. Frontend only reflects/hides.
9. UTC internally, display in tenant/user timezone. Decimal-safe money.
10. Every feature must be a real vertical slice (UI → API → Service → Domain → Repo → DB → Events → Tests → E2E).

## Phase Plan
- Phase 0 — Foundation ← IN PROGRESS
- Phase 1 — Core Platform (RBAC, Audit, Module Manager UI, Notifications, System Health)
- Phase 2 — Customer Management (Subscribers, Plans, Customer 360, Lifecycle)
- Phase 3 — AAA ⭐ (RADIUS server, NAS, Active Sessions, Session History, CoA, Disconnect)
- Phase 4 — Network (NAS devices, IPAM, DHCP, DNS, PPPoE, MultiWAN)
- Phase 5 — Policy (Bandwidth, QoS, Time Access, Firewall, Security Profiles)
- Phase 6 — Monitoring (Active sessions, bandwidth, traffic, alerts, diagnostics)
- Phase 7 — Billing (Invoices, recurring/cyclic, grace, suspension, vouchers, tax)
- Phase 8 — Payments (Gateway abstraction, adapters, reconciliation, refunds)
- Phase 9 — Operations (Complaints, technicians, installations, inventory, incidents, leads)
- Phase 10 — Device Management (TR-069, MikroTik, SNMP, SSH, GPON/OLT)
- Phase 11 — Finance & Intelligence (Revenue, forecasting, collections, GST, SLA)
- Phase 12 — Communication (Email, SMS, WhatsApp, templates, rules)
- Phase 13 — AI (Advisor, Diagnosis, Churn prediction — optional, never blocks core)
- Phase 14 — Production Hardening (Security audit, performance, backup, E2E)

---
Task ID: 0-init
Agent: lead-architect
Task: Initialize worklog, inspect existing project, plan Phase 0.

Work Log:
- Read the full 3,619-line architecture document.
- Inspected existing project: clean Next.js 16 scaffold with full shadcn/ui component set, Prisma+SQLite (minimal User/Post schema), NextAuth v4 available, TanStack Query/Table, Recharts, next-intl, framer-motion installed.
- Current `src/app/page.tsx` is a placeholder (Z.ai logo) — will be replaced with the real Cryptsk dashboard.
- Current `prisma/schema.prisma` has only User/Post — will be rebuilt with tenant-aware Cryptsk foundation schema.

Stage Summary:
- Project is a greenfield — no business logic exists yet. Phase 0 will establish: design tokens, Prisma schema, module registry, event bus, repository base, API conventions, auth foundation, app shell, and real dashboard with KPIs from the DB.
- Next: build Phase 0 foundation files.
