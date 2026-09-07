// =====================================================================
// STATUS BADGE — semantic status indicators
// =====================================================================

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const STATUS_STYLES: Record<string, string> = {
  // Subscriber / general
  active: "bg-success/15 text-success border-success/30",
  pending: "bg-warning/15 text-warning border-warning/30",
  suspended: "bg-warning/15 text-warning border-warning/30",
  terminated: "bg-muted text-muted-foreground border-border",
  disabled: "bg-muted text-muted-foreground border-border",
  locked: "bg-destructive/15 text-destructive border-destructive/30",

  // Sessions
  online: "bg-success/15 text-success border-success/30",
  offline: "bg-muted text-muted-foreground border-border",
  stopped: "bg-muted text-muted-foreground border-border",
  expired: "bg-warning/15 text-warning border-warning/30",

  // Billing
  paid: "bg-success/15 text-success border-success/30",
  draft: "bg-muted text-muted-foreground border-border",
  issued: "bg-info/15 text-info border-info/30",
  partial: "bg-warning/15 text-warning border-warning/30",
  overdue: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",

  // System
  healthy: "bg-success/15 text-success border-success/30",
  degraded: "bg-warning/15 text-warning border-warning/30",
  down: "bg-destructive/15 text-destructive border-destructive/30",
  unknown: "bg-muted text-muted-foreground border-border",

  // Tickets
  open: "bg-info/15 text-info border-info/30",
  in_progress: "bg-warning/15 text-warning border-warning/30",
  resolved: "bg-success/15 text-success border-success/30",
  closed: "bg-muted text-muted-foreground border-border",

  // Priority
  low: "bg-muted text-muted-foreground border-border",
  normal: "bg-info/15 text-info border-info/30",
  high: "bg-warning/15 text-warning border-warning/30",
  urgent: "bg-destructive/15 text-destructive border-destructive/30",
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const styleClass =
    STATUS_STYLES[status.toLowerCase()] ??
    "bg-muted text-muted-foreground border-border";
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium capitalize",
        styleClass,
        className
      )}
    >
      {label ?? status.replace(/_/g, " ")}
    </Badge>
  );
}
