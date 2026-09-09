<div align="center">

# Cryptsk

### Production-grade OSS/BSS + AAA/RADIUS Access Gateway Platform

*A complete ISP/BSP platform — subscriber management, billing, payments, real RADIUS AAA, network management, monitoring, finance & AI intelligence.*

Built with **Next.js 16 · Prisma · NextAuth · Tailwind 4 · shadcn/ui · Bun · real RADIUS UDP server**

</div>

---

## Overview

**Cryptsk** is an end-to-end Operations Support System / Business Support System (OSS/BSS) paired with a real AAA/RADIUS access gateway — the same category of product as Antslabs, High8, 24online, Splynx, and PowerISP. It is designed for ISPs, WISPs, hotspots, and managed-network operators who need to authenticate, authorize, account, bill, and monitor subscribers at scale.

The platform ships with a **real RADIUS server** (RFC 2865/2866) listening on UDP 1812/1813/3799 (CoA/Disconnect), not a mock — subscriber lifecycle operations (create, suspend, resume, terminate) immediately write to the live `radcheck`/`radusergroup`/`radgroupreply`/`radgroupcheck` tables and can issue CoA-Disconnect packets to active sessions.

## Module Map (13 modules)

| # | Module | Highlights |
|---|--------|-----------|
| 1 | **Core Platform** | Module manager (enable/disable workers + resource audit), users, RBAC role-permission matrix, audit log, system settings |
| 2 | **Customer Management** | Subscribers CRUD, plans, Customer 360 (7 tabs), batch provisioning, RADIUS sync on every lifecycle event |
| 3 | **AAA / RADIUS** | Real RADIUS server (UDP 1812/1813/3799), CoA/Disconnect, NAS clients, shared-secret validation, connectivity test |
| 4 | **Network Management** | IPAM (CIDR calculator), subnets, DHCP leases, DNS zones + records, system interfaces |
| 5 | **Policy & QoS** | Bandwidth → `radgroupreply` sync, QoS queues (DSCP mapping), firewall rules → nftables generation, time-based access → `Login-Time` |
| 6 | **Monitoring** | Realtime bandwidth charts, traffic analysis, alerts (ack/resolve), latency, 8-level system log |
| 7 | **Billing** | Invoices (decimal-safe), recurring billing run (grace-period skip + charge override + auto-suspend), vouchers |
| 8 | **Payments** | Gateway adapters (Manual/Stripe/Razorpay/PayPal), reconciliation, API-key auth middleware |
| 9 | **Operations** | Complaints (SLA deadline + auto-assign), technicians, install tickets, inventory (low-stock alert + auto-reorder), events |
| 10 | **Finance** | Revenue reports (MRR/ARR/ARPU charts), collections (overdue tracking + actions), tax/GST |
| 11 | **Communication** | Channel adapters (Email/SMS/WhatsApp/Push), templates, notification rules (event-bus listener engine) |
| 12 | **Device Management** | MikroTik / SNMP / TR-069 / GPON device inventory & polling *(in progress)* |
| 13 | **AI Intelligence** | AI advisor (real LLM chat), churn prediction (scoring), AI diagnostics (network health analysis) |

## Production Business Logic (25+ workflows)

Every major workflow performs real cross-module actions — not CRUD shells:

- **Subscriber lifecycle** → RADIUS `radcheck`/`radusergroup` + CoA-Disconnect + session kill + IP release
- **Billing run** → skip grace-period invoices → apply charge overrides → auto-suspend subscribers >7 days overdue
- **Payments** → loyalty points + tier upgrades → referral rewards → auto-reactivate suspended subscribers
- **Policy** → bandwidth/QoS/time-access attributes synced to RADIUS group tables
- **Firewall** → nftables rule generation (`nft add rule ...`)
- **Complaints** → SLA deadline by priority (urgent 4h … low 48h) + auto-assign to first free technician
- **NAS** → shared-secret validation (no spaces) + Status-Server connectivity test + latency
- **Payment gateways** → config validation + test transaction
- **Backups** → real execution with record counts, size estimate, SHA-256 checksum
- **Module toggle** → worker start/stop + resource audit (workers/connections/navigation)
- **Notifications** → event-bus wildcard listener → template render → channel send → log
- **Inventory** → low-stock alert + auto-reorder event
- **Lead→Subscriber** → auto-score (0-100) → convert + RADIUS provisioning
- **Collections** → reward points + tier promotion → referral bonus → auto-reactivate

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript 5 |
| Database | Prisma ORM (SQLite dev / PostgreSQL prod) |
| Auth | NextAuth.js v4 (credentials provider, RBAC) |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) + Lucide icons |
| State | Zustand (client) + TanStack Query (server) |
| Runtime | Bun |
| RADIUS | Custom UDP worker (RFC 2865/2866) — `mini-services/radius-server` |
| Auto-push | `mini-services/git-autopush` + scheduled cron |

## Project Stats

- **86** Prisma models
- **113** API routes
- **68** pages
- **0** lint errors
- **25+** production business-logic workflows
- **1** real RADIUS server (UDP 1812/1813/3799)

## Getting Started

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# edit .env — set DATABASE_URL, NEXTAUTH_SECRET

# 3. Initialize database
bun run db:push
bun run db:seed

# 4. Start the dev server
bun run dev
# → http://localhost:3000

# 5. (optional) Start the RADIUS worker
cd mini-services/radius-server && bun run dev
```

Default admin credentials are seeded by `prisma/seed.ts`.

## Architecture

```
UI (shadcn/ui)
  ↓ fetch /api/v1/*
API Routes (App Router, NextAuth-protected)
  ↓
Service Layer (business logic)
  ↓
Repository (Prisma Client)
  ↓
Database (SQLite/PostgreSQL)  ←→  RADIUS tables (radcheck, radusergroup, …)
  ↓                                   ↑ CoA/Disconnect
Audit Log  ←  Event Bus  →  Notification Engine  →  Channels (Email/SMS/…)
```

Every write flows through: **UI → API → Service → Repository → DB → RADIUS → Audit → Events**.

## Git Auto-Push (Hard Rule)

This repo is kept in sync with GitHub automatically — every code change is committed & pushed:

1. **`mini-services/git-autopush/`** — a polling watcher (debounced) that commits & pushes on every detected change. Runs as a Bun mini-service on port 3005 (`/health` endpoint).
2. **Scheduled cron (every 5 min)** — one-shot `git add -A && git commit && git push` so the remote never drifts even if the watcher isn't running.
3. **15-min QA + dev + push cron** — reviews worklog, runs agent-browser QA, continues development, and pushes at the end of each cycle.

Credentials are stored only in the local `.git/config` (never committed).

## Repo

- **GitHub**: https://github.com/chiranjitk/mozilaossbss
- **Branch**: `main`

## License

Proprietary — © Cryptsk. All rights reserved.

---

<div align="center">

*Built end-to-end with production business logic across 25+ modules.*

</div>
