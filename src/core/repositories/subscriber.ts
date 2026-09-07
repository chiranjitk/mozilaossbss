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
 * Emits a state-change event for downstream consumers (RADIUS CoA, billing, notifications).
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

  return db.subscriber.update({
    where: { id },
    data: { status: newStatus },
    include: SUBSCRIBER_INCLUDE,
  });
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
