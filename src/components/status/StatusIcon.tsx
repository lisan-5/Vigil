/**
 * Status indicators. Every state pairs a distinct icon shape with a text label,
 * so meaning never depends on color alone (color-blind safe).
 */
import {
  Bug,
  CheckCheck,
  CircleCheck,
  CircleX,
  Eye,
  Flame,
  Info,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { AlertState, LogLevel, Severity } from "@/api/types";
import type { Health } from "@/stores/live";
import { cn } from "@/lib/utils";

interface Meta {
  icon: LucideIcon;
  label: string;
  /** Text color class */
  tone: string;
  /** Soft background + border classes */
  soft: string;
}

const tone = {
  healthy: { tone: "text-healthy", soft: "bg-healthy/10 border-healthy/25 text-healthy" },
  warning: { tone: "text-warning", soft: "bg-warning/10 border-warning/30 text-warning" },
  critical: { tone: "text-critical", soft: "bg-critical/10 border-critical/30 text-critical" },
  info: { tone: "text-info", soft: "bg-info/10 border-info/25 text-info" },
  muted: { tone: "text-muted-foreground", soft: "bg-muted border-border text-muted-foreground" },
};

export const HEALTH_META: Record<Health, Meta> = {
  healthy: { icon: CircleCheck, label: "Healthy", ...tone.healthy },
  degraded: { icon: TriangleAlert, label: "Degraded", ...tone.warning },
  critical: { icon: OctagonAlert, label: "Critical", ...tone.critical },
};

export const SEVERITY_META: Record<Severity, Meta> = {
  info: { icon: Info, label: "Info", ...tone.info },
  warning: { icon: TriangleAlert, label: "Warning", ...tone.warning },
  critical: { icon: OctagonAlert, label: "Critical", ...tone.critical },
};

export const ALERT_STATE_META: Record<AlertState, Meta> = {
  ok: { icon: CircleCheck, label: "OK", ...tone.healthy },
  firing: { icon: Flame, label: "Firing", ...tone.critical },
  acknowledged: { icon: Eye, label: "Acknowledged", ...tone.warning },
  resolved: { icon: CheckCheck, label: "Resolved", ...tone.muted },
};

export const LEVEL_META: Record<LogLevel, Meta> = {
  debug: {
    icon: Bug,
    label: "DEBUG",
    tone: "text-debug",
    soft: "bg-muted border-border text-debug",
  },
  info: { icon: Info, label: "INFO", ...tone.info },
  warn: { icon: TriangleAlert, label: "WARN", ...tone.warning },
  error: { icon: CircleX, label: "ERROR", ...tone.critical },
};

export function StatusPill({
  meta,
  className,
  compact = false,
}: {
  meta: Meta;
  className?: string;
  compact?: boolean;
}) {
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        meta.soft,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {compact ? <span className="sr-only">{meta.label}</span> : meta.label}
    </span>
  );
}

export function StatusIcon({ meta, className }: { meta: Meta; className?: string }) {
  const Icon = meta.icon;
  return (
    <Icon
      className={cn("size-4 shrink-0", meta.tone, className)}
      aria-label={meta.label}
      role="img"
    />
  );
}
