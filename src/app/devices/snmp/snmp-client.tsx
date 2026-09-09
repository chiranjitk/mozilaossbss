// =====================================================================
// SNMP DEVICES CLIENT — placeholder (no backend yet)
// Renders empty state until SNMP device repository is implemented.
// =====================================================================

"use client";

import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { Network } from "lucide-react";

export function SnmpDevicesClient() {
  return (
    <>
      <PageHeader
        title="SNMP Devices"
        description="Manage SNMP-enabled network devices (switches, routers, APs). Polls via SNMP v1/v2c/v3."
      />
      <EmptyState
        title="No SNMP devices configured"
        description="Add SNMP-enabled devices to begin monitoring via SNMP v1/v2c/v3 polls."
      />
    </>
  );
}
