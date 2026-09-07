// =====================================================================
// API CONVENTIONS
// Consistent response envelope, error codes, request IDs.
// Every API returns: { success, data?, error?, meta? }
// =====================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { logger } from "@/core/logging/logger";

// ---------------------------------------------------------------------
// SUCCESS / ERROR ENVELOPE
// ---------------------------------------------------------------------

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    page?: number;
    pageSize?: number;
    total?: number;
    [key: string]: unknown;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

// ---------------------------------------------------------------------
// ERROR CODES — typed, centralized
// ---------------------------------------------------------------------

export const ErrorCode = {
  // 400
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  DUPLICATE_RESOURCE: "DUPLICATE_RESOURCE",
  // 401
  UNAUTHENTICATED: "UNAUTHENTICATED",
  // 403
  FORBIDDEN: "FORBIDDEN",
  MODULE_DISABLED: "MODULE_DISABLED",
  // 404
  NOT_FOUND: "NOT_FOUND",
  // 409
  CONFLICT: "CONFLICT",
  // 422
  BUSINESS_RULE_VIOLATION: "BUSINESS_RULE_VIOLATION",
  // 500
  INTERNAL_ERROR: "INTERNAL_ERROR",
  // 503
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS_CODES: Record<ErrorCodeType, number> = {
  VALIDATION_ERROR: 400,
  INVALID_INPUT: 400,
  DUPLICATE_RESOURCE: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  MODULE_DISABLED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BUSINESS_RULE_VIOLATION: 422,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// ---------------------------------------------------------------------
// API ERROR — thrown from handlers / services
// ---------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public code: ErrorCodeType,
    message: string,
    public details?: unknown,
    public statusCode?: number
  ) {
    super(message);
    this.name = "ApiError";
  }

  static notFound(resource: string, id?: string) {
    return new ApiError(
      ErrorCode.NOT_FOUND,
      `${resource}${id ? ` ${id}` : ""} not found`
    );
  }

  static forbidden(action?: string) {
    return new ApiError(
      ErrorCode.FORBIDDEN,
      action ? `You do not have permission to ${action}` : "Forbidden"
    );
  }

  static unauthenticated() {
    return new ApiError(ErrorCode.UNAUTHENTICATED, "Authentication required");
  }

  static moduleDisabled(moduleId: string) {
    return new ApiError(
      ErrorCode.MODULE_DISABLED,
      `Module "${moduleId}" is not enabled for this tenant`
    );
  }

  static validation(zodError: z.ZodError) {
    return new ApiError(
      ErrorCode.VALIDATION_ERROR,
      "Request validation failed",
      zodError.flatten()
    );
  }

  static duplicate(resource: string, field: string, value: string) {
    return new ApiError(
      ErrorCode.DUPLICATE_RESOURCE,
      `${resource} with ${field} "${value}" already exists`
    );
  }

  static conflict(message: string) {
    return new ApiError(ErrorCode.CONFLICT, message);
  }

  static businessRule(message: string, details?: unknown) {
    return new ApiError(ErrorCode.BUSINESS_RULE_VIOLATION, message, details);
  }

  static internal(message = "Internal server error", details?: unknown) {
    return new ApiError(ErrorCode.INTERNAL_ERROR, message, details);
  }
}

// ---------------------------------------------------------------------
// RESPONSE HELPERS — uniform envelope
// ---------------------------------------------------------------------

export function ok<T>(data: T, meta?: ApiSuccess<T>["meta"], requestId?: string) {
  return NextResponse.json(
    { success: true, data, meta: { requestId, ...meta } } satisfies ApiSuccess<T>,
    { status: 200 }
  );
}

export function created<T>(data: T, requestId?: string) {
  return NextResponse.json(
    { success: true, data, meta: { requestId } } satisfies ApiSuccess<T>,
    { status: 201 }
  );
}

export function paginated<T>(
  data: T[],
  { page, pageSize, total }: { page: number; pageSize: number; total: number },
  requestId?: string
) {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: { requestId, page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    } satisfies ApiSuccess<T>,
    { status: 200 }
  );
}

export function fail(error: ApiError, requestId?: string) {
  const code = error.code as ErrorCodeType;
  const status = error.statusCode ?? STATUS_CODES[code];

  // Never expose internal errors in detail to the client
  const isInternal = code === ErrorCode.INTERNAL_ERROR;
  const safeMessage = isInternal ? "Internal server error" : error.message;

  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message: safeMessage,
        details: isInternal ? undefined : error.details,
        requestId,
      },
    } satisfies ApiErrorResponse,
    { status }
  );
}

// ---------------------------------------------------------------------
// REQUEST ID — propagated to all logs for traceability
// ---------------------------------------------------------------------

export function generateRequestId(): string {
  return randomUUID();
}

// ---------------------------------------------------------------------
// API HANDLER WRAPPER — consistent error handling, request IDs, logging
// ---------------------------------------------------------------------

type HandlerContext = {
  requestId: string;
};

type ApiHandler = (req: Request, ctx: HandlerContext) => Promise<Response>;

/**
 * Wrap an API route handler to get:
 * - consistent error envelope
 * - request ID propagation
 * - structured logging
 * - zod validation surfacing
 */
export function apiRoute(handler: ApiHandler): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const requestId = req.headers.get("x-request-id") ?? generateRequestId();
    const path = new URL(req.url).pathname;

    try {
      logger.info(`${req.method} ${path}`, { requestId, module: "api" });
      const response = await handler(req, { requestId });
      return response;
    } catch (err) {
      if (err instanceof ApiError) {
        logger.warn(`API error: ${err.code} ${err.message}`, {
          requestId,
          module: "api",
          code: err.code,
        });
        return fail(err, requestId);
      }

      // Zod errors → 400
      if (err instanceof z.ZodError) {
        logger.warn("Validation error", { requestId, module: "api" });
        return fail(ApiError.validation(err), requestId);
      }

      // Prisma unique constraint
      if (err && typeof err === "object" && "code" in err && (err as any).code === "P2002") {
        const target = (err as any).meta?.target as string[] | undefined;
        logger.warn("Duplicate resource", { requestId, module: "api", target });
        return fail(
          ApiError.duplicate("Resource", target?.[0] ?? "field", ""),
          requestId
        );
      }

      // Unknown error → 500
      logger.error("Unhandled error", { requestId, module: "api" }, err as Error);
      return fail(ApiError.internal(), requestId);
    }
  };
}
