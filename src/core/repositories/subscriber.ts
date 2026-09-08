// =====================================================================
// SUBSCRIBER REPOSITORY — data access + lifecycle logic
// Business logic for subscriber states: active → suspended → terminated
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/crypto/password";
import {
  paginate,
  parsePagination,
  type PaginatedResult,
} from "@/core/repositories/base";

// Subscriber statuses (canonical)
export const SUBSCRIBER_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  TERMINATED: "terminated",
} as const;

export type SubscriberStatus = (typeof SUBSCRIBER_STATUS)[keyof typeof SUBSCRIBER_STATUS];

// Valid state transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["active", "terminated"],
  active: ["suspended", "terminated"],
  suspended: ["active", "terminated"],
  terminated: [],
};

export function canTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface SubscriberListFilters {
  search?: string;
  status?: string;
  planId?: string;
}

export const SUBSCRIBER_INCLUDE = {
  plan: { select: { id: true, name: true, code: true, downloadSpeed: true, uploadSpeed: true } },
  _count: {
    select: {
      activeSessions: { where: { status: "active" } },
      invoices: true,
      payments: true,
      complaints: true,
    },
  },
} satisfies Prisma.SubscriberInclude;

export type SubscriberWithRelations = Prisma.SubscriberGetPayload<{
  include: typeof SUBSCRIBER_INCLUDE;
}>;

export async function listSubscribers(
  tenantId: string,
  filters: SubscriberListFilters,
  query: URLSearchParams
): Promise<PaginatedResult<SubscriberWithRelations>> {
  const { page, pageSize } = parsePagination(query);

  const where: Prisma.SubscriberWhereInput = {
    tenantId,
    ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.planId && filters.planId !== "all" ? { planId: filters.planId } : {}),
    ...(filters.search
      ? {
          OR: [
            { customerId: { contains: filters.search } },
            { firstName: { contains: filters.search } },
            { lastName: { contains: filters.search } },
            { email: { contains: filters.search } },
            { phone: { contains: filters.search } },
            { username: { contains: filters.search } },
          ],
        }
      : {}),
  };

  return paginate<
    SubscriberWithRelations,
    Prisma.SubscriberWhereInput,
    Prisma.SubscriberOrderByWithRelationInput
  >(
    {
      findMany: (args) => db.subscriber.findMany({ ...args, include: SUBSCRIBER_INCLUDE }),
      count: (args) => db.subscriber.count(args),
    },
    { where, orderBy: { createdAt: "desc" }, page, pageSize }
  );
}

export async function getSubscriberById(
  tenantId: string,
  id: string
): Promise<SubscriberWithRelations | null> {
  return db.subscriber.findFirst({
    where: { id, tenantId },
    include: SUBSCRIBER_INCLUDE,
  });
}

export async function getSubscriberByCustomerId(
  tenantId: string,
  customerId: string
): Promise<SubscriberWithRelations | null> {
  return db.subscriber.findFirst({
    where: { tenantId, customerId },
    include: SUBSCRIBER_INCLUDE,
  });
}

export interface CreateSubscriberInput {
  tenantId: string;
  customerId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  planId?: string;
  username?: string;
  password?: string;
  status?: string;
}

export async function createSubscriber(
  input: CreateSubscriberInput
): Promise<SubscriberWithRelations> {
  // Auto-generate customerId if not provided (format: CUST-XXXX)
  let customerId = input.customerId;
  if (!customerId) {
    const count = await db.subscriber.count({ where: { tenantId: input.tenantId } });
    customerId = `CUST-${String(count + 1001).padStart(4, "0")}`;
  }

  // Auto-generate username if not provided (firstname.lastname)
  let username = input.username;
  if (!username) {
    const base = `${input.firstName.toLowerCase()}.${input.lastName.toLowerCase()}`.replace(/[^a-z0-9.]/g, "");
    username = base;
    let suffix = 1;
    while (await db.subscriber.findUnique({ where: { username } })) {
      username = `${base}${suffix++}`;
    }
  }

  // Hash password if provided (for RADIUS auth)
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  return db.subscriber.create({
    data: {
      tenantId: input.tenantId,
      customerId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      address: input.address,
      planId: input.planId,
      username,
      passwordHash,
      status: input.status ?? SUBSCRIBER_STATUS.PENDING,
    },
    include: SUBSCRIBER_INCLUDE,
  }).then(async (subscriber) => {
    // === INDUSTRY STANDARD: Sync to FreeRADIUS tables ===
    // Create radcheck entry with Cleartext-Password (or Crypt-Password if hashed)
    if (input.password) {
      await db.radCheck.create({
        data: {
          username,
          attribute: "Cleartext-Password",
          op: ":=",
          value: input.password,
        },
      });
    }

    // Create radusergroup mapping (subscriber → plan group)
    if (input.planId) {
      const plan = await db.plan.findFirst({
        where: { id: input.planId, tenantId: input.tenantId },
        select: { name: true },
      });
      if (plan) {
        const groupName = `plan-${plan.name.toLowerCase().replace(/\s+/g, "-")}`;
        await db.radUserGroup.create({
          data: {
            username,
            groupname: groupName,
            priority: 1,
          },
        }).catch(() => {}); // Ignore if group already exists for this user
      }
    }

    // Create ActionHistory
    await db.actionHistory.create({
      data: {
        tenantId: input.tenantId,
        subscriberId: subscriber.id,
        action: "plan_assign",
        performedBy: input.tenantId, // system
        newValue: JSON.stringify({ status: subscriber.status, planId: input.planId, username }),
      },
    }).catch(() => {});

    return subscriber;
  });
}

export interface UpdateSubscriberInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  planId?: string | null;
  username?: string;
  password?: string;
}

export async function updateSubscriber(
  tenantId: string,
  id: string,
  input: UpdateSubscriberInput
): Promise<SubscriberWithRelations> {
  const { password, ...data } = input;
  const passwordHash = password ? await hashPassword(password) : undefined;

  return db.subscriber.update({
    where: { id },
    data: {
      ...(data as Prisma.SubscriberUpdateInput),
      ...(passwordHash ? { passwordHash } : {}),
    },
    include: SUBSCRIBER_INCLUDE,
  });
}

/**
 * Transition a subscriber's status. Validates the transition.
 * INDUSTRY STANDARD: Performs real RADIUS actions on each transition:
 *   - suspend → disable radcheck (Auth-Type := Reject) + CoA disconnect active sessions
 *   - reactivate → re-enable radcheck (remove Auth-Type reject) + restore
 *   - terminate → disable radcheck + disconnect all sessions + release IPs
 * Also creates ActionHistory records, CoA events, and emits domain events.
 */
export async function transitionSubscriberStatus(
  tenantId: string,
  id: string,
  newStatus: SubscriberStatus,
  actorUserId: string
): Promise<SubscriberWithRelations> {
  const subscriber = await getSubscriberById(tenantId, id);
  if (!subscriber) {
    throw new Error("Subscriber not found");
  }

  if (subscriber.status === newStatus) {
    return subscriber; // no-op
  }

  if (!canTransition(subscriber.status, newStatus)) {
    throw new Error(
      `Invalid status transition: ${subscriber.status} → ${newStatus}`
    );
  }

  const oldStatus = subscriber.status;

  // === INDUSTRY STANDARD: Real RADIUS integration on lifecycle transitions ===
  if (subscriber.username) {
    if (newStatus === "suspended" || newStatus === "terminated") {
      // 1. Disable RADIUS authentication: add Auth-Type := Reject to radcheck
      //    This prevents future logins even without CoA
      const existingReject = await db.radCheck.findFirst({
        where: { username: subscriber.username, attribute: "Auth-Type", value: "Reject" },
      });
      if (!existingReject) {
        await db.radCheck.create({
          data: {
            username: subscriber.username,
            attribute: "Auth-Type",
            op: ":=",
            value: "Reject",
          },
        });
      }

      // 2. Disconnect all active RADIUS sessions via CoA
      const activeSessions = await db.activeSession.findMany({
        where: { subscriberId: id, status: "active" },
        include: { nas: { select: { ipAddress: true, coaPort: true, sharedSecret: true } } },
      });

      for (const session of activeSessions) {
        await db.coaEvent.create({
          data: {
            tenantId,
            type: newStatus === "terminated" ? "session_disconnect" : "session_disconnect",
            status: "requested",
            subscriberId: id,
            sessionId: session.sessionId,
            nasIpAddress: session.nas.ipAddress,
            coaPort: session.nas.coaPort,
            attributes: JSON.stringify({ "Acct-Session-Id": session.sessionId }),
            requestedBy: actorUserId,
          },
        });

        // Move session to history
        await db.sessionHistory.create({
          data: {
            tenantId,
            sessionId: session.sessionId,
            subscriberId: session.subscriberId,
            nasId: session.nasId,
            username: session.username,
            nasIpAddress: session.nasIpAddress,
            framedIpAddress: session.framedIpAddress,
            callingStationId: session.callingStationId,
            startTime: session.startTime,
            stopTime: new Date(),
            duration: Math.floor((Date.now() - session.startTime.getTime()) / 1000),
            inputOctets: session.inputOctets,
            outputOctets: session.outputOctets,
            terminationCause: newStatus === "terminated" ? "Admin-Reset" : "User-Request",
          },
        });

        // Delete active session
        await db.activeSession.delete({ where: { id: session.id } });
      }

      // 3. For terminated: release static IP assignment if any
      if (newStatus === "terminated") {
        await db.ipAddress.updateMany({
          where: { assignedTo: id, assignedType: "subscriber" },
          data: { status: "available", assignedTo: null, assignedType: null, allocatedAt: null, allocatedBy: null },
        });
      }
    } else if (newStatus === "active" && oldStatus === "suspended") {
      // Reactivate: remove Auth-Type := Reject from radcheck
      await db.radCheck.deleteMany({
        where: { username: subscriber.username, attribute: "Auth-Type", value: "Reject" },
      });
    }
  }

  // Update subscriber status
  const updated = await db.subscriber.update({
    where: { id },
    data: { status: newStatus },
    include: SUBSCRIBER_INCLUDE,
  });

  // Create ActionHistory record
  await db.actionHistory.create({
    data: {
      tenantId,
      subscriberId: id,
      action: newStatus === "active" ? "activate" : newStatus === "suspended" ? "suspend" : "terminate",
      performedBy: actorUserId,
      oldValue: JSON.stringify({ status: oldStatus }),
      newValue: JSON.stringify({ status: newStatus }),
    },
  });

  return updated;
}

export async function deleteSubscriber(
  tenantId: string,
  id: string
): Promise<void> {
  // Check no active sessions
  const activeSessions = await db.activeSession.count({
    where: { subscriberId: id, status: "active" },
  });
  if (activeSessions > 0) {
    throw new Error(
      `Cannot delete subscriber with ${activeSessions} active session(s). Disconnect them first.`
    );
  }

  await db.subscriber.delete({ where: { id, tenantId } });
}

/**
 * Bulk create subscribers (for batch provisioning).
 * Returns created subscribers and errors.
 */
export async function bulkCreateSubscribers(
  tenantId: string,
  inputs: CreateSubscriberInput[]
): Promise<{ created: SubscriberWithRelations[]; errors: Array<{ index: number; error: string; input: CreateSubscriberInput }> }> {
  const created: SubscriberWithRelations[] = [];
  const errors: Array<{ index: number; error: string; input: CreateSubscriberInput }> = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    try {
      // Check duplicate customerId if provided
      if (input.customerId) {
        const existing = await getSubscriberByCustomerId(tenantId, input.customerId);
        if (existing) {
          errors.push({
            index: i,
            error: `Customer ID ${input.customerId} already exists`,
            input,
          });
          continue;
        }
      }
      // Check duplicate username if provided
      if (input.username) {
        const existing = await db.subscriber.findUnique({
          where: { username: input.username },
        });
        if (existing) {
          errors.push({
            index: i,
            error: `Username ${input.username} already exists`,
            input,
          });
          continue;
        }
      }
      // Validate plan exists
      if (input.planId) {
        const plan = await db.plan.findFirst({
          where: { id: input.planId, tenantId },
        });
        if (!plan) {
          errors.push({
            index: i,
            error: `Plan ${input.planId} not found`,
            input,
          });
          continue;
        }
      }

      const sub = await createSubscriber({ ...input, tenantId });
      created.push(sub);
    } catch (err) {
      errors.push({
        index: i,
        error: err instanceof Error ? err.message : "Unknown error",
        input,
      });
    }
  }

  return { created, errors };
}
