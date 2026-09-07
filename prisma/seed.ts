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
