# CRYPTSKINTELLIGENT ISP Platform — Complete Product Documentation

**Version:** v6.4  
**Platform:** Full-stack ISP Management System  
**Last Updated:** Generated from source code analysis

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [Complete Menu Structure](#4-complete-menu-structure)
5. [Data Model](#5-data-model)
6. [API Route Documentation](#6-api-route-documentation)
7. [Business Rules & Workflows](#7-business-rules--workflows)
8. [Cross-Cutting Patterns](#8-cross-cutting-patterns)
9. [Integration Points](#9-integration-points)
10. [Test Credentials](#10-test-credentials)

---

## 1. Executive Summary

### 1.1 Platform Overview

CRYPTSKINTELLIGENT (branded "Cryptsk") is a comprehensive, end-to-end ISP (Internet Service Provider) management platform designed for Indian ISPs. It covers the complete lifecycle from subscriber acquisition through billing, network management, field operations, and AI-powered intelligence.

### 1.2 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend Framework** | Next.js (App Router) | 16.1.1 |
| **UI Library** | React | 19.0.0 |
| **Styling** | Tailwind CSS | 4.x |
| **Component Library** | shadcn/ui (Radix UI) | Latest |
| **State Management** | Zustand | 5.0.6 |
| **Server State** | TanStack Query | 5.82.0 |
| **Forms** | React Hook Form + Zod | 7.60.0 / 4.0.2 |
| **Backend** | Next.js API Routes | 16.1.1 |
| **ORM** | Prisma | 6.19.2 |
| **Database** | SQLite (dev) / PostgreSQL 18 (prod) | — |
| **Authentication** | Custom HMAC-SHA256 session tokens | — |
| **Password Hashing** | bcryptjs | 3.0.3 |
| **Runtime** | Bun / Node.js | — |
| **Charts** | Recharts | 2.15.4 |
| **Maps** | Leaflet / React-Leaflet | 1.9.4 |
| **Icons** | Lucide React | 0.525.0 |
| **Testing** | Vitest + Testing Library | 4.1.4 |
| **SMS** | MSG91 |
| **Email** | Nodemailer (SMTP) | 8.0.5 |
| **Payment** | Razorpay + Stripe |
| **WhatsApp** | Business API |
| **Network** | SNMP (net-snmp), SSH2, ros-client (MikroTik) |
| **VPN** | WireGuard |
| **Monitoring** | Grafana integration |

### 1.3 Scale Metrics

| Metric | Count |
|--------|-------|
| **API Route Files** | 479 route.ts files |
| **API Route Groups** | 80+ endpoint groups |
| **Database Models** | 140+ Prisma models |
| **Enumerations** | 90+ enums |
| **Menu Items** | 100+ sidebar navigation items |
| **Navigation Sections** | 11 sections |
| **UI Components** | 50+ shadcn/ui components |
| **Dashboard Widgets** | 27 data points |
| **Platform Modules** | 17 modules |
| **Deployment Presets** | 7 presets |
| **Mini-Services** | 10+ background services |
| **Pages** | 80+ page components |
| **Seed Data** | 12 users, 40 subscribers, 18 devices, 32 invoices, 38 payments, 25 complaints, 10 plans, 10 areas, 5 technicians, 4 agents |

---

## 2. System Architecture

### 2.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (React 19 SPA)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  Next.js 16  │  │  Tailwind 4  │  │  shadcn/ui         │  │
│  │  App Router  │  │  Styling     │  │  Component Library  │  │
│  └──────┬──────┘  └──────────────┘  └────────────────────┘  │
│         │                                                      │
│  ┌──────┴──────────────────────────────────────────────────┐ │
│  │  Zustand (Client State) + TanStack Query (Server State) │ │
│  └──────────────────────┬─────────────────────────────────┘ │
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTP/REST
┌─────────────────────────┼───────────────────────────────────┐
│              NEXT.JS API ROUTES (Server)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │  Auth     │  │  CRUD    │  │  Billing │  │  AI/ML      │  │
│  │  Routes   │  │  Routes  │  │  Routes  │  │  Routes     │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘  │
│       └──────────────┼────────────┼───────────────┘         │
│                      │            │                           │
│  ┌───────────────────┴────────────┴───────────────────────┐ │
│  │  Prisma ORM  ──→  SQLite (dev) / PostgreSQL (prod)    │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
┌────────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐
│  GATEWAY      │ │  MINI-SVC   │ │  EXTERNAL    │
│  SERVICES     │ │  (Bun)      │ │  INTEGRATIONS│
│ ┌────────────┐│ │ ┌──────────┐│ │ ┌──────────┐│
│ │ gateway    ││ │ │whatsapp  ││ │ │ Razorpay ││
│ │ service    ││ │ │ bot      ││ │ │ Stripe   ││
│ │ :3005      ││ │ │          ││ │ │ MSG91    ││
│ └────────────┘│ │ │ snmp     ││ │ │ Twilio   ││
│ ┌────────────┐│ │ │ service  ││ │ │ SMTP     ││
│ │ IPS daemon ││ │ │          ││ │ │ WhatsApp ││
│ │ :3030      ││ │ │multiwan  ││ │ │ SNMP     ││
│ └────────────┘│ │ │ monitor  ││ │ │ MikroTik ││
│ ┌────────────┐│ │ │          ││ │ │ Grafana  ││
│ │ nDPI       ││ │ │billing   ││ │ │ WireGuard││
│ │ service    ││ │ │ cron     ││ │ │ FreeRADIUS│
│ │ :3031      ││ │ │          ││ │ └──────────┘│
│ └────────────┘│ │ │network   ││ │              │
│               │ │ │ monitor  ││ │              │
│               │ │ │syslog    ││ │              │
│               │ │ │diameter  ││ │              │
│               │ │ │radius    ││ │              │
│               │ │ └──────────┘│ │              │
└───────────────┘ └─────────────┘ └──────────────┘
```

### 2.2 Frontend Architecture

- **Next.js 16 App Router** — Server and client components
- **React 19** — Latest features including useSyncExternalStore for hydration-safe state
- **Tailwind CSS 4** — Utility-first CSS with `@tailwindcss/postcss`
- **shadcn/ui** — 50+ pre-built accessible UI components built on Radix UI primitives
- **Zustand 5** — Lightweight client state management (auth-store, app-store, module-store, subscriber-auth-store)
- **TanStack Query 5** — Server state management with caching, refetching, and optimistic updates
- **React Hook Form + Zod 4** — Form handling with schema validation
- **Recharts** — Data visualization for dashboard widgets and reports
- **Framer Motion** — Animation library for UI transitions
- **Sonner** — Toast notification system
- **Leaflet** — Map integration for area management and network visualization
- **Command Palette** — Keyboard-driven navigation (cmdk)

### 2.3 Backend Architecture

- **Next.js API Routes** — 479 route handlers across 80+ groups
- **Prisma ORM** — Type-safe database access with 140+ models
- **SQLite** — Development database (file-based, zero config)
- **PostgreSQL 18** — Production database target
- **HMAC-SHA256 Session Tokens** — Custom authentication (Edge-compatible)
- **bcryptjs** — Password hashing
- **CSV Export** — UTF-8 BOM for Excel compatibility

### 2.4 Gateway Services

| Service | Port | Description |
|---------|------|-------------|
| `gateway-service` | 3005 | Main network gateway — TC/QoS, DHCP, DNS, firewall, captive portal management |
| `ips-daemon` | 3030 | Intrusion Prevention System — nDPI-based detection, auto-blocking with nftables |
| `ndpi-service` | — | Deep Packet Inspection — L7 application identification |
| `diameter-service` | — | Diameter protocol simulator for WiFi Offload (Gy/Gx/SWa) |

### 2.5 Mini-Services

All mini-services run on Bun runtime:

| Service | Description |
|---------|-------------|
| `whatsapp-bot` | WhatsApp Business API integration with bot commands, quick replies, templates |
| `snmp-service` | SNMP polling engine for network device monitoring |
| `multiwan-monitor` | Multi-WAN link monitoring, failover detection, bandwidth tracking |
| `gateway-service` | Network gateway controller (TC/QoS, DHCP, DNS, firewall) |
| `radius-service` | RADIUS user provisioning and accounting |
| `billing-cron` | Automated billing cycle generation and invoicing |
| `network-monitor` | Network device health monitoring |
| `syslog-service` | Centralized syslog collection and analysis |
| `diameter-service` | Diameter protocol simulation for carrier-grade WiFi |
| `ips-daemon` | Intrusion prevention with real-time threat detection |
| `ndpi-service` | Deep packet inspection and application awareness |

### 2.6 Module System

The platform uses a modular architecture with 17 modules across 7 categories:

| Category | Modules |
|----------|---------|
| **core** | Core Platform (always loaded, cannot be disabled) |
| **network** | Network Infrastructure, IPv6 Support, WiFi Offload |
| **gateway** | Gateway Controller |
| **operations** | Field Operations |
| **finance** | Finance Suite |
| **ai** | Voice Assistant, AI Intelligence |
| **addon** | Service Integrations, IPS, App Awareness, Traffic Analytics, QoS Monitor, Latency Monitor, Enterprise LDAP |

Core modules (19 pages) are protected and cannot be disabled. All other modules can be toggled via the Module Manager.

---

## 3. Authentication & Authorization

### 3.1 Dual Auth System

The platform maintains two separate authentication systems:

| System | Cookie Name | Token Type | Purpose |
|--------|-------------|------------|---------|
| **Admin Auth** | `cryptsk_session` | `{uid, iat, exp}` | Admin panel access |
| **Subscriber Auth** | `cryptsk_subscriber_session` | `{uid, type:"subscriber", iat, exp}` | Self-care portal access |

Both use HMAC-SHA256 signing with the same `SESSION_SECRET` but separate cookie names to prevent cross-portal session collision. Subscriber tokens include a `type: "subscriber"` discriminator to prevent admin token forgery.

### 3.2 Session Token Format

```
base64url(payload).base64url(hmac_sha256_signature)
```

**Payload structure (Admin):**
```json
{
  "uid": "clx...",
  "iat": 1718000000,
  "exp": 1718604800
}
```

**Payload structure (Subscriber):**
```json
{
  "uid": "clx...",
  "type": "subscriber",
  "iat": 1718000000,
  "exp": 1718604800
}
```

- **Expiry:** 7 days (`604800` seconds)
- **Signing:** HMAC-SHA256 using Web Crypto API (Edge-compatible)
- **Secret:** `SESSION_SECRET` env var (min 16 chars, random fallback in dev)
- **Cookie flags:** `httpOnly=true`, `secure=true` (production), `sameSite=lax`, `path=/`

### 3.3 Password Policy

Configured via `IspSettings` singleton:

| Setting | Default | Description |
|---------|---------|-------------|
| `passwordMinLength` | 8 | Minimum password length |
| `passwordRequireUppercase` | false | Require at least one uppercase letter |
| `passwordRequireLowercase` | true | Require at least one lowercase letter |
| `passwordRequireNumbers` | true | Require at least one number |
| `passwordRequireSpecial` | false | Require at least one special character |
| `passwordExpiryDays` | 90 | Days until password expires |

### 3.4 Brute-Force Protection

- **Enabled in production only** — disabled in development for testing convenience
- **Max failed attempts:** 5 (configurable via `maxLoginAttempts`)
- **Lockout duration:** 15 minutes (`15 * 60 * 1000` ms)
- **Captcha trigger:** After 3 failed attempts (configurable via `captchaAfterAttempts`)
- **Lockout duration setting:** 30 minutes (`lockoutDurationMinutes`)
- Implementation uses in-memory `Map<email, {count, lockedUntil}>`
- Failed attempts are cleared on successful login
- Lockout state resets on server restart (in-memory storage)

### 3.5 Account Status Gates

Login is blocked for users with non-ACTIVE status:

| Status | Error Message |
|--------|--------------|
| `LOCKED` | "Account is locked. Contact administrator." |
| `INACTIVE` | "Account is inactive. Contact administrator." |
| `SUSPENDED` | "Account is suspended. Contact administrator." |

Only `ACTIVE` users can authenticate. Session verification also checks `user.status !== 'ACTIVE'`.

### 3.6 RBAC System

#### 3.6.1 Role Hierarchy

7 roles with numeric permission levels (higher = more permissions):

| Role | Level | Description |
|------|-------|-------------|
| `SUPER_ADMIN` | 100 | Full system access, user management, system settings |
| `ADMIN` | 80 | Full operational access, no user delete |
| `OPERATOR` | 60 | Day-to-day operations, no delete, limited create |
| `TECHNICIAN` | 40 | Field operations, complaint updates, equipment |
| `AGENT` | 30 | Collection, read-only on most resources |
| `VIEWER` | 10 | Read-only access to all resources |
| `CUSTOMER` | 5 | Self-service portal, own data only |

#### 3.6.2 Permission Matrix

| Resource | SUPER_ADMIN | ADMIN | OPERATOR | TECHNICIAN | AGENT | VIEWER | CUSTOMER |
|----------|:-----------:|:-----:|:--------:|:----------:|:-----:|:------:|:--------:|
| **Subscribers** | CRUD | CRUD | CRU | R | R | R | R:own |
| **Plans** | CRUD | CRUD | R | R | — | R | — |
| **Invoices** | CRUD | CRUD | CRU | R | R | R | R:own |
| **Payments** | CRUD+Verify | CRUD+Verify | CRU | — | RC | R | R:own |
| **Complaints** | CRUD+Assign | CRUD+Assign | CRU+Assign | RU | — | R | R:own+C |
| **Network** | CRUD+Backup | CRUD+Backup | R | R | — | R | — |
| **Areas** | CRUD | CRUD | R | R | R | R | — |
| **Users** | CRUD | CRU | R | — | — | — | — |
| **Settings** | RU | RU | R | — | — | — | — |
| **Reports** | R+Export | R+Export | R | — | R | R | — |
| **Technicians** | CRUD | CRU | R | — | — | — | — |
| **Agents** | CRUD | CRU | R | — | — | — | — |
| **Equipment** | CRUD | CRUD | R | RU | — | — | — |
| **Installations** | CRUD | CRU | CRU | RU | — | — | — |
| **Vouchers** | CRUD | CRU | RC | — | — | — | — |
| **Promotions** | CRUD | CRU | R | — | — | — | — |
| **Dashboard** | R | R | R | R | R | R | — |

*Legend: C=Create, R=Read, U=Update, D=Delete*

#### 3.6.3 Permission Checks

Three levels of permission checking available:

```typescript
// Level 1: Authentication only
const userId = await requireAuth(request);

// Level 2: Authentication + specific permission
const userId = await requirePermission(request, 'subscribers.create');

// Level 3: Role-level minimum check
if (hasMinRole(userRole, 'OPERATOR')) { /* ... */ }
```

Permission strings follow `resource.action` format:
- `subscribers.read`, `subscribers.create`, `subscribers.update`, `subscribers.delete`
- `payments.verify` — Special permission for payment verification
- `complaints.assign` — Special permission for complaint assignment
- `network.backup` — Special permission for network backup operations
- `reports.export` — Special permission for data export
- `subscribers.read:own` — Own-data scope for subscriber self-care

Wildcard matching: `subscribers.*` matches any subscriber permission.

### 3.7 Auth Helper Functions

| Function | Description |
|----------|-------------|
| `requireAuth(request)` | Returns userId or throws 401 |
| `optionalAuth(request)` | Returns userId or null (no error) |
| `requirePermission(request, permission)` | Auth + RBAC check, throws 401/403 |
| `getUserRole(request)` | Returns `{userId, role, status}` |
| `withAuth(handler)` | Higher-order wrapper for authenticated handlers |
| `login(email, password)` | Authenticates credentials |
| `getUserById(id)` | Retrieves user by ID |
| `hasRole(role, required)` | Exact role match check |
| `hasMinRole(role, required)` | Minimum role level check |
| `isAdmin(role)` | SUPER_ADMIN or ADMIN |
| `isSuperAdmin(role)` | SUPER_ADMIN only |
| `isStaff(role)` | Any internal role except CUSTOMER |

---

## 4. Complete Menu Structure

Extracted from `src/components/layout/sidebar.tsx`. 11 sections, 100+ menu items. Items are dynamically filtered based on the enabled modules via `isPageEnabled()`.

### 4.1 MAIN (7 items)

| Item | Route | Icon | Description |
|------|-------|------|-------------|
| Dashboard | `/` | LayoutDashboard | Main dashboard with 27 KPI widgets |
| Subscribers | `/subscribers` | Users | Subscriber CRM management |
| 360° Customer View | `/subscriber-360` | Eye | Unified customer view |
| Plans | `/plans` | CreditCard | Plan management and analytics |
| Plan Recommendations | `/plan-recommendations` | Sparkles | AI-powered plan suggestions |
| Billing | `/billing` | Receipt | Billing operations |
| Payments | `/payments` | Wallet | Payment management |

### 4.2 NETWORK (6 items)

| Item | Route | Icon | Module |
|------|-------|------|--------|
| Devices | `/devices` | Router | network-infra |
| MultiWAN | `/multiwan` | Globe | network-infra |
| IPAM | `/ipam` | MapPinned | network-infra |
| Sessions | `/sessions` | MonitorDot | network-infra |
| Dynamic Routing | `/dynamic-routing` | Activity | network-infra |
| Network Health | `/network-health` | Heart | network-infra |

### 4.3 SERVICES (14 items)

| Item | Route | Icon | Module |
|------|-------|------|--------|
| TR-069 ACS | `/tr069-acs` | MonitorSmartphone | services |
| MikroTik Manager | `/mikrotik-manager` | Router | services |
| SSH Device Manager | `/ssh-device-manager` | TerminalIcon | services |
| SNMP Manager | `/snmp-manager` | Activity | services |
| AAA/RADIUS | `/aaa-radius` | ShieldCheck | network-infra |
| Hotspot | `/hotspot` | Wifi | network-infra |
| FTTH/GPON | `/ftth-gpon` | Network | network-infra |
| Enterprise Auth | `/enterprise-auth` | Building2 | enterprise-ldap |
| WiFi Offload | `/wifi-offload` | Radio | wifi-offload |
| RADIUS Proxy | `/radius-proxy` | Radio | network-infra |
| RADIUS Attributes | `/radius-attributes` | Sliders | network-infra |
| CoA Tracking | `/coa-tracking` | RefreshCw | network-infra |
| Tech Performance | `/technician-performance` | Trophy | — |
| Network Health | `/network-health` | Heart | — |

### 4.4 SECURITY (7 items)

| Item | Route | Icon | Module |
|------|-------|------|--------|
| Firewall Rules | `/firewall` | ShieldAlert | gateway |
| IPS / Anomaly Detection | `/ips` | ScanEye | ips |
| VPN Server | `/vpn-server` | Lock | services |
| DDoS Protection | `/ddos-protection` | ShieldAlert | gateway |
| Security Profiles | `/security` | Shield | gateway |
| NAT Logs | `/nat-logs` | FileSearch | gateway |
| Network Alerts | `/network-alerts` | Siren | network-infra |

### 4.5 GATEWAY (7 items)

| Item | Route | Icon | Module |
|------|-------|------|--------|
| Bandwidth Mgmt | `/bandwidth-mgmt` | Gauge | gateway (required) |
| System Interfaces | `/system-interfaces` | Server | gateway |
| PPPoE Server | `/pppoe-server` | Cable | gateway |
| DHCP Server | `/dhcp` | Server | gateway |
| DHCPv6 Server | `/dhcpv6` | Globe | ipv6 |
| DNS Server | `/dns` | Globe | gateway |
| Captive Portal | `/captive-portal` | Lock | gateway |

### 4.6 MONITORING (14 items)

| Item | Route | Icon | Module |
|------|-------|------|--------|
| Bandwidth | `/bandwidth` | Activity | network-infra |
| Traffic Analytics | `/traffic-analytics` | BarChart3 | traffic-analytics |
| BW Reports | `/bw-reports` | BarChart3 | network-infra |
| App Awareness | `/app-awareness` | ScanEye | app-awareness |
| QoS Monitor | `/qos-monitor` | Gauge | qos-monitor |
| Diagnostic Tools | `/diagnostic-tools` | TerminalIcon | network-infra |
| Speed Test | `/speed-test` | Zap | services |
| Uptime Monitor | `/uptime-monitor` | Eye | services |
| Latency Monitor | `/latency-monitor` | Timer | latency-monitor |
| Syslog Server | `/syslog-server` | Scroll | services |
| Grafana Dashboards | `/grafana-dashboards` | BarChart3 | services |
| Zone Budgets | `/zone-budgets` | PieChart | network-infra |
| Time Access | `/time-access` | Timer | network-infra |
| IP-MAC History | `/ip-mac-history` | FileSearch | network-infra |

### 4.7 OPERATIONS (11 items)

| Item | Route | Icon | Badge |
|------|-------|------|-------|
| Complaints | `/complaints` | AlertTriangle | destructive (open count) |
| Technicians | `/technicians` | Wrench | — |
| Agents | `/agents` | UserCog | — |
| Installations | `/installations` | PackagePlus | — |
| Inventory | `/inventory` | Boxes | — |
| Incidents | `/incidents` | Siren | — |
| Leads | `/leads` | UserPlus | — |
| Reseller | `/reseller` | Handshake | — |
| Batch Provisioning | `/batch-provisioning` | UserPlus | — |
| Action History | `/action-history` | ClipboardList | — |
| Announcements | `/announcements` | Megaphone | — |

### 4.8 BUSINESS (1 item)

| Item | Route | Icon |
|------|-------|------|
| Reseller Intelligence | `/reseller-analytics` | BarChart3 |

### 4.9 FINANCE (20 items)

| Item | Route | Icon |
|------|-------|------|
| Invoices | `/invoices` | FileText |
| Vouchers | `/vouchers` | Ticket |
| Reports | `/reports` | ClipboardList |
| Revenue Reports | `/revenue-reports` | TrendingUp |
| Revenue Forecast | `/revenue-forecast` | BarChart3 |
| Collection | `/collection` | HandCoins |
| Due Recovery | `/due-recovery` | DollarSign |
| GST/Tax | `/gst-tax` | Calculator |
| Referral | `/referral` | Gift |
| Loyalty Gamification | `/loyalty-gamification` | Trophy |
| Charge Override | `/charge-override` | DollarSign |
| Cyclic Billing | `/cyclic-billing` | RotateCcw |
| Grace Periods | `/grace-periods` | Clock |
| Add-on Services | `/add-on-services` | PackagePlus |
| Top-Ups | `/top-ups` | PlusCircle |
| Smart Collections | `/smart-collections` | Target |
| Revenue Leakage | `/revenue-leakage` | AlertTriangle |
| Compliance & SLA | `/compliance-sla` | ShieldCheckIcon |
| Data Export | `/data-export` | FileSpreadsheet |

### 4.10 AI INTELLIGENCE (7 items)

| Item | Route | Icon | Badge |
|------|-------|------|-------|
| AI Advisor | `/ai-advisor` | Brain | — |
| AI Diagnosis | `/ai-diagnosis` | Stethoscope | — |
| Churn Alerts | `/churn-alerts` | AlertCircle | destructive |
| Churn Prediction | `/churn-prediction` | BrainCircuit | — |
| Competitor Intel | `/competitor-intel` | Radar | — |
| Competitor Analysis | `/competitor-analysis` | GitCompare | — |
| WhatsApp Bot | `/whatsapp-bot` | MessageCircle | — |

### 4.11 SETTINGS (14 items)

| Item | Route | Icon | Required |
|------|-------|------|----------|
| Dashboard Widgets | `/dashboard-widgets` | LayoutDashboard | Yes (core) |
| ISP Profile | `/isp-profile` | Building2 | Yes (core) |
| Users | `/users` | UserCircle | Yes (core) |
| Areas | `/areas` | MapPin | Yes (core) |
| Equipment | `/equipment` | HardHat | Yes (core) |
| Promotions | `/promotions` | Megaphone | Yes (core) |
| Notifications | `/notifications` | Bell | Yes (core, secondary badge) |
| API Keys | `/api-keys` | KeyRound | Yes (core) |
| Audit Log | `/audit-log` | ScrollText | Yes (core) |
| Backup | `/backup` | DatabaseBackup | Yes (core) |
| Integrations | `/integrations` | Plug | Yes (core) |
| Knowledge Base | `/knowledge-base` | BookOpen | Yes (core) |
| Module Manager | `/module-manager` | Layers | Yes (core) |

---

## 5. Data Model

### 5.1 Model Count: 140+ models across all domains

### 5.2 Core Models

#### User
- **Table:** `User`
- **ID:** `cuid()` (primary key)
- **Unique fields:** `email`
- **Indexes:** `[email]`, `[role]`, `[status]`
- **Relations:** Technician (1:1), CollectionAgent (1:1), AuditLog[], Payment[], Notification[], UserSession[], Incident[], Refund[], CreditNote[], NetworkAlert[], AlertComment[], ComplaintComment[], Dispute[], RecoveryEscalation[], GeneratedLegalNotice[]
- **Key fields:** id, email, name, password (bcrypt), phone, role (UserRole), status (UserStatus), avatarUrl, twoFactorEnabled, twoFactorSecret, assignedAreaIds (Json), lastLoginAt, createdAt, updatedAt

#### IspSettings (Singleton)
- **Table:** `IspSettings`
- **ID:** Fixed `"default"` — only one row exists
- **Key configuration groups:**
  - Company info: companyName, tagline, logo, address, city, state, pincode, phone, email, website, gstin, panNumber, cinNumber
  - Branding: primaryColor, currency (default "INR"), timezone, language, dateFormat
  - RADIUS: radiusServerIp, radiusServerPort, radiusSecret
  - Password policy: passwordMinLength, passwordRequireUppercase/Lowercase/Numbers/Special, passwordExpiryDays
  - Brute-force: maxLoginAttempts (5), lockoutDurationMinutes (30), captchaAfterAttempts (3)
  - Billing: gracePeriodDays (5), lateFeeType (PERCENTAGE), lateFeeValue (2), invoicePrefix ("INV"), customerCodePrefix ("CRY")
  - Tax: defaultCgstRate (9), defaultSgstRate (9), defaultIgstRate (18), taxType (INTRA_STATE), taxInclusive, compositeScheme, compositeSchemeRate (6)
  - SMTP: smtpHost, smtpPort, smtpUser, smtpPass, smtpFromEmail
  - SMS: smsGateway, smsAuthKey, smsSenderId
  - WhatsApp: whatsappApiToken, whatsappPhoneNumberId, whatsappEnabled, whatsappAutoReply, whatsappGreetingMessage, whatsappAwayMessage, whatsappBusinessName/Category/Address/Email/Phone/Website/About, whatsappWebhookConfig
  - Payment: razorpayKeyId, razorpayKeySecret, paymentGatewayMode
  - Captive Portal: captivePortalEnabled, captivePortalName, captivePortalWelcome, captivePortalLoginMethod, captivePortalSessionTimeout (86400), captivePortalBandwidthLimit, captivePortalRedirectUrl, captivePortalTos, captivePortalAllowedHosts
  - Gateway: gatewayModeEnabled (master switch), tcRootBandwidthDownMbps/UpMbps, tcAutoRestoreOnBoot, tcDefaultUnshapedDownMbps/UpMbps
  - Complaint escalation: complaintEscalationEnabled, complaintEscalationLevel1Percent (75), complaintEscalationLevel2Percent (100), complaintEscalationRole1/Role2
  - Invoice numbering: invoiceNumberPadding (4), invoiceStartNumber (1001), invoiceSeparator ("-"), invoiceAutoReset (NEVER)
  - Loyalty: pointsExpiryDays (365), pointsAutoExpiry
  - Audit: auditRetentionDays (90), auditAutoDelete
  - Monitoring: grafanaUrl, grafanaApiKey
  - Backup: backupSettings (Json), cloudBackupConfig (Json), encryptionKey
  - Commission: commissionConfig (Json)
  - KPI: kpiTargets (Json)
  - Custom: hsnCodes (Json), loadBalancingConfig (Json), bandwidthThresholds (Json), churnWorkflowConfig (Json), escalationPathConfig (Json)

#### Subscriber
- **Table:** `Subscriber`
- **ID:** `cuid()` (primary key)
- **Unique fields:** `code`, `serviceUsername`
- **Indexes:** `[code]`, `[phone]`, `[areaId]`, `[planId]`, `[status]`, `[serviceUsername]`, `[radiusGroupId]`, `[status, createdAt]`, `[areaId, status]`, `[planId, status]`, `[macAddress]`
- **Key fields:** id, code (unique customer code e.g., "CRY1001"), name, email, phone, altPhone, address, areaId, landmark, pincode, planId, connectionType (ConnectionType), status (SubscriberStatus), serviceUsername (RADIUS login, unique), servicePassword, ipType, ipAddress, macAddress, assignedDeviceId, gstin, panNumber, kycAadhaarNumber, kycDocPath, profilePhotoPath, kycVerified, activationDate, billingStartDate, balance, routerRented, routerSerial, routerDeposit, currentSpeedDown, currentSpeedUp, currentCycleDataUsed, radiusGroupId (override), sessionTimeout, idleTimeout, lastAuthAt, lastAuthResult, radiusEnabled, ipStackType (IPV4_ONLY/DUAL_STACK/IPV6_ONLY), ipv6Address, ipv6Prefix, ipv6PrefixLength, ipv6Duid, ipv6AssignmentMode, ipv6PoolId
- **30+ relations:** Plan, Area, RadiusGroup, invoices[], payments[], complaints[], usageLogs[], notifications[], installations[], assignedEquipment[], vouchers[], referralCode, loyaltyMember[], chargeOverrides[], billingCycles[], gracePeriods[], addOns[], actionHistory[], topUpPurchases[], timeAccessPolicies[], ipMacHistories[], radiusAttributes[], coaEvents[], disputes[], paymentPlans[], recoveryEscalations[], recoverySlas[], legalNotices[], tdsEntries[], portalSessions[], dataUsage[], ipsAlerts[], ipsBlockRules[]

#### Plan
- **Table:** `Plan`
- **Unique fields:** auto-generated `id`
- **Indexes:** `[category]`, `[status]`, `[sortOrder]`, `[groupId]`
- **Key fields:** id, name, description, category (PlanCategory: FTTH/WIRELESS/CABLE/LEASED_LINE/HOTSPOT/COMBO), downloadSpeed (Kbps), uploadSpeed, speedUnit (KBPS/MBPS/GBPS), downloadSpeedFup, uploadSpeedFup, dataLimitGb, priceMonthly, priceQuarterly, priceHalfYearly, priceYearly, installationCharge, securityDeposit, routerRental, validityDays (30), cgstPercent (9), sgstPercent (9), igstPercent (0), contentionRatio, burstSpeed, burstDuration, maxConcurrentSessions (1), freeTrialDays, slaUptime (99.5), status (PlanStatus: ACTIVE/ARCHIVED/HIDDEN/COMING_SOON), isPopular, sortOrder, groupId (auto-linked RADIUS group), ipv6Enabled, ipv6PrefixDelegation, ipv6DefaultPoolId, ipv6AssignmentMode

#### Invoice
- **Table:** `Invoice`
- **Unique fields:** `invoiceNumber`
- **Indexes:** `[invoiceNumber]`, `[subscriberId]`, `[status]`, `[issueDate]`, `[dueDate]`, `[subscriberId, status]`, `[status, issueDate]`, `[status, dueDate]`
- **Key fields:** id, invoiceNumber (unique, e.g., "INV2025000001"), subscriberId, planId, issueDate, dueDate, periodStart, periodEnd, description, subtotal, cgstAmount, sgstAmount, igstAmount, totalTax, totalAmount, discountType (PERCENTAGE/FLAT), discountValue, discountAmount, lateFee, advanceAdjustment, grandTotal, paidAmount, balanceAmount, status (DRAFT/SENT/PAID/PARTIALLY_PAID/OVERDUE/CANCELLED/CREDIT_NOTE), paymentMode, paidAt, receiptNumber, notes, isProRata, proRataDays, recurringTemplateId, cgstRate, sgstRate, igstRate, reverseCharge, tdsRate, tdsAmount, tdsDeducted

#### InvoiceLineItem
- **Cascade delete on invoice removal**
- **Fields:** id, invoiceId, description, quantity, rate, amount, sortOrder

#### Payment
- **Table:** `Payment`
- **Indexes:** `[subscriberId]`, `[invoiceId]`, `[transactionRef]`, `[status]`, `[createdAt]`, `[subscriberId, createdAt]`, `[status, createdAt]`
- **Key fields:** id, subscriberId, invoiceId, amount, paymentMode (CASH/UPI/ONLINE/BANK_TRANSFER/CHEQUE/WALLET), transactionRef, bankName, chequeNumber, status (PENDING/VERIFIED/FAILED/REFUNDED), collectedById, verifiedById, receiptNumber, notes

#### Complaint
- **Table:** `Complaint`
- **Unique fields:** `ticketNumber`
- **Indexes:** `[ticketNumber]`, `[subscriberId]`, `[areaId]`, `[status]`, `[priority]`, `[status, priority]`, `[areaId, status]`, `[createdAt]`
- **Key fields:** id, ticketNumber (unique, e.g., "TKT2025000001"), subscriberId, areaId, type (ComplaintType), priority (P1_CRITICAL/P2_HIGH/P3_MEDIUM/P4_LOW), description, assignedToId, status (OPEN/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED/REOPENED), slaHours, slaDeadline, walkInName, resolutionNotes, resolvedAt, resolvedById, customerRating (1-5), customerFeedback, aiCategory, aiSeverity, aiProbableCause, aiResolutionGuide, escalationLevel, isSlaPaused, slaPausedAt, slaPausedTotalMs, slaPauseReason

#### NetworkDevice
- **Table:** `NetworkDevice`
- **Indexes:** `[ipAddress]`, `[type]`, `[status]`, `[vendor]`
- **Key fields:** id, name, type (DeviceType: ROUTER/SWITCH/AP/OLT/ONU/SERVER/FIREWALL/GATEWAY/BRIDGE/WIRELESS_BRIDGE/OTHER), vendor (DeviceVendor: 25+ vendors), model, serialNumber, firmwareVersion, ipAddress, port (22), apiPort (8728), username, password, monitorProtocol (SNMP/SNMP_V3/SSH/API/TELNET/HTTP), snmpCommunity, snmpVersion, snmpPort, snmpv3* fields, location, areaId, status (ONLINE/OFFLINE/WARNING/UNKNOWN/MAINTENANCE), lastSeenAt, uptimeSeconds, cpuUsage, memoryUsage, temperature, autoBackup, backupSchedule, backupPath, configLastBackup, tags, maintenanceStart/End/Note, parentId (topology), sortOrder, managementIpv6, ipv6Enabled, ipv6Gateway

### 5.3 Complete Enum Reference

#### User & Auth Enums
| Enum | Values |
|------|--------|
| `UserRole` | SUPER_ADMIN, ADMIN, OPERATOR, AGENT, TECHNICIAN, VIEWER, CUSTOMER |
| `UserStatus` | ACTIVE, SUSPENDED, INACTIVE, LOCKED |

#### Subscriber Enums
| Enum | Values |
|------|--------|
| `ConnectionType` | FTTH, WIRELESS, CABLE, LEASED_LINE, ETHERNET |
| `SubscriberStatus` | ACTIVE, SUSPENDED, DISCONNECTED, TRIAL, PENDING_ACTIVATION |
| `IpType` | DYNAMIC, STATIC |
| `IpStackType` | IPV4_ONLY, DUAL_STACK, IPV6_ONLY |

#### Plan Enums
| Enum | Values |
|------|--------|
| `PlanCategory` | FTTH, WIRELESS, CABLE, LEASED_LINE, HOTSPOT, COMBO |
| `PlanStatus` | ACTIVE, ARCHIVED, HIDDEN, COMING_SOON |
| `SpeedUnit` | KBPS, MBPS, GBPS |

#### Invoice Enums
| Enum | Values |
|------|--------|
| `InvoiceStatus` | DRAFT, SENT, PAID, PARTIALLY_PAID, OVERDUE, CANCELLED, CREDIT_NOTE |
| `PaymentMode` | CASH, UPI, ONLINE, BANK_TRANSFER, CHEQUE, WALLET |
| `PaymentStatus` | PENDING, VERIFIED, FAILED, REFUNDED |
| `DiscountType` | PERCENTAGE, FLAT |
| `LateFeeType` | PERCENTAGE, FLAT |

#### Complaint Enums
| Enum | Values |
|------|--------|
| `ComplaintType` | NO_INTERNET, SLOW_SPEED, CABLE_CUT, WIFI_ISSUE, PLAN_CHANGE, BILLING_QUERY, VOIP_ISSUE, IPTV_ISSUE, NEW_CONNECTION, OTHER |
| `ComplaintPriority` | P1_CRITICAL, P2_HIGH, P3_MEDIUM, P4_LOW |
| `ComplaintStatus` | OPEN, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED, REOPENED |

#### Network Enums
| Enum | Values |
|------|--------|
| `DeviceType` | ROUTER, SWITCH, AP, OLT, ONU, SERVER, FIREWALL, GATEWAY, BRIDGE, WIRELESS_BRIDGE, OTHER |
| `DeviceVendor` | MIKROTIK, CISCO, JUNIPER, HUAWEI, ZTE, VSOL, BDCOM, UBIQUITI, TP_LINK, ARUBA, FORTINET, NOKIA, C_DATA, FIBERHOME, REALTEK, DASAN, ZYXEL, CTC_UNION, O_NET, ABOCOM, RUIJIE, H3C, ZHONE, CALIX, ADTRAN, OTHER |
| `DeviceStatus` | ONLINE, OFFLINE, WARNING, UNKNOWN, MAINTENANCE |
| `MonitorProtocol` | SNMP, SNMP_V3, SSH, API, TELNET, HTTP |
| `InterfaceStatus` | UP, DOWN, DISABLED |
| `InterfaceType` | ETHERNET, SFP, WIRELESS, PON, VIRTUAL |

#### Voucher & Promotion Enums
| Enum | Values |
|------|--------|
| `VoucherStatus` | ACTIVE, USED, EXPIRED, CANCELLED |
| `PromoType` | PERCENTAGE, FLAT, FREE_TRIAL |
| `PromoStatus` | ACTIVE, EXPIRED, DEPLETED |

#### Notification Enums
| Enum | Values |
|------|--------|
| `NotificationType` | SMS, WHATSAPP, EMAIL, PUSH, IN_APP |
| `NotificationCategory` | BILL_DUE, PAYMENT_CONFIRM, DATA_USAGE, PLAN_CHANGE, OUTAGE, MAINTENANCE, WELCOME, OTHER |
| `NotificationStatus` | PENDING, SENT, FAILED, DELIVERED, READ |

#### Equipment Enums
| Enum | Values |
|------|--------|
| `EquipmentCategory` | ROUTER, ONT, SWITCH, AP, CABLE, SPLITTER, ANTENNA, UPS, PATCH_CORD, OLT, POWER_SUPPLY, OTHER |
| `EquipmentCondition` | NEW, GOOD, DAMAGED, DEAD |
| `EquipmentStatus` | IN_STOCK, DEPLOYED, RETURNED, DECOMMISSIONED |

#### Installation Enum
| Enum | Values |
|------|--------|
| `InstallationStatus` | SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW |

#### RADIUS Enums
| Enum | Values |
|------|--------|
| `ProxyServerType` | AUTH, ACCT, BOTH |
| `PacketAction` | ADD, MODIFY, DELETE |
| `PacketType` | AUTH_REQ, ACCT_REQ, COA_REQ, COA_ACK, DISCONNECT_REQ |
| `RadiusAttrType` | CHECK, REPLY, BOTH |
| `RadiusAttrDataType` | STRING, INTEGER, IP_ADDRESS, OCTETS |
| `CoaType` | PLAN_CHANGE, BANDWIDTH_CHANGE, SESSION_DISCONNECT, SESSION_TIMEOUT, FAP_TRIGGER, TOPUP_APPLY |
| `CoaStatus` | REQUESTED, SUCCESS, FAILED, TIMEOUT |

#### Billing Enums
| Enum | Values |
|------|--------|
| `BillingCycleType` | HOURLY, DAILY, WEEKLY, MONTHLY |
| `GracePeriodType` | PRE_BILLING, POST_BILLING |
| `GracePeriodStatus` | ACTIVE, SUSPENDED, CANCELLED, EXPIRED |
| `AddOnChargeType` | FLAT, PER_DAY, PER_GB, PER_MONTH |
| `SubscriberAddOnStatus` | ACTIVE, EXPIRED, CANCELLED |

#### Action History Enum
| Enum | Values |
|------|--------|
| `UserActionType` | PLAN_CHANGE, PLAN_ASSIGN, RENEWAL, SUSPEND, ACTIVATE, PLAN_UPGRADE, PLAN_DOWNGRADE, FAP_TRIGGER, TOPUP_APPLY, REVERSAL, PRICE_OVERRIDE, GRACE_APPLY, NOTE_ADD |

#### Finance Enums
| Enum | Values |
|------|--------|
| `ChargeOverrideStatus` | ACTIVE, EXPIRED, CANCELLED |
| `TopUpType` | DATA, TIME, SPEED_BOOST |
| `TopUpStatus` | ACTIVE, USED, EXPIRED, CANCELLED |
| `TimeAccessAction` | ALLOW, BLOCK, RATE_LIMIT |
| `LeadSource` | WEBSITE, WHATSAPP, REFERRAL, WALK_IN, CALL, SOCIAL_MEDIA, OTHER |
| `LeadStatus` | NEW, CONTACTED, INTERESTED, QUALIFIED, CONVERTED, LOST |
| `ResellerStatus` | ACTIVE, SUSPENDED, TRIAL |
| `CommissionMethod` | PERCENTAGE, FLAT, SLAB |
| `RecurringSchedule` | DAILY, WEEKLY, MONTHLY |

#### Gateway Platform Enums
| Enum | Values |
|------|--------|
| `IfaceRole` | WAN, LAN, UNASSIGNED |
| `IfaceType` | PHYSICAL, VLAN, BRIDGE, BOND, ALIAS, VIRTUAL |
| `DhcpLeaseState` | ACTIVE, EXPIRED, RELEASED, ABANDONED |
| `PortalLoginMethod` | RADIUS, VOUCHER, CLICK_TO_CONTINUE, MAC_AUTH, SOCIAL |
| `PortalTemplate` | HOTEL, CAFE, AIRPORT, RESORT, CORPORATE, ISP_DEFAULT, CUSTOM |
| `PortalSessionStatus` | ACTIVE, EXPIRED, DISCONNECTED, DATA_CAP_REACHED, ADMIN_DISCONNECT |
| `DnsRecordType` | A, AAAA, CNAME, MX, TXT, SRV |
| `SyslogProtocol` | UDP, TCP, TLS |
| `FirewallAction` | ACCEPT, DROP, REJECT, LOG, DNAT, SNAT, MASQUERADE |
| `FirewallRuleStatus` | ACTIVE, DISABLED, SCHEDULED |
| `SecurityFeature` | ARP_PROTECTION, DHCP_SNOOPING, CLIENT_ISOLATION, PORT_SECURITY, STORM_CONTROL |
| `NatMode` | NONE, MASQUERADE, SNAT_POOL, ROUND_ROBIN, ONE_TO_ONE |
| `AppRuleAction` | ALLOW, BLOCK, RATE_LIMIT, SHAPE |
| `AppRuleScope` | GLOBAL, PLAN, SUBSCRIBER, IP_RANGE |
| `WidgetCategory` | NETWORK, BILLING, SUBSCRIBER, SYSTEM, CUSTOM |
| `BatchJobStatus` | PENDING, IN_PROGRESS, COMPLETED, FAILED, CANCELLED |

#### Purchase Order & Repair Enums
| Enum | Values |
|------|--------|
| `PurchaseOrderStatus` | DRAFT, SUBMITTED, APPROVED, ORDERED, RECEIVED, CANCELLED |
| `RepairStatus` | SUBMITTED, DIAGNOSED, REPAIRING, COMPLETED, UNREPAIRABLE |
| `AdjustmentReason` | CORRECTION, DAMAGED, RETURN, AUDIT, OTHER |
| `WarehouseStatus` | ACTIVE, INACTIVE |
| `ReturnStatus` | PENDING_INSPECTION, INSPECTED, REPAIRED, SCRAPPED, RESTOCKED |
| `ReturnCondition` | GOOD, FAIR, POOR |
| `EqRepairType` | HARDWARE, FIRMWARE, PHYSICAL, ELECTRICAL, OTHER |
| `EqRepairStatus` | REPORTED, DIAGNOSED, REPAIRING, COMPLETED, CANCELLED |
| `TdsEntryType` | TDS, TCS |
| `TdsEntryStatus` | DEDUCTED, DEPOSITED, PENDING |

### 5.4 Key Constraints

- **Unique constraints:** User.email, Subscriber.code, Subscriber.serviceUsername, Plan.id, Invoice.invoiceNumber, Complaint.ticketNumber, RadiusGroup.name, Voucher.code, ApiKey.key, SystemInterface.name, Vlan.vlanId, Warehouse.id, Reseller.code, PurchaseOrder.orderNumber, IpamSnapshot.snapshotDate (unique date)
- **Cascade deletes:** InvoiceLineItem (on Invoice), DeviceInterface (on NetworkDevice), RadiusSession (on RadiusUser), ComplaintComment (on Complaint), UsageLog (on Subscriber), Installation feedback (on Installation), StockTransfer equipment relation, various child entities
- **SetNull on delete:** AuditLog.user, CreditNoteInvoice (via SetNull), TDS entries
- **Composite unique:** AttendanceRecord `[technicianId, date]`

### 5.5 Seed Data Summary

The seed script (`prisma/seed.ts`) populates:

| Entity | Count | Details |
|--------|-------|---------|
| IspSettings | 1 | Singleton: "Cryptsk ISP", Indore, MP |
| Areas | 10 | Vijay Nagar, Palasia, MG Road, Bhawarkuan, etc. |
| Plans | 10 | 5 Cable + 3 FTTH + 1 Wireless + 1 Leased Line |
| Users | 12 | 3 system + 5 technicians + 4 agents |
| Technicians | 5 | With skills, areas, ratings, salary |
| Collection Agents | 4 | With daily/monthly targets, commission |
| Network Devices | 18 | OLTs, switches, routers, ONUs, APs, firewall |
| Subscribers | 40 | Various statuses (ACTIVE, SUSPENDED, DISCONNECTED, TRIAL, PENDING_ACTIVATION) |
| Complaints | 25 | Various types, priorities, statuses |
| Payments | 38 | Mix of CASH, UPI, ONLINE, BANK_TRANSFER, CHEQUE |
| Invoices | 32 | With line items, tax calculations |
| Notifications | 18 | SMS, WhatsApp, Email, In-App |

---

## 6. API Route Documentation

### 6.1 AUTH Routes

#### POST `/api/auth/login`
- **Auth:** None (public)
- **Request:** `{ email: string, password: string }`
- **Validation:** Both fields required
- **Business Logic:**
  1. Lookup user by email (case-insensitive, trimmed)
  2. Check account status (LOCKED/INACTIVE/SUSPENDED → reject)
  3. Check brute-force lockout (production only)
  4. Verify password with bcrypt
  5. Track failed attempts (production: 5 → 15-min lockout)
  6. Update lastLoginAt on success
  7. Create HMAC-SHA256 session token
  8. Set httpOnly cookie `cryptsk_session`
  9. Audit login attempt (success/failure)
- **Response:** `{ success: true, user: AuthUser }` with Set-Cookie header
- **Errors:** 400 (missing fields), 401 (invalid credentials/locked/inactive)

#### POST `/api/auth/logout`
- **Auth:** Required
- **Business Logic:** Clear session cookie
- **Response:** `{ success: true, message: "Logged out" }`

#### GET `/api/auth/me`
- **Auth:** Required
- **Response:** `{ success: true, user: { id, email, name, role, status, ... } }`
- **Errors:** 401 (not authenticated)

### 6.2 SUBSCRIBER-AUTH Routes (Self-Care Portal)

#### POST `/api/subscriber-auth/login`
- **Auth:** None (public)
- **Request:** `{ username: string, password: string }`
- **Business Logic:** Authenticate by serviceUsername + servicePassword, verify subscriber is ACTIVE
- **Response:** `{ success: true, subscriber: {...} }` with `cryptsk_subscriber_session` cookie

#### GET `/api/subscriber-auth/me`
- **Auth:** Subscriber session (`cryptsk_subscriber_session`)
- **Response:** Subscriber profile data

#### GET `/api/subscriber-auth/service-status`
- **Auth:** Subscriber session
- **Response:** Current service status, plan info, data usage

#### GET `/api/subscriber-auth/plans`
- **Auth:** Subscriber session
- **Response:** Available plans list

#### GET `/api/subscriber-auth/invoices`
- **Auth:** Subscriber session
- **Response:** Subscriber's invoices

#### GET `/api/subscriber-auth/payments`
- **Auth:** Subscriber session
- **Response:** Subscriber's payments

#### GET `/api/subscriber-auth/complaints`
- **Auth:** Subscriber session
- **Response:** Subscriber's complaints

#### GET `/api/subscriber-auth/usage`
- **Auth:** Subscriber session
- **Response:** Data usage history

#### POST `/api/subscriber-auth/speed-test`
- **Auth:** Subscriber session
- **Response:** Speed test results

#### PUT `/api/subscriber-auth/profile`
- **Auth:** Subscriber session
- **Request:** Profile update fields
- **Response:** Updated profile

#### POST `/api/subscriber-auth/password`
- **Auth:** Subscriber session
- **Request:** `{ currentPassword, newPassword }`
- **Response:** Password change confirmation

#### POST `/api/subscriber-auth/logout`
- **Auth:** Subscriber session
- **Response:** Logout confirmation, clear cookie

### 6.3 SUBSCRIBERS Routes

#### GET `/api/subscribers`
- **Auth:** `subscribers.read`
- **Query:** `page`, `limit`, `search`, `status`, `areaId`, `planId`, `connectionType`, `sort`, `order`
- **Response:** `{ subscribers: [...], pagination: { page, limit, total, totalPages } }`

#### POST `/api/subscribers`
- **Auth:** `subscribers.create`
- **Request:** Full subscriber object with name, phone, email, areaId, planId, connectionType, etc.
- **Validation:** Phone regex, required fields
- **Business Logic:**
  1. Generate unique customer code (e.g., `CRY1001`)
  2. Create serviceUsername (e.g., `cry1001@cryptsk`)
  3. Create subscriber record
- **Response:** Created subscriber

#### GET `/api/subscribers/stats`
- **Auth:** `subscribers.read`
- **Response:** `{ total, active, suspended, disconnected, trial, pendingActivation, newThisMonth }`

#### GET `/api/subscribers/expiring`
- **Auth:** `subscribers.read`
- **Response:** Subscribers with expiring plans

#### GET `/api/subscribers/[id]`
- **Auth:** `subscribers.read`
- **Response:** Full subscriber with relations (plan, area, invoices, payments, complaints)

#### GET `/api/subscribers/[id]/360`
- **Auth:** `subscribers.read`
- **Response:** 360° view — subscriber + all related data (invoices, payments, complaints, usage, equipment, action history)

#### GET `/api/subscribers/[id]/balance`
- **Auth:** `subscribers.read`
- **Response:** `{ balance: number }`

#### POST `/api/subscribers/bulk`
- **Auth:** `subscribers.create`
- **Request:** `{ subscribers: [...] }`
- **Response:** Bulk creation results

#### GET `/api/subscribers/export`
- **Auth:** `reports.export`
- **Response:** CSV file with UTF-8 BOM

### 6.4 PLANS Routes

#### GET `/api/plans`
- **Auth:** `plans.read`
- **Query:** `page`, `limit`, `search`, `category`, `status`, `sort`
- **Response:** Paginated plans list

#### POST `/api/plans`
- **Auth:** `plans.create`
- **Business Logic:** Auto-create RADIUS group if not specified
- **Response:** Created plan

#### GET `/api/plans/analytics`
- **Auth:** `plans.read`
- **Response:** Plan distribution, subscriber counts, revenue per plan

#### GET `/api/plans/performance`
- **Auth:** `plans.read`
- **Response:** Plan performance metrics

#### GET `/api/plans/recommend`
- **Auth:** `plans.read`
- **Response:** AI-recommended plans based on usage patterns

#### POST `/api/plans/migrate`
- **Auth:** `subscribers.update`
- **Request:** `{ subscriberIds: [], newPlanId: string }`
- **Business Logic:** Bulk plan migration with RADIUS group update
- **Response:** Migration results

#### PUT `/api/plans/reorder`
- **Auth:** `plans.update`
- **Request:** `{ items: [{ id, sortOrder }] }`
- **Response:** Reorder confirmation

#### GET `/api/plans/[id]`
- **Auth:** `plans.read`
- **Response:** Plan details

#### PUT `/api/plans/[id]`
- **Auth:** `plans.update`
- **Response:** Updated plan

#### DELETE `/api/plans/[id]`
- **Auth:** `plans.delete`
- **Response:** Deletion confirmation

#### GET `/api/plans/optimization`
- **Auth:** `plans.read`
- **Response:** Plan optimization suggestions

### 6.5 INVOICES Routes

#### GET `/api/invoices`
- **Auth:** `invoices.read`
- **Query:** `page`, `limit`, `search`, `status`, `subscriberId`, `dateFrom`, `dateTo`
- **Response:** Paginated invoices

#### POST `/api/invoices`
- **Auth:** `invoices.create`
- **Request:** Invoice creation data with subscriberId, planId, amounts
- **Business Logic:**
  1. Calculate tax: CGST = subtotal × 9%, SGST = subtotal × 9%, IGST = 0%
  2. Calculate: totalTax = cgstAmount + sgstAmount + igstAmount
  3. Calculate: grandTotal = subtotal + totalTax - discountAmount + lateFee - advanceAdjustment
  4. Calculate: balanceAmount = grandTotal - paidAmount
  5. Generate invoice number (e.g., INV2025000001)
  6. Create line items
- **Response:** Created invoice

#### GET `/api/invoices/export`
- **Auth:** `reports.export`
- **Response:** CSV download

#### GET `/api/invoices/export-all`
- **Auth:** `reports.export`
- **Response:** Bulk CSV export

#### POST `/api/invoices/bulk-generate`
- **Auth:** `invoices.create`
- **Request:** `{ subscriberIds: [], periodStart, periodEnd }`
- **Business Logic:** Generate invoices for multiple subscribers at once
- **Response:** Bulk generation results

#### GET `/api/invoices/recurring-templates`
- **Auth:** `invoices.read`
- **Response:** Recurring invoice templates

#### GET `/api/invoices/[id]`
- **Auth:** `invoices.read`
- **Response:** Invoice with line items and payments

#### PUT `/api/invoices/[id]`
- **Auth:** `invoices.update`
- **Response:** Updated invoice

#### DELETE `/api/invoices/[id]`
- **Auth:** `invoices.delete`
- **Response:** Deletion confirmation

#### POST `/api/invoices/[id]/credit-note`
- **Auth:** `invoices.create`
- **Request:** `{ amount, reason, notes }`
- **Business Logic:** Create credit note, reduce invoice balance
- **Response:** Credit note

#### GET `/api/invoices/[id]/credit-notes`
- **Auth:** `invoices.read`
- **Response:** Credit notes for invoice

### 6.6 PAYMENTS Routes

#### GET `/api/payments`
- **Auth:** `payments.read`
- **Query:** `page`, `limit`, `search`, `status`, `mode`, `subscriberId`, `dateFrom`, `dateTo`
- **Response:** Paginated payments

#### POST `/api/payments`
- **Auth:** `payments.create`
- **Request:** `{ subscriberId, amount, paymentMode, transactionRef, ... }`
- **Business Logic:**
  1. Create payment record (status: PENDING)
  2. If linked to invoice, update invoice balance
- **Response:** Created payment

#### POST `/api/payments/refund`
- **Auth:** `payments.update`
- **Request:** `{ paymentId, amount, reason, mode }`
- **Business Logic:** Create refund record, update payment status
- **Response:** Refund confirmation

#### POST `/api/payments/bulk-verify`
- **Auth:** `payments.verify`
- **Request:** `{ paymentIds: [] }`
- **Business Logic:** Bulk verify payments, update invoice balances
- **Response:** Verification results

#### POST `/api/payments/bulk-reject`
- **Auth:** `payments.verify`
- **Request:** `{ paymentIds: [], reason }`
- **Business Logic:** Bulk reject payments
- **Response:** Rejection results

#### GET `/api/payments/revenue-by-mode`
- **Auth:** `payments.read`
- **Response:** Revenue breakdown by payment mode

#### POST `/api/payments/create-order`
- **Auth:** `payments.create`
- **Request:** `{ subscriberId, planId, amount }`
- **Business Logic:** Create Razorpay/Stripe order
- **Response:** Order details with payment gateway credentials

### 6.7 BILLING Routes

#### GET `/api/billing`
- **Auth:** `invoices.read`
- **Query:** `page`, `limit`, `status`, `subscriberId`
- **Response:** Billing records

#### POST `/api/billing`
- **Auth:** `invoices.create`
- **Business Logic:** Generate invoice for subscriber

#### POST `/api/billing/generate`
- **Auth:** `invoices.create`
- **Request:** `{ subscriberIds: [], periodStart, periodEnd }`
- **Business Logic:** Generate invoices with tax calculation

#### POST `/api/billing/send`
- **Auth:** `invoices.update`
- **Request:** `{ invoiceIds: [] }`
- **Business Logic:** Send invoices via configured channels (email/SMS/WhatsApp)

#### POST `/api/billing/record_payment`
- **Auth:** `payments.create`
- **Business Logic:** Record payment and update invoice

#### GET `/api/billing/export`
- **Auth:** `reports.export`
- **Response:** CSV download

#### GET `/api/billing/[id]`
- **Auth:** `invoices.read`
- **Response:** Billing record

### 6.8 COMPLAINTS Routes

#### GET `/api/complaints`
- **Auth:** `complaints.read`
- **Query:** `page`, `limit`, `search`, `status`, `priority`, `type`, `areaId`, `assignedToId`
- **Response:** Paginated complaints

#### POST `/api/complaints`
- **Auth:** `complaints.create`
- **Request:** Complaint data with subscriberId, type, priority, description
- **Business Logic:**
  1. Generate ticket number (e.g., TKT2025000001)
  2. Calculate SLA deadline based on priority SLA hours
  3. Auto-assign if technician available
  4. AI categorization (aiCategory, aiSeverity, aiProbableCause, aiResolutionGuide)
- **Response:** Created complaint

#### GET `/api/complaints/analytics`
- **Auth:** `complaints.read`
- **Response:** Complaint analytics (by type, priority, status, area, resolution time)

#### GET `/api/complaints/export`
- **Auth:** `reports.export`
- **Response:** CSV download

#### POST `/api/complaints/bulk-close`
- **Auth:** `complaints.update`
- **Request:** `{ complaintIds: [], resolutionNotes }`
- **Business Logic:** Bulk close complaints, set resolvedAt

#### GET `/api/complaints/[id]`
- **Auth:** `complaints.read`
- **Response:** Complaint with comments

#### PUT `/api/complaints/[id]`
- **Auth:** `complaints.update`
- **Response:** Updated complaint

#### POST `/api/complaints/[id]/comments`
- **Auth:** `complaints.update`
- **Request:** `{ message: string }`
- **Business Logic:** Add comment with userId and timestamp
- **Response:** Created comment

#### POST `/api/complaints/[id]/auto-assign`
- **Auth:** `complaints.assign`
- **Business Logic:** Auto-assign complaint to best available technician based on:
  1. Area match
  2. Current workload
  3. Skills match
  4. Rating
- **Response:** Assignment confirmation

### 6.9 DASHBOARD Routes

#### GET `/api/dashboard`
- **Auth:** `dashboard.read`
- **Response:** Main dashboard data with all KPIs

#### GET `/api/dashboard/stats`
- **Auth:** `dashboard.read`
- **Response:** Core statistics:
  - totalSubscribers, activeSubscribers, totalRevenue, monthlyRecurringRevenue (MRR)
  - averageRevenuePerUser (ARPU), totalComplaints, openComplaints, churnRate
  - activeDevices, totalDevices, bandwidthUtilization, newSubscribersThisMonth
  - overdueInvoices, totalPayments, collectionRate

#### GET `/api/dashboard/subscriber-growth`
- **Auth:** `dashboard.read`
- **Response:** Monthly subscriber growth trend

#### GET `/api/dashboard/subscriber-analytics`
- **Auth:** `dashboard.read`
- **Response:** Subscriber distribution by area, plan, status

#### GET `/api/dashboard/subscriber-lifecycle`
- **Auth:** `dashboard.read`
- **Response:** Subscriber lifecycle stages (trial → active → churned)

#### GET `/api/dashboard/retention`
- **Auth:** `dashboard.read`
- **Response:** Retention and churn metrics

#### GET `/api/dashboard/payment-analytics`
- **Auth:** `dashboard.read`
- **Response:** Payment trends by mode, daily/weekly/monthly

#### GET `/api/dashboard/collection-performance`
- **Auth:** `dashboard.read`
- **Response:** Collection targets vs actual

#### GET `/api/dashboard/collection-target`
- **Auth:** `dashboard.read`
- **Response:** Collection target progress

#### GET `/api/dashboard/area-distribution`
- **Auth:** `dashboard.read`
- **Response:** Subscriber distribution across areas

#### GET `/api/dashboard/connection-types`
- **Auth:** `dashboard.read`
- **Response:** Connection type breakdown (FTTH/Cable/Wireless/Leased Line)

#### GET `/api/dashboard/plan-comparison`
- **Auth:** `dashboard.read`
- **Response:** Plan subscriber counts and revenue comparison

#### GET `/api/dashboard/top-subscribers`
- **Auth:** `dashboard.read`
- **Response:** Top subscribers by revenue

#### GET `/api/dashboard/technician-stats`
- **Auth:** `dashboard.read`
- **Response:** Technician performance metrics

#### GET `/api/dashboard/response-time`
- **Auth:** `dashboard.read`
- **Response:** Average response time metrics

#### GET `/api/dashboard/churn-risk`
- **Auth:** `dashboard.read`
- **Response:** Churn risk subscribers list

#### GET `/api/dashboard/health-score`
- **Auth:** `dashboard.read`
- **Response:** ISP health score calculation

#### GET `/api/dashboard/invoice-aging`
- **Auth:** `dashboard.read`
- **Response:** Invoice aging buckets (0-30, 31-60, 61-90, 90+ days)

### 6.10 RADIUS Routes

#### GET `/api/radius-sessions`
- **Auth:** `network.read`
- **Response:** Active RADIUS sessions with NAS IP, framed IP, session time, data usage

### 6.11 NETWORK Routes

#### GET `/api/network/devices`
- **Auth:** `network.read`
- **Response:** Network devices list

#### GET `/api/network/status`
- **Auth:** `network.read`
- **Response:** Overall network status summary

#### GET `/api/network/health-enhanced`
- **Auth:** `network.read`
- **Response:** Enhanced network health with device metrics

#### GET `/api/network/health-history`
- **Auth:** `network.read`
- **Response:** Network health history timeline

#### GET `/api/network/usage-summary`
- **Auth:** `network.read`
- **Response:** Bandwidth usage summary

#### GET `/api/network/predictive`
- **Auth:** `network.read`
- **Response:** Predictive network analytics

### 6.12 BANDWIDTH Routes

#### GET `/api/bandwidth`
- **Auth:** `network.read`
- **Response:** Bandwidth monitoring data

#### GET `/api/bandwidth/interfaces`
- **Auth:** `network.read`
- **Response:** Per-interface bandwidth data

#### GET `/api/bandwidth/consumers`
- **Auth:** `network.read`
- **Response:** Top bandwidth consumers

#### GET `/api/bandwidth/compare`
- **Auth:** `network.read`
- **Query:** `period`, `interface1`, `interface2`
- **Response:** Bandwidth comparison between interfaces/periods

#### GET `/api/bandwidth/export`
- **Auth:** `reports.export`
- **Response:** CSV download

#### POST `/api/bandwidth/throttle`
- **Auth:** `network.update`
- **Request:** `{ deviceId, maxDownloadMbps, maxUploadMbps, scheduleEnabled, ... }`
- **Business Logic:** Apply bandwidth throttle via TC/qdisc

#### GET `/api/bandwidth/thresholds`
- **Auth:** `network.read`
- **Response:** Configured bandwidth thresholds

#### GET `/api/bandwidth/qos`
- **Auth:** `network.read`
- **Response:** QoS configuration and statistics

### 6.13 FIREWALL Routes

Firewall rules management with nftables integration via gateway-service proxy.

### 6.14 DHCP Routes

DHCP server management (subnets, reservations) with gateway-service proxy.

### 6.15 DHCPv6 Routes

#### GET `/api/dhcpv6/subnets`
#### GET `/api/dhcpv6/pools`
#### GET `/api/dhcpv6/reservations`
#### GET `/api/dhcpv6/prefix-delegation`
#### GET `/api/dhcpv6/stats`

### 6.16 CAPTIVE PORTAL Routes

Comprehensive captive portal management:

| Route | Description |
|-------|-------------|
| `GET/POST /api/captive-portal` | List/create portals |
| `GET/PUT/DELETE /api/captive-portal/[id]` | Portal CRUD |
| `GET/POST /api/captive-portal/rules` | Access rules |
| `GET/PUT/DELETE /api/captive-portal/rules/[id]` | Rule CRUD |
| `GET/POST /api/captive-portal/schedules` | Time schedules |
| `GET/PUT/DELETE /api/captive-portal/schedules/[id]` | Schedule CRUD |
| `GET/POST /api/captive-portal/sessions` | Active sessions |
| `GET/DELETE /api/captive-portal/sessions/[id]` | Session management |
| `POST /api/captive-portal/sessions/disconnect-all` | Disconnect all |
| `GET/POST /api/captive-portal/ads` | Advertisement management |
| `GET/PUT/DELETE /api/captive-portal/ads/[id]` | Ad CRUD |
| `GET /api/captive-portal/analytics` | Portal analytics |
| `GET /api/captive-portal/events` | Portal events |
| `GET/POST /api/captive-portal/mac-whitelist` | MAC whitelist |
| `GET/POST /api/captive-portal/subnet-mapping` | Subnet mapping |
| `GET/POST /api/captive-portal/voucher-pools` | Voucher pools |
| `GET/PUT/DELETE /api/captive-portal/voucher-pools/[id]` | Pool CRUD |

### 6.17 IPS / nDPI Routes

| Route | Description |
|-------|-------------|
| `GET /api/ips` | IPS dashboard |
| `GET/POST /api/ips/block-rules` | Block rules |
| `GET/PUT/DELETE /api/ips/block-rules/[id]` | Rule CRUD |
| `POST /api/ips/block-rules/unblock` | Unblock IP |
| `GET /api/ips/alerts` | IPS alerts |
| `GET /api/ndpi` | nDPI dashboard |
| `GET /api/ndpi/categories` | App categories |
| `GET /api/ndpi/catalog` | Application catalog |
| `GET/POST /api/ndpi/apps` | App-specific rules |
| `GET/PUT/DELETE /api/ndpi/rules/[id]` | nDPI rule CRUD |
| `GET /api/ndpi/rules` | nDPI rules list |
| `GET /api/ndpi/subscribers` | Per-subscriber app usage |
| `GET /api/ndpi/stats` | nDPI statistics |

### 6.18 VPN / DDoS / MultiWAN / Dynamic Routing

| Route | Description |
|-------|-------------|
| `GET/POST /api/vpn-server` | VPN (WireGuard) management |
| `GET/POST /api/ddos` | DDoS protection rules |
| `GET/POST /api/multiwan` | MultiWAN link management |
| `GET /api/multiwan/export` | MultiWAN export |

### 6.19 FTTH/GPON Routes

| Route | Description |
|-------|-------------|
| `GET/POST /api/ftth/olts` | OLT CRUD |
| `GET/PUT/DELETE /api/ftth/olts/[id]` | OLT detail/update |
| `POST /api/ftth/olts/[id]/reboot` | OLT reboot |
| `GET /api/ftth/olts/export` | OLT export |
| `GET/POST /api/ftth/ports` | OLT port management |
| `GET/PUT/DELETE /api/ftth/ports/[id]` | Port detail/update |
| `GET /api/ftth/ports/status-history` | Port status history |
| `GET/POST /api/ftth/splitters` | Splitter management |
| `GET/POST /api/ftth/templates` | OLT templates |

### 6.20 EQUIPMENT / INVENTORY Routes

| Route | Description |
|-------|-------------|
| `GET/POST /api/equipment` | Equipment CRUD |
| `GET/PUT/DELETE /api/equipment/[id]` | Equipment detail |
| `GET /api/equipment/analytics` | Equipment analytics |
| `POST /api/equipment/adjust` | Stock adjustment |
| `POST /api/equipment/inspect` | Equipment inspection |
| `GET/POST /api/equipment/repairs` | Repair records |
| `GET/PUT/DELETE /api/equipment/repairs/[id]` | Repair detail |
| `POST /api/equipment/repair` | Quick repair |
| `GET/POST /api/equipment/stock-count` | Stock count |
| `GET/POST /api/equipment/purchase-orders` | Purchase orders |
| `GET/PUT/DELETE /api/equipment/purchase-orders/[id]` | PO detail |
| `GET /api/equipment/purchase-orders/export` | PO export |
| `GET/POST /api/inventory` | Inventory management |
| `GET/PUT/DELETE /api/inventory/[id]` | Inventory item |
| `POST /api/inventory/bulk` | Bulk inventory operations |
| `GET/POST /api/warehouses` | Warehouse CRUD |
| `GET/PUT/DELETE /api/warehouses/[id]` | Warehouse detail |
| `GET /api/warehouses/summary` | Warehouse summary |
| `GET/POST /api/vendors` | Vendor CRUD |
| `GET/PUT/DELETE /api/vendors/[id]` | Vendor detail |
| `GET/POST /api/stock-transfers` | Stock transfers |

### 6.21 TECHNICIANS Routes

| Route | Auth | Description |
|-------|------|-------------|
| `GET/POST /api/technicians` | `technicians.read/create` | CRUD |
| `GET/PUT/DELETE /api/technicians/[id]` | — | Detail/update |
| `GET /api/technicians/[id]/analytics` | — | Individual analytics |
| `GET /api/technicians/analytics` | — | Team analytics |
| `GET /api/technicians/performance` | — | Performance metrics |
| `GET /api/technicians/sla` | — | SLA compliance |
| `POST /api/technicians/dispatch` | — | Auto-dispatch |
| `GET /api/technicians/calendar` | — | Calendar view |
| `GET/POST /api/technicians/attendance` | — | Attendance records |
| `GET/POST /api/technicians/leave` | — | Leave management |
| `GET /api/technicians/leaderboard` | — | Performance leaderboard |
| `GET /api/technicians/export` | `reports.export` | CSV export |
| `POST /api/technicians/bulk` | `technicians.create` | Bulk operations |

### 6.22 AGENTS Routes

| Route | Auth | Description |
|-------|------|-------------|
| `GET/POST /api/agents` | `agents.read/create` | Agent CRUD |
| `GET/PUT/DELETE /api/agents/[id]` | — | Detail/update |
| `GET /api/agents/analytics` | — | Agent analytics |
| `POST /api/agents/create-login` | — | Create login credentials |
| `GET/POST /api/agents/payouts` | — | Commission payouts |
| `GET/POST /api/agents/reconciliation` | — | Daily reconciliation |
| `GET/POST /api/agents/followups` | — | Follow-up management |
| `GET /api/agents/export` | `reports.export` | CSV export |
| `POST /api/agents/import` | — | Bulk import |

### 6.23 NOTIFICATIONS Routes

| Route | Description |
|-------|-------------|
| `GET/POST /api/notifications` | Notification CRUD |
| `GET/PUT/DELETE /api/notifications/[id]` | Detail/update |
| `POST /api/notifications/send` | Send notification |
| `POST /api/notifications/[id]/retry` | Retry failed notification |
| `POST /api/notifications/retry-failed` | Retry all failed |
| `POST /api/notifications/mark-all-read` | Mark all as read |
| `GET /api/notifications/unread-count` | Unread count |
| `GET /api/notifications/analytics` | Notification analytics |
| `GET/POST /api/notification-rules` | Rule CRUD |
| `GET/PUT/DELETE /api/notification-rules/[id]` | Rule detail |

### 6.24 VOUCHERS Routes

| Route | Description |
|-------|-------------|
| `GET/POST /api/vouchers` | Voucher CRUD |
| `GET/PUT/DELETE /api/vouchers/[id]` | Detail/update |
| `POST /api/vouchers/bulk` | Bulk operations |
| `POST /api/vouchers/generate` | Generate vouchers |
| `POST /api/vouchers/import` | Import vouchers |
| `GET /api/vouchers/stats` | Voucher statistics |
| `GET/POST /api/vouchers/templates` | Template CRUD |
| `GET/PUT/DELETE /api/vouchers/templates/[id]` | Template detail |
| `GET /api/vouchers/usage-history` | Usage history |

### 6.25 PROMOTIONS Routes

#### POST `/api/promotions`
- **Auth:** `promotions.create`
- **Validation:**
  - `type === PERCENTAGE` → `value <= 100`
  - `validFrom < validUntil`
  - `usageLimit > 0` if set
- **Response:** Created promotion

### 6.26 ALERTS Routes

| Route | Description |
|-------|-------------|
| `GET/POST /api/alerts` | Alert CRUD |
| `GET /api/alerts/analytics` | Alert analytics |
| `POST /api/alerts/auto-escalate` | Auto-escalate alerts |
| `GET /api/alerts/history` | Alert history |
| `GET /api/alerts/export` | CSV export |

### 6.27 LEADS Routes (CRM)

| Route | Description |
|-------|-------------|
| `GET/POST /api/leads` | Lead CRUD |
| `GET/PUT/DELETE /api/leads/[id]` | Lead detail |

**Lead Scoring Factors:** source, area, estimated value, interaction history, follow-up recency

**Status Pipeline:** NEW → CONTACTED → INTERESTED → QUALIFIED → CONVERTED → LOST

### 6.28 REFERRAL Routes

| Route | Description |
|-------|-------------|
| `GET/POST /api/referral` | Referral management |
| **Sub-resources** | codes, rewards, settings, redemptions |

### 6.29 RESELLER Routes

| Route | Description |
|-------|-------------|
| `GET/POST /api/reseller` | Reseller CRUD |
| `GET /api/resellers/analytics` | Analytics |
| `POST /api/resellers/credit` | Credit management |
| `GET /api/resellers/commission-engine` | Commission calculation |

**Commission Methods:** PERCENTAGE (flat %), FLAT (fixed amount), SLAB (tiered)

### 6.30 AI Routes

| Route | Description |
|-------|-------------|
| `POST /api/ai/advisor` | AI chat advisor (LLM-powered) |
| `GET/POST /api/ai/diagnosis` | AI network diagnosis |
| `GET/POST /api/ai/diagnosis/baselines` | Diagnosis baselines |
| `POST /api/ai/diagnose` | Quick diagnose |
| `GET/POST /api/ai/churn` | Churn prediction |
| `GET/POST /api/ai/whatsapp-bot` | WhatsApp bot commands |

### 6.31 GST/TAX Routes

| Route | Description |
|-------|-------------|
| `GET/POST /api/gst` | GST configuration |
| `GET /api/gst/gstr9` | GSTR9 report |
| `GET/POST /api/gst/reverse-charge` | Reverse charge management |
| `GET/POST /api/gst/tds-tcs` | TDS/TCS tracking |
| `GET/POST /api/gst/composite` | Composite scheme |
| `GET/POST /api/gst/audit` | Tax audit |

### 6.32 COLLECTION / DUE RECOVERY Routes

| Route | Description |
|-------|-------------|
| `GET/POST /api/collection` | Collection management |
| `GET /api/collection/summary` | Collection summary |
| `GET/POST /api/collection/targets` | Collection targets |
| `POST /api/collection/receipt` | Generate receipt |
| `POST /api/collection/refund` | Process refund |
| `POST /api/collection/reconcile` | Reconciliation |
| `GET/POST /api/collection/disputes` | Dispute management |
| `GET/POST /api/collections/analytics` | Analytics |
| `GET/POST /api/collections/schedule` | Schedule management |
| `POST /api/collections/smart` | Smart collection suggestions |

### 6.33 CHURN ALERTS Routes

| Route | Description |
|-------|-------------|
| `GET/POST /api/churn-alerts` | Churn alert management |
| `GET/POST /api/churn-alerts/tracking` | Churn tracking |
| `GET/POST /api/churn-alerts/communications` | Communication log |
| `GET/POST /api/churn-alerts/workflows` | Workflow automation |
| `GET/POST /api/churn/analytics` | Churn analytics |
| `POST /api/churn/predict` | Churn prediction |
| `GET/POST /api/churn/retention` | Retention strategies |

### 6.34 LOYALTY / GAMIFICATION Routes

| Route | Description |
|-------|-------------|
| `GET /api/loyalty` | Loyalty program management |
| **Features** | Badges, tiers (Bronze/Silver/Gold/Platinum), points system, reward redemptions |

**Loyalty Settings:** pointsPerHundred (1), pointValueInr (0.5), monthlyBonusPoints, pointsExpiryDays (365)

### 6.35 MONITORING Routes

| Route | Description |
|-------|-------------|
| `GET/POST /api/speed-test` | Speed test execution |
| `GET /api/uptime-monitor` | Uptime monitoring |
| `GET /api/latency-monitor` | Latency/jitter tracking |
| `GET/POST /api/qos/[...slug]` | QoS management |
| `GET /api/system-health` | System health |
| `GET /api/system-monitor` | System monitoring |
| `GET/POST /api/sessions` | Session management |
| `GET /api/sessions/export` | Session export |
| `GET /api/syslog-server` | Syslog management |
| `GET /api/bw-reports` | Bandwidth reports |
| `GET/POST /api/traffic-analytics` | Traffic analytics |
| `GET/POST /api/diag` | Diagnostic tools |
| `GET/POST /api/diag/tcpdump/captures/[id]` | TCP dump capture |
| `GET /api/diag/tcpdump/download/[id]` | Download capture |
| `GET /api/grafana-dashboards` | Grafana integration |
| `GET /api/area-budgets` | Zone bandwidth budgets |
| `GET/POST /api/time-access-policies` | Time access rules |
| `GET /api/ip-mac-history` | IP-MAC assignment history |
| `GET /api/usage` | Usage data |

### 6.36 BACKUP Routes

| Route | Description |
|-------|-------------|
| `GET/POST /api/backup` | Backup management |
| `POST /api/backup/[id]/verify` | Verify backup integrity |
| `GET /api/backup/[id]/download` | Download backup file |

**Encryption:** AES-256-GCM for encrypted backups

### 6.37 AUDIT LOG Routes

| Route | Description |
|-------|-------------|
| `GET /api/audit-log` | Audit log listing with filters |
| `GET /api/audit-log/stats` | Audit statistics |
| `GET /api/audit-log/entity/[entityType]` | Entity-specific audit trail |

**Audit Log Fields:** userId, userName, action, entity, entityId, details (Json), previousValues (Json diff), endpoint, method, ipAddress, userAgent, timestamp

### 6.38 MODULES Routes

| Route | Description |
|-------|-------------|
| `GET/POST /api/modules` | Module enable/disable |

**Module System:** 17 modules, 7 deployment presets (ISP, Education, Hospital, Hotel, Campus, Enterprise, Full)

### 6.39 SETTINGS Routes

| Route | Description |
|-------|-------------|
| `GET/PUT /api/settings` | ISP settings CRUD |
| `GET/PUT /api/settings/isp-profile` | ISP profile |
| `POST /api/settings/isp-profile/test-smtp` | SMTP test |
| `GET/PUT /api/settings/tax` | Tax configuration |
| `GET/PUT /api/settings/invoice-format` | Invoice format |

### 6.40 Additional Route Groups

- **USERS:** CRUD, bulk, export, permissions, change-password, impersonate, activity, sessions
- **AREAS:** CRUD, reorder, bulk-import
- **EQUIPMENT:** CRUD, analytics, adjust, inspect, repairs, returns, stock-count, purchase orders
- **WAREHOUSES:** CRUD, summary
- **VENDORS:** CRUD
- **STOCK TRANSFERS:** CRUD
- **API KEYS:** CRUD
- **INTEGRATIONS:** CRUD, logs, transactions
- **KNOWLEDGE BASE:** CRUD
- **ANNOUNCEMENTS:** CRUD, dismiss
- **EXPENSES:** CRUD
- **IPAM:** Subnet, IP address management, CGNAT pools, VLANs
- **RADIUS PROXY:** Servers, realms, proxy config
- **RADIUS ATTRIBUTES:** Custom attributes management
- **COA EVENTS:** Change of Authorization tracking
- **ENTERPRISE AUTH:** LDAP/AD configuration, per-company auth, test
- **WIFI OFFLOAD:** Peers, policies, sessions, events, dashboard, proxy
- **WHATSAPP:** Templates, commands, quick-replies, conversations, broadcasts, config, webhooks, logs, analytics
- **VOICE:** Transcribe, speak, command
- **DNS:** DNS record management
- **PPPoe:** PPPoE server configuration
- **SERVICES STATUS:** Mini-service status monitoring
- **SYSTEM:** Alerts summary, health
- **DATA EXPORT:** Cross-entity export
- **LOAN/EMI:** Payment plans with installments
- **INVENTORY:** Bulk operations
- **CHARGE OVERRIDE:** Per-subscriber charge overrides
- **GRACE PERIODS:** Pre/post billing grace periods
- **ADD-ON SERVICES:** Subscribe, manage subscriptions
- **TOP-UPS:** Data/time/speed boost purchases
- **CYCLIC BILLING:** Automated billing cycles
- **RESELLER INTELLIGENCE:** Analytics
- **COMPETITORS:** Intel, comparison, market share, price history, win-loss
- **REVENUE:** Forecast, audit, cashflow, aging, leakage
- **SMART COLLECTIONS:** AI-powered collection suggestions
- **COMPLIANCE & SLA:** SLA monitoring

---

## 7. Business Rules & Workflows

### 7.1 Subscriber Registration Flow

1. **Code Generation:** Auto-generate unique customer code (e.g., `CRY1001`) using prefix + padded sequence
2. **Service Username:** Generate RADIUS username (e.g., `cry1001@cryptsk`)
3. **Validation:** Validate phone, email, required fields
4. **Record Creation:** Create Subscriber record with:
   - Default status: `PENDING_ACTIVATION`
   - IP type: `DYNAMIC` (unless STATIC specified)
   - IP stack: `IPV4_ONLY` (default)
5. **RADIUS Provisioning:** Optionally create RadiusUser record
6. **KYC:** Optional KYC verification with Aadhaar number
7. **Equipment Assignment:** Optionally assign equipment (router, ONU, etc.)
8. **Invoice Generation:** Generate first invoice based on plan pricing
9. **Notification:** Send welcome notification

### 7.2 Invoice Lifecycle

```
DRAFT ──→ SENT ──→ PAID
                ──→ PARTIALLY_PAID ──→ PAID
                ──→ OVERDUE ──→ PAID
                              ──→ CANCELLED
                              ──→ CREDIT_NOTE
```

**State Transitions:**
- `DRAFT → SENT`: Invoice sent to subscriber
- `SENT → PAID`: Full payment received
- `SENT → PARTIALLY_PAID`: Partial payment received
- `SENT → OVERDUE`: Due date passed without payment
- `PARTIALLY_PAID → PAID`: Remaining balance paid
- `OVERDUE → PAID`: Late payment received
- `ANY → CANCELLED`: Invoice cancelled (with reversal)
- `PAID → CREDIT_NOTE`: Credit note issued (refund)

**Tax Calculation:**
- CGST = subtotal × cgstRate (default 9%)
- SGST = subtotal × sgstRate (default 9%)
- IGST = subtotal × igstRate (default 0%)
- Total Tax = CGST + SGST + IGST
- Grand Total = subtotal + totalTax - discountAmount + lateFee - advanceAdjustment
- Balance = grandTotal - paidAmount

**Auto-Overdue:** Invoices past due date transition to OVERDUE status automatically

### 7.3 Payment Processing

```
CREATE ──→ PENDING ──→ VERIFIED
                    ──→ FAILED
                    ──→ REFUNDED
```

**State Transitions:**
- `PENDING → VERIFIED`: Payment confirmed by admin (or auto-verified for online payments)
- `PENDING → FAILED`: Payment failed or rejected
- `VERIFIED → REFUNDED`: Refund processed

**Bulk Verify:** Admin can verify multiple payments at once, which triggers:
1. Update each payment status to VERIFIED
2. Set verifiedById to current admin
3. Update linked invoice paidAmount and balanceAmount
4. If invoice balance reaches 0, set invoice status to PAID

**Payment Modes:** CASH, UPI, ONLINE, BANK_TRANSFER, CHEQUE, WALLET

### 7.4 Complaint Lifecycle

```
OPEN ──→ ASSIGNED ──→ IN_PROGRESS ──→ RESOLVED ──→ CLOSED
                                                      ──→ REOPENED (→ IN_PROGRESS)
```

**Auto-Escalation Rules:**
- SLA deadline based on priority (P1: 4h, P2: 8h, P3: 24h, P4: 48h)
- Level 1 escalation at 75% of SLA time
- Level 2 escalation at 100% of SLA time
- SLA pause support (isSlaPaused, slaPausedAt, slaPausedTotalMs)

**Auto-Assignment Algorithm:**
1. Filter technicians assigned to complaint's area
2. Exclude technicians with too many open complaints
3. Score by: skills match, current workload, rating, distance
4. Assign to highest-scoring available technician

**AI Enhancement:** Each complaint gets AI-generated fields:
- `aiCategory`: Categorized complaint type
- `aiSeverity`: Predicted severity
- `aiProbableCause`: Likely root cause
- `aiResolutionGuide`: Step-by-step resolution guide

### 7.5 Plan Creation

1. **Name & Category:** Define plan name and category (FTTH/WIRELESS/CABLE/LEASED_LINE/HOTSPOT/COMBO)
2. **Speed Config:** Set download/upload speed in Kbps
3. **Pricing:** Set monthly, quarterly (5% off), half-yearly (10% off), yearly (15% off)
4. **Tax Defaults:** CGST 9%, SGST 9%, IGST 0% (configurable per plan)
5. **RADIUS Group:** Auto-create RADIUS group linked to plan
6. **Optional:** FUP speeds, data limit, burst config, SLA uptime, IPv6 settings

### 7.6 Billing Cycle

1. **Generation:** Monthly (or weekly/daily) invoice generation
2. **Pro-rata:** Calculate pro-rata for mid-cycle activations (based on remaining days)
3. **Grace Period:** Configurable pre-billing and post-billing grace periods
4. **Late Fees:** PERCENTAGE (of outstanding) or FLAT amount
5. **Cyclic Billing:** Automated recurring billing with configurable cycle types (HOURLY/DAILY/WEEKLY/MONTHLY)
6. **Payment Plans:** EMI support with installments

### 7.7 Audit Trail

Every significant action is logged:

**Logged Data:**
- `userId` / `userName`: Who performed the action
- `action`: What was done (CREATE, UPDATE, DELETE, LOGIN, etc.)
- `entity` / `entityId`: What resource was affected
- `previousValues`: JSON diff of changed fields
- `endpoint`: API route
- `method`: HTTP method
- `ipAddress`: Client IP
- `userAgent`: Browser/client info
- `timestamp`: When it happened

**Retention:** Configurable via `auditRetentionDays` (default 90 days), with optional auto-delete

### 7.8 Webhook Events

**Event Firing:**
- Find all enabled webhooks matching the event (or wildcard `*`)
- Fire all matching webhooks in parallel (`Promise.allSettled`)
- 15-second timeout per webhook
- Log every delivery attempt (success/failure, status code, duration)

**Payload Format:**
```json
{
  "event": "subscriber.created",
  "data": { ... },
  "timestamp": "2025-01-15T10:30:00Z",
  "eventId": "evt_1718000000_abc123"
}
```

**Signature:** HMAC-SHA256 sent in `X-Webhook-Signature` header

**Headers:**
- `X-Webhook-Signature`: HMAC-SHA256 signature
- `X-Webhook-Event`: Event name
- `X-Webhook-Delivery`: Event ID
- `X-Cryptsk-Timestamp`: Timestamp
- `User-Agent`: `Cryptsk-Webhooks/1.0`

### 7.9 Module System

**17 Modules:**

| Module | Category | Default | Dependencies |
|--------|----------|---------|--------------|
| core | core | Yes (locked) | — |
| network-infra | network | Yes | core |
| services | addon | Yes | core, network-infra |
| gateway | gateway | Yes | core, network-infra |
| ips | addon | Yes | core, gateway |
| app-awareness | addon | Yes | core, network-infra |
| traffic-analytics | addon | Yes | core, network-infra |
| qos-monitor | addon | Yes | core, network-infra, gateway |
| latency-monitor | addon | Yes | core, network-infra |
| ipv6 | network | No | core, gateway |
| enterprise-ldap | addon | No | core, network-infra, services |
| field-ops | operations | Yes | core |
| finance | finance | Yes | core |
| voice-assistant | ai | Yes | core |
| wifi-offload | network | No | core, network-infra |
| ai-intelligence | ai | Yes | core |

**Core modules (19 pages)** cannot be disabled — they are always loaded.

**Dependency Resolution:** When enabling a module, all dependencies are automatically enabled. When disabling, only modules with no dependents can be disabled.

**7 Deployment Presets:**

| Preset | Modules |
|--------|---------|
| ISP / WISP | All except ipv6, enterprise-ldap, wifi-offload |
| Education / Campus | core, network-infra, services, gateway, field-ops, finance |
| Hospital / Healthcare | core, network-infra, services, gateway, field-ops, finance |
| Hotel / Hospitality | core, network-infra, services, gateway, field-ops, finance |
| Corporate Campus | core, network-infra, gateway, field-ops, finance |
| Enterprise | core, field-ops, finance, ai-intelligence, services |
| Full Platform | All 17 modules |

---

## 8. Cross-Cutting Patterns

### 8.1 Validation Patterns

| Field | Pattern | Source |
|-------|---------|--------|
| Phone | Indian mobile: 10 digits starting with 6-9 | Subscriber schema |
| Email | `email.toLowerCase().trim()` | Auth module |
| MAC Address | `AA:BB:CC:DD:00:0A` (colon-separated hex) | Seed data |
| IPv4 | Dotted decimal (validated by IPAM) | Subnet/IpAddress models |
| IPv6 | Full/compressed hex notation | IPv6 validators |
| Service Username | `{code.toLowerCase()}@cryptsk` | Seed convention |
| Invoice Number | `INV{padded_number}` | InvoicePrefix + padding config |
| Customer Code | `CRY{padded_number}` | CustomerCodePrefix + padding config |
| Ticket Number | `TKT{padded_number}` | Complaint convention |
| Receipt Number | `RCT{padded_number}` | Payment convention |

### 8.2 Pagination Standard

All list endpoints support:
```
?page=1&limit=20&search=keyword&sort=createdAt&order=desc
```

**Response format:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### 8.3 Error Handling

Standard error response format:
```json
{ "success": false, "error": "Error message" }
```

**HTTP Status Codes:**
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation error)
- `401`: Unauthorized (not authenticated / session expired)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `500`: Internal Server Error

**AuthError class:** Custom error class with statusCode field for proper HTTP response generation.

### 8.4 CORS Headers

API routes set CORS headers for cross-origin requests. Standard headers include `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`.

### 8.5 CSV Export

- **Encoding:** UTF-8 with BOM (`\uFEFF`) for Excel compatibility
- **Content-Type:** `text/csv; charset=utf-8`
- **Content-Disposition:** `attachment; filename="prefix_export_YYYY-MM-DD.csv"`
- **Quoting:** Double-quote escaping for values containing commas/quotes
- **Date Format:** Indian locale (`en-IN`)

### 8.6 Currency Formatting

Default currency: INR (Indian Rupee)

```typescript
fmtINR(amount) // "₹1,299" (uses Intl.NumberFormat with en-IN locale)
```

### 8.7 Date/Time Formatting

```typescript
fmtDate(date)     // "15/1/2025" (Indian locale)
fmtDateTime(date) // "15/1/2025, 10:30:00 AM" (Indian locale)
```

### 8.8 API Proxy Pattern

Gateway services (gateway-service, IPS, nDPI) are proxied through the Next.js backend:

```typescript
// From gateway-proxy.ts, ips-proxy.ts, ndpi-proxy.ts
const response = await fetch(`http://localhost:${port}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...reqHeaders },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(10000),
});
```

This allows the frontend to call a single API endpoint while the actual processing happens in a separate microservice.

---

## 9. Integration Points

### 9.1 Payment Gateways

| Gateway | Config Fields | Purpose |
|---------|--------------|---------|
| **Razorpay** | `razorpayKeyId`, `razorpayKeySecret`, `paymentGatewayMode` | Indian payment processing (UPI, cards, net banking) |
| **Stripe** | Via IntegrationConfig | International payment processing |

**Payment Flow:** Create order → Redirect to gateway → Webhook callback → Verify → Update invoice

### 9.2 SMS Gateways

| Gateway | Config Fields | Purpose |
|---------|--------------|---------|
| **MSG91** | `smsGateway`, `smsAuthKey`, `smsSenderId` | SMS notifications (India) |
| **Twilio** | Via IntegrationConfig | International SMS |

### 9.3 Email (SMTP)

| Config Field | Default | Purpose |
|-------------|---------|---------|
| `smtpHost` | — | SMTP server hostname |
| `smtpPort` | 587 | SMTP server port |
| `smtpUser` | — | SMTP username |
| `smtpPass` | — | SMTP password |
| `smtpFromEmail` | — | From email address |

**Library:** Nodemailer 8.0.5

**Test Endpoint:** `POST /api/settings/isp-profile/test-smtp` — sends test email

### 9.4 WhatsApp Business API

| Config Field | Purpose |
|-------------|---------|
| `whatsappApiToken` | API authentication token |
| `whatsappPhoneNumberId` | Business phone number ID |
| `whatsappEnabled` | Master enable/disable |
| `whatsappAutoReply` | Auto-reply to incoming messages |
| `whatsappGreetingMessage` | Greeting message template |
| `whatsappAwayMessage` | Away/busy message |

**Features:** Templates, broadcast, quick replies, bot commands, conversation tracking, scheduled messages

### 9.5 SNMP (Network Monitoring)

| Library | Purpose |
|---------|---------|
| `net-snmp` 3.26.1 | SNMP v1/v2c/v3 device polling |

**Supported versions:** SNMP, SNMP_V3 (with auth/priv protocols)
**V3 Auth:** MD5, SHA
**V3 Priv:** DES, AES

### 9.6 MikroTik (RouterOS API)

| Library | Purpose |
|---------|---------|
| `ros-client` 1.1.2 | MikroTik RouterOS API client |

**Features:** Device management, interface configuration, firewall rules, bandwidth management

### 9.7 RADIUS (FreeRADIUS)

**Integration:** Via radius-service mini-service
- User provisioning: Create/delete RADIUS users
- Group management: Link plans to RADIUS groups
- Accounting: Session tracking, data usage
- CoA (Change of Authorization): Plan changes, bandwidth adjustments
- Proxy/Relay: Forward auth/accounting to upstream RADIUS

### 9.8 Grafana

| Config Field | Purpose |
|-------------|---------|
| `grafanaUrl` | Grafana server URL |
| `grafanaApiKey` | API key for authentication |

**Purpose:** Embed Grafana dashboards for network monitoring, traffic analytics, system health

### 9.9 VPN (WireGuard)

**Purpose:** Site-to-site and client VPN management
**Integration:** Via VPN Server page and API routes

### 9.10 SSH Device Management

| Library | Purpose |
|---------|---------|
| `ssh2` 1.17.0 | SSH2 protocol client |

**Purpose:** Remote device management, configuration backup, command execution on network devices

---

## 10. Test Credentials

### 10.1 Admin Users

All users share the same password: **`Admin@123`**

| Email | Name | Role | Phone |
|-------|------|------|-------|
| `admin@cryptsk.com` | Rajesh Kumar | SUPER_ADMIN | 9893123401 |
| `manager@cryptsk.com` | Amit Sharma | ADMIN | 9893123402 |
| `operator@cryptsk.com` | Priya Patel | OPERATOR | 9893123403 |

### 10.2 Technician Users

| Email | Name | Role | Phone |
|-------|------|------|-------|
| `tech1@cryptsk.com` | Vikram Singh | TECHNICIAN | 8878234501 |
| `tech2@cryptsk.com` | Suresh Yadav | TECHNICIAN | 8878234502 |
| `tech3@cryptsk.com` | Arjun Mehta | TECHNICIAN | 8878234503 |
| `tech4@cryptsk.com` | Dinesh Patidar | TECHNICIAN | 8878234504 |
| `tech5@cryptsk.com` | Karan Joshi | TECHNICIAN | 8878234505 |

### 10.3 Agent Users

| Email | Name | Role | Phone |
|-------|------|------|-------|
| `agent1@cryptsk.com` | Ravi Verma | AGENT | 7789345601 |
| `agent2@cryptsk.com` | Manoj Tiwari | AGENT | 7789345602 |
| `agent3@cryptsk.com` | Sandeep Gupta | AGENT | 7789345603 |
| `agent4@cryptsk.com` | Prakash Dwivedi | AGENT | 7789345604 |

### 10.4 Sample Subscriber Service Credentials

| Subscriber | Service Username | Password |
|-----------|-----------------|----------|
| Rohit Agarwal (CRY1001) | `cry1001@cryptsk` | `Pass@123` |
| Sneha Gupta (CRY1002) | `cry1002@cryptsk` | `Pass@123` |
| Manish Sharma (CRY1003) | `cry1003@cryptsk` | `Pass@123` |

*Note: All 40 subscribers use `Pass@123` as servicePassword (seed data).*

### 10.5 Network Device Credentials

| Device | IP | Username | Password |
|--------|-----|----------|----------|
| All seed devices | Various (192.168.x.x) | `admin` | `cryptsk@2024` |

### 10.6 ISP Settings

| Setting | Value |
|---------|-------|
| Company Name | Cryptsk ISP |
| Location | 201, Cyber Tower, Scheme No 54, Vijay Nagar, Indore, MP 452010 |
| GSTIN | 23AABCC1234F1ZP |
| PAN | AABCC1234F |
| CIN | U72200MP2020PTC012345 |
| RADIUS Server | 192.168.1.1:1812 |
| RADIUS Secret | cryptskRadiusSecret |
| Primary Color | #DC2626 |
| Currency | INR |
| Timezone | Asia/Kolkata |

---

*Document generated from source code analysis of the CRYPTSKINTELLIGENT ISP Platform v6.4.*
*Total API route files: 479 | Total database models: 140+ | Total enumerations: 90+*
