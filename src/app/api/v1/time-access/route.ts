// =====================================================================
// TIME ACCESS API — list + create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus } from "@/core/events/bus";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.timeaccess.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const where = { tenantId: ctx.tenantId, ...(status && status !== "all" ? { status } : {}), ...(search ? { name: { contains: search } } : {}) };
  const [profiles, total] = await Promise.all([
    db.timeAccessProfile.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.timeAccessProfile.count({ where }),
  ]);
  return paginated(profiles.map((p) => ({
    ...p, schedule: p.schedule ? JSON.parse(p.schedule) : null,
  })), { page, pageSize, total }, requestId);
});

const createSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  schedule: z.record(z.any()),
  timezone: z.string().default("UTC"),
  action: z.enum(["allow", "deny"]).default("allow"),
  status: z.enum(["active", "disabled"]).default("active"),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.timeaccess.write");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  data.schedule = JSON.stringify(data.schedule);
  if (data.description === "") data.description = null;

  const existing = await db.timeAccessProfile.findUnique({ where: { tenantId_name: { tenantId: ctx.tenantId, name: data.name } } });
  if (existing) throw ApiError.duplicate("Profile", "name", data.name);

  const profile = await db.timeAccessProfile.create({ data: { tenantId: ctx.tenantId, ...data } });

  // === INDUSTRY STANDARD: Sync time access to radgroupcheck Login-Time ===
  const groupName = `timeaccess-${profile.name.toLowerCase().replace(/\s+/g, "-")}`;
  const loginTimeString = convertScheduleToLoginTime(profile.schedule);

  if (loginTimeString) {
    await db.radGroupCheck.create({
      data: { groupname: groupName, attribute: "Login-Time", op: ":=", value: loginTimeString },
    }).catch(() => {});
  }

  await eventBus.emit("policy.timeaccess.created", { profileId: profile.id, groupName, loginTime: loginTimeString }, { tenantId: ctx.tenantId, source: "policy", requestId });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "timeaccess.create", module: "policy", resource: "TimeAccessProfile", resourceId: profile.id, requestId, message: `Created time access profile ${profile.name} → RADIUS Login-Time: ${loginTimeString}` });
  return created({ id: profile.id, name: profile.name, status: profile.status, radiusGroup: groupName, loginTime: loginTimeString }, requestId);
});

/**
 * Convert schedule JSON to RADIUS Login-Time format
 * Schedule: { mon: [{start:"08:00",end:"22:00"}], tue: [...], ... }
 * Login-Time: "Wk0800-2200" (weekdays 8am-10pm) or "Wk0800-2200,Sa0000-2400" etc.
 */
function convertScheduleToLoginTime(scheduleStr: string): string | null {
  try {
    const schedule = JSON.parse(scheduleStr);
    const dayMap: Record<string, string> = { mon: "Mo", tue: "Tu", wed: "We", thu: "Th", fri: "Fr", sat: "Sa", sun: "Su" };
    const parts: string[] = [];

    for (const [day, slots] of Object.entries(schedule)) {
      const radiusDay = dayMap[day];
      if (!radiusDay) continue;
      for (const slot of slots as Array<{ start: string; end: string }>) {
        const startTime = slot.start.replace(":", "");
        const endTime = slot.end.replace(":", "").replace("23:59", "2400");
        parts.push(`${radiusDay}${startTime}-${endTime}`);
      }
    }

    return parts.length > 0 ? parts.join(",") : null;
  } catch {
    return null;
  }
}
