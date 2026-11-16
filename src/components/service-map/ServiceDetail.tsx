/** Side panel for the selected service on the map: identity, live vitals, neighbours, alerts. */
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, ScrollText, Waypoints, X } from "lucide-react";
import { useMemo } from "react";
import type { Service, ServiceEdge, ServiceName } from "@/api/types";
import { Sparkline } from "@/components/charts/Sparkline";
import {
  ALERT_STATE_META,
  HEALTH_META,
  StatusIcon,
  StatusPill,
} from "@/components/status/StatusIcon";
import { Button } from "@/components/ui/button";
import { fmtAgo, fmtCompact, fmtMs, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { healthOf, isOpen, useLive } from "@/stores/live";

export function ServiceDetail({
  service,
  edges,
  onSelect,
  onClose,
}: {
  service: Service;
  edges: ServiceEdge[];
  onSelect: (s: ServiceName) => void;
  onClose: () => void;
}) {
  const ticks = useLive((s) => s.ticks);
  const alerts = useLive((s) => s.alerts);
  const name = service.name;
  const recent = useMemo(() => ticks.slice(-120).map((t) => t.services[name]), [ticks, name]);
  const now = recent[recent.length - 1];
  const health = healthOf(now, alerts, name);
  const meta = HEALTH_META[health];
  const open = alerts.filter((a) => a.service === name && isOpen(a));
  const calls = edges.filter((e) => e.source === name);
  const calledBy = edges.filter((e) => e.target === name);

  const vitals: { label: string; value: string; values: number[]; tone?: string }[] = now
    ? [
        {
          label: "Throughput",
          value: `${fmtCompact(now.rps)}/s`,
          values: recent.map((s) => s.rps),
        },
        {
          label: "Error rate",
          value: fmtPct(now.errorRate),
          values: recent.map((s) => s.errorRate),
          tone:
            now.errorRate > 0.05
              ? "var(--critical)"
              : now.errorRate > 0.015
                ? "var(--warning)"
                : undefined,
        },
        { label: "p95 latency", value: fmtMs(now.p95), values: recent.map((s) => s.p95) },
        { label: "p99 latency", value: fmtMs(now.p99), values: recent.map((s) => s.p99) },
        { label: "CPU", value: `${now.cpu.toFixed(0)}%`, values: recent.map((s) => s.cpu) },
        {
          label: "Memory",
          value: `${Math.round(now.memory)} MB`,
          values: recent.map((s) => s.memory),
        },
      ]
    : [];

  return (
    <aside
      aria-label={`${name} details`}
      className="panel flex min-w-0 flex-col animate-in fade-in slide-in-from-right-4 duration-300"
    >
      <header className="flex items-start gap-2 border-b-2 border-foreground p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusIcon meta={meta} className="size-4" />
            <h2 className="truncate font-mono text-base font-semibold">{name}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{service.description}</p>
          <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <div>
              <dt className="sr-only">Team</dt>
              <dd>team/{service.team.toLowerCase()}</dd>
            </div>
            <div>
              <dt className="sr-only">Language</dt>
              <dd>{service.language}</dd>
            </div>
            <div>
              <dt className="sr-only">Version</dt>
              <dd>{service.version}</dd>
            </div>
          </dl>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details">
          <X aria-hidden />
        </Button>
      </header>

      <div className={cn("flex items-center gap-2 border-b px-3 py-2 text-xs", meta.soft)}>
        <StatusIcon meta={meta} className="size-3.5" />
        <span className="font-medium">{meta.label}</span>
        <span className="ml-auto font-mono text-[11px]">
          {open.length
            ? `${open.length} open alert${open.length > 1 ? "s" : ""}`
            : "no open alerts"}
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-px border-b bg-border">
        {vitals.map((v) => (
          <li key={v.label} className="bg-surface p-2.5">
            <p className="eyebrow">{v.label}</p>
            <p className="num mt-0.5 font-mono text-sm font-semibold" style={{ color: v.tone }}>
              {v.value}
            </p>
            <Sparkline values={v.values} height={22} color={v.tone ?? "var(--muted-foreground)"} />
          </li>
        ))}
      </ul>

      <Neighbours
        title="Calls"
        icon={<ArrowUpRight className="size-3.5" aria-hidden />}
        rows={calls.map((e) => ({ name: e.target, edge: e }))}
        empty="Leaf service — calls nothing downstream."
        onSelect={onSelect}
      />
      <Neighbours
        title="Called by"
        icon={<ArrowDownRight className="size-3.5" aria-hidden />}
        rows={calledBy.map((e) => ({ name: e.source, edge: e }))}
        empty="Entry point — nothing calls it."
        onSelect={onSelect}
      />

      {open.length > 0 && (
        <section className="border-b p-3">
          <h3 className="eyebrow mb-2">Open alerts</h3>
          <ul className="space-y-1.5">
            {open.map((a) => (
              <li key={a.id}>
                <Link
                  to="/alerts"
                  search={{ alert: a.id }}
                  className="flex items-center gap-2 text-xs hover:underline"
                >
                  <span className="min-w-0 flex-1 truncate">{a.ruleName}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {fmtAgo(a.startedAt)}
                  </span>
                  <StatusPill meta={ALERT_STATE_META[a.state]} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-auto flex gap-2 p-3">
        <Button asChild variant="outline" size="sm" className="flex-1">
          <Link to="/logs" search={{ service: name }}>
            <ScrollText aria-hidden /> Logs
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="flex-1">
          <Link to="/traces" search={{ service: name }}>
            <Waypoints aria-hidden /> Traces
          </Link>
        </Button>
      </div>
    </aside>
  );
}

function Neighbours({
  title,
  icon,
  rows,
  empty,
  onSelect,
}: {
  title: string;
  icon: React.ReactNode;
  rows: { name: ServiceName; edge: ServiceEdge }[];
  empty: string;
  onSelect: (s: ServiceName) => void;
}) {
  return (
    <section className="border-b p-3">
      <h3 className="eyebrow mb-2 flex items-center gap-1">
        {icon}
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(({ name, edge }) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => onSelect(name)}
                className="num flex w-full items-center gap-2 px-1 py-0.5 text-left font-mono text-xs hover:bg-accent"
              >
                <span className="flex-1 truncate">{name}</span>
                <span className="text-muted-foreground">{fmtCompact(edge.rps)}/s</span>
                <span
                  className={cn(
                    "w-12 text-right",
                    edge.errorRate > 0.05
                      ? "text-critical"
                      : edge.errorRate > 0.015
                        ? "text-warning"
                        : "text-muted-foreground",
                  )}
                >
                  {fmtPct(edge.errorRate, 1)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
