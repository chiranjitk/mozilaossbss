// =====================================================================
// REPOSITORY BASE
// Common patterns: pagination, ordering, count.
// Business logic stays here, not in components or API handlers.
// =====================================================================

import { Prisma } from "@prisma/client";

export interface PaginateOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Normalize pagination params from a query string.
 */
export function parsePagination(params: URLSearchParams | Record<string, string | string[] | undefined>): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const page = Math.max(1, parseInt(get("page") ?? "1", 10));
  const requestedSize = parseInt(get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, isNaN(requestedSize) ? DEFAULT_PAGE_SIZE : requestedSize));

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/**
 * Run a findMany + count in parallel and return a uniform paginated result.
 */
export async function paginate<T, W extends Prisma.WhereInput, O extends Prisma.OrderByIdInput>(
  model: {
    findMany: (args: { where?: W; orderBy?: O; skip?: number; take?: number }) => Promise<T[]>;
    count: (args: { where?: W }) => Promise<number>;
  },
  args: { where?: W; orderBy?: O } & PaginateOptions
): Promise<PaginatedResult<T>> {
  const { page = 1, pageSize = DEFAULT_PAGE_SIZE } = args;
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  const [data, total] = await Promise.all([
    model.findMany({
      where: args.where as W,
      orderBy: args.orderBy,
      skip,
      take,
    }),
    model.count({ where: args.where as W }),
  ]);

  return { data, total, page, pageSize };
}
