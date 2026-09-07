// =====================================================================
// MODULE CATALOG — All Cryptsk modules declared here.
// This is the authoritative functional scope of the platform.
// New modules MUST be added here with full metadata.
// =====================================================================

import type { CryptskModule } from "./types";

export const MODULE_CATALOG: CryptskModule[] = [
  // -------------------------------------------------------------------
  // CORE (cannot be disabled)
  // -------------------------------------------------------------------
  {
    id: "core",
    name: "Core Platform",
    description:
      "Authentication, authorization, audit, system configuration, and module management. The foundation every Cryptsk deployment requires.",
    version: "1.0.0",
    category: "core",
    permissions: [
      "system.settings.read",
      "system.settings.update",
      "module.manage",
      "audit.read",
      "role.manage",
      "user.manage",
    ],
    resources: ["full-stack"],
    hasWorker: false,
    requiresExternalConnection: false,
    defaultEnabled: true,
    coreModule: true,
    licenseTier: "community",
    navigation: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: "LayoutDashboard",
        children: [
          {
            id: "dashboard-overview",
            label: "Overview",
            icon: "Gauge",
            href: "/",
          },
        ],
      },
      {
        id: "admin",
        label: "Administration",
        icon: "Settings",
        permission: "system.settings.read",
        children: [
          {
            id: "modules",
            label: "Module Manager",
            icon: "Boxes",
            href: "/admin/modules",
            permission: "module.manage",
          },
          {
            id: "users",
            label: "Users",
            icon: "Users",
            href: "/admin/users",
            permission: "user.manage",
          },
          {
            id: "roles",
            label: "Roles & Permissions",
            icon: "ShieldCheck",
            href: "/admin/roles",
            permission: "role.manage",
          },
          {
            id: "audit",
            label: "Audit Log",
            icon: "ScrollText",
            href: "/admin/audit",
            permission: "audit.read",
          },
          {
            id: "settings",
            label: "System Settings",
            icon: "Settings",
            href: "/admin/settings",
            permission: "system.settings.read",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // CUSTOMER MANAGEMENT
  // -------------------------------------------------------------------
  {
    id: "subscribers",
    name: "Subscribers",
    description:
      "Subscriber lifecycle: create, provision, assign plans, suspend, reactivate, terminate. Customer 360 view with full history.",
    version: "1.0.0",
    category: "customer",
    industries: ["isp", "telecom", "hospitality"],
    dependencies: ["core"],
    permissions: [
      "subscriber.read",
      "subscriber.create",
      "subscriber.update",
      "subscriber.delete",
      "subscriber.suspend",
      "subscriber.reactivate",
      "subscriber.terminate",
      "subscriber.import",
      "subscriber.export",
    ],
    resources: ["full-stack"],
    hasWorker: false,
    requiresExternalConnection: false,
    defaultEnabled: true,
    coreModule: false,
    licenseTier: "standard",
    navigation: [
      {
        id: "customer",
        label: "Customers",
        icon: "Users",
        permission: "subscriber.read",
        children: [
          {
            id: "subscribers-list",
            label: "Subscribers",
            icon: "UserCircle",
            href: "/subscribers",
            permission: "subscriber.read",
          },
          {
            id: "plans",
            label: "Plans",
            icon: "Package",
            href: "/plans",
            permission: "subscriber.read",
          },
          {
            id: "batch-provisioning",
            label: "Batch Provisioning",
            icon: "UserPlus",
            href: "/subscribers/batch",
            permission: "subscriber.create",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // AAA — the strategic differentiator
  // -------------------------------------------------------------------
  {
    id: "aaa",
    name: "AAA & RADIUS Gateway",
    description:
      "Full RADIUS Authentication, Authorization, and Accounting. Active session management, CoA, Disconnect, session history. Production target: 100K concurrent sessions.",
    version: "1.0.0",
    category: "aaa",
    industries: ["isp", "telecom", "enterprise", "campus"],
    dependencies: ["core", "subscribers"],
    permissions: [
      "aaa.session.read",
      "aaa.session.disconnect",
      "aaa.session.coa",
      "aaa.nas.read",
      "aaa.nas.create",
      "aaa.nas.update",
      "aaa.nas.delete",
      "aaa.history.read",
      "aaa.authlog.read",
      "aaa.radius.configure",
    ],
    resources: ["full-stack", "with-worker", "external-connection"],
    hasWorker: true,
    requiresExternalConnection: true,
    defaultEnabled: true,
    coreModule: false,
    licenseTier: "enterprise",
    navigation: [
      {
        id: "aaa",
        label: "AAA & Access",
        icon: "KeyRound",
        permission: "aaa.session.read",
        children: [
          {
            id: "active-sessions",
            label: "Active Sessions",
            icon: "Radio",
            href: "/aaa/sessions",
            permission: "aaa.session.read",
            badgeKey: "activeSessions",
          },
          {
            id: "session-history",
            label: "Session History",
            icon: "History",
            href: "/aaa/history",
            permission: "aaa.history.read",
          },
          {
            id: "nas-clients",
            label: "NAS Clients",
            icon: "Server",
            href: "/aaa/nas",
            permission: "aaa.nas.read",
          },
          {
            id: "auth-logs",
            label: "Authentication Logs",
            icon: "FileKey",
            href: "/aaa/logs",
            permission: "aaa.authlog.read",
          },
          {
            id: "radius-config",
            label: "RADIUS Configuration",
            icon: "Settings2",
            href: "/aaa/radius",
            permission: "aaa.radius.configure",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // NETWORK
  // -------------------------------------------------------------------
  {
    id: "network",
    name: "Network Management",
    description:
      "IPAM, subnets, DHCP, DNS, PPPoE, system interfaces, MultiWAN, dynamic routing. Production adapters; sandbox-safe stubs documented as external dependencies.",
    version: "1.0.0",
    category: "network",
    industries: ["isp", "telecom", "enterprise", "datacenter"],
    dependencies: ["core"],
    permissions: [
      "network.ipam.read",
      "network.ipam.write",
      "network.dhcp.read",
      "network.dhcp.write",
      "network.dns.read",
      "network.dns.write",
      "network.interface.read",
      "network.pppoe.read",
      "network.pppoe.write",
    ],
    resources: ["full-stack", "external-connection"],
    hasWorker: true,
    requiresExternalConnection: true,
    defaultEnabled: true,
    coreModule: false,
    licenseTier: "enterprise",
    navigation: [
      {
        id: "network",
        label: "Network",
        icon: "Network",
        permission: "network.ipam.read",
        children: [
          {
            id: "ipam",
            label: "IPAM",
            icon: "Subnet",
            href: "/network/ipam",
            permission: "network.ipam.read",
          },
          {
            id: "subnets",
            label: "Subnets",
            icon: "GitBranch",
            href: "/network/subnets",
            permission: "network.ipam.read",
          },
          {
            id: "dhcp",
            label: "DHCP",
            icon: "Server",
            href: "/network/dhcp",
            permission: "network.dhcp.read",
          },
          {
            id: "dns",
            label: "DNS",
            icon: "Globe",
            href: "/network/dns",
            permission: "network.dns.read",
          },
          {
            id: "interfaces",
            label: "Interfaces",
            icon: "Cable",
            href: "/network/interfaces",
            permission: "network.interface.read",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // POLICY
  // -------------------------------------------------------------------
  {
    id: "policy",
    name: "Policy & QoS",
    description:
      "Bandwidth management, QoS queues, time-based access, firewall rules, security profiles, IPS. Integrates with subscribers and plans.",
    version: "1.0.0",
    category: "policy",
    industries: ["isp", "telecom", "enterprise", "campus"],
    dependencies: ["core", "subscribers"],
    permissions: [
      "policy.bandwidth.read",
      "policy.bandwidth.write",
      "policy.qos.read",
      "policy.qos.write",
      "policy.firewall.read",
      "policy.firewall.write",
      "policy.timeaccess.read",
      "policy.timeaccess.write",
    ],
    resources: ["full-stack"],
    hasWorker: false,
    requiresExternalConnection: false,
    defaultEnabled: true,
    coreModule: false,
    licenseTier: "enterprise",
    navigation: [
      {
        id: "policy",
        label: "Policy",
        icon: "Shield",
        permission: "policy.bandwidth.read",
        children: [
          {
            id: "bandwidth",
            label: "Bandwidth Profiles",
            icon: "Gauge",
            href: "/policy/bandwidth",
            permission: "policy.bandwidth.read",
          },
          {
            id: "qos",
            label: "QoS Queues",
            icon: "Layers",
            href: "/policy/qos",
            permission: "policy.qos.read",
          },
          {
            id: "firewall",
            label: "Firewall Rules",
            icon: "Flame",
            href: "/policy/firewall",
            permission: "policy.firewall.read",
          },
          {
            id: "time-access",
            label: "Time Access",
            icon: "Clock",
            href: "/policy/time-access",
            permission: "policy.timeaccess.read",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // MONITORING
  // -------------------------------------------------------------------
  {
    id: "monitoring",
    name: "Monitoring & Analytics",
    description:
      "Real-time bandwidth, traffic analytics, uptime, latency, alerts, syslog, diagnostics, IP-MAC history, zone budgets.",
    version: "1.0.0",
    category: "monitoring",
    dependencies: ["core"],
    permissions: [
      "monitoring.read",
      "monitoring.alerts.read",
      "monitoring.alerts.ack",
      "monitoring.logs.read",
      "monitoring.diagnose",
    ],
    resources: ["full-stack", "with-worker"],
    hasWorker: true,
    requiresExternalConnection: false,
    defaultEnabled: true,
    coreModule: false,
    licenseTier: "standard",
    navigation: [
      {
        id: "monitoring",
        label: "Monitoring",
        icon: "Activity",
        permission: "monitoring.read",
        children: [
          {
            id: "bandwidth",
            label: "Bandwidth",
            icon: "TrendingUp",
            href: "/monitoring/bandwidth",
            permission: "monitoring.read",
          },
          {
            id: "traffic",
            label: "Traffic Analytics",
            icon: "BarChart3",
            href: "/monitoring/traffic",
            permission: "monitoring.read",
          },
          {
            id: "alerts",
            label: "Alerts",
            icon: "Bell",
            href: "/monitoring/alerts",
            permission: "monitoring.alerts.read",
            badgeKey: "openAlerts",
          },
          {
            id: "uptime",
            label: "Uptime & Latency",
            icon: "Pulse",
            href: "/monitoring/uptime",
            permission: "monitoring.read",
          },
          {
            id: "syslog",
            label: "Syslog",
            icon: "FileText",
            href: "/monitoring/syslog",
            permission: "monitoring.logs.read",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // BILLING
  // -------------------------------------------------------------------
  {
    id: "billing",
    name: "Billing & Invoicing",
    description:
      "Recurring/cyclic billing, invoices, grace periods, suspension automation, add-ons, top-ups, vouchers, discounts, tax. Decimal-safe money.",
    version: "1.0.0",
    category: "finance",
    dependencies: ["core", "subscribers"],
    permissions: [
      "billing.invoice.read",
      "billing.invoice.create",
      "billing.invoice.update",
      "billing.invoice.cancel",
      "billing.run",
      "billing.voucher.read",
      "billing.voucher.write",
    ],
    resources: ["full-stack", "with-worker", "scheduled-jobs"],
    hasWorker: true,
    requiresExternalConnection: false,
    defaultEnabled: true,
    coreModule: false,
    licenseTier: "standard",
    navigation: [
      {
        id: "billing",
        label: "Billing",
        icon: "ReceiptText",
        permission: "billing.invoice.read",
        children: [
          {
            id: "invoices",
            label: "Invoices",
            icon: "FileText",
            href: "/billing/invoices",
            permission: "billing.invoice.read",
          },
          {
            id: "run-billing",
            label: "Run Billing",
            icon: "Play",
            href: "/billing/run",
            permission: "billing.run",
          },
          {
            id: "vouchers",
            label: "Vouchers",
            icon: "Ticket",
            href: "/billing/vouchers",
            permission: "billing.voucher.read",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // PAYMENTS
  // -------------------------------------------------------------------
  {
    id: "payments",
    name: "Payments",
    description:
      "Payment gateway abstraction, adapter architecture (Stripe, Razorpay, PayPal, manual), reconciliation, refunds, payment history.",
    version: "1.0.0",
    category: "finance",
    dependencies: ["core", "billing"],
    permissions: [
      "payment.read",
      "payment.create",
      "payment.refund",
      "payment.reconcile",
      "payment.gateway.configure",
    ],
    resources: ["full-stack", "external-connection"],
    hasWorker: false,
    requiresExternalConnection: true,
    defaultEnabled: true,
    coreModule: false,
    licenseTier: "standard",
    navigation: [
      {
        id: "payments",
        label: "Payments",
        icon: "CreditCard",
        permission: "payment.read",
        children: [
          {
            id: "payments-list",
            label: "Payments",
            icon: "CircleDollarSign",
            href: "/payments",
            permission: "payment.read",
          },
          {
            id: "gateways",
            label: "Payment Gateways",
            icon: "Plug",
            href: "/payments/gateways",
            permission: "payment.gateway.configure",
          },
          {
            id: "reconciliation",
            label: "Reconciliation",
            icon: "Scale",
            href: "/payments/reconciliation",
            permission: "payment.reconcile",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // OPERATIONS
  // -------------------------------------------------------------------
  {
    id: "operations",
    name: "Operations",
    description:
      "Complaints, technicians, agents, installations, inventory, incidents, leads, resellers, action history, announcements.",
    version: "1.0.0",
    category: "operations",
    dependencies: ["core", "subscribers"],
    permissions: [
      "ops.complaint.read",
      "ops.complaint.write",
      "ops.technician.read",
      "ops.technician.write",
      "ops.installation.read",
      "ops.installation.write",
      "ops.inventory.read",
      "ops.inventory.write",
      "ops.incident.read",
      "ops.incident.write",
      "ops.lead.read",
      "ops.lead.write",
    ],
    resources: ["full-stack"],
    hasWorker: false,
    requiresExternalConnection: false,
    defaultEnabled: true,
    coreModule: false,
    licenseTier: "standard",
    navigation: [
      {
        id: "operations",
        label: "Operations",
        icon: "Wrench",
        permission: "ops.complaint.read",
        children: [
          {
            id: "complaints",
            label: "Complaints",
            icon: "MessageSquareWarning",
            href: "/operations/complaints",
            permission: "ops.complaint.read",
            badgeKey: "openComplaints",
          },
          {
            id: "technicians",
            label: "Technicians",
            icon: "HardHat",
            href: "/operations/technicians",
            permission: "ops.technician.read",
          },
          {
            id: "installations",
            label: "Installations",
            icon: "Hammer",
            href: "/operations/installations",
            permission: "ops.installation.read",
          },
          {
            id: "inventory",
            label: "Inventory",
            icon: "Boxes",
            href: "/operations/inventory",
            permission: "ops.inventory.read",
          },
          {
            id: "incidents",
            label: "Incidents",
            icon: "AlertTriangle",
            href: "/operations/incidents",
            permission: "ops.incident.read",
            badgeKey: "openIncidents",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // FINANCE & INTELLIGENCE
  // -------------------------------------------------------------------
  {
    id: "finance",
    name: "Finance & Intelligence",
    description:
      "Revenue reports, forecasting, collections, due recovery, GST/tax, referrals, loyalty, smart collections, revenue leakage, compliance, SLA, reseller intelligence, data export.",
    version: "1.0.0",
    category: "finance",
    dependencies: ["core", "billing", "payments"],
    permissions: [
      "finance.report.read",
      "finance.report.export",
      "finance.collection.read",
      "finance.collection.write",
      "finance.tax.read",
      "finance.tax.write",
    ],
    resources: ["full-stack", "scheduled-jobs"],
    hasWorker: true,
    requiresExternalConnection: false,
    defaultEnabled: false,
    coreModule: false,
    licenseTier: "enterprise",
    navigation: [
      {
        id: "finance",
        label: "Finance",
        icon: "Landmark",
        permission: "finance.report.read",
        children: [
          {
            id: "revenue",
            label: "Revenue Reports",
            icon: "DollarSign",
            href: "/finance/revenue",
            permission: "finance.report.read",
          },
          {
            id: "collections",
            label: "Collections",
            icon: "Wallet",
            href: "/finance/collections",
            permission: "finance.collection.read",
          },
          {
            id: "tax",
            label: "Tax / GST",
            icon: "Receipt",
            href: "/finance/tax",
            permission: "finance.tax.read",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // DEVICE MANAGEMENT
  // -------------------------------------------------------------------
  {
    id: "devices",
    name: "Device Management",
    description:
      "TR-069 ACS, MikroTik Manager, SSH Device Manager, SNMP Manager, OLT/GPON management. Adapter architecture per device family.",
    version: "1.0.0",
    category: "devices",
    industries: ["isp", "telecom", "enterprise"],
    dependencies: ["core", "network"],
    permissions: [
      "device.read",
      "device.write",
      "device.tr069.read",
      "device.tr069.write",
      "device.mikrotik.read",
      "device.mikrotik.write",
      "device.gpon.read",
      "device.gpon.write",
    ],
    resources: ["full-stack", "external-connection"],
    hasWorker: true,
    requiresExternalConnection: true,
    defaultEnabled: false,
    coreModule: false,
    licenseTier: "enterprise",
    navigation: [
      {
        id: "devices",
        label: "Devices",
        icon: "Router",
        permission: "device.read",
        children: [
          {
            id: "tr069",
            label: "TR-069 ACS",
            icon: "Cpu",
            href: "/devices/tr069",
            permission: "device.tr069.read",
          },
          {
            id: "mikrotik",
            label: "MikroTik",
            icon: "Router",
            href: "/devices/mikrotik",
            permission: "device.mikrotik.read",
          },
          {
            id: "gpon",
            label: "GPON / OLT",
            icon: "Cable",
            href: "/devices/gpon",
            permission: "device.gpon.read",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // COMMUNICATION
  // -------------------------------------------------------------------
  {
    id: "communication",
    name: "Communication",
    description:
      "Email, SMS, WhatsApp, push notifications, templates, notification rules. Every channel is an optional adapter.",
    version: "1.0.0",
    category: "communication",
    dependencies: ["core"],
    permissions: [
      "comm.template.read",
      "comm.template.write",
      "comm.rule.read",
      "comm.rule.write",
      "comm.send",
    ],
    resources: ["full-stack", "external-connection", "with-worker"],
    hasWorker: true,
    requiresExternalConnection: true,
    defaultEnabled: false,
    coreModule: false,
    licenseTier: "standard",
    navigation: [
      {
        id: "communication",
        label: "Communication",
        icon: "MessageSquare",
        permission: "comm.template.read",
        children: [
          {
            id: "templates",
            label: "Templates",
            icon: "FileText",
            href: "/communication/templates",
            permission: "comm.template.read",
          },
          {
            id: "rules",
            label: "Notification Rules",
            icon: "Bell",
            href: "/communication/rules",
            permission: "comm.rule.read",
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // AI
  // -------------------------------------------------------------------
  {
    id: "ai",
    name: "AI Intelligence",
    description:
      "AI Advisor, AI Diagnosis, churn prediction, churn alerts, competitor intelligence, operational recommendations. Optional — never blocks core OSS/BSS.",
    version: "1.0.0",
    category: "ai",
    dependencies: ["core", "monitoring", "subscribers"],
    permissions: [
      "ai.advisor.use",
      "ai.diagnosis.use",
      "ai.churn.read",
      "ai.competitor.read",
    ],
    resources: ["full-stack", "with-worker", "external-connection"],
    hasWorker: true,
    requiresExternalConnection: true,
    defaultEnabled: false,
    coreModule: false,
    licenseTier: "enterprise",
    navigation: [
      {
        id: "ai",
        label: "AI Intelligence",
        icon: "Sparkles",
        permission: "ai.advisor.use",
        children: [
          {
            id: "advisor",
            label: "AI Advisor",
            icon: "Bot",
            href: "/ai/advisor",
            permission: "ai.advisor.use",
          },
          {
            id: "diagnosis",
            label: "AI Diagnosis",
            icon: "Stethoscope",
            href: "/ai/diagnosis",
            permission: "ai.diagnosis.use",
          },
          {
            id: "churn",
            label: "Churn Prediction",
            icon: "TrendingDown",
            href: "/ai/churn",
            permission: "ai.churn.read",
          },
        ],
      },
    ],
  },
];

/** Lookup map for O(1) access by id */
export const MODULE_MAP: Record<string, CryptskModule> = Object.fromEntries(
  MODULE_CATALOG.map((m) => [m.id, m])
);

/** All permissions declared across all modules (for seeding) */
export const ALL_PERMISSIONS: string[] = Array.from(
  new Set(MODULE_CATALOG.flatMap((m) => m.permissions))
);
