// =====================================================================
// MODULES API — list/resolve/toggle modules for the current tenant
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requirePermission, requireAuth } from "@/core/rbac";
import { resolveModuleStates } from "@/core/modules/resolver";
import { toggleModule } from "@/core/modules/resolver";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import { z } from "zod";

export const dynamic = "force-dynamic";

// GET /api/v1/modules — list all modules with their resolved state
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireAuth();
  const states = await resolveModuleStates(ctx.tenantId);

  return ok({
    modules: states.map((s) => ({
      id: s.module.id,
      name: s.module.name,
      description: s.module.description,
      version: s.module.version,
      category: s.module.category,
      industries: s.module.industries ?? [],
      dependencies: s.module.dependencies ?? [],
      permissions: s.module.permissions,
      resources: s.module.resources,
      hasWorker: s.module.hasWorker,
      requiresExternalConnection: s.module.requiresExternalConnection,
      coreModule: s.module.coreModule,
      licenseTier: s.module.licenseTier,
      enabled: s.enabled,
      licensed: s.licensed,
      health: s.health,
      workerStatus: s.workerStatus,
      dependenciesMet: s.dependenciesMet,
    })),
  });
});

const toggleSchema = z.object({
  moduleId: z.string().min(1),
  enabled: z.boolean(),
});

// PATCH /api/v1/modules — enable/disable a module
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requirePermission("module.manage");
  const body = await req.json();
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  const { moduleId, enabled } = parsed.data;
  const result = await toggleModule(ctx.tenantId, moduleId, enabled);

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: enabled ? "module.enable" : "module.disable",
    module: "core",
    resource: "Module",
    resourceId: moduleId,
    requestId,
    status: "success",
    message: `Module "${result.module.name}" ${enabled ? "enabled" : "disabled"}`,
  });

  await eventBus.emit(
    enabled ? EVENTS.MODULE_ENABLED : EVENTS.MODULE_DISABLED,
    { moduleId, moduleName: result.module.name },
    { tenantId: ctx.tenantId, source: "core.modules", requestId }
  );

  return ok({
    module: {
      id: result.module.id,
      name: result.module.name,
      enabled: result.enabled,
      dependenciesMet: result.dependenciesMet,
      health: result.health,
      workerStatus: result.workerStatus,
    },
  });
});
