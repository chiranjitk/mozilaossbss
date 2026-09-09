// =====================================================================
// DEVICE POLL API — POST /api/v1/devices/[id]/poll
// Triggers a reachability check (SNMP / TR-069 / MikroTik REST / GPON mgr).
// Deterministic-but-random based on device id hash → ~85% online.
// Updates status, lastSeenAt, latencyMs, uptime; refreshes interface counters;
// creates a DeviceAlert if unreachable; emits device.polled / device.offline.
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus } from "@/core/events/bus";

export const dynamic = "force-dynamic";

// === Deterministic pseudo-random based on device id + time bucket ===
// Stable across same polling window (~5 minutes) so consecutive calls within
// that window produce the same online/offline result — important for ops.
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function deterministicReachable(deviceId: string, type: string): boolean {
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000)); // 5-min window
  const seed = hashString(`${deviceId}:${bucket}`);
  // ~85% online baseline. MikroTik slightly higher reliability, GPON slightly lower.
  const threshold =
    type === "mikrotik" ? 0.9 : type === "snmp" ? 0.85 : type === "tr069" ? 0.82 : type === "gpon" ? 0.8 : 0.85;
  const sample = (seed % 1000) / 1000;
  return sample < threshold;
}

function randomLatency(deviceId: string, reachable: boolean): number {
  if (!reachable) return 0;
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const seed = hashString(`${deviceId}:lat:${bucket}`);
  return 2 + (seed % 49); // 2–50 ms
}

function randomWalk(value: number, seed: number): number {
  // ±5% jitter on a counter (interface bytes/packets)
  const jitter = (seed % 100) - 50;
  const delta = Math.floor(value * (jitter / 1000)) + 1024 * (1 + (seed % 64));
  return Math.max(0, value + delta);
}

// POST /api/v1/devices/[id]/poll
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("devices", "device.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const device = await db.device.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { interfaces: true },
  });
  if (!device) {
    throw ApiError.notFound("Device", id);
  }

  // === 1. Simulate reachability probe (type-aware) ===
  // In production, each adapter would do the actual protocol probe:
  //   - mikrotik: HTTP REST /api/system/resource (auth: Basic)
  //   - snmp: SNMPv2c GET sysUpTime.0 (UDP/161)
  //   - tr069: HTTP POST Connection Request to CPE (ACS-initiated)
  //   - gpon: OLT manager socket (vendor-specific)
  const reachable = deterministicReachable(device.id, device.type);
  const latencyMs = randomLatency(device.id, reachable);
  const now = new Date();

  let updatedDevice;
  let alertCreated = null;
  const updatedInterfaces: { id: string; name: string; rxBytes: string; txBytes: string; status: string }[] = [];

  if (reachable) {
    // === Online branch ===
    // Increment uptime by the delta since last poll (or a fresh start if unknown)
    const lastPoll = device.lastPolledAt ?? now;
    const uptimeDelta = Math.max(1, Math.floor((now.getTime() - lastPoll.getTime()) / 1000));
    const newUptime = (device.uptime ?? 0) + uptimeDelta;

    updatedDevice = await db.device.update({
      where: { id },
      data: {
        status: "online",
        lastSeenAt: now,
        lastPolledAt: now,
        latencyMs,
        uptime: newUptime,
      },
    });

    // === Refresh interface counters (random walk) ===
    // Only refresh when device is reachable. We use the device id + current
    // bucket as the jitter seed so different devices get different walks.
    const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
    for (const iface of device.interfaces) {
      const seed = hashString(`${device.id}:${iface.id}:${bucket}`);
      const newRx = randomWalk(Number(iface.rxBytes ?? 0n), seed);
      const newTx = randomWalk(Number(iface.txBytes ?? 0n), seed + 1);
      const newRxPackets = randomWalk(Number(iface.rxPackets ?? 0n), seed + 2);
      const newTxPackets = randomWalk(Number(iface.txPackets ?? 0n), seed + 3);
      const updated = await db.deviceInterface.update({
        where: { id: iface.id },
        data: {
          rxBytes: BigInt(newRx),
          txBytes: BigInt(newTx),
          rxPackets: BigInt(newRxPackets),
          txPackets: BigInt(newTxPackets),
          status: "up",
          lastUpdated: now,
        },
      });
      updatedInterfaces.push({
        id: updated.id,
        name: updated.name,
        rxBytes: updated.rxBytes.toString(),
        txBytes: updated.txBytes.toString(),
        status: updated.status,
      });
    }

    // Auto-resolve prior "unreachable" critical alerts since device is back online
    await db.deviceAlert.updateMany({
      where: {
        deviceId: id,
        severity: "critical",
        resolvedAt: null,
      },
      data: { resolvedAt: now },
    });
  } else {
    // === Offline branch ===
    updatedDevice = await db.device.update({
      where: { id },
      data: {
        status: "offline",
        lastPolledAt: now,
        latencyMs: 0,
      },
    });

    // Only create a NEW critical alert if there isn't an open one already.
    const existingOpen = await db.deviceAlert.findFirst({
      where: { deviceId: id, severity: "critical", resolvedAt: null, acknowledged: false },
    });
    if (!existingOpen) {
      alertCreated = await db.deviceAlert.create({
        data: {
          deviceId: id,
          tenantId: ctx.tenantId,
          severity: "critical",
          message: `Device ${device.name} (${device.ipAddress}) unreachable`,
          metric: "reachability",
          value: "timeout",
        },
      });
    }
  }

  // === 2. Audit log entry (action=device.poll, module=devices) ===
  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "device.poll",
    module: "devices",
    resource: "Device",
    resourceId: id,
    requestId,
    newValue: {
      reachable,
      status: updatedDevice.status,
      latencyMs,
      uptime: updatedDevice.uptime,
    },
    message: `Polled ${device.type} device ${device.name} → ${reachable ? `online (${latencyMs}ms)` : "offline"}`,
  });

  // === 3. Emit device.polled event (and device.offline if unreachable) ===
  await eventBus.emit(
    "device.polled",
    {
      deviceId: id,
      type: device.type,
      reachable,
      latencyMs,
      status: updatedDevice.status,
      interfacesUpdated: updatedInterfaces.length,
    },
    { tenantId: ctx.tenantId, source: "devices", requestId }
  );

  if (!reachable) {
    await eventBus.emit(
      "device.offline",
      {
        deviceId: id,
        name: device.name,
        ipAddress: device.ipAddress,
        type: device.type,
        alertId: alertCreated?.id,
      },
      { tenantId: ctx.tenantId, source: "devices", requestId }
    );
  }

  return ok({
    deviceId: id,
    name: device.name,
    type: device.type,
    reachable,
    latencyMs,
    status: updatedDevice.status,
    lastSeenAt: updatedDevice.lastSeenAt,
    lastPolledAt: updatedDevice.lastPolledAt,
    uptime: updatedDevice.uptime,
    alert: alertCreated
      ? {
          id: alertCreated.id,
          severity: alertCreated.severity,
          message: alertCreated.message,
        }
      : null,
    interfacesUpdated: updatedInterfaces,
  });
});
