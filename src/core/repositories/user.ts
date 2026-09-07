// =====================================================================
// USER REPOSITORY — data access layer for users
// Business logic stays here; API handlers stay thin.
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/crypto/password";
import { paginate, parsePagination, type PaginatedResult } from "@/core/repositories/base";

export interface UserListFilters {
  search?: string;
  status?: string;
  roleId?: string;
}

export const USER_INCLUDE = {
  tenant: { select: { id: true, name: true, slug: true } },
  userRoles: {
    include: {
      role: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.UserInclude;

export type UserWithRelations = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

export async function listUsers(
  tenantId: string,
  filters: UserListFilters,
  query: URLSearchParams
): Promise<PaginatedResult<UserWithRelations>> {
  const { page, pageSize, skip, take } = parsePagination(query);

  const where: Prisma.UserWhereInput = {
    tenantId,
    ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search } },
            { email: { contains: filters.search } },
            { username: { contains: filters.search } },
          ],
        }
      : {}),
    ...(filters.roleId
      ? { userRoles: { some: { roleId: filters.roleId } } }
      : {}),
  };

  return paginate<
    UserWithRelations,
    Prisma.UserWhereInput,
    Prisma.UserOrderByWithRelationInput
  >(
    {
      findMany: (args) => db.user.findMany({ ...args, include: USER_INCLUDE }),
      count: (args) => db.user.count(args),
    },
    { where, orderBy: { createdAt: "desc" }, page, pageSize }
  );
}

export async function getUserById(
  tenantId: string,
  id: string
): Promise<UserWithRelations | null> {
  return db.user.findFirst({
    where: { id, tenantId },
    include: USER_INCLUDE,
  });
}

export async function getUserByUsername(username: string): Promise<UserWithRelations | null> {
  return db.user.findUnique({
    where: { username },
    include: USER_INCLUDE,
  });
}

export interface CreateUserInput {
  tenantId: string;
  email: string;
  username: string;
  password: string;
  name?: string;
  phone?: string;
  roleIds: string[];
}

export async function createUser(input: CreateUserInput): Promise<UserWithRelations> {
  const passwordHash = await hashPassword(input.password);
  return db.user.create({
    data: {
      tenantId: input.tenantId,
      email: input.email,
      username: input.username,
      passwordHash,
      name: input.name,
      phone: input.phone,
      status: "active",
      userRoles: {
        create: input.roleIds.map((roleId) => ({ roleId })),
      },
    },
    include: USER_INCLUDE,
  });
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  phone?: string;
  status?: string;
  password?: string;
  roleIds?: string[];
}

export async function updateUser(
  tenantId: string,
  id: string,
  input: UpdateUserInput
): Promise<UserWithRelations> {
  const { roleIds, password, ...data } = input;
  const passwordHash = password ? await hashPassword(password) : undefined;

  return db.user.update({
    where: { id },
    data: {
      ...(data as Prisma.UserUpdateInput),
      ...(passwordHash ? { passwordHash } : {}),
      ...(roleIds
        ? {
            userRoles: {
              deleteMany: {},
              create: roleIds.map((roleId) => ({ roleId })),
            },
          }
        : {}),
    },
    include: USER_INCLUDE,
  });
}

export async function deleteUser(tenantId: string, id: string): Promise<void> {
  await db.user.delete({ where: { id, tenantId } });
}

export async function resetUserPassword(
  tenantId: string,
  id: string,
  newPassword: string
): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await db.user.update({
    where: { id, tenantId },
    data: { passwordHash, failedAttempts: 0, lockedUntil: null },
  });
}

export async function unlockUser(tenantId: string, id: string): Promise<void> {
  await db.user.update({
    where: { id, tenantId },
    data: { failedAttempts: 0, lockedUntil: null, status: "active" },
  });
}
