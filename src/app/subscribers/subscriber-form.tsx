// =====================================================================
// SUBSCRIBER FORM — create + edit
// Fields: name, contact, address, plan, RADIUS credentials, status
// =====================================================================

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  code: string;
}

interface SubscriberFormProps {
  mode: "create" | "edit";
  plans: Plan[];
  subscriber?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    planId: string | null;
    username: string | null;
    status: string;
  };
  onSuccess?: () => void;
}

export function SubscriberForm({ mode, plans, subscriber, onSuccess }: SubscriberFormProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: subscriber?.firstName ?? "",
    lastName: subscriber?.lastName ?? "",
    email: subscriber?.email ?? "",
    phone: subscriber?.phone ?? "",
    address: subscriber?.address ?? "",
    planId: subscriber?.planId ?? "",
    username: subscriber?.username ?? "",
    password: "",
    status: subscriber?.status ?? "pending",
  });

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        planId: form.planId || undefined,
        status: form.status,
      };
      if (mode === "create") {
        if (form.username) body.username = form.username;
        if (form.password) body.password = form.password;
      } else {
        body.username = form.username || undefined;
        if (form.password) body.password = form.password;
      }

      const url = mode === "create" ? "/api/v1/subscribers" : `/api/v1/subscribers/${subscriber!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `Failed to ${mode} subscriber`);
      }
      toast.success(mode === "create" ? "Subscriber created" : "Subscriber updated");
      onSuccess?.();
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="sub-first">First name *</Label>
          <Input
            id="sub-first"
            value={form.firstName}
            onChange={(e) => handleChange("firstName", e.target.value)}
            required
            placeholder="John"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sub-last">Last name *</Label>
          <Input
            id="sub-last"
            value={form.lastName}
            onChange={(e) => handleChange("lastName", e.target.value)}
            required
            placeholder="Smith"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="sub-email">Email</Label>
          <Input
            id="sub-email"
            type="email"
            value={form.email}
            onChange={(e) => handleChange("email", e.target.value)}
            placeholder="john@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sub-phone">Phone</Label>
          <Input
            id="sub-phone"
            value={form.phone}
            onChange={(e) => handleChange("phone", e.target.value)}
            placeholder="+1 555 123 4567"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sub-address">Address</Label>
        <Textarea
          id="sub-address"
          value={form.address}
          onChange={(e) => handleChange("address", e.target.value)}
          placeholder="123 Main St, City, State, ZIP"
          rows={2}
        />
      </div>

      {/* Plan assignment */}
      <div className="space-y-2">
        <Label htmlFor="sub-plan">Plan</Label>
        <Select value={form.planId || "none"} onValueChange={(v) => handleChange("planId", v === "none" ? "" : v)}>
          <SelectTrigger id="sub-plan">
            <SelectValue placeholder="Select a plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No plan</SelectItem>
            {plans.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} <Badge variant="outline" className="ml-2 text-[10px]">{p.code}</Badge>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* RADIUS credentials */}
      <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          RADIUS Credentials
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="sub-username" className="text-xs">Username</Label>
            <Input
              id="sub-username"
              value={form.username}
              onChange={(e) => handleChange("username", e.target.value)}
              placeholder="auto-generated if blank"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sub-password" className="text-xs">
              Password {mode === "edit" && "(blank = unchanged)"}
            </Label>
            <Input
              id="sub-password"
              type="password"
              value={form.password}
              onChange={(e) => handleChange("password", e.target.value)}
              placeholder="min 6 characters"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          These credentials are used by the subscriber&apos;s router/CPE to authenticate via RADIUS/PPPoE.
        </p>
      </div>

      {/* Status */}
      {mode === "create" && (
        <div className="space-y-2">
          <Label htmlFor="sub-status">Initial status</Label>
          <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
            <SelectTrigger id="sub-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending (default)</SelectItem>
              <SelectItem value="active">Active (immediately online)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={saving || !form.firstName || !form.lastName}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {mode === "create" ? "Create subscriber" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
