// =====================================================================
// DEVICE FORM — shared create/edit form for all device families
// Type-specific fields toggle based on selected type
// =====================================================================

"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export const DEVICE_TYPES = [
  { value: "mikrotik", label: "MikroTik" },
  { value: "snmp", label: "SNMP" },
  { value: "tr069", label: "TR-069" },
  { value: "gpon", label: "GPON / OLT" },
  { value: "generic", label: "Generic" },
];

export const DEVICE_STATUSES = [
  { value: "unmanaged", label: "Unmanaged" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "maintenance", label: "Maintenance" },
];

export interface DeviceListItem {
  id: string;
  name: string;
  type: string;
  ipAddress: string;
  managementPort: number;
  vendor: string | null;
  model: string | null;
  serialNumber: string | null;
  firmwareVersion: string | null;
  status: string;
  location: string | null;
  parentId: string | null;
  parentName: string | null;
  snmpCommunity: string | null;
  tr069Url: string | null;
  lastSeenAt: string | null;
  lastPolledAt: string | null;
  latencyMs: number | null;
  uptime: number;
  interfaceCount: number;
  openAlertCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DeviceFormProps {
  device: DeviceListItem | null;
  isSaving: boolean;
  defaultType?: string;
  parentOptions?: Array<{ id: string; name: string }>;
  onSave: (values: any) => void;
}

export function DeviceForm({
  device,
  isSaving,
  defaultType = "mikrotik",
  parentOptions = [],
  onSave,
}: DeviceFormProps) {
  const [form, setForm] = useState({
    name: device?.name ?? "",
    type: device?.type ?? defaultType,
    ipAddress: device?.ipAddress ?? "",
    managementPort: String(device?.managementPort ?? 8728),
    vendor: device?.vendor ?? "",
    model: device?.model ?? "",
    serialNumber: device?.serialNumber ?? "",
    firmwareVersion: device?.firmwareVersion ?? "",
    status: device?.status ?? "unmanaged",
    location: device?.location ?? "",
    parentId: device?.parentId ?? "",
    snmpCommunity: "",
    tr069Url: device?.tr069Url ?? "",
    credentialsUsername: "",
    credentialsPassword: "",
  });

  const handleChange = (key: string, value: any) => {
    setForm((p) => ({ ...p, [key]: value }));
  };

  const requiresSnmp = form.type === "snmp";
  const requiresTr069 = form.type === "tr069";
  const isMikrotik = form.type === "mikrotik";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const payload: any = {
          name: form.name,
          type: form.type,
          ipAddress: form.ipAddress,
          managementPort: Number(form.managementPort),
          status: form.status,
          vendor: form.vendor || undefined,
          model: form.model || undefined,
          serialNumber: form.serialNumber || undefined,
          firmwareVersion: form.firmwareVersion || undefined,
          location: form.location || undefined,
          parentId: form.parentId || undefined,
        };
        if (requiresSnmp && form.snmpCommunity) {
          payload.snmpCommunity = form.snmpCommunity;
        }
        if (requiresTr069 && form.tr069Url) {
          payload.tr069Url = form.tr069Url;
        }
        if (isMikrotik && (form.credentialsUsername || form.credentialsPassword)) {
          payload.credentials = {
            username: form.credentialsUsername,
            password: form.credentialsPassword,
          };
        }
        onSave(payload);
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="dev-name">Name</Label>
        <Input
          id="dev-name"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          placeholder="e.g. Core Router RB4011"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="dev-ip">IP Address</Label>
          <Input
            id="dev-ip"
            value={form.ipAddress}
            onChange={(e) => handleChange("ipAddress", e.target.value)}
            placeholder="10.0.0.1"
            required
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dev-port">Management Port</Label>
          <Input
            id="dev-port"
            type="number"
            min="1"
            max="65535"
            value={form.managementPort}
            onChange={(e) => handleChange("managementPort", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="dev-type">Type</Label>
          <Select
            value={form.type}
            onValueChange={(v) => handleChange("type", v)}
            disabled={!!device}
          >
            <SelectTrigger id="dev-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEVICE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dev-status">Status</Label>
          <Select
            value={form.status}
            onValueChange={(v) => handleChange("status", v)}
          >
            <SelectTrigger id="dev-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEVICE_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="dev-vendor">Vendor</Label>
          <Input
            id="dev-vendor"
            value={form.vendor}
            onChange={(e) => handleChange("vendor", e.target.value)}
            placeholder="MikroTik / Cisco / Huawei"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dev-model">Model</Label>
          <Input
            id="dev-model"
            value={form.model}
            onChange={(e) => handleChange("model", e.target.value)}
            placeholder="RB4011 / C9200 / MA5608T"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="dev-serial">Serial Number</Label>
          <Input
            id="dev-serial"
            value={form.serialNumber}
            onChange={(e) => handleChange("serialNumber", e.target.value)}
            placeholder="SN-xxxxxx"
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dev-fw">Firmware Version</Label>
          <Input
            id="dev-fw"
            value={form.firmwareVersion}
            onChange={(e) => handleChange("firmwareVersion", e.target.value)}
            placeholder="7.14.3 / 16.12.4"
            className="font-mono"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dev-loc">Location</Label>
        <Input
          id="dev-loc"
          value={form.location}
          onChange={(e) => handleChange("location", e.target.value)}
          placeholder="Site A · Rack 3 · U1"
        />
      </div>

      {parentOptions.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="dev-parent">Parent Device (topology)</Label>
          <Select
            value={form.parentId}
            onValueChange={(v) => handleChange("parentId", v || undefined)}
          >
            <SelectTrigger id="dev-parent">
              <SelectValue placeholder="None — top-level device" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">— none —</SelectItem>
              {parentOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {requiresSnmp && (
        <div className="space-y-2">
          <Label htmlFor="dev-snmp">SNMP Community</Label>
          <Input
            id="dev-snmp"
            value={form.snmpCommunity}
            onChange={(e) => handleChange("snmpCommunity", e.target.value)}
            placeholder={device?.snmpCommunity ? "•••••••• (blank = keep)" : "public"}
            className="font-mono"
            required={!device}
          />
        </div>
      )}

      {requiresTr069 && (
        <div className="space-y-2">
          <Label htmlFor="dev-tr069">TR-069 Connection Request URL</Label>
          <Input
            id="dev-tr069"
            value={form.tr069Url}
            onChange={(e) => handleChange("tr069Url", e.target.value)}
            placeholder="http://10.0.0.50:7547/"
            className="font-mono"
            required={!device}
          />
        </div>
      )}

      {isMikrotik && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="dev-user">API Username</Label>
            <Input
              id="dev-user"
              value={form.credentialsUsername}
              onChange={(e) => handleChange("credentialsUsername", e.target.value)}
              placeholder={device ? "•••••• (blank = keep)" : "admin"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dev-pass">API Password</Label>
            <Input
              id="dev-pass"
              type="password"
              value={form.credentialsPassword}
              onChange={(e) => handleChange("credentialsPassword", e.target.value)}
              placeholder="••••••"
            />
          </div>
        </div>
      )}

      <DialogFooter>
        <Button
          type="submit"
          disabled={isSaving || !form.name || !form.ipAddress}
        >
          {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {device ? "Save changes" : "Add device"}
        </Button>
      </DialogFooter>
    </form>
  );
}
