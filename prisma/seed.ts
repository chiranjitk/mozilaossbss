// =====================================================================
// SEED — Demo tenant, admin user, system roles, permissions, default modules
// Run with: bun run db:seed
// NEVER run automatically in production.
// =====================================================================

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/crypto/password";
import { MODULE_CATALOG, ALL_PERMISSIONS } from "../src/core/modules/catalog";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Cryptsk database…");

  // -------------------------------------------------------------------
  // 1. Demo tenant
  // -------------------------------------------------------------------
  const tenant = await db.tenant.upsert({
    where: { slug: "cryptsk-demo" },
    update: {},
    create: {
      name: "Cryptsk Demo ISP",
      slug: "cryptsk-demo",
      edition: "isp",
      timezone: "Asia/Kolkata",
      locale: "en",
      currency: "INR",
      status: "active",
    },
  });
  console.log(`✓ Tenant: ${tenant.name} (${tenant.slug})`);

  // -------------------------------------------------------------------
  // 2. Permissions — seeded from the module catalog
  // -------------------------------------------------------------------
  for (const key of ALL_PERMISSIONS) {
    const [module, action] = key.split(".");
    await db.permission.upsert({
      where: { key },
      update: {},
      create: {
        key,
        module,
        action,
        description: `${module}.${action} permission`,
      },
    });
  }
  console.log(`✓ ${ALL_PERMISSIONS.length} permissions seeded`);

  // -------------------------------------------------------------------
  // 3. System roles
  // -------------------------------------------------------------------
  const allPerms = await db.permission.findMany();

  const superAdmin = await db.role.upsert({
    where: { name: "super_admin" },
    update: {},
    create: {
      name: "super_admin",
      description: "Full system access — super administrator",
      isSystem: true,
    },
  });
  // Attach all permissions to super_admin
  await db.rolePermission.deleteMany({ where: { roleId: superAdmin.id } });
  await db.rolePermission.createMany({
    data: allPerms.map((p) => ({ roleId: superAdmin.id, permissionId: p.id })),
  });
  console.log(`✓ Role: super_admin (${allPerms.length} permissions)`);

  const adminRole = await db.role.upsert({
    where: { name: "admin" },
    update: {},
    create: {
      name: "admin",
      description: "Administrator — most operations",
      isSystem: true,
    },
  });
  // Admin gets everything except a few destructive system perms
  const adminPerms = allPerms.filter(
    (p) => !["system.settings.update", "module.manage"].includes(p.key)
  );
  await db.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
  await db.rolePermission.createMany({
    data: adminPerms.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
  });
  console.log(`✓ Role: admin (${adminPerms.length} permissions)`);

  await db.role.upsert({
    where: { name: "network_engineer" },
    update: {},
    create: {
      name: "network_engineer",
      description: "Network operations — sessions, NAS, monitoring",
      isSystem: true,
    },
  });

  await db.role.upsert({
    where: { name: "finance_manager" },
    update: {},
    create: {
      name: "finance_manager",
      description: "Billing & payments — invoices, payments, finance reports",
      isSystem: true,
    },
  });

  await db.role.upsert({
    where: { name: "support_agent" },
    update: {},
    create: {
      name: "support_agent",
      description: "Support — subscriber read, complaints",
      isSystem: true,
    },
  });

  await db.role.upsert({
    where: { name: "technician" },
    update: {},
    create: {
      name: "technician",
      description: "Field technician — installations, complaints assigned",
      isSystem: true,
    },
  });

  await db.role.upsert({
    where: { name: "read_only" },
    update: {},
    create: {
      name: "read_only",
      description: "Read-only auditor",
      isSystem: true,
    },
  });

  // -------------------------------------------------------------------
  // 4. Admin user
  // -------------------------------------------------------------------
  const passwordHash = await hashPassword("admin123");
  const admin = await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "admin@cryptsk.local",
      username: "admin",
      passwordHash,
      name: "Cryptsk Administrator",
      status: "active",
    },
  });

  // Attach super_admin role
  await db.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superAdmin.id } },
    update: {},
    create: { userId: admin.id, roleId: superAdmin.id },
  });
  console.log(`✓ User: admin (super_admin) · password: admin123`);

  // -------------------------------------------------------------------
  // 5. Module states — enable defaults per catalog
  // -------------------------------------------------------------------
  for (const mod of MODULE_CATALOG) {
    const enabled = mod.coreModule || mod.defaultEnabled;
    await db.moduleState.upsert({
      where: { tenantId_moduleId: { tenantId: tenant.id, moduleId: mod.id } },
      update: {},
      create: {
        tenantId: tenant.id,
        moduleId: mod.id,
        enabled,
        licensed: true,
        health: enabled ? "healthy" : "unknown",
        workerStatus: mod.hasWorker && enabled ? "stopped" : "stopped",
      },
    });
  }
  const enabledCount = MODULE_CATALOG.filter((m) => m.coreModule || m.defaultEnabled).length;
  console.log(`✓ Modules: ${enabledCount}/${MODULE_CATALOG.length} enabled by default`);

  // -------------------------------------------------------------------
  // 6. Demo plan
  // -------------------------------------------------------------------
  const plan = await db.plan.upsert({
    where: { code: "BASIC-50MBPS" },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Basic 50 Mbps",
      code: "BASIC-50MBPS",
      description: "50 Mbps down / 10 Mbps up, 500 GB data cap",
      price: 499,
      currency: "INR",
      billingCycle: "monthly",
      downloadSpeed: 51200,
      uploadSpeed: 10240,
      dataCap: 500000,
      sessionLimit: 1,
      taxRate: 0.18,
      status: "active",
    },
  });
  console.log(`✓ Plan: ${plan.name} (${plan.code})`);

  const plan2 = await db.plan.upsert({
    where: { code: "PRO-100MBPS" },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Pro 100 Mbps",
      code: "PRO-100MBPS",
      description: "100 Mbps down / 20 Mbps up, unlimited",
      price: 799,
      currency: "INR",
      billingCycle: "monthly",
      downloadSpeed: 102400,
      uploadSpeed: 20480,
      dataCap: 0,
      sessionLimit: 2,
      taxRate: 0.18,
      status: "active",
    },
  });
  console.log(`✓ Plan: ${plan2.name} (${plan2.code})`);

  // -------------------------------------------------------------------
  // 7. Demo NAS client
  // -------------------------------------------------------------------
  const nas = await db.nasClient.upsert({
    where: { ipAddress: "10.0.0.1" },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "MikroTik Router 1",
      ipAddress: "10.0.0.1",
      sharedSecret: "cryptsk-shared-secret",
      type: "mikrotik",
      coaPort: 3799,
      status: "active",
    },
  });
  console.log(`✓ NAS: ${nas.name} (${nas.ipAddress})`);

  // -------------------------------------------------------------------
  // 8. Demo subscriber + session (so dashboard KPIs are non-zero)
  // -------------------------------------------------------------------
  const subPassword = await hashPassword("subscriber123");
  const subscriber = await db.subscriber.upsert({
    where: { customerId: "CUST-0001" },
    update: {},
    create: {
      tenantId: tenant.id,
      customerId: "CUST-0001",
      firstName: "Rahul",
      lastName: "Sharma",
      email: "rahul.sharma@example.com",
      phone: "+91 98765 43210",
      address: "12 MG Road, Bengaluru, KA 560001",
      status: "active",
      planId: plan2.id,
      username: "rahul.sharma",
      passwordHash: subPassword,
    },
  });
  console.log(`✓ Subscriber: ${subscriber.firstName} ${subscriber.lastName} (${subscriber.customerId})`);

  const subscriber2 = await db.subscriber.upsert({
    where: { customerId: "CUST-0002" },
    update: {},
    create: {
      tenantId: tenant.id,
      customerId: "CUST-0002",
      firstName: "Priya",
      lastName: "Patel",
      email: "priya.patel@example.com",
      phone: "+91 98765 12345",
      status: "active",
      planId: plan.id,
      username: "priya.patel",
      passwordHash: await hashPassword("subscriber123"),
    },
  });

  const subscriber3 = await db.subscriber.upsert({
    where: { customerId: "CUST-0003" },
    update: {},
    create: {
      tenantId: tenant.id,
      customerId: "CUST-0003",
      firstName: "Amit",
      lastName: "Kumar",
      email: "amit.kumar@example.com",
      phone: "+91 99887 76655",
      status: "suspended",
      planId: plan.id,
      username: "amit.kumar",
      passwordHash: await hashPassword("subscriber123"),
    },
  });

  // Demo active sessions
  await db.activeSession.upsert({
    where: { sessionId: "session-0001" },
    update: {},
    create: {
      tenantId: tenant.id,
      sessionId: "session-0001",
      subscriberId: subscriber.id,
      nasId: nas.id,
      operatorId: admin.id,
      username: subscriber.username!,
      nasIpAddress: nas.ipAddress,
      framedIpAddress: "192.168.1.100",
      nasPortId: "ether1",
      callingStationId: "AA:BB:CC:DD:EE:01",
      calledStationId: nas.ipAddress,
      protocol: "PPPoE",
      sessionTimeout: 86400,
      status: "active",
    },
  });

  await db.activeSession.upsert({
    where: { sessionId: "session-0002" },
    update: {},
    create: {
      tenantId: tenant.id,
      sessionId: "session-0002",
      subscriberId: subscriber2.id,
      nasId: nas.id,
      username: subscriber2.username!,
      nasIpAddress: nas.ipAddress,
      framedIpAddress: "192.168.1.101",
      nasPortId: "ether2",
      callingStationId: "AA:BB:CC:DD:EE:02",
      calledStationId: nas.ipAddress,
      protocol: "PPPoE",
      sessionTimeout: 86400,
      status: "active",
    },
  });
  console.log(`✓ 2 active demo sessions created`);

  // Demo invoice + payment
  const invoice = await db.invoice.upsert({
    where: { number: "INV-2025-0001" },
    update: {},
    create: {
      tenantId: tenant.id,
      number: "INV-2025-0001",
      subscriberId: subscriber.id,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      subtotal: 799,
      taxAmount: 143.82,
      total: 942.82,
      amountPaid: 942.82,
      status: "paid",
      currency: "INR",
      items: JSON.stringify([
        { description: "Pro 100 Mbps — monthly", amount: 799 },
        { description: "GST 18%", amount: 143.82 },
      ]),
    },
  });

  await db.payment.upsert({
    where: { number: "PAY-2025-0001" },
    update: {},
    create: {
      tenantId: tenant.id,
      number: "PAY-2025-0001",
      invoiceId: invoice.id,
      subscriberId: subscriber.id,
      amount: 942.82,
      currency: "INR",
      method: "upi",
      status: "completed",
    },
  });
  console.log(`✓ Invoice INV-2025-0001 + payment PAY-2025-0001 (paid)`);

  // Demo open complaint
  await db.complaint.upsert({
    where: { ticketNo: "TKT-0001" },
    update: {},
    create: {
      tenantId: tenant.id,
      ticketNo: "TKT-0001",
      subscriberId: subscriber2.id,
      assignedTo: admin.id,
      subject: "Intermittent connectivity drop",
      description: "Customer reports the connection drops every few minutes since yesterday.",
      category: "technical",
      priority: "high",
      status: "open",
    },
  });
  console.log(`✓ Complaint TKT-0001 (open)`);

  // -------------------------------------------------------------------
  // Phase 10 — Areas, Captive Portals, RADIUS Proxy, CoA, Attributes
  // -------------------------------------------------------------------

  // Areas
  const areaDefs = [
    { name: "Andheri East", city: "Mumbai", state: "Maharashtra", pincode: "400069", lat: 19.1136, lng: 72.8697, sortOrder: 1 },
    { name: "Bandra West", city: "Mumbai", state: "Maharashtra", pincode: "400050", lat: 19.0596, lng: 72.8295, sortOrder: 2 },
    { name: "Powai", city: "Mumbai", state: "Maharashtra", pincode: "400076", lat: 19.1176, lng: 72.9060, sortOrder: 3 },
    { name: "Indiranagar", city: "Bengaluru", state: "Karnataka", pincode: "560038", lat: 12.9719, lng: 77.6412, sortOrder: 4 },
    { name: "Koramangala", city: "Bengaluru", state: "Karnataka", pincode: "560034", lat: 12.9352, lng: 77.6245, sortOrder: 5 },
    { name: "Connaught Place", city: "New Delhi", state: "Delhi", pincode: "110001", lat: 28.6315, lng: 77.2167, sortOrder: 6, status: "disabled" },
  ];
  for (const a of areaDefs) {
    await db.area.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: a.name } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: a.name,
        city: a.city,
        state: a.state,
        pincode: a.pincode,
        latitude: a.lat,
        longitude: a.lng,
        status: (a as any).status ?? "active",
        sortOrder: a.sortOrder,
        description: `${a.city} coverage zone`,
      },
    });
  }
  console.log(`✓ ${areaDefs.length} areas seeded`);

  // Captive Portal(s)
  const portal = await db.captivePortal.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Hotel Lobby WiFi" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Hotel Lobby WiFi",
      enabled: true,
      loginMethod: "click_to_continue",
      sessionTimeout: 14400,
      bandwidthLimit: 10240,
      redirectUrl: "https://welcome.hotel-demo.local",
      welcomeMessage: "Welcome to Hotel Demo — enjoy complimentary WiFi.",
      template: "hotel",
      status: "active",
    },
  });
  await db.captivePortal.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Cafe Guestnet" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Cafe Guestnet",
      enabled: true,
      loginMethod: "voucher",
      sessionTimeout: 3600,
      bandwidthLimit: 4096,
      template: "cafe",
      status: "active",
    },
  });
  await db.captivePortal.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Office Visitor Access" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Office Visitor Access",
      enabled: false,
      loginMethod: "radius",
      sessionTimeout: 28800,
      template: "corporate",
      status: "disabled",
    },
  });
  // Captive portal sessions
  await db.captivePortalSession.create({
    data: {
      tenantId: tenant.id,
      portalId: portal.id,
      macAddress: "AA:BB:CC:11:22:33",
      ipAddress: "10.10.0.42",
      username: "guest_4821",
      sessionId: "cp-sess-0001",
      authMethod: "click_to_continue",
      status: "active",
      startTime: new Date(Date.now() - 23 * 60 * 1000),
      dataUsed: BigInt(124 * 1024 * 1024),
    },
  });
  await db.captivePortalSession.create({
    data: {
      tenantId: tenant.id,
      portalId: portal.id,
      macAddress: "AA:BB:CC:44:55:66",
      ipAddress: "10.10.0.51",
      username: null,
      sessionId: "cp-sess-0002",
      authMethod: "click_to_continue",
      status: "active",
      startTime: new Date(Date.now() - 4 * 60 * 1000),
      dataUsed: BigInt(12 * 1024 * 1024),
    },
  });
  await db.captivePortalSession.create({
    data: {
      tenantId: tenant.id,
      portalId: portal.id,
      macAddress: "AA:BB:CC:99:AA:BB",
      ipAddress: "10.10.0.77",
      username: null,
      sessionId: "cp-sess-0003",
      authMethod: "click_to_continue",
      status: "expired",
      startTime: new Date(Date.now() - 5 * 60 * 60 * 1000),
      endTime: new Date(Date.now() - 60 * 60 * 1000),
      dataUsed: BigInt(580 * 1024 * 1024),
    },
  });
  console.log(`✓ 3 captive portals + 3 sessions seeded`);

  // RADIUS Proxy Servers
  const upstreamRadius = await db.radiusProxyServer.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Upstream RADIUS 1" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Upstream RADIUS 1",
      ipAddress: "203.0.113.10",
      authPort: 1812,
      acctPort: 1813,
      secret: "sharedSecret123",
      type: "both",
      timeout: 5,
      status: "active",
    },
  });
  await db.radiusProxyServer.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Partner ISP Auth" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Partner ISP Auth",
      ipAddress: "203.0.113.20",
      authPort: 1812,
      acctPort: 1813,
      secret: "partnerSecret456",
      type: "auth",
      timeout: 3,
      status: "active",
    },
  });
  await db.radiusProxyServer.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Acct Backup Server" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Acct Backup Server",
      ipAddress: "203.0.113.30",
      authPort: 1812,
      acctPort: 1813,
      secret: "acctBackup789",
      type: "acct",
      timeout: 10,
      status: "disabled",
    },
  });

  // RADIUS Proxy Realms
  await db.radiusProxyRealm.upsert({
    where: { realm: "example.com" },
    update: {},
    create: {
      tenantId: tenant.id,
      realm: "example.com",
      type: "both",
      serverId: upstreamRadius.id,
      stripRealm: true,
      status: "active",
    },
  });
  await db.radiusProxyRealm.upsert({
    where: { realm: "partner-isp.net" },
    update: {},
    create: {
      tenantId: tenant.id,
      realm: "partner-isp.net",
      type: "auth",
      serverId: upstreamRadius.id,
      stripRealm: false,
      status: "active",
    },
  });
  console.log(`✓ 3 RADIUS proxy servers + 2 realms seeded`);

  // RADIUS Attributes
  const attrDefs = [
    { name: "User-Name", type: "string", vendor: null, attrType: "check", description: "Subscriber's username (with realm)." },
    { name: "User-Password", type: "string", vendor: null, attrType: "check", description: "Subscriber's password (PAP)." },
    { name: "Session-Timeout", type: "integer", vendor: null, attrType: "reply", description: "Maximum session duration in seconds." },
    { name: "Idle-Timeout", type: "integer", vendor: null, attrType: "reply", description: "Idle disconnect timeout in seconds." },
    { name: "Framed-IP-Address", type: "ipaddr", vendor: null, attrType: "reply", description: "Static IP to assign to the subscriber." },
    { name: "Framed-IP-Netmask", type: "ipaddr", vendor: null, attrType: "reply", description: "Subnet mask for the assigned IP." },
    { name: "Acct-Interim-Interval", type: "integer", vendor: null, attrType: "reply", description: "Interim accounting update interval in seconds." },
    { name: "Class", type: "string", vendor: null, attrType: "reply", description: "Opaque token echoed back in accounting records." },
    { name: "Mikrotik-Rate-Limit", type: "string", vendor: "Mikrotik", attrType: "reply", description: "Mikrotik-formatted bandwidth limit (e.g. 5M/5M)." },
    { name: "Mikrotik-Address-List", type: "string", vendor: "Mikrotik", attrType: "reply", description: "Mikrotik address list to insert the subscriber's IP into." },
    { name: "Cisco-AVPair", type: "string", vendor: "Cisco", attrType: "both", description: "Cisco vendor-specific attribute-value pair." },
    { name: "Juniper-Primary-Dns", type: "ipaddr", vendor: "Juniper", attrType: "reply", description: "Primary DNS server pushed to Juniper CPE." },
  ];
  for (const a of attrDefs) {
    await db.radiusAttributeDef.upsert({
      where: { name: a.name },
      update: {},
      create: {
        tenantId: tenant.id,
        name: a.name,
        type: a.type,
        vendor: a.vendor,
        attrType: a.attrType,
        description: a.description,
      },
    });
  }
  console.log(`✓ ${attrDefs.length} RADIUS attributes seeded`);

  // CoA Events
  const coaEvents = [
    { type: "session_disconnect", status: "success", sub: "CUST-0001", nas: "10.0.0.1", port: 3799, attrs: { "User-Name": "rahul.sharma" } },
    { type: "bandwidth_change", status: "success", sub: "CUST-0001", nas: "10.0.0.1", port: 3799, attrs: { "Mikrotik-Rate-Limit": "100M/100M" } },
    { type: "session_disconnect", status: "failed", sub: "CUST-0002", nas: "10.0.0.1", port: 3799, attrs: { "User-Name": "priya.patel" }, error: "NAS did not respond within 5s" },
    { type: "plan_change", status: "success", sub: "CUST-0001", nas: "10.0.0.1", port: 3799, attrs: { "User-Name": "rahul.sharma", "Session-Timeout": 86400 } },
    { type: "topup_apply", status: "requested", sub: "CUST-0002", nas: "10.0.0.1", port: 3799, attrs: { "Mikrotik-Rate-Limit": "150M/150M" } },
  ];
  for (const e of coaEvents) {
    await db.coaEvent.create({
      data: {
        tenantId: tenant.id,
        type: e.type,
        status: e.status,
        subscriberId: e.sub,
        sessionId: `session-${Math.floor(Math.random() * 9000 + 1000)}`,
        nasIpAddress: e.nas,
        coaPort: e.port,
        attributes: JSON.stringify(e.attrs),
        response: e.status === "success" ? JSON.stringify({ code: 41, message: "CoA-ACK" }) : null,
        errorMessage: (e as any).error ?? null,
        requestedBy: "admin",
        requestedAt: new Date(Date.now() - Math.floor(Math.random() * 86400000)),
        processedAt: e.status === "requested" ? null : new Date(),
      },
    });
  }
  console.log(`✓ ${coaEvents.length} CoA events seeded`);

  // -------------------------------------------------------------------
  // 10-ops-features: Leads, Promotions, Resellers, Collection Agents, ApiKeys, Announcements, Backups
  // -------------------------------------------------------------------

  // LEADS — pipeline demo
  const leads = [
    { name: "Anita Desai", email: "anita.desai@example.com", phone: "+91 98200 11111", source: "website", status: "new", estimatedValue: 4500, followUpInDays: 1, assignedTo: "sales_alia", notes: "Saw 100 Mbps plan page, filled lead form." },
    { name: "Vikram Rao", email: "vikram.rao@example.com", phone: "+91 98201 22222", source: "whatsapp", status: "contacted", estimatedValue: 7200, followUpInDays: 0, assignedTo: "sales_alia", notes: "Wants installation in Powai, asked about OTT bundle." },
    { name: "Meera Nair", email: "meera.nair@example.com", phone: "+91 99300 33333", source: "referral", status: "interested", estimatedValue: 6000, followUpInDays: 2, assignedTo: "sales_karan", notes: "Referred by CUST-0001. Wants dual-band router." },
    { name: "Sanjay Gupta", email: "sanjay.gupta@example.com", phone: "+91 98203 44444", source: "call", status: "qualified", estimatedValue: 12000, followUpInDays: 1, assignedTo: "sales_karan", notes: "Enterprise 200 Mbps plan. Needs static IP. Sign-up next week." },
    { name: "Priya Iyer", email: "priya.iyer@example.com", phone: "+91 98204 55555", source: "walk_in", status: "converted", estimatedValue: 5400, followUpInDays: -3, assignedTo: "sales_alia", notes: "Converted to CUST-0007. Paid 3 months upfront." },
    { name: "Rohit Mehta", email: "rohit.mehta@example.com", phone: "+91 99301 66666", source: "social_media", status: "lost", estimatedValue: 3000, followUpInDays: -7, assignedTo: "sales_karan", notes: "Went with competitor (cheaper, no SLA)." },
    { name: "Deepak Joshi", email: "deepak.joshi@example.com", phone: "+91 98205 77777", source: "website", status: "new", estimatedValue: 8000, followUpInDays: 2, assignedTo: null, notes: "Wants installation in Bandra West." },
    { name: "Kavya Reddy", email: "kavya.reddy@example.com", phone: "+91 99302 88888", source: "referral", status: "interested", estimatedValue: 9000, followUpInDays: 4, assignedTo: "sales_alia", notes: "Looking for 150 Mbps plan, asked about parental controls." },
  ];
  for (const lead of leads) {
    await db.lead.create({
      data: {
        tenantId: tenant.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        status: lead.status,
        estimatedValue: lead.estimatedValue,
        notes: lead.notes,
        followUpDate: new Date(Date.now() + lead.followUpInDays * 24 * 60 * 60 * 1000),
        assignedTo: lead.assignedTo,
      },
    });
  }
  console.log(`✓ ${leads.length} leads seeded (CRM pipeline)`);

  // PROMOTIONS — discount codes
  const promotions = [
    { name: "New Year 25% Off", code: "NEWYEAR25", description: "25% off first 3 months for new subscribers.", type: "percentage", value: 25, maxUses: 500, usedCount: 142, validFrom: -10, validUntil: 60, status: "active", applicablePlans: null },
    { name: "Summer Flat $20", code: "SUMMERFLAT20", description: "$20 off any plan subscription.", type: "flat", value: 20, maxUses: 200, usedCount: 38, validFrom: -5, validUntil: 45, status: "active", applicablePlans: null },
    { name: "7-Day Free Trial", code: "TRIAL7", description: "7-day free trial on premium plans.", type: "free_trial", value: 7, maxUses: 1000, usedCount: 67, validFrom: -30, validUntil: 365, status: "active", applicablePlans: null },
    { name: "Black Friday 40%", code: "BLACKFRI40", description: "40% off — Black Friday weekend only.", type: "percentage", value: 40, maxUses: 100, usedCount: 100, validFrom: -120, validUntil: -60, status: "expired", applicablePlans: null },
    { name: "Referral Bonus $15", code: "REFER15", description: "$15 credit for referrer + referee.", type: "flat", value: 15, maxUses: null, usedCount: 28, validFrom: -90, validUntil: 275, status: "active", applicablePlans: null },
    { name: "Enterprise 10% Loyalty", code: "ENT10", description: "10% off for enterprise plan renewals.", type: "percentage", value: 10, maxUses: null, usedCount: 5, validFrom: -15, validUntil: 350, status: "active", applicablePlans: null },
  ];
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  for (const p of promotions) {
    const existing = await db.promotion.findUnique({ where: { code: p.code } });
    if (existing) continue;
    await db.promotion.create({
      data: {
        tenantId: tenant.id,
        name: p.name,
        code: p.code,
        description: p.description,
        type: p.type,
        value: p.value,
        maxUses: p.maxUses,
        usedCount: p.usedCount,
        validFrom: new Date(now.getTime() + p.validFrom * day),
        validUntil: new Date(now.getTime() + p.validUntil * day),
        status: p.status,
        applicablePlans: p.applicablePlans,
      },
    });
  }
  console.log(`✓ ${promotions.length} promotions seeded`);

  // RESELLERS — channel partners
  const resellers = [
    { name: "Acme Internet Partners", code: "ACME01", email: "contact@acme.net", phone: "+91 22 4000 1111", address: "Andheri East, Mumbai", contactPerson: "Ramesh Kumar", status: "active", commissionMethod: "percentage", commissionRate: 12, creditLimit: 50000, balance: 12450 },
    { name: "SkyNet Distributors", code: "SKY02", email: "ops@skynet.in", phone: "+91 80 5000 2222", address: "Indiranagar, Bengaluru", contactPerson: "Lakshmi Venkat", status: "active", commissionMethod: "flat", commissionRate: 250, creditLimit: 30000, balance: -1500 },
    { name: "ConnectHub Reseller", code: "CONN03", email: "sales@connecthub.co", phone: "+91 11 6000 3333", address: "Connaught Place, New Delhi", contactPerson: "Imran Khan", status: "trial", commissionMethod: "percentage", commissionRate: 8, creditLimit: 10000, balance: 0 },
    { name: "FiberFirst Pvt Ltd", code: "FBF04", email: "hello@fiberfirst.in", phone: "+91 22 7000 4444", address: "Powai, Mumbai", contactPerson: "Sneha Patil", status: "suspended", commissionMethod: "slab", commissionRate: 15, creditLimit: 75000, balance: 8900 },
  ];
  for (const r of resellers) {
    const existing = await db.reseller.findUnique({ where: { code: r.code } });
    if (existing) continue;
    await db.reseller.create({
      data: {
        tenantId: tenant.id,
        name: r.name,
        code: r.code,
        email: r.email,
        phone: r.phone,
        address: r.address,
        contactPerson: r.contactPerson,
        status: r.status,
        commissionMethod: r.commissionMethod,
        commissionRate: r.commissionRate,
        creditLimit: r.creditLimit,
        balance: r.balance,
      },
    });
  }
  console.log(`✓ ${resellers.length} resellers seeded`);

  // COLLECTION AGENTS
  const agents = [
    { name: "Suresh Patel", employeeId: "EMP-CA-001", phone: "+91 98200 10001", email: "suresh.patel@cryptsk.com", status: "active", dailyTarget: 5000, monthlyTarget: 150000, commissionRate: 5 },
    { name: "Anjali Sharma", employeeId: "EMP-CA-002", phone: "+91 98201 10002", email: "anjali.sharma@cryptsk.com", status: "active", dailyTarget: 7500, monthlyTarget: 225000, commissionRate: 6 },
    { name: "Mohammed Ali", employeeId: "EMP-CA-003", phone: "+91 99300 10003", email: "mohammed.ali@cryptsk.com", status: "active", dailyTarget: 5000, monthlyTarget: 150000, commissionRate: 5 },
    { name: "Pooja Verma", employeeId: "EMP-CA-004", phone: "+91 98203 10004", email: "pooja.verma@cryptsk.com", status: "inactive", dailyTarget: 5000, monthlyTarget: 150000, commissionRate: 4 },
    { name: "Karan Singh", employeeId: "EMP-CA-005", phone: "+91 99301 10005", email: "karan.singh@cryptsk.com", status: "suspended", dailyTarget: 6000, monthlyTarget: 180000, commissionRate: 5 },
  ];
  for (const a of agents) {
    const existing = await db.collectionAgent.findFirst({
      where: { tenantId: tenant.id, employeeId: a.employeeId },
    });
    if (existing) continue;
    await db.collectionAgent.create({
      data: {
        tenantId: tenant.id,
        name: a.name,
        employeeId: a.employeeId,
        phone: a.phone,
        email: a.email,
        status: a.status,
        dailyTarget: a.dailyTarget,
        monthlyTarget: a.monthlyTarget,
        commissionRate: a.commissionRate,
      },
    });
  }
  console.log(`✓ ${agents.length} collection agents seeded`);

  // API KEYS — store hashed (sha256) keys for demo. Plaintext shown only in seed log.
  const crypto = await import("crypto");
  const hashKey = (key: string) =>
    crypto.createHash("sha256").update(key).digest("hex");
  const apiKeysToSeed = [
    { name: "Billing Integration", plain: "cryp_live_demo_billing_integration_key_001", perms: ["billing.invoice.read", "billing.voucher.read"], usedDays: 2, expires: 90, status: "active" },
    { name: "Mobile App Backend", plain: "cryp_live_demo_mobile_app_backend_key_002", perms: ["subscriber.read", "payment.read"], usedDays: 0, expires: 180, status: "active" },
    { name: "Legacy CRM Sync", plain: "cryp_live_demo_legacy_crm_sync_key_003", perms: [], usedDays: 30, expires: 0, status: "revoked" },
  ];
  for (const k of apiKeysToSeed) {
    const existing = await db.apiKey.findFirst({
      where: { tenantId: tenant.id, name: k.name },
    });
    if (existing) continue;
    await db.apiKey.create({
      data: {
        tenantId: tenant.id,
        name: k.name,
        key: hashKey(k.plain),
        permissions: JSON.stringify(k.perms),
        lastUsedAt: k.usedDays > 0 ? new Date(Date.now() - k.usedDays * day) : null,
        expiresAt: k.expires > 0 ? new Date(Date.now() + k.expires * day) : null,
        status: k.status,
        createdBy: admin.id,
      },
    });
  }
  console.log(`✓ ${apiKeysToSeed.length} API keys seeded (revoked demo key included)`);

  // ANNOUNCEMENTS
  const announcements = [
    { title: "Scheduled Maintenance Window", message: "The platform will undergo routine maintenance on Saturday 2:00 AM – 4:00 AM IST. Services may be briefly interrupted.", level: "warning", audience: "all", dismissible: true, activeFrom: -1, activeUntil: 7 },
    { title: "New RADIUS Attribute Catalog", message: "12 standard + vendor RADIUS attributes are now available for assignment in NAS profiles.", level: "info", audience: "admins", dismissible: true, activeFrom: -7, activeUntil: null },
    { title: "Q4 Billing Run Completed", message: "All Q4 invoices have been generated successfully. 0 errors. Total invoiced: $42,180.", level: "success", audience: "admins", dismissible: true, activeFrom: -2, activeUntil: 3 },
    { title: "Critical: NAS-001 Down", message: "NAS-001 (10.0.0.1) is unreachable. Field team dispatched. ETA: 45 minutes.", level: "error", audience: "all", dismissible: false, activeFrom: 0, activeUntil: 0.04 },
  ];
  for (const a of announcements) {
    const existing = await db.announcement.findFirst({
      where: { tenantId: tenant.id, title: a.title },
    });
    if (existing) continue;
    await db.announcement.create({
      data: {
        tenantId: tenant.id,
        title: a.title,
        message: a.message,
        level: a.level,
        audience: a.audience,
        dismissible: a.dismissible,
        activeFrom: new Date(now.getTime() + a.activeFrom * day),
        activeUntil: a.activeUntil === null ? null : new Date(now.getTime() + a.activeUntil * day),
      },
    });
  }
  console.log(`✓ ${announcements.length} announcements seeded`);

  // BACKUPS — historical record
  const backups = [
    { type: "full", status: "completed", sizeBytes: 18 * 1024 * 1024, encrypted: true, daysAgo: 30, durationMin: 12 },
    { type: "database", status: "completed", sizeBytes: 12 * 1024 * 1024, encrypted: true, daysAgo: 23, durationMin: 8 },
    { type: "database", status: "completed", sizeBytes: 13 * 1024 * 1024, encrypted: true, daysAgo: 16, durationMin: 9 },
    { type: "config", status: "completed", sizeBytes: 256 * 1024, encrypted: false, daysAgo: 14, durationMin: 1 },
    { type: "database", status: "completed", sizeBytes: 14 * 1024 * 1024, encrypted: true, daysAgo: 9, durationMin: 9 },
    { type: "full", status: "failed", sizeBytes: null, encrypted: true, daysAgo: 7, durationMin: 2 },
    { type: "database", status: "completed", sizeBytes: 15 * 1024 * 1024, encrypted: true, daysAgo: 2, durationMin: 10 },
    { type: "database", status: "completed", sizeBytes: 15 * 1024 * 1024, encrypted: true, daysAgo: 0, durationMin: 9 },
  ];
  for (const b of backups) {
    const createdAt = new Date(Date.now() - b.daysAgo * day);
    const completedAt = b.status === "completed" ? new Date(createdAt.getTime() + b.durationMin * 60 * 1000) : null;
    const timestamp = createdAt.toISOString().replace(/[:.]/g, "-");
    const path = `backups/cryptsk-demo/cryptsk-${b.type}-${timestamp}.bak`;
    const checksum = crypto.createHash("sha256").update(`${tenant.id}:${timestamp}`).digest("hex");
    await db.backup.create({
      data: {
        tenantId: tenant.id,
        type: b.type,
        status: b.status,
        size: b.sizeBytes,
        path,
        checksum,
        encrypted: b.encrypted,
        createdBy: admin.id,
        createdAt,
        completedAt,
      },
    });
  }
  console.log(`✓ ${backups.length} backups seeded (1 failed)`);

  // ===================================================================
  // BILLING EXTRAS — grace periods, add-on services, top-ups,
  // charge overrides, credit notes, referrals, loyalty members
  // (Task 10-billing-extras)
  // ===================================================================
  const subs = await db.subscriber.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, customerId: true, firstName: true, lastName: true },
    take: 3,
  });
  const inv = await db.invoice.findFirst({
    where: { tenantId: tenant.id },
    select: { id: true, number: true, total: true },
  });

  // GRACE PERIODS — 4 across subscribers
  const gracePeriods = [
    { subscriberIdx: 0, type: "post_billing", status: "active", days: 7, startDays: -2 },
    { subscriberIdx: 1, type: "pre_billing", status: "active", days: 3, startDays: -1 },
    { subscriberIdx: 2, type: "post_billing", status: "expired", days: 5, startDays: -20 },
    { subscriberIdx: 0, type: "post_billing", status: "cancelled", days: 14, startDays: -30 },
  ];
  for (const g of gracePeriods) {
    const sub = subs[g.subscriberIdx];
    if (!sub) continue;
    const start = new Date(Date.now() + g.startDays * day);
    const end = new Date(start.getTime() + g.days * day);
    const existing = await db.gracePeriod.findFirst({
      where: {
        tenantId: tenant.id,
        subscriberId: sub.id,
        type: g.type,
        startDate: start,
      },
    });
    if (existing) continue;
    await db.gracePeriod.create({
      data: {
        tenantId: tenant.id,
        subscriberId: sub.id,
        type: g.type,
        status: g.status,
        startDate: start,
        endDate: end,
        days: g.days,
      },
    });
  }
  console.log(`✓ ${gracePeriods.length} grace periods seeded`);

  // ADD-ON SERVICES — 5 across charge types
  const addOns = [
    { name: "Static IP Address", description: "One static public IPv4 address, billed monthly.", chargeType: "per_month", price: 5.0, status: "active" },
    { name: "Installation Fee", description: "One-time field installation & ONT configuration.", chargeType: "flat", price: 49.99, status: "active" },
    { name: "Data Boost Pack", description: "Additional data quota beyond plan cap.", chargeType: "per_gb", price: 0.25, status: "active" },
    { name: "Premium Support", description: "Priority 24/7 support with SLA.", chargeType: "per_month", price: 9.99, status: "active" },
    { name: "Maintenance Window Extension", description: "Extend session time on per-day basis.", chargeType: "per_day", price: 2.0, status: "disabled" },
  ];
  for (const a of addOns) {
    const existing = await db.addOnService.findFirst({
      where: { tenantId: tenant.id, name: a.name },
    });
    if (existing) continue;
    await db.addOnService.create({
      data: {
        tenantId: tenant.id,
        name: a.name,
        description: a.description,
        chargeType: a.chargeType,
        price: a.price,
        status: a.status,
      },
    });
  }
  console.log(`✓ ${addOns.length} add-on services seeded`);

  // TOP-UPS — 5 across subscribers/types
  const topUps = [
    { subscriberIdx: 0, type: "data", amount: 5, price: 50, status: "active", expiresDays: 30 },
    { subscriberIdx: 1, type: "speed_boost", amount: 51200, price: 25, status: "used", expiresDays: 7 },
    { subscriberIdx: 2, type: "time", amount: 24, price: 15, status: "active", expiresDays: 14 },
    { subscriberIdx: 0, type: "data", amount: 10, price: 90, status: "expired", expiresDays: -1 },
    { subscriberIdx: 1, type: "data", amount: 2, price: 20, status: "cancelled", expiresDays: 30 },
  ];
  for (const t of topUps) {
    const sub = subs[t.subscriberIdx];
    if (!sub) continue;
    const created = new Date(Date.now() - 2 * day);
    await db.topUp.create({
      data: {
        tenantId: tenant.id,
        subscriberId: sub.id,
        type: t.type,
        amount: t.amount,
        price: t.price,
        status: t.status,
        expiresAt: new Date(Date.now() + t.expiresDays * day),
        createdAt: created,
      },
    });
  }
  console.log(`✓ ${topUps.length} top-ups seeded`);

  // CHARGE OVERRIDES — 4 across subscribers
  const overrides = [
    { subscriberIdx: 0, type: "discount", valueType: "percentage", value: 10, reason: "Loyalty discount — 2-year customer", status: "active", startDays: -30, endDays: 365 },
    { subscriberIdx: 1, type: "discount", valueType: "flat", value: 50, reason: "Long-term contract signing bonus", status: "active", startDays: -10, endDays: null },
    { subscriberIdx: 2, type: "surcharge", valueType: "percentage", value: 5, reason: "Premium SLA add-on", status: "active", startDays: -15, endDays: 350 },
    { subscriberIdx: 0, type: "discount", valueType: "percentage", value: 20, reason: "Holiday promo", status: "expired", startDays: -90, endDays: -10 },
  ];
  for (const o of overrides) {
    const sub = subs[o.subscriberIdx];
    if (!sub) continue;
    const start = new Date(Date.now() + o.startDays * day);
    const end = o.endDays === null ? null : new Date(Date.now() + o.endDays * day);
    const existing = await db.chargeOverride.findFirst({
      where: {
        tenantId: tenant.id,
        subscriberId: sub.id,
        type: o.type,
        startDate: start,
      },
    });
    if (existing) continue;
    await db.chargeOverride.create({
      data: {
        tenantId: tenant.id,
        subscriberId: sub.id,
        type: o.type,
        value: o.value,
        valueType: o.valueType,
        reason: o.reason,
        status: o.status,
        startDate: start,
        endDate: end,
      },
    });
  }
  console.log(`✓ ${overrides.length} charge overrides seeded`);

  // CREDIT NOTES — 3 against the seeded invoice
  if (inv) {
    const creditNotes = [
      { number: "CN-2025-0001", amount: 50, reason: "Service outage credit — 4h downtime on Aug 12", status: "applied", issuedDaysAgo: 20 },
      { number: "CN-2025-0002", amount: 25.5, reason: "Pro-rated refund for unused days", status: "issued", issuedDaysAgo: 5 },
      { number: "CN-2025-0003", amount: 100, reason: "Duplicate charge — cancellation issued", status: "cancelled", issuedDaysAgo: 2 },
    ];
    for (const c of creditNotes) {
      const existing = await db.creditNote.findUnique({ where: { number: c.number } });
      if (existing) continue;
      await db.creditNote.create({
        data: {
          tenantId: tenant.id,
          invoiceId: inv.id,
          number: c.number,
          amount: c.amount,
          reason: c.reason,
          status: c.status,
          issuedBy: admin.id,
          issuedAt: new Date(Date.now() - c.issuedDaysAgo * day),
        },
      });
    }
    console.log(`✓ ${creditNotes.length} credit notes seeded`);
  } else {
    console.log(`✓ Skipping credit notes (no invoice found)`);
  }

  // REFERRALS — 5 across subscribers & reward types
  const referrals = [
    { code: "RAHUL50", referrerIdx: 0, refereeIdx: 1, rewardType: "credit", rewardValue: 50, status: "completed", completedDaysAgo: 10 },
    { code: "PRIYA15PCT", referrerIdx: 1, refereeIdx: 2, rewardType: "discount", rewardValue: 15, status: "completed", completedDaysAgo: 5 },
    { code: "AMITFREEMONTH", referrerIdx: 2, refereeIdx: null, rewardType: "free_month", rewardValue: 30, status: "pending", completedDaysAgo: null },
    { code: "SUMMER25", referrerIdx: null, refereeIdx: null, rewardType: "discount", rewardValue: 25, status: "pending", completedDaysAgo: null },
    { code: "OLDCODE99", referrerIdx: 0, refereeIdx: null, rewardType: "credit", rewardValue: 99, status: "expired", completedDaysAgo: null },
  ];
  for (const r of referrals) {
    const existing = await db.referral.findUnique({ where: { code: r.code } });
    if (existing) continue;
    const referrer = r.referrerIdx !== null ? subs[r.referrerIdx] : null;
    const referee = r.refereeIdx !== null ? subs[r.refereeIdx] : null;
    await db.referral.create({
      data: {
        tenantId: tenant.id,
        referrerId: referrer?.id ?? null,
        refereeId: referee?.id ?? null,
        code: r.code,
        rewardType: r.rewardType,
        rewardValue: r.rewardValue,
        status: r.status,
        completedAt: r.completedDaysAgo !== null ? new Date(Date.now() - r.completedDaysAgo * day) : null,
      },
    });
  }
  console.log(`✓ ${referrals.length} referrals seeded`);

  // LOYALTY MEMBERS — 3 (one per subscriber)
  const loyaltyMembers = [
    { subscriberIdx: 0, tier: "gold", points: 2850, totalEarned: 3200, totalRedeemed: 350, joinedDaysAgo: 720 },
    { subscriberIdx: 1, tier: "silver", points: 740, totalEarned: 980, totalRedeemed: 240, joinedDaysAgo: 365 },
    { subscriberIdx: 2, tier: "bronze", points: 120, totalEarned: 150, totalRedeemed: 30, joinedDaysAgo: 60 },
  ];
  for (const m of loyaltyMembers) {
    const sub = subs[m.subscriberIdx];
    if (!sub) continue;
    const existing = await db.loyaltyMember.findUnique({ where: { subscriberId: sub.id } });
    if (existing) continue;
    await db.loyaltyMember.create({
      data: {
        tenantId: tenant.id,
        subscriberId: sub.id,
        tier: m.tier,
        points: m.points,
        totalEarned: m.totalEarned,
        totalRedeemed: m.totalRedeemed,
        joinedAt: new Date(Date.now() - m.joinedDaysAgo * day),
      },
    });
  }
  console.log(`✓ ${loyaltyMembers.length} loyalty members seeded`);

  // ===================================================================
  // POLICY ENGINE DATA — bandwidth profiles, QoS queues, time access,
  // firewall rules + full FreeRADIUS table sync (radgroupreply /
  // radgroupcheck / radusergroup) so the policy engine works out of the box.
  // ===================================================================
  {
    const policyPlans = [plan, plan2];
    const profileDefs = [
      {
        plan: plan,
        description: "Entry plan profile — 50 Mbps with burst to 75",
        downloadSpeed: 51200, uploadSpeed: 10240,
        downloadBurst: 76800, uploadBurst: 15360,
        burstThreshold: 40960, burstTime: 16,
        priority: 6, qosType: "fq_codel", rateLimit: null, ceilLimit: 61440,
        sessionLimit: 1,
        timeWindows: { mon: [{ start: "00:00", end: "23:59" }], tue: [{ start: "00:00", end: "23:59" }], wed: [{ start: "00:00", end: "23:59" }], thu: [{ start: "00:00", end: "23:59" }], fri: [{ start: "00:00", end: "23:59" }], sat: [{ start: "00:00", end: "23:59" }], sun: [{ start: "00:00", end: "23:59" }] },
      },
      {
        plan: plan2,
        description: "Premium plan profile — 100 Mbps with burst to 150",
        downloadSpeed: 102400, uploadSpeed: 20480,
        downloadBurst: 153600, uploadBurst: 30720,
        burstThreshold: 81920, burstTime: 16,
        priority: 3, qosType: "fq_codel", rateLimit: null, ceilLimit: 122880,
        sessionLimit: 3,
        timeWindows: null, // no time restriction on premium
      },
    ];

    for (const def of profileDefs) {
      const groupName = `plan-${def.plan.name.toLowerCase().replace(/\s+/g, "-")}`;

      // Bandwidth profile
      const bw = await db.bandwidthProfile.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: groupName } },
        create: {
          tenantId: tenant.id,
          name: groupName,
          description: def.description,
          downloadSpeed: def.downloadSpeed,
          uploadSpeed: def.uploadSpeed,
          downloadBurst: def.downloadBurst,
          uploadBurst: def.uploadBurst,
          burstThreshold: def.burstThreshold,
          burstTime: def.burstTime,
          priority: def.priority,
          status: "active",
        },
        update: {},
      });

      // QoS queue for the group
      await db.qosQueue.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: groupName } },
        create: {
          tenantId: tenant.id,
          name: groupName,
          description: `Auto queue for ${def.plan.name}`,
          type: def.qosType,
          priority: def.priority,
          rateLimit: def.rateLimit,
          ceilLimit: def.ceilLimit,
          quantum: 1500,
          status: "active",
        },
        update: {},
      });

      // Time access profile (only when restricted)
      if (def.timeWindows) {
        await db.timeAccessProfile.upsert({
          where: { tenantId_name: { tenantId: tenant.id, name: groupName } },
          create: {
            tenantId: tenant.id,
            name: groupName,
            description: `Allowed hours for ${def.plan.name}`,
            schedule: JSON.stringify(def.timeWindows),
            timezone: "Asia/Kolkata",
            action: "allow",
            status: "active",
          },
          update: {},
        });
      }

      // FreeRADIUS group reply — MikroTik rate limit + WISPr bandwidth
      const mrl = `${def.downloadSpeed / 1000}M/${def.uploadSpeed / 1000}M ${def.downloadBurst / 1000}M/${def.uploadBurst / 1000}M ${def.burstThreshold / 1000}M/${def.burstThreshold / 1000}M ${def.burstTime}`;
      const replies: Array<[string, string]> = [
        ["Mikrotik-Rate-Limit", mrl],
        ["WISPr-Bandwidth-Max-Down", String(Math.round((def.downloadSpeed * 1000) / 8))],
        ["WISPr-Bandwidth-Max-Up", String(Math.round((def.uploadSpeed * 1000) / 8))],
        ["Idle-Timeout", "1800"],
        ["Session-Timeout", "86400"],
      ];
      for (const [attribute, value] of replies) {
        await db.radGroupReply.upsert({
          where: { groupname_attribute: { groupname: groupName, attribute } },
          create: { groupname: groupName, attribute, op: "=", value },
          update: { value },
        });
      }

      // FreeRADIUS group check — simultaneous use + optional login time
      const checks: Array<[string, string]> = [["Simultaneous-Use", String(def.sessionLimit)]];
      for (const [attribute, value] of checks) {
        const existingCheck = await db.radGroupCheck.findFirst({
          where: { groupname: groupName, attribute },
        });
        if (existingCheck) {
          await db.radGroupCheck.update({ where: { id: existingCheck.id }, data: { value } });
        } else {
          await db.radGroupCheck.create({ data: { groupname: groupName, attribute, op: ":=", value } });
        }
      }
      void bw;
    }

    // Firewall rules — a small production-realistic baseline
    const firewallRules = [
      { name: "Allow DNS to resolver", action: "accept", chain: "forward", protocol: "udp", dstPort: "53", priority: 10, description: "Permit subscriber DNS egress" },
      { name: "Block SMTP egress", action: "reject", chain: "forward", protocol: "tcp", dstPort: "25", priority: 5, description: "Anti-spam: block direct port 25" },
      { name: "Allow established", action: "accept", chain: "forward", protocol: "any", priority: 1, description: "Stateful allow for established flows" },
      { name: "Drop RFC1918 on WAN", action: "drop", chain: "input", protocol: "any", srcAddress: "10.0.0.0/8", priority: 2, description: "Anti-spoof on upstream" },
      { name: "NAT masquerade", action: "masquerade", chain: "output", protocol: "any", priority: 100, description: "Subscriber NAT egress" },
    ];
    for (const r of firewallRules) {
      const existing = await db.firewallRule.findFirst({
        where: { tenantId: tenant.id, description: r.description },
      });
      if (existing) continue;
      await db.firewallRule.create({
        data: {
          tenantId: tenant.id,
          name: r.name,
          action: r.action,
          chain: r.chain,
          protocol: r.protocol,
          srcAddress: r.srcAddress ?? null,
          dstPort: r.dstPort ?? null,
          priority: r.priority,
          description: r.description,
          enabled: true,
        },
      });
    }

    // radusergroup for the seeded subscribers + backfill radcheck auth rows
    const allSubs = await db.subscriber.findMany({ where: { tenantId: tenant.id, username: { not: null } } });
    for (const s of allSubs) {
      if (!s.username || !s.planId) continue;
      const sPlan = policyPlans.find((p) => p.id === s.planId) ??
        await db.plan.findFirst({ where: { id: s.planId } });
      if (!sPlan) continue;
      const groupName = `plan-${sPlan.name.toLowerCase().replace(/\s+/g, "-")}`;
      const existing = await db.radUserGroup.findFirst({ where: { username: s.username } });
      if (!existing) {
        await db.radUserGroup.create({ data: { username: s.username, groupname: groupName, priority: 1 } });
      }
      // Backfill the per-user auth row so the RADIUS server can verify PAP
      // (plaintext is only known at provisioning time — seed uses subscriber123)
      const hasAuth = await db.radCheck.findFirst({ where: { username: s.username, attribute: "Cleartext-Password" } });
      if (!hasAuth && ["rahul.sharma", "priya.patel", "amit.kumar"].includes(s.username)) {
        await db.radCheck.create({
          data: { username: s.username, attribute: "Cleartext-Password", op: ":=", value: "subscriber123" },
        });
      }
    }

    // Overage rate setting consumed by the billing engine
    await db.systemSetting.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: "billing.overagePerGb" } },
      create: { tenantId: tenant.id, key: "billing.overagePerGb", value: "50" },
      update: {},
    });

    // GPON plant — 2 OLTs + 3 splitters
    const oltDefs = [
      { name: "OLT-Central-01", ipAddress: "10.10.0.11", vendor: "huawei", model: "MA5608T", totalPorts: 16, usedPorts: 11, location: "Central POP" },
      { name: "OLT-North-02", ipAddress: "10.10.0.12", vendor: "zte", model: "ZXA10 C320", totalPorts: 16, usedPorts: 4, location: "North Cabinet" },
    ];
    for (const o of oltDefs) {
      await db.olt.upsert({
        where: { tenantId_ipAddress: { tenantId: tenant.id, ipAddress: o.ipAddress } },
        create: { tenantId: tenant.id, ...o, status: "active", firmware: "v100r018" },
        update: {},
      });
    }
    const oltRows = await db.olt.findMany({ where: { tenantId: tenant.id } });
    const splitterDefs = [
      { name: "SPL-Central-L1-01", type: "1:8", location: "Central POP · Level 1", oltIdx: 0, portNumber: 1 },
      { name: "SPL-Central-L2-03", type: "1:16", location: "Central POP · Level 2", oltIdx: 0, portNumber: 3 },
      { name: "SPL-North-L1-02", type: "1:8", location: "North Cabinet · Level 1", oltIdx: 1, portNumber: 2 },
    ];
    for (const s of splitterDefs) {
      const existing = await db.splitter.findFirst({
        where: { tenantId: tenant.id, name: s.name },
      });
      if (existing) continue;
      await db.splitter.create({
        data: {
          tenantId: tenant.id,
          name: s.name,
          type: s.type,
          location: s.location,
          oltId: oltRows[s.oltIdx]?.id ?? null,
          portNumber: s.portNumber,
          status: "active",
        },
      });
    }

    console.log(`✓ Policy engine data seeded (2 profiles, 2 QoS queues, 5 firewall rules, RADIUS group tables, 2 OLTs, 3 splitters)`);
  }

  console.log("\n🎉 Cryptsk seed complete.");
  console.log("Login: admin / admin123");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
