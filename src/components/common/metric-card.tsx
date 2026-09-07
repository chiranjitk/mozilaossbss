// =====================================================================
// METRIC CARD — KPI display for dashboards
// =====================================================================

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  delta?: { value: string; trend: "up" | "down" | "neutral" };
  hint?: string;
  accent?: "default" | "brand" | "success" | "warning" | "danger";
  className?: string;
}

const ACCENT_STYLES: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  default: "text-foreground",
  brand: "text-brand",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

const ICON_BG: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  default: "bg-muted text-muted-foreground",
  brand: "bg-brand/10 text-brand",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
};

export function MetricCard({
  label,
  value,
  icon: Icon,
  delta,
  hint,
  accent = "default",
  className,
}: MetricCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
            {label}
          </p>
          <p
            className={cn(
              "text-2xl font-semibold tracking-tight tabular-nums",
              ACCENT_STYLES[accent]
            )}
          >
            {value}
          </p>
          {hint && (
            <p className="text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
            ICON_BG[accent]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {delta && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          {delta.trend === "up" && (
            <TrendingUp className="h-3.5 w-3.5 text-success" />
          )}
          {delta.trend === "down" && (
            <TrendingDown className="h-3.5 w-3.5 text-destructive" />
          )}
          <span
            className={
              delta.trend === "up"
                ? "text-success"
                : delta.trend === "down"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }
          >
            {delta.value}
          </span>
        </div>
      )}
    </Card>
  );
}
