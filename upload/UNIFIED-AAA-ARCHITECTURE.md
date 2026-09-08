# CRYPTSKINTELLIGENT — Unified AAA & Gateway Architecture
## Target: 5 Million Concurrent Users

**Version:** 1.0  
**Status:** Architecture Design Document  
**Date:** 2025  
**Scope:** Complete repositioning from ISP Subscriber CRM → Pure AAA & Gateway Platform

---

## 1. Executive Summary

### 1.1 The Problem
CRYPTSKINTELLIGENT currently operates as two parallel systems:
- **Subscriber System** (Prisma ORM): `Subscriber` → `Plan` → `NasSession`  
- **RADIUS System** (separate): `RadiusUser` (1:1 with Subscriber) → `RadiusGroup` → `RadiusSession` → `RadiusAccountingLog`

This creates duplication, sync issues, and a confused product identity. The sidebar has 11 scattered sections with 100+ items including separate "Subscribers", "Plans", "Sessions", "AAA/RADIUS", "RADIUS Proxy", "RADIUS Attributes", "CoA Tracking", "Session Engine (NAS)" tabs.

### 1.2 The Solution
**FreeRADIUS tables = THE backbone.** No parallel systems. No separate subscriber concept.

```
User Profile = radcheck + radreply + radusergroup + Subnet/IPAM + Policy metadata
Plan/Group   = radgroupcheck + radgroupreply  
Session     = radacct (real-time from FreeRADIUS)
Policy      = radgroupcheck/radgroupreply attributes
```

### 1.3 Target Product Identity
This is **NOT** an ISP subscriber CRM. It is:
| Capability | Description |
|---|---|
| **AAA Platform** | Authentication, Authorization, Accounting — the core |
| **Network Gateway** | Built-in NAS (PPPoE/DHCP/Captive Portal) + External NAS support |
| **Policy Engine** | Bandwidth, data cap, time-based, FUP, concurrent limits, QoS |
| **Multi-Tenant** | ISPs, TSPs, enterprises, hotels, venues, campuses |

---

## 2. Current State → Target State Mapping

### 2.1 Table Inventory (Current)

| # | Current Model | Purpose | Rows @ 5M Scale | Fate |
|---|---|---|---|---|
| 1 | `Subscriber` | ISP customer record with CRM + RADIUS fields mixed | 10-50M | **RESTRUCTURE** → AAA User Profile |
| 2 | `Plan` | Speed/data/price tier | 100-500 | **RESTRUCTURE** → RADIUS Group alias |
| 3 | `RadiusUser` | Thin 1:1 provisioning record | 5M | **ELIMINATE** (merge into Subscriber) |
| 4 | `RadiusGroup` | Speed limit + data limit | 100-500 | **TRANSFORM** → FreeRADIUS group tables |
| 5 | `RadiusSession` | Active RADIUS sessions | 5M | **ELIMINATE** → Use radacct |
| 6 | `RadiusAccountingLog` | Historical accounting | 500M+ | **ELIMINATE** → Use radacct |
| 7 | `NasSession` | Session engine sessions | 5M | **MERGE** → Unified with radacct |
| 8 | `SessionEvent` | Session lifecycle audit | 100M+ | **KEEP** (audit trail) |
| 9 | `Subnet` | IPAM subnet with QoS | 1K-10K | **KEEP + ENHANCE** |
| 10 | `IpAddress` | IPAM address tracking | 1M-20M | **KEEP + ENHANCE** |
| 11 | `NetworkDevice` | NAS/snmp devices | 1K-50K | **KEEP** (rename to NasDevice) |
| 12 | `NasClientConfig` | Per-device RADIUS config | 1K-50K | **KEEP** |
| 13 | `NasConfig` | Built-in NAS config | 1 (singleton) | **KEEP** |
| 14 | `CaptivePortal` | Captive portal profiles | 100-1K | **KEEP** |
| 15 | `PortalSession` | CP sessions | 1M+ | **MERGE** → Into radacct view |
| 16 | `SystemInterface` | Gateway interfaces | 10-100 | **KEEP** |
| 17 | `DhcpSubnet` | DHCP pool config | 100-1K | **KEEP + ENHANCE** |
| 18 | `DhcpReservation` | DHCP reservations | 1M-5M | **KEEP** |
| 19 | `FirewallRule` | nftables rules | 100-10K | **KEEP** |
| 20 | `UserRadiusAttribute` | Per-user RADIUS attrs | 100K-1M | **ELIMINATE** → Use radreply/radcheck |
| 21 | `RadiusAttributeDef` | RADIUS attribute catalog | 500 | **KEEP** |
| 22 | `CoaEvent` | CoA tracking | 10M+ | **KEEP** |
| 23 | `UserBillingCycle` | Cyclic billing state | 10M+ | **KEEP** |
| 24 | `BillingMilestone` | FUP thresholds per plan | 100-500 | **TRANSFORM** → radgroupcheck |
| 25 | `SubscriberTimeAccess` | Time access policies | 100K-1M | **TRANSFORM** → radgroupcheck |
| 26 | `RadiusProxyRealm` | RADIUS proxy realms | 10-100 | **KEEP** |
| 27 | `RadiusProxyServer` | Proxy server targets | 10-100 | **KEEP** |
| 28 | `QosConfig` | QoS policies | 100-1K | **TRANSFORM** → radgroupcheck |
| 29 | `TcClassMapping` | TC class tracking | 5M | **KEEP** |
| 30 | `IspSettings` | Platform config | 1 (singleton) | **RESTRUCTURE** → PlatformConfig |

---

## 3. FreeRADIUS Integration: The Core Tables

### 3.1 Standard FreeRADIUS SQL Schema (Native PostgreSQL)

The following tables are the **absolute backbone**. They replace ALL custom RADIUS/session logic. FreeRADIUS's SQL module queries these DIRECTLY — no ORM layer in the auth path.

```sql
-- ════════════════════════════════════════════════════════════════
-- FREE RADIUS NATIVE TABLES (managed by FreeRADIUS SQL module)
-- FreeRADIUS reads/writes these directly via SQL queries
-- NO Prisma ORM layer on the auth/acct hot path
-- ════════════════════════════════════════════════════════════════

-- User credentials (Authentication)
CREATE TABLE radcheck (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(64) NOT NULL,
    attribute       VARCHAR(64) NOT NULL,
    op              CHAR(2) DEFAULT '==',
    value           VARCHAR(253) NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_radcheck_username ON radcheck(username);
CREATE INDEX idx_radcheck_attr ON radcheck(attribute, value);

-- User reply attributes (Authorization - per user overrides)
CREATE TABLE radreply (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(64) NOT NULL,
    attribute       VARCHAR(64) NOT NULL,
    op              CHAR(2) DEFAULT '=',
    value           VARCHAR(253) NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_radreply_username ON radreply(username);

-- Group check attributes (Policy enforcement per group)
CREATE TABLE radgroupcheck (
    id              BIGSERIAL PRIMARY KEY,
    groupname       VARCHAR(64) NOT NULL,
    attribute       VARCHAR(64) NOT NULL,
    op              CHAR(2) DEFAULT '==',
    value           VARCHAR(253) NOT NULL
);
CREATE INDEX idx_radgroupcheck_group ON radgroupcheck(groupname);
CREATE INDEX idx_radgroupcheck_attr ON radgroupcheck(groupname, attribute);

-- Group reply attributes (Speed/policy per group)
CREATE TABLE radgroupreply (
    id              BIGSERIAL PRIMARY KEY,
    groupname       VARCHAR(64) NOT NULL,
    attribute       VARCHAR(64) NOT NULL,
    op              CHAR(2) DEFAULT '=',
    value           VARCHAR(253) NOT NULL
);
CREATE INDEX idx_radgroupreply_group ON radgroupreply(groupname);
CREATE UNIQUE INDEX idx_radgroupreply_unique ON radgroupreply(groupname, attribute);

-- User-to-Group mapping
CREATE TABLE radusergroup (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(64) NOT NULL,
    groupname       VARCHAR(64) NOT NULL,
    priority        INT DEFAULT 1
);
CREATE INDEX idx_radusergroup_username ON radusergroup(username);
CREATE INDEX idx_radusergroup_group ON radusergroup(groupname);
CREATE UNIQUE INDEX idx_radusergroup_unique ON radusergroup(username, groupname);

-- Accounting (THE session table - written by FreeRADIUS)
CREATE TABLE radacct (
    radacctid       BIGSERIAL PRIMARY KEY,
    acctsessionid   VARCHAR(64) NOT NULL,
    acctuniqueid    VARCHAR(32) NOT NULL,
    username        VARCHAR(64) NOT NULL DEFAULT '',
    realm           VARCHAR(64) DEFAULT '',
    nasipaddress    INET,
    nasportid       VARCHAR(15) DEFAULT '',
    nasporttype     VARCHAR(32) DEFAULT '',
    acctstarttime   TIMESTAMP WITH TIME ZONE,
    acctupdatetime  TIMESTAMP WITH TIME ZONE,
    acctstoptime    TIMESTAMP WITH TIME ZONE,
    acctinterval    INT DEFAULT 0,
    acctsessiontime INT DEFAULT 0,
    acctauthentic   VARCHAR(32) DEFAULT '',
    connectinfo_start VARCHAR(50) DEFAULT '',
    connectinfo_stop  VARCHAR(50) DEFAULT '',
    acctinputoctets   BIGINT DEFAULT 0,
    acctoutputoctets  BIGINT DEFAULT 0,
    calledstationid   VARCHAR(50) DEFAULT '',
    callingstationid  VARCHAR(50) DEFAULT '',
    acctterminatecause VARCHAR(32) DEFAULT '',
    servicetype       VARCHAR(32) DEFAULT '',
    framedprotocol    VARCHAR(32) DEFAULT '',
    framedipaddress   INET,
    framedipv6address VARCHAR(45) DEFAULT '',
    framedipv6prefix  VARCHAR(45) DEFAULT '',
    delegatedipv6prefix VARCHAR(64) DEFAULT '',
    ipv6inputoctets   BIGINT DEFAULT 0,
    ipv6outputoctets  BIGINT DEFAULT 0,
    -- CRYPTSK EXTENSIONS
    subscriber_id     VARCHAR(30) DEFAULT '',   -- FK to AaaUser.id
    plan_id           VARCHAR(30) DEFAULT '',   -- FK to plan at session start
    group_name        VARCHAR(64) DEFAULT '',   -- group at session start
    nas_type          VARCHAR(20) DEFAULT '',   -- BUILTIN, MIKROTIK, CISCO, etc.
    subnet_id         VARCHAR(30) DEFAULT '',   -- IPAM subnet
    auth_method       VARCHAR(20) DEFAULT '',   -- RADIUS, LOCAL_DB, MAC_AUTH, VOUCHER, CP
    fup_state         VARCHAR(20) DEFAULT '',   -- normal, throttled, blocked
    -- Partition key for sharding
    acctmonth         VARCHAR(7) GENERATED ALWAYS AS (to_char(acctstarttime, 'YYYY-MM')) STORED
);

-- CRITICAL: Partition by month for 5M users
-- ~50M rows/month. Retain 12 months hot = 600M rows
CREATE INDEX idx_radacct_username ON radacct(username);
CREATE INDEX idx_radacct_sessionid ON radacct(acctsessionid);
CREATE INDEX idx_radacct_nasip ON radacct(nasipaddress);
CREATE INDEX idx_radacct_starttime ON radacct(acctstarttime);
CREATE INDEX idx_radacct_acctmonth ON radacct(acctmonth);
CREATE INDEX idx_radacct_active ON radacct(acctstoptime) WHERE acctstoptime IS NULL;
CREATE INDEX idx_radacct_framedip ON radacct(framedipaddress);
CREATE INDEX idx_radacct_subscriber ON radacct(subscriber_id);
CREATE INDEX idx_radacct_calling ON radacct(callingstationid);
CREATE INDEX idx_radacct_nastype ON radacct(nas_type);
```

### 3.2 radacct Partitioning Strategy (5M Users)

```sql
-- Native PostgreSQL declarative partitioning by month
CREATE TABLE radacct (
    -- ... all columns above ...
) PARTITION BY RANGE (acctstarttime);

-- Auto-create monthly partitions (cron job)
CREATE TABLE radacct_2025_07 PARTITION OF radacct
    FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE radacct_2025_08 PARTITION OF radacct
    FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
-- ... etc
```

### 3.3 radgroupcheck/radgroupreply: Policy Attribute Map

| Policy Type | RADIUS Attribute (radgroupcheck) | RADIUS Attribute (radgroupreply) | Notes |
|---|---|---|---|
| **Speed Limit** | — | `Mikrotik-Rate-Limit` / `Huawei-Input-Bandwidth` / `Cisco-AVPair` | Vendor-specific format |
| **Speed Limit (Vendor-agnostic)** | — | `WISPr-Bandwidth-Max-Down` / `WISPr-Bandwidth-Max-Up` | Standard WISPr |
| **Data Cap (hard)** | `Max-Monthly-Volume` | — | FreeRADIUS sqlcounter |
| **Data Cap (soft/FUP)** | `Cryptsk-FUP-Threshold` | `Cryptsk-FUP-Speed-Down` / `Cryptsk-FUP-Speed-Up` | Custom via unlang |
| **Session Timeout** | `Max-Daily-Session` / `Session-Timeout` | — | Standard RADIUS |
| **Idle Timeout** | `Idle-Timeout` | — | Standard RADIUS |
| **Concurrent Sessions** | `Simultaneous-Use` | — | FreeRADIUS checks automatically |
| **Time Access** | `Login-Time` | — | Standard RADIUS time string |
| **IP Assignment** | — | `Framed-IP-Address` (static) | Per-user in radreply |
| **IP Pool** | — | `Framed-Pool` | DHCP pool name |
| **VLAN** | — | `Tunnel-Type` / `Tunnel-Medium-Type` / `Tunnel-Private-Group-ID` | VLAN assignment |
| **IPv6 Pool** | — | `Delegated-IPv6-Prefix-Pool` | IPv6 PD |
| **QoS Marking** | — | `Cisco-AVPair += "ip:subqos-marking"` | DSCP marking |
| **Filter ID** | — | `Filter-Id` | NAS ACL name |
| **Address List** | — | `Mikrotik-Address-List` | Mikrotik firewall list |

### 3.4 FreeRADIUS SQL Module Configuration

```
# /etc/freeradius/3.0/mods-enabled/sql
sql {
    driver = "rlm_sql_postgresql"
    dialect = "postgresql"
    
    # Connection pooling (critical for 5M scale)
    pool {
        start = 20
        min = 20
        max = 200
        spare = 50
        uses = 0          # unlimited
        retry_delay = 3
        lifetime = 3600    # 1 hour
        idle_timeout = 60
    }
    
    # Read replicas for accounting queries
    read_clients = yes
    postauth_query = "..."
    
    # Direct connection - NO ORM
    server = "postgresql://cryptsk:password@db-primary:5432/aaa"
    acct_table = "radacct"
    
    # Auth queries
    authorize_check_query = "SELECT id, username, attribute, op, value FROM radcheck WHERE username = '%{SQL-User-Name}' ORDER BY id"
    authorize_reply_query = "SELECT id, username, attribute, op, value FROM radreply WHERE username = '%{SQL-User-Name}' ORDER BY id"
    groupcheck_query = "SELECT id, groupname, attribute, op, value FROM radgroupcheck WHERE groupname = '%{Sql-Group}' ORDER BY id"
    groupreply_query = "SELECT id, groupname, attribute, op, value FROM radgroupreply WHERE groupname = '%{Sql-Group}' ORDER BY id"
    usergroup_query = "SELECT groupname FROM radusergroup WHERE username = '%{SQL-User-Name}' ORDER BY priority"
}
```

---

## 4. New Table Architecture

### 4.1 Core Tables (AAA Backbone)

#### AaaUser (replaces Subscriber for AAA identity)

```prisma
model AaaUser {
  id                String       @id @default(cuid())
  // AAA Identity (matches radcheck username)
  username          String       @unique    // = radcheck username = serviceUsername
  password          String                   // Cleartext (encrypted at rest via AES-256-GCM)
  
  // Profile metadata (NOT used for auth - just display/search)
  displayName       String       @default("")  // Human-readable name
  email             String       @default("")
  phone             String       @default("")
  address           String       @default("")
  
  // Network assignment
  subnetId          String?                   // IPAM subnet (for IP allocation)
  staticIp          String?                   // Framed-IP-Address if static
  macAddress        String       @default("")  // Calling-Station-Id for MAC auth
  areaId            String?                   // Location/zone
  
  // Plan/Group (maps to radusergroup.groupname)
  groupName         String?                   // Current RADIUS group (= Plan name)
  planId            String?                   // Reference to Plan for billing metadata
  
  // State
  status            AaaUserStatus @default(ACTIVE)  // ACTIVE, SUSPENDED, DISABLED, EXPIRED
  enabled           Boolean      @default(true)      // Auth gate: disabled = Access-Reject
  
  // Concurrent session tracking (updated by FreeRADIUS)
  maxConcurrent     Int          @default(1)
  
  // Billing reference (NOT billing logic - just FK for integration)
  billingAccountId  String?                   // External billing system ID
  balance           Float        @default(0)
  
  // Metadata
  tags              Json?
  customFields      Json?
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt
  
  // Relations
  subnet            Subnet?                      @relation(fields: [subnetId], references: [id])
  area              Area?                        @relation(fields: [areaId], references: [id])
  plan              Plan?                        @relation(fields: [planId], references: [id])
  sessionEvents     SessionEvent[]
  coaEvents         CoaEvent[]
  ipHistory         IpMacHistory[]
  billingCycles     UserBillingCycle[]
  
  @@index([username])
  @@index([status])
  @@index([subnetId])
  @@index([areaId])
  @@index([groupName])
  @@index([macAddress])
  @@index([phone])
  @@index([staticIp])
}

enum AaaUserStatus {
  ACTIVE
  SUSPENDED
  DISABLED
  EXPIRED
  TRIAL
  PENDING
}
```

**Key Design Decision**: `AaaUser.username` IS the RADIUS username. `AaaUser.password` IS the radcheck password. The Prisma model is just a **cache/management layer** — FreeRADIUS never queries this table. FreeRADIUS queries `radcheck` directly.

When creating/updating an AaaUser, the system **synchronizes** to radcheck/radreply/radusergroup:

```
AaaUser.create({ username: "john", password: "pass123", groupName: "plan-50mbps" })
  → INSERT INTO radcheck (username, attribute, op, value) VALUES ('john', 'Cleartext-Password', ':=', 'pass123')
  → INSERT INTO radusergroup (username, groupname) VALUES ('john', 'plan-50mbps')
```

#### Plan (restructured as RADIUS Group alias + billing metadata)

```prisma
model Plan {
  id                String       @id @default(cuid())
  name              String       @unique    // = radgroupcheck/radgroupreply groupname
  description       String       @default("")
  category          PlanCategory @default(FTTH)
  
  // === RADIUS Policy (synced to radgroupcheck/radgroupreply) ===
  // Speed
  downloadSpeedKbps Int
  uploadSpeedKbps   Int
  burstSpeedKbps    Int?
  burstDurationSec  Int?
  // Data
  dataLimitMb       Int?          // null = unlimited → radgroupcheck: Max-Monthly-Volume
  // Time
  sessionTimeoutSec Int?          // → radgroupcheck: Session-Timeout
  idleTimeoutSec    Int?          // → radgroupcheck: Idle-Timeout
  validityDays      Int          @default(30)
  // Concurrent
  maxConcurrent     Int          @default(1)  // → radgroupcheck: Simultaneous-Use
  
  // === FUP (Fair Usage Policy) ===
  fupThresholdMb    Int?          // → radgroupcheck: Cryptsk-FUP-Threshold
  fupSpeedDownKbps  Int?          // → radgroupcheck: Cryptsk-FUP-Speed-Down
  fupSpeedUpKbps    Int?          // → radgroupcheck: Cryptsk-FUP-Speed-Up
  
  // === Time Access ===
  timeAccessRule    String?       // → radgroupcheck: Login-Time (e.g., "Wk0800-2200")
  
  // === Billing Metadata (NOT used by RADIUS) ===
  priceMonthly      Float        @default(0)
  priceQuarterly    Float?
  priceHalfYearly   Float?
  priceYearly       Float?
  installationCharge Float       @default(0)
  taxPercent        Float        @default(18)
  
  // State
  status            PlanStatus   @default(ACTIVE)
  sortOrder         Int          @default(0)
  
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt
  
  users              AaaUser[]
  billingMilestones  BillingMilestone[]
  
  @@index([status])
  @@index([category])
}

enum PlanCategory {
  FTTH
  WIRELESS
  CABLE
  LEASED_LINE
  HOTSPOT
  COMBO
  ENTERPRISE
  HOTEL
  CAMPUS
}

enum PlanStatus {
  ACTIVE
  ARCHIVED
  HIDDEN
}
```

**Key Design Decision**: Plan creation triggers a **sync to radgroupcheck/radgroupreply**:

```sql
-- When Plan "plan-50mbps" is created with downloadSpeedKbps=51200, uploadSpeedKbps=25600, dataLimitMb=51200
INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES
  ('plan-50mbps', 'Max-Monthly-Volume', ':=', '51200'),
  ('plan-50mbps', 'Session-Timeout', ':=', '2592000'),
  ('plan-50mbps', 'Simultaneous-Use', ':=', '1');

INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES
  ('plan-50mbps', 'Mikrotik-Rate-Limit', ':=', '50M/25M'),
  ('plan-50mbps', 'WISPr-Bandwidth-Max-Down', ':=', '51200'),
  ('plan-50mbps', 'WISPr-Bandwidth-Max-Up', ':=', '25600');
```

### 4.2 Tables to ELIMINATE

| Table | Reason | Migration |
|---|---|---|
| `RadiusUser` | Thin 1:1 mapping no longer needed. AaaUser IS the RADIUS user | Data: DELETE RadiusUser rows. AaaUser.username maps directly to radcheck |
| `RadiusSession` | Duplicate of radacct. FreeRADIUS writes directly to radacct | Data: Migrate any active sessions to radacct, then drop |
| `RadiusAccountingLog` | Same as above. radacct is THE accounting table | Data: Already duplicates radacct. Drop |
| `RadiusGroup` | Redundant. radgroupcheck/radgroupreply are THE group definitions | Data: Migrate to radgroupcheck/radgroupreply, then drop |
| `UserRadiusAttribute` | Per-user attributes should live in radcheck/radreply | Data: Migrate to radcheck/radreply, then drop |
| `UsageLog` | Duplicates radacct accounting data | Data: Replace with radacct views, then drop |

### 4.3 Tables to KEEP (Unchanged or Enhanced)

| Table | Changes |
|---|---|
| `Subnet` | Add `ipAssignmentMode` (STATIC/DHCP/ALL/NONE), `gatewayMode` flag |
| `IpAddress` | Add `assignedUsername` FK to AaaUser, `leaseExpiry` |
| `NetworkDevice` | Rename to `NasDevice` (keep backward compat alias) |
| `NasClientConfig` | Keep — maps device to RADIUS client config |
| `NasConfig` | Keep — built-in NAS singleton |
| `SessionEvent` | Keep — audit trail (not for auth, for dashboard/logs) |
| `CoaEvent` | Keep — CoA tracking |
| `TcClassMapping` | Keep — TC/QoS state |
| `CaptivePortal` | Keep — captive portal config |
| `PortalSession` | Keep — add `acctSessionId` FK to radacct |
| `FirewallRule` | Keep |
| `SystemInterface` | Keep |
| `DhcpSubnet` | Keep — add `ipamSubnetId` FK |
| `DhcpReservation` | Keep — add `aaaUserId` FK |
| `RadiusProxyRealm` | Keep |
| `RadiusProxyServer` | Keep |
| `RadiusPacketMapping` | Keep |
| `RadiusPacketRule` | Keep |
| `RadiusAttributeDef` | Keep — attribute catalog |
| `BillingMilestone` | Keep — FUP thresholds |
| `UserBillingCycle` | Keep — cyclic billing state |
| `UserActionHistory` | Keep — audit |
| `SubscriberTimeAccess` | Transform → radgroupcheck `Login-Time` attribute |
| `QosConfig` | Transform → radgroupreply QoS attributes |
| `Invoice`, `Payment`, `Voucher` | Keep (OPERATIONS module) |
| `Complaint`, `Technician`, `Agent` | Keep (OPERATIONS module) |
| `AuditLog` | Keep |
| `ApiKeys` | Keep |

### 4.4 Tables to RESTRUCTURE

| Current Table | Restructure |
|---|---|
| `Subscriber` | Split: AAA identity → `AaaUser`, Billing/CRM → keep as `Subscriber` (billing only, no RADIUS fields) OR deprecate entirely |
| `IspSettings` | Split into `PlatformConfig` (gateway/network settings) + `BillingConfig` (financial settings) |
| `Area` | Keep — now called "Zone" in sidebar, but `Area` in DB (just rename in UI) |

### 4.5 New Views (For Dashboard & Queries)

```sql
-- ════════════════════════════════════════════════════════════════
-- VIEWS: Unified data layer for dashboard/monitoring queries
-- ════════════════════════════════════════════════════════════════

-- View: Active Sessions (replaces RadiusSession + NasSession queries)
CREATE VIEW v_active_sessions AS
SELECT 
    a.radacctid,
    a.acctsessionid,
    a.username,
    u.display_name,
    u.phone,
    u.group_name AS plan_name,
    u.mac_address,
    u.subnet_id,
    a.nasipaddress::text AS nas_ip,
    a.nas_type,
    a.framedipaddress::text AS framed_ip,
    a.callingstationid AS mac,
    a.acctstarttime AS start_time,
    EXTRACT(EPOCH FROM (NOW() - a.acctstarttime))::int AS duration_sec,
    a.acctinputoctets AS download_bytes,
    a.acctoutputoctets AS upload_bytes,
    (a.acctinputoctets + a.acctoutputoctets) AS total_bytes,
    a.acctsessiontime AS session_time,
    a.fup_state,
    a.auth_method
FROM radacct a
LEFT JOIN "AaaUser" u ON u.username = a.username
WHERE a.acctstoptime IS NULL;

-- Materialized for performance (refresh every 30 sec)
CREATE MATERIALIZED VIEW mv_active_sessions AS
SELECT * FROM v_active_sessions
WITH DATA;
CREATE UNIQUE INDEX idx_mvas_sessionid ON mv_active_sessions(acctsessionid);

-- View: User with Group Policy (for user detail page)
CREATE VIEW v_user_policy AS
SELECT 
    u.id AS user_id,
    u.username,
    u.display_name,
    u.status,
    ug.groupname,
    gc.attribute AS check_attr,
    gc.value AS check_value,
    gr.attribute AS reply_attr,
    gr.value AS reply_value
FROM "AaaUser" u
JOIN radusergroup ug ON ug.username = u.username
LEFT JOIN radgroupcheck gc ON gc.groupname = ug.groupname
LEFT JOIN radgroupreply gr ON gr.groupname = ug.groupname;

-- View: Group Policy Summary (for plan/group management page)
CREATE VIEW v_group_policy_summary AS
SELECT 
    groupname,
    COUNT(DISTINCT username) AS user_count,
    COUNT(*) FILTER (WHERE attribute = 'Mikrotik-Rate-Limit') AS has_speed,
    COUNT(*) FILTER (WHERE attribute = 'Max-Monthly-Volume') AS has_data_cap,
    COUNT(*) FILTER (WHERE attribute = 'Session-Timeout') AS has_session_timeout,
    COUNT(*) FILTER (WHERE attribute = 'Simultaneous-Use') AS has_concurrent_limit
FROM radgroupreply
GROUP BY groupname;

-- View: Session History with user info (replaces RadiusAccountingLog)
CREATE VIEW v_session_history AS
SELECT 
    a.*,
    u.display_name,
    u.phone,
    u.group_name
FROM radacct a
LEFT JOIN "AaaUser" u ON u.username = a.username
ORDER BY a.acctstarttime DESC;

-- View: Real-time bandwidth per user (from interim updates)
CREATE VIEW v_realtime_bandwidth AS
SELECT 
    a.acctsessionid,
    a.username,
    a.framedipaddress::text,
    a.acctinputoctets - COALESCE(p.prev_input, 0) AS delta_input,
    a.acctoutputoctets - COALESCE(p.prev_output, 0) AS delta_output,
    a.acctupdatetime
FROM radacct a
LEFT JOIN radacct_prev p ON p.acctsessionid = a.acctsessionid
WHERE a.acctstoptime IS NULL
AND a.acctupdatetime > NOW() - INTERVAL '5 minutes';
```

---

## 5. IPAM Flow: Subnet → IP Pool → User Assignment

### 5.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    IPAM HIERARCHY                             │
│                                                              │
│  Area/Zone ──→ Subnet ──→ IpAddress Pool ──→ AaaUser        │
│                                                              │
│  1. Create Subnet (10.10.0.0/24)                            │
│  2. Set ipAssignmentMode: STATIC | DHCP | ALL | NONE        │
│  3. Users in this subnet auto-assigned IPs                   │
│  4. DHCP server (Kea) reads from IpAddress table             │
│  5. Static IPs → Framed-IP-Address in radreply              │
│  6. Pool name → Framed-Pool in radgroupreply                │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 IP Assignment Modes

| Mode | Behavior | RADIUS Attribute | Use Case |
|---|---|---|---|
| `STATIC` | User gets specific IP from IpAddress | `Framed-IP-Address` in radreply | FTTH, enterprise |
| `DHCP` | User assigned from pool by DHCP server | `Framed-Pool` in radgroupreply + Kea DHCP | Wireless, hotel |
| `ALL` | Any IP in subnet is allowed | No RADIUS IP attrs | Captive portal, hotspot |
| `NONE` | No IP management (external) | No RADIUS IP attrs | External NAS (Mikrotik PPPoE) |

### 5.3 IP Assignment Flow

```
AaaUser Created/Updated with subnetId:
  1. Query Subnet.ipAssignmentMode
  2. IF STATIC:
     a. Find free IpAddress in Subnet (status='free')
     b. UPDATE IpAddress SET status='used', assignedUsername=user.username
     c. INSERT INTO radreply (username, 'Framed-IP-Address', ':=', '10.10.0.5')
  3. IF DHCP:
     a. Insert DhcpReservation (macAddress, ipAddress) if MAC known
     b. INSERT INTO radreply (username, 'Framed-Pool', ':=', 'pool-subnet-10-10-0')
  4. IF ALL/NONE:
     a. No IP RADIUS attributes needed

AaaUser Deleted/Suspended:
  1. UPDATE IpAddress SET status='free', assignedUsername=NULL
  2. DELETE FROM radreply WHERE username=... AND attribute='Framed-IP-Address'
  3. DELETE FROM DhcpReservation WHERE aaaUserId=...
```

### 5.4 Enhanced Subnet Model

```prisma
model Subnet {
  id                  String           @id @default(cuid())
  name                String
  network             String           // "10.10.0.0"
  cidr                String           // "10.10.0.0/24"
  gateway             String           // "10.10.0.1"
  dns                 String
  areaId              String?
  
  // IP Assignment
  ipAssignmentMode    IpAssignmentMode @default(DHCP)
  ipPoolName          String           @default("")   // Framed-Pool name for RADIUS
  
  // IPv6
  networkv6           String           @default("")
  prefixv6            String           @default("")
  ipv6PoolName        String           @default("")
  
  // VLAN
  vlanId              String?
  
  // NAT / CGNAT
  natMode              NatMode @default(NONE)
  cgnatPoolId          String?
  
  // TC/QoS (existing)
  tcEnabled            Boolean @default(false)
  tcSubnetIndex        Int     @default(0)
  nextClassSlot        Int     @default(1)
  bandwidthPoolDownMbps  Float  @default(0)
  bandwidthPoolUpMbps    Float  @default(0)
  
  // Captive Portal
  captivePortalId     String?
  
  // DHCP Server config
  dhcpSubnetId        String?     // FK to DhcpSubnet
  
  // Stats
  totalIps            Int         @default(254)
  usedIps             Int         @default(0)
  freeIps             Int         @default(254)
  
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt

  area                Area?
  vlan                Vlan?
  ipAddresses         IpAddress[]
  users               AaaUser[]
  captivePortal       CaptivePortal?
  dhcpSubnet          DhcpSubnet?  @relation("SubnetDhcp")
  
  @@index([cidr])
  @@index([areaId])
  @@index([vlanId])
}

enum IpAssignmentMode {
  STATIC
  DHCP
  ALL
  NONE
}
```

---

## 6. Session Flow: Login → Auth → Accounting → Policy → CoA → Logout

### 6.1 Complete Session Lifecycle

```
┌──────────────────────────────────────────────────────────────────────┐
│                    SESSION LIFECYCLE                                  │
│                                                                      │
│  ┌─────────┐    ┌──────────┐    ┌───────────┐    ┌───────────┐      │
│  │  LOGIN  │───→│  AUTH    │───→│  ACCT     │───→│  ENFORCE  │      │
│  │ (PPPoE/ │    │ (FreeRADIUS│   │ START     │    │  POLICY   │      │
│  │ DHCP/CP │    │ SQL module)│   │ (radacct) │    │ (cron)    │      │
│  └─────────┘    └──────────┘    └───────────┘    └───────────┘      │
│       │               │               │                 │            │
│       ▼               ▼               ▼                 ▼            │
│  Access-Request   Access-Accept   Accounting-Start   Data/Time cap? │
│                   or Reject       → INSERT radacct   → CoA/DM     │
│                                    (nas_type=BUILTIN)               │
│                                                                      │
│  ┌─────────┐    ┌──────────┐    ┌───────────┐                       │
│  │INTERIM  │───→│  UPDATE  │───→│  radacct  │  (every 300 sec)     │
│  │ACCT     │    │  policy  │    │  UPDATE   │                       │
│  └─────────┘    └──────────┘    └───────────┘                       │
│                                                                      │
│  ┌─────────┐    ┌──────────┐    ┌───────────┐                       │
│  │  LOGOUT │───→│  CoA/DM  │───→│  Acct     │                       │
│  │ (user/  │    │ or       │    │  STOP     │                       │
│  │ admin/  │    │ timeout) │    │  radacct  │                       │
│  │ FUP)    │    └──────────┘    └───────────┘                       │
│  └─────────┘                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 Auth Flow (FreeRADIUS SQL Module)

```
1. NAS sends Access-Request
   └→ FreeRADIUS receives (User-Name, User-Password, NAS-IP, NAS-Identifier, ...)

2. FreeRADIUS SQL authorize:
   └→ SELECT * FROM radcheck WHERE username = '%{User-Name}'
   └→ SELECT groupname FROM radusergroup WHERE username = '%{User-Name}'
   └→ SELECT * FROM radgroupcheck WHERE groupname = '%{Sql-Group}'
   └→ Check: password matches? → Yes → Continue
   
3. FreeRADIUS SQL post-auth:
   └→ SELECT * FROM radreply WHERE username = '%{User-Name}'
   └→ SELECT * FROM radgroupreply WHERE groupname = '%{Sql-Group}'
   └→ Compose Access-Accept with reply attributes (speed, IP, VLAN, etc.)

4. FreeRADIUS returns Access-Accept (or Reject)

5. CRYPTSKINTELLIGENT hooks (via FreeRADIUS exec module or PostgreSQL triggers):
   └→ INSERT INTO SessionEvent (AUTH_SUCCESS)
   └→ If built-in NAS: Create TC class (subscriber-add.sh)
   └→ Assign IP from IPAM pool
```

### 6.3 Accounting Flow

```
1. Accounting-Start:
   └→ INSERT INTO radacct (all RADIUS attrs + subscriber_id, plan_id, group_name, nas_type)
   └→ INSERT INTO SessionEvent (SESSION_START)

2. Interim-Update (every 300 sec):
   └→ UPDATE radacct SET acctinputoctets=..., acctoutputoctets=..., acctsessiontime=...
   └→ Policy engine checks data/time limits:
       IF data_used >= data_limit → Send CoA (disconnect or throttle)
       IF session_time >= session_timeout → Send PoD (disconnect)
       IF idle > idle_timeout → Send PoD (disconnect)

3. Accounting-Stop:
   └→ UPDATE radacct SET acctstoptime=NOW(), acctsessiontime=..., acctterminatecause=...
   └→ INSERT INTO SessionEvent (SESSION_STOP)
   └→ Free TC class (subscriber-del.sh)
   └→ Release IP back to pool
```

### 6.4 Built-in NAS (Session Engine) Flow

```
For built-in NAS (PPPoE/DHCP/Captive Portal managed by CRYPTSKINTELLIGENT):

1. Session Engine authenticates via FreeRADIUS (radclient -x)
   └→ Same auth path as external NAS
   └→ nas_type = 'BUILTIN' in radacct

2. On Access-Accept:
   └→ Create NasSession in memory (or radacct with nas_type='BUILTIN')
   └→ Assign IP from DHCP pool
   └→ Create TC class (subscriber-add.sh)
   └→ Apply firewall rules

3. On Accounting-Stop:
   └→ Free TC class
   └→ Release IP
   └→ Remove firewall rules

4. WebSocket broadcasts for real-time dashboard:
   └→ session_start, session_stop, coa_event, stats_tick
```

### 6.5 CoA (Change of Authorization) Flow

```
Trigger: Plan change, FUP, admin action, billing event

1. System determines CoA action:
   └→ Speed change → CoA-Request with new Mikrotik-Rate-Limit
   └→ Disconnect → Disconnect-Message (PoD)
   └→ Data limit reached → CoA with FUP speed or PoD

2. Send to NAS:
   └→ External NAS: radclient -x <nas-ip>:3799 coa <secret>
   └→ Built-in NAS: Internal function call

3. On success:
   └→ UPDATE radacct SET fup_state='throttled' (if FUP)
   └→ UPDATE TcClassMapping SET rateKbps=<fup_speed>
   └→ subscriber-rate.sh <fup_speed>
   └→ INSERT INTO CoaEvent
   └→ INSERT INTO SessionEvent (COA_SUCCESS)

4. On failure:
   └→ INSERT INTO CoaEvent with status=FAILED
   └→ Retry logic (3 retries with backoff)
```

---

## 7. Policy Engine Architecture

### 7.1 Policy Resolution Chain

```
User Request → FreeRADIUS Authorize:
  1. radcheck (per-user checks: password, MAC filter)
  2. radusergroup → determines group(s)
  3. radgroupcheck (group checks: data cap, time, concurrent)
  4. radreply (per-user overrides: static IP, custom attrs)
  5. radgroupreply (group reply: speed, QoS, VLAN)
  
Priority: radreply > radgroupreply (per-user overrides group)
         radcheck > radgroupcheck (per-user checks override group)
```

### 7.2 Policy Enforcement Engine (Background Service)

```typescript
// mini-services/policy-engine/index.ts (NEW service, port 3008)

// Runs every 60 seconds:
async function enforcePolicies() {
  // 1. Data cap enforcement
  const overLimit = await db.$queryRaw`
    SELECT username, subscriber_id, acctsessionid, 
           SUM(acctinputoctets + acctoutputoctets) / 1048576 AS used_mb,
           gc.value AS limit_mb
    FROM radacct a
    JOIN radusergroup ug ON ug.username = a.username
    JOIN radgroupcheck gc ON gc.groupname = ug.groupname 
      AND gc.attribute = 'Max-Monthly-Volume'
    WHERE a.acctstoptime IS NULL
    AND a.acctmonth = to_char(NOW(), 'YYYY-MM')
    GROUP BY username, subscriber_id, acctsessionid, gc.value
    HAVING SUM(acctinputoctets + acctoutputoctets) / 1048576 >= gc.value::numeric
  `;
  
  for (const user of overLimit) {
    // Check if FUP is configured
    const fupSpeed = await getFupSpeed(user.username);
    if (fupSpeed) {
      await sendCoA(user, { speedDown: fupSpeed.down, speedUp: fupSpeed.up });
    } else {
      await sendPoD(user); // Hard cap = disconnect
    }
  }
  
  // 2. Session timeout enforcement
  // 3. Concurrent session enforcement
  // 4. Idle timeout enforcement
  // 5. Time access enforcement (Login-Time)
}
```

### 7.3 Multi-Vendor Speed Attribute Mapping

```typescript
// When Plan is synced to radgroupreply, generate vendor-specific attrs

function generateSpeedAttributes(plan: Plan, nasVendor: string): { attribute: string, value: string }[] {
  const attrs: { attribute: string, value: string }[] = [];
  
  // Always add WISPr (vendor-agnostic)
  attrs.push({ attribute: 'WISPr-Bandwidth-Max-Down', value: String(plan.downloadSpeedKbps) });
  attrs.push({ attribute: 'WISPr-Bandwidth-Max-Up', value: String(plan.uploadSpeedKbps) });
  
  // Vendor-specific
  switch (nasVendor) {
    case 'mikrotik':
      attrs.push({ attribute: 'Mikrotik-Rate-Limit', value: `${plan.downloadSpeedKbps/1000}M/${plan.uploadSpeedKbps/1000}M` });
      break;
    case 'cisco':
      attrs.push({ attribute: 'Cisco-AVPair', value: `ip:subqos-marking=${plan.downloadSpeedKbps}` });
      break;
    case 'huawei':
      attrs.push({ attribute: 'Huawei-Input-Bandwidth', value: String(plan.uploadSpeedKbps) });
      attrs.push({ attribute: 'Huawei-Output-Bandwidth', value: String(plan.downloadSpeedKbps) });
      break;
    case 'juniper':
      attrs.push({ attribute: 'Juniper-Cos-Input-Bandwidth', value: String(plan.uploadSpeedKbps) });
      attrs.push({ attribute: 'Juniper-Cos-Output-Bandwidth', value: String(plan.downloadSpeedKbps) });
      break;
  }
  
  return attrs;
}
```

---

## 8. New Navigation (Sidebar) Architecture

### 8.1 Restructured Sidebar

```
┌─────────────────────────────────────────────────────────────┐
│  🏠 DASHBOARD                                               │
│  └── /dashboard                                              │
├─────────────────────────────────────────────────────────────┤
│  👤 AAA & USERS                                             │
│  ├── Users            /users            (was Subscribers)   │
│  ├── User Groups       /user-groups      (was Plans)        │
│  ├── Active Sessions   /sessions         (from radacct)     │
│  ├── Session History   /session-history  (from radacct)     │
│  └── Auth Log          /auth-log         (SessionEvent)     │
├─────────────────────────────────────────────────────────────┤
│  🌐 NETWORK                                                │
│  ├── Subnets (IPAM)   /subnets          (IPAM + QoS)        │
│  ├── IP Addresses      /ip-addresses                         │
│  ├── NAS Devices       /nas-devices      (was NetworkDevice)│
│  ├── DHCP Server       /dhcp-server                           │
│  ├── DNS Server        /dns-server                           │
│  ├── PPPoE Server      /pppoe-server                         │
│  └── Captive Portal    /captive-portal                       │
├─────────────────────────────────────────────────────────────┤
│  ⚡ POLICY                                                 │
│  ├── Bandwidth Policies/bandwidth-policies  (from groups)  │
│  ├── Time Access        /time-access                         │
│  ├── FUP Rules          /fup-rules                           │
│  ├── QoS                /qos                                 │
│  ├── Firewall           /firewall                            │
│  └── IPS                /ips                                 │
├─────────────────────────────────────────────────────────────┤
│  📊 MONITORING                                              │
│  ├── Real-time Dashboard/dashboard                          │
│  ├── Live Sessions     /live-sessions    (radacct real-time)│
│  ├── Bandwidth         /bandwidth                           │
│  ├── Traffic Analytics /traffic-analytics                   │
│  ├── Alerts            /alerts                              │
│  └── RADIUS Proxy      /radius-proxy                        │
├─────────────────────────────────────────────────────────────┤
│  🔧 SERVICES                                               │
│  ├── Enterprise Auth   /enterprise-auth                     │
│  ├── WiFi Offload      /wifi-offload                        │
│  ├── RADIUS Attributes/radius-attributes                    │
│  ├── CoA Tracking      /coa-tracking                        │
│  ├── TR-069 ACS        /tr069-acs                           │
│  └── Hotspot           /hotspot                             │
├─────────────────────────────────────────────────────────────┤
│  💰 OPERATIONS (optional module)                            │
│  ├── Billing           /billing                             │
│  ├── Invoices          /invoices                            │
│  ├── Vouchers          /vouchers                            │
│  └── Reports           /reports                             │
├─────────────────────────────────────────────────────────────┤
│  ⚙️ SETTINGS                                               │
│  ├── System Config     /system-config                       │
│  ├── RADIUS Config     /radius-config                       │
│  ├── API Keys          /api-keys                            │
│  └── Audit Log         /audit-log                           │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Page Mapping (Current → New)

| Current Route | Current Name | New Section | New Route |
|---|---|---|---|
| `/subscribers` | Subscribers | AAA & USERS | `/users` |
| `/plans` | Plans | AAA & USERS | `/user-groups` |
| `/sessions` | Sessions | AAA & USERS | `/sessions` |
| `/aaa-radius` | AAA/RADIUS | AAA & USERS | *(merged into Users)* |
| `/radius-attributes` | RADIUS Attributes | SERVICES | `/radius-attributes` |
| `/radius-proxy` | RADIUS Proxy | MONITORING | `/radius-proxy` |
| `/coa-tracking` | CoA Tracking | SERVICES | `/coa-tracking` |
| `/ipam` | IPAM | NETWORK | `/subnets` |
| `/devices` | Devices | NETWORK | `/nas-devices` |
| `/dhcp` | DHCP Server | NETWORK | `/dhcp-server` |
| `/dns` | DNS Server | NETWORK | `/dns-server` |
| `/pppoe-server` | PPPoE Server | NETWORK | `/pppoe-server` |
| `/captive-portal` | Captive Portal | NETWORK | `/captive-portal` |
| `/firewall` | Firewall | POLICY | `/firewall` |
| `/ips` | IPS | POLICY | `/ips` |
| `/bandwidth-mgmt` | Bandwidth Mgmt | POLICY | `/qos` |
| `/time-access` | Time Access | POLICY | `/time-access` |
| `/billing` | Billing | OPERATIONS | `/billing` |
| `/invoices` | Invoices | OPERATIONS | `/invoices` |
| `/vouchers` | Vouchers | OPERATIONS | `/vouchers` |
| `/reports` | Reports | OPERATIONS | `/reports` |
| `/complaints` | Complaints | *(removed from core)* | — |

---

## 9. 5M Concurrent Users: Scale Strategy

### 9.1 Infrastructure Topology

```
                    ┌──────────────────────────┐
                    │   LOAD BALANCER           │
                    │   (HAProxy / Nginx)       │
                    └────────┬─────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
   ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
   │ App Server 1│   │ App Server 2│   │ App Server 3│
   │ (Next.js)   │   │ (Next.js)   │   │ (Next.js)   │
   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
   ┌─────────────────────────┼─────────────────────┐
   │                         │                      │
   │  ┌──────────────┐  ┌────▼─────┐  ┌──────────┐ │
   │  │ FreeRADIUS   │  │ Postgres│  │ Redis    │ │
   │  │ (3 instances│  │ Primary  │  │ (cache)  │ │
   │  │  HA cluster)│  │ + 2 Reps │  │          │ │
   │  └──────────────┘  └────┬─────┘  └──────────┘ │
   │  ┌──────────────┐       │                       │
   │  │ Gateway Svc  │  ┌────▼─────┐               │
   │  │ (TC/QoS/DHCP)│  │ Postgres│               │
   │  └──────────────┘  │ Replica │               │
   │                     │ (RO for │               │
   │                     │  dash)  │               │
   │                     └─────────┘               │
   └──────────────────────────────────────────────┘
```

### 9.2 PostgreSQL Scaling

#### Connection Pooling
```yaml
# PgBouncer configuration
[pgbouncer]
pool_mode = transaction
max_client_conn = 10000
default_pool_size = 200
reserve_pool_size = 50
reserve_pool_timeout = 3
```

#### Partitioning (radacct)
- **By month**: Native PostgreSQL declarative partitioning on `acctstarttime`
- **Retention**: 12 months hot, archive older to cold storage
- **Expected size**: ~50M rows/month × 12 = 600M rows hot
- **Partition management**: Cron job creates next month's partition 7 days in advance

#### Indexing Strategy
```sql
-- Critical indexes for 5M concurrent sessions query performance
CREATE INDEX CONCURRENTLY idx_radacct_active_fast ON radacct (username, acctstoptime) 
    WHERE acctstoptime IS NULL;
    
CREATE INDEX CONCURRENTLY idx_radacct_nas_active ON radacct (nasipaddress, acctstoptime)
    WHERE acctstoptime IS NULL;

-- Partial indexes for common filter patterns
CREATE INDEX CONCURRENTLY idx_radacct_active_subnet ON radacct (framedipaddress)
    WHERE acctstoptime IS NULL;
```

#### Table-Specific Scaling

| Table | Strategy | Notes |
|---|---|---|
| `radcheck` | Read-heavy | Connection pool + prepared statements cache |
| `radreply` | Read-heavy | Same |
| `radgroupcheck` | Cache in Redis | Changes rarely, cache for 60s |
| `radgroupreply` | Cache in Redis | Changes rarely, cache for 60s |
| `radusergroup` | Read-heavy | Index on username |
| `radacct` (active) | Write-heavy (interim updates) | Partition + materialized view for reads |
| `radacct` (history) | Append-only | Partition by month, archive after 12 months |
| `IpAddress` | Read-heavy | Index on status + subnetId |
| `SessionEvent` | Write-heavy | Partition by month |

### 9.3 Redis Caching Layer

```
CACHE KEYS:
├── user:{username}:profile     → AaaUser profile (TTL: 60s)
├── user:{username}:policy      → Resolved policy attributes (TTL: 60s)
├── group:{groupname}:check     → radgroupcheck rows (TTL: 120s)
├── group:{groupname}:reply     → radgroupreply rows (TTL: 120s)
├── active:sessions:count       → COUNT(*) from mv_active_sessions (TTL: 30s)
├── active:sessions:by_nas:{ip} → Sessions for a NAS (TTL: 10s)
├── subnet:{id}:ip_pool         → Available IPs in subnet (TTL: 30s)
├── dashboard:stats             → Aggregated stats (TTL: 30s)
└── auth:{username}:lock        → Brute-force lockout (TTL: 900s)
```

### 9.4 FreeRADIUS Scaling

```
- 3 FreeRADIUS instances in HA (keepalived + CARP)
- Each handles ~1.7M users
- PostgreSQL connection pool: 200 per instance
- SQL module with prepared statements
- radacct writes balanced across replicas (write to primary, read from replicas)
- Interim accounting interval: 300s (configurable per group)
```

### 9.5 Gateway Service Scaling (TC/QoS)

```
- Single gateway server (TC/QoS must be on forwarding path)
- Max ~100K concurrent users per TC hierarchy (practical HTB limit)
- For 5M users: 50 gateway nodes with geo-distributed zones
- Each zone manages ~100K users via local TC/QoS
- Central RADIUS for auth, local session engine for enforcement
- DPDK/VPP migration path for 1M+ per node
```

### 9.6 Session Engine Scaling

```
- Session Engine is stateless (state in radacct + Redis)
- Multiple instances behind load balancer
- WebSocket fan-out via Redis pub/sub
- Auth via FreeRADIUS (shared cluster)
```

---

## 10. Sync Layer: Prisma ↔ FreeRADIUS Tables

### 10.1 Sync Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  SYNC ARCHITECTURE                            │
│                                                              │
│  ┌──────────────┐     SYNC      ┌──────────────────┐        │
│  │ Prisma ORM   │─────────────→│ radcheck          │        │
│  │ (AaaUser,    │             │ radreply          │        │
│  │  Plan)       │             │ radusergroup      │        │
│  └──────────────┘             │ radgroupcheck     │        │
│       ↑                       │ radgroupreply     │        │
│       │                       └──────────────────┘        │
│  ┌────┴─────────┐                      ↑                  │
│  │ API Routes   │              FreeRADIUS                 │
│  │ (Next.js)    │              SQL Module                  │
│  └──────────────┘              (direct queries)            │
│                                                              │
│  RULE: FreeRADIUS NEVER reads Prisma tables.               │
│        Prisma writes trigger sync to RADIUS tables.         │
│        Dashboard reads from materialized views (radacct).   │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Sync Functions

```typescript
// Sync layer: writes to both Prisma tables and raw RADIUS tables

async function createUser(data: CreateUserDTO) {
  return await db.$transaction(async (tx) => {
    // 1. Create AaaUser (Prisma)
    const user = await tx.aaaUser.create({ data });
    
    // 2. Sync to radcheck (password)
    await tx.$executeRaw`
      INSERT INTO radcheck (username, attribute, op, value)
      VALUES (${data.username}, 'Cleartext-Password', ':=', ${data.password})
    `;
    
    // 3. Sync to radusergroup
    if (data.groupName) {
      await tx.$executeRaw`
        INSERT INTO radusergroup (username, groupname, priority)
        VALUES (${data.username}, ${data.groupName}, 1)
      `;
    }
    
    // 4. Sync static IP to radreply if applicable
    if (data.staticIp) {
      await tx.$executeRaw`
        INSERT INTO radreply (username, attribute, op, value)
        VALUES (${data.username}, 'Framed-IP-Address', ':=', ${data.staticIp})
      `;
    }
    
    return user;
  });
}

async function updatePlan(data: UpdatePlanDTO) {
  return await db.$transaction(async (tx) => {
    // 1. Update Plan (Prisma)
    const plan = await tx.plan.update({ where: { id: data.id }, data });
    
    // 2. Sync speed to radgroupreply
    await tx.$executeRaw`
      DELETE FROM radgroupreply WHERE groupname = ${plan.name}
        AND attribute IN ('Mikrotik-Rate-Limit', 'WISPr-Bandwidth-Max-Down', 'WISPr-Bandwidth-Max-Up')
    `;
    await tx.$executeRaw`
      INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES
        (${plan.name}, 'Mikrotik-Rate-Limit', ':=', ${formatMikrotikRate(plan)}),
        (${plan.name}, 'WISPr-Bandwidth-Max-Down', ':=', ${String(plan.downloadSpeedKbps)}),
        (${plan.name}, 'WISPr-Bandwidth-Max-Up', ':=', ${String(plan.uploadSpeedKbps)})
    `;
    
    // 3. Sync data limit to radgroupcheck
    await tx.$executeRaw`
      DELETE FROM radgroupcheck WHERE groupname = ${plan.name} 
        AND attribute = 'Max-Monthly-Volume'
    `;
    if (plan.dataLimitMb) {
      await tx.$executeRaw`
        INSERT INTO radgroupcheck (groupname, attribute, op, value)
        VALUES (${plan.name}, 'Max-Monthly-Volume', ':=', ${String(plan.dataLimitMb)})
      `;
    }
    
    // 4. Sync timeouts to radgroupcheck
    await tx.$executeRaw`
      DELETE FROM radgroupcheck WHERE groupname = ${plan.name} 
        AND attribute IN ('Session-Timeout', 'Idle-Timeout', 'Simultaneous-Use')
    `;
    const checks = [];
    if (plan.sessionTimeoutSec) checks.push(`(${plan.name}, 'Session-Timeout', ':=', ${String(plan.sessionTimeoutSec)})`);
    if (plan.idleTimeoutSec) checks.push(`(${plan.name}, 'Idle-Timeout', ':=', ${String(plan.idleTimeoutSec)})`);
    if (plan.maxConcurrent > 1) checks.push(`(${plan.name}, 'Simultaneous-Use', ':=', ${String(plan.maxConcurrent)})`);
    if (checks.length) {
      await tx.$executeRaw`INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES ${checks.join(',')}`;
    }
    
    // 5. Invalidate Redis cache for this group
    await redis.del(`group:${plan.name}:check`, `group:${plan.name}:reply`);
    
    return plan;
  });
}
```

---

## 11. Implementation Phases

### Phase 1: Foundation (Week 1-2)
| # | Task | Priority |
|---|---|---|
| 1 | Create FreeRADIUS native tables (radcheck, radreply, radgroupcheck, radgroupreply, radusergroup) in PostgreSQL | P0 |
| 2 | Create radacct with monthly partitioning | P0 |
| 3 | Create AaaUser model in Prisma (replacing Subscriber for AAA) | P0 |
| 4 | Build sync layer: AaaUser CRUD → radcheck/radreply/radusergroup | P0 |
| 5 | Build sync layer: Plan CRUD → radgroupcheck/radgroupreply | P0 |
| 6 | Configure FreeRADIUS SQL module to use native tables | P0 |
| 7 | Data migration: Subscriber → AaaUser + radcheck | P0 |

### Phase 2: Session Unification (Week 3-4)
| # | Task | Priority |
|---|---|---|
| 8 | Point Session Engine to write to radacct (nas_type='BUILTIN') | P0 |
| 9 | Create materialized view mv_active_sessions | P0 |
| 10 | Migrate RadiusSession data to radacct | P1 |
| 11 | Drop RadiusSession, RadiusAccountingLog tables | P1 |
| 12 | Drop RadiusUser table | P1 |
| 13 | Policy engine service (port 3008) | P1 |

### Phase 3: Navigation Restructure (Week 5)
| # | Task | Priority |
|---|---|---|
| 14 | New sidebar component with 7 sections | P1 |
| 15 | Rename Subscribers page → Users page | P1 |
| 16 | Merge Plans page into User Groups page | P1 |
| 17 | Sessions page reads from mv_active_sessions | P1 |
| 18 | Auth Log reads from SessionEvent | P1 |

### Phase 4: IPAM Enhancement (Week 6)
| # | Task | Priority |
|---|---|---|
| 19 | Add ipAssignmentMode to Subnet | P1 |
| 20 | IP assignment flow (static/DHCP/ALL/NONE) | P1 |
| 21 | Sync IP assignment to radreply | P1 |
| 22 | Kea DHCP integration with IpAddress table | P2 |

### Phase 5: Scale (Week 7-8)
| # | Task | Priority |
|---|---|---|
| 23 | Redis caching layer for group policies | P1 |
| 24 | PgBouncer connection pooling | P1 |
| 25 | radacct archive/retention cron | P2 |
| 26 | FreeRADIUS HA cluster setup | P2 |
| 27 | Performance testing at 100K concurrent | P1 |

### Phase 6: Cleanup & Polish (Week 9-10)
| # | Task | Priority |
|---|---|---|
| 28 | Drop RadiusGroup (replaced by radgroupcheck/radgroupreply) | P2 |
| 29 | Drop UserRadiusAttribute (replaced by radreply) | P2 |
| 30 | Restructure IspSettings → PlatformConfig | P2 |
| 31 | Documentation updates | P2 |
| 32 | Rename subscriber references in UI/API | P2 |

---

## 12. Service Architecture (Final)

```
┌──────────────────────────────────────────────────────────────┐
│                    MINI-SERVICES                              │
│                                                               │
│  ┌────────────────┐  Port 3001  RADIUS User Management      │
│  │ radius-service  │           + FreeRADIUS config generation │
│  └────────────────┘                                          │
│  ┌────────────────┐  Port 3005  Network Gateway              │
│  │ gateway-service │           TC/QoS, DHCP, DNS, Firewall  │
│  └────────────────┘                                          │
│  ┌────────────────┐  Port 3008  Policy Enforcement           │
│  │ policy-engine   │           Data/time/idle limits        │
│  └────────────────┘                                          │
│  ┌────────────────┐  Port 3010  Built-in NAS Session Engine  │
│  │ session-engine  │           PPPoE/DHCP/CP sessions       │
│  └────────────────┘                                          │
│  ┌────────────────┐  Port 3030  IPS Daemon                   │
│  │ ips-daemon      │           nDPI detection + nftables     │
│  └────────────────┘                                          │
│  ┌────────────────┐  Port 3031  Deep Packet Inspection       │
│  │ ndpi-service    │           Application identification   │
│  └────────────────┘                                          │
│  ┌────────────────┐  —         Billing Cron                 │
│  │ billing-cron    │           Invoice generation            │
│  └────────────────┘                                          │
│  ┌────────────────┐  —         SNMP Polling                  │
│  │ snmp-service    │           Device monitoring             │
│  └────────────────┘                                          │
│  ┌────────────────┐  —         Syslog Collection            │
│  │ syslog-service  │           Centralized logging          │
│  └────────────────┘                                          │
│  ┌────────────────┐  —         Diameter (WiFi Offload)       │
│  │ diameter-service│           Gy/Gx/SWa simulation          │
│  └────────────────┘                                          │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   FREE RADIUS (standalone)               ││
│  │  Auth: radcheck + radreply + radusergroup              ││
│  │  Policy: radgroupcheck + radgroupreply                 ││
│  │  Accounting: radacct (partitioned by month)            ││
│  │  HA: 3 instances with keepalived                       ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

---

## 13. Summary: Key Architecture Principles

1. **FreeRADIUS tables = backbone** — No parallel session systems, no ORM on auth path
2. **AaaUser IS the RADIUS user** — username maps 1:1 to radcheck username
3. **Plan = RADIUS Group** — All policy via radgroupcheck/radgroupreply, synced on CRUD
4. **Session = radacct** — Real-time from FreeRADIUS, no custom session tables
5. **IPAM before user creation** — Subnet → IP pool → User assignment
6. **Policy = RADIUS attributes** — Data cap, speed, time, FUP, concurrent, QoS all as RADIUS attrs
7. **Built-in NAS + External NAS** — Session engine for captive/PPPoE, FreeRADIUS for all NAS types
8. **Direct SQL for auth** — FreeRADIUS SQL module queries PostgreSQL directly, zero ORM overhead
9. **Prisma for management** — Admin UI uses Prisma ORM, but syncs to raw RADIUS tables
10. **Scale via partitioning + caching** — radacct partitioned by month, policies cached in Redis, PgBouncer for connection pooling

---

*End of Document*
