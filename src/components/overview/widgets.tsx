/** Live overview widgets — reused on the Overview page and on Dashboards. */
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Activity, BellRing, Gauge, TriangleAlert, type LucideIcon } from "lucide-react";
import { SERVICE_NAMES, type Alert } from "@/api/types";
import { METRIC_UNITS } from "@/api/mock/metrics";
import { Sparkline } from "@/components/charts/Sparkline";
import { SERVICE_COLOR } from "@/components/charts/colors";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { EmptyState } from "@/components/common/EmptyState";
import {
  ALERT_STATE_META,
  HEALTH_META,
  SEVERITY_META,
  StatusIcon,
  StatusPill,
} from "@/components/status/StatusIcon";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtAgo, fmtCompact, fmtMetric, fmtMs, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fleetTotals, healthOf, isOpen, useLive } from "@/stores/live";

export type KpiKind = "rps" | "errors" | "p95" | "alerts";

const KPI: Record<KpiKind, { label: string; icon: LucideIcon }> = {
  rps: { label: "Requests / sec", icon: Activity },
  errors: { label: "Error rate", icon: TriangleAlert },
  p95: { label: "p95 latency (edge)", icon: Gauge },
  alerts: { label: "Active alerts", icon: BellRing },
};

export function KpiCard({ kind, className }: { kind: KpiKind; className?: string }) {
  const ticks = useLive((s) => s.ticks);
  const alerts = useLive((s) => s.alerts);
  const ready = useLive((s) => s.ready);
  const series = useMemo(() => ticks.slice(-120).map(fleetTotals), [ticks]);
  const now = series[series.length - 1];
  const prev = series[Math.max(0, series.length - 61)];
  const open = alerts.filter(isOpen);
  const { label, icon: Icon } = KPI[kind];

  let value = "—";
  let tone: "healthy" | "warning" | "critical" = "healthy";
  let values: number[] = [];
  let delta: number | null = null;
  if (now) {
    if (kind === "rps") {
      value = fmtCompact(now.rps);
      values = series.map((s) => s.rps);
      delta = prev ? (now.rps - prev.rps) / prev.rps : null;
    } else if (kind === "errors") {
      value = fmtPct(now.errorRate);
      values = series.map((s) => s.errorRate);
      tone = now.errorRate > 0.03 ? "critical" : now.errorRate > 0.01 ? "warning" : "healthy";
      delta = prev ? now.errorRate - prev.errorRate : null;
    } else if (kind === "p95") {
      value = fmtMs(now.p95);
      values = series.map((s) => s.p95);
      tone = now.p95 > 120 ? "critical" : now.p95 > 60 ? "warning" : "healthy";
      delta = prev ? (now.p95 - prev.p95) / prev.p95 : null;
    } else {
      value = String(open.length);
      values = series.map(() => open.length);
      tone = open.some((a) => a.severity === "critical" && a.state === "firing")
        ? "critical"
        : open.length
          ? "warning"
          : "healthy";
    }
  }
  const color =
    tone === "critical"
      ? "var(--critical)"
      : tone === "warning"
        ? "var(--warning)"
        : kind === "alerts"
          ? "var(--muted-foreground)"
          : "var(--primary)";
  const toneText =
    tone === "critical" ? "text-critical" : tone === "warning" ? "text-warning" : "text-foreground";

  return (
    <div className={cn("panel flex flex-col gap-2 p-3", className)}>
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="eyebrow">{label}</span>
        {tone !== "healthy" && (
          <span className={cn("ml-auto text-[10px] font-medium uppercase tracking-wide", toneText)}>
            {tone === "critical" ? "Critical" : "Elevated"}
          </span>
        )}
      </div>
      {!ready ? (
        <Skeleton className="h-7 w-24" />
      ) : (
        <div className="flex items-baseline gap-2">
          <span
            className={cn("num text-2xl font-semibold tracking-tight", toneText)}
            aria-live="off"
          >
            {value}
          </span>
          {delta !== null && kind !== "alerts" && (
            <span className="num text-[11px] text-muted-foreground">
              {kind === "errors"
                ? `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(2)}pt`
                : `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`}{" "}
              <span className="sr-only">vs a minute ago</span>
            </span>
          )}
          {kind === "alerts" && (
            <span className="text-[11px] text-muted-foreground">
              {open.length === 0
                ? "All quiet. Nothing needs you."
                : `${open.filter((a) => a.state === "firing").length} firing`}
            </span>
          )}
        </div>
      )}
      <Sparkline values={values} color={color} height={30} />
    </div>
  );
}

export function ThroughputChart({ height = 240 }: { height?: number }) {
  const ticks = useLive((s) => s.ticks);
  const ready = useLive((s) => s.ready);
  const series = useMemo(
    () =>
      SERVICE_NAMES.map((s) => ({
        key: s,
        label: s,
        color: SERVICE_COLOR[s],
        points: ticks.map((t) => ({ t: t.t, v: t.services[s].rps })),
      })),
    [ticks],
  );
  if (!ready) return <Skeleton className="w-full" style={{ height }} />;
  return (
    <TimeSeriesChart
      series={series}
      unit="rps"
      kind="area"
      stacked
      height={height}
      ariaLabel="Throughput by service, last five minutes"
    />
  );
}

export function ServiceHealthGrid({ dense = false }: { dense?: boolean }) {
  const ticks = useLive((s) => s.ticks);
  const alerts = useLive((s) => s.alerts);
  const ready = useLive((s) => s.ready);
  const last = ticks[ticks.length - 1];
  const recent = ticks.slice(-60);
  if (!ready || !last)
    return (
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        {SERVICE_NAMES.map((s) => (
          <Skeleton key={s} className="h-20" />
        ))}
      </div>
    );
  return (
    <ul
      className={cn("grid gap-2 p-3", dense ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}
      aria-label="Service health"
    >
      {SERVICE_NAMES.map((name) => {
        const snap = last.services[name];
        const health = healthOf(snap, alerts, name);
        const meta = HEALTH_META[health];
        return (
          <li key={name}>
            <Link
              to="/service-map"
              search={{ service: name }}
              className={cn(
                "flex h-full flex-col gap-1 rounded-md border bg-surface-2/50 p-2.5 transition-colors hover:border-ring/40",
                health === "critical"
                  ? "border-critical/50 bg-critical/5"
                  : health === "degraded"
                    ? "border-warning/40"
                    : "border-border",
              )}
            >
              <div className="flex items-center gap-1.5">
                <StatusIcon meta={meta} className="size-3.5" />
                <span className="truncate font-mono text-xs text-foreground">{name}</span>
                <span className="sr-only">{meta.label}</span>
              </div>
              <div className="num flex justify-between gap-1 font-mono text-[11px] text-muted-foreground">
                <span title="requests per second">{fmtCompact(snap.rps)}/s</span>
                <span
                  title="error rate"
                  className={
                    snap.errorRate > 0.05
                      ? "text-critical"
                      : snap.errorRate > 0.015
                        ? "text-warning"
                        : ""
                  }
                >
                  {fmtPct(snap.errorRate, 1)}
                </span>
                <span title="p95 latency">{fmtMs(snap.p95)}</span>
              </div>
              <Sparkline
                values={recent.map((t) => t.services[name].errorRate)}
                height={16}
                fill={false}
                color={
                  health === "healthy"
                    ? "var(--muted-foreground)"
                    : health === "critical"
                      ? "var(--critical)"
                      : "var(--warning)"
                }
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function IncidentFeed({
  limit = 8,
  openOnly = false,
}: {
  limit?: number;
  openOnly?: boolean;
}) {
  const alerts = useLive((s) => s.alerts);
  const ready = useLive((s) => s.ready);
  const items = (openOnly ? alerts.filter(isOpen) : alerts)
    .slice()
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
  if (!ready && alerts.length === 0)
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  if (items.length === 0)
    return (
      <EmptyState
        title="All quiet. Nothing needs you."
        body="When something breaks, it shows up here first."
      />
    );
  return (
    <ol className="divide-y divide-border" aria-label="Recent incidents">
      {items.map((a) => (
        <IncidentRow key={a.id} alert={a} />
      ))}
    </ol>
  );
}

function IncidentRow({ alert: a }: { alert: Alert }) {
  const unit = METRIC_UNITS[a.metric];
  return (
    <li className="animate-fade-up">
      <Link
        to="/alerts"
        search={{ alert: a.id }}
        className="flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-accent/40"
      >
        <StatusIcon meta={SEVERITY_META[a.severity]} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] text-foreground">{a.ruleName}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{a.service}</span>
            <span className="num">peak {fmtMetric(a.value, unit)}</span>
            <span>{fmtAgo(a.startedAt)}</span>
          </div>
        </div>
        <StatusPill meta={ALERT_STATE_META[a.state]} />
      </Link>
    </li>
  );
}
