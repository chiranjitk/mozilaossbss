// =====================================================================
// FREERADIUS TABLES API — visibility into the policy→RADIUS sync output
// GET /api/v1/aaa/radius-tables
//   ?table=radgroupreply|radgroupcheck|radusergroup|radcheck
//   &q=<search>
// Returns the rows the policy engine syncs (group profiles, user mappings)
// and per-subscriber auth rows. Read-only: these tables are managed by the
// policy CRUD routes (sync on create/update/delete).
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.radius.configure");
  const table = req.nextUrl.searchParams.get("table") ?? "radgroupreply";
  const q = req.nextUrl.searchParams.get("q") ?? "";

  const take = 200;
  const search = q.trim();

  let rows: Array<Record<string, unknown>> = [];
  switch (table) {
    case "radcheck": {
      const data = await db.radCheck.findMany({
        where: search ? { username: { contains: search } } : {},
        take,
        orderBy: { username: "asc" },
      });
      rows = data.map((r) => ({
        id: r.id,
        key: r.username,
        attribute: r.attribute,
        op: r.op,
        value: r.attribute === "Cleartext-Password" ? "••••••" : r.value,
      }));
      break;
    }
    case "radgroupcheck": {
      const data = await db.radGroupCheck.findMany({
        where: search ? { groupname: { contains: search } } : {},
        take,
        orderBy: { groupname: "asc" },
      });
      rows = data.map((r) => ({
        id: r.id,
        key: r.groupname,
        attribute: r.attribute,
        op: r.op,
        value: r.value,
      }));
      break;
    }
    case "radusergroup": {
      const data = await db.radUserGroup.findMany({
        where: search ? { username: { contains: search } } : {},
        take,
        orderBy: { username: "asc" },
      });
      rows = data.map((r) => ({
        id: r.id,
        key: r.username,
        attribute: "Group",
        op: "=",
        value: r.groupname,
        priority: r.priority,
      }));
      break;
    }
    case "radgroupreply":
    default: {
      const data = await db.radGroupReply.findMany({
        where: search ? { groupname: { contains: search } } : {},
        take,
        orderBy: { groupname: "asc" },
      });
      rows = data.map((r) => ({
        id: r.id,
        key: r.groupname,
        attribute: r.attribute,
        op: r.op,
        value: r.value,
      }));
      break;
    }
  }

  // Sync health: counts across all tables so the UI can show drift
  const [groupReply, groupCheck, userGroup, check, reply] = await Promise.all([
    db.radGroupReply.count(),
    db.radGroupCheck.count(),
    db.radUserGroup.count(),
    db.radCheck.count(),
    db.radReply.count(),
  ]);

  return ok(
    {
      table,
      rows,
      counts: { radGroupReply: groupReply, radGroupCheck: groupCheck, radUserGroup: userGroup, radCheck: check, radReply: reply },
    },
    { requestId },
    requestId
  );
});
