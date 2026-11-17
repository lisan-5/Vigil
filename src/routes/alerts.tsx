import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BellOff, Check, CheckCheck, Eye, X } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { vigil } from "@/api";
import type { Alert, AlertState } from "@/api/types";
import { METRIC_UNITS } from "@/api/mock/metrics";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { PageHeader, Panel } from "@/components/common/PageHeader";
import {
  ALERT_STATE_META,
  SEVERITY_META,
  StatusIcon,
  StatusPill,
} from "@/components/status/StatusIcon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtAgo, fmtClock, fmtDuration, fmtMetric } from "@/lib/format";
import { METRIC_LABEL, metricValue } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { useLive } from "@/stores/live";

type Filter = "open" | "firing" | "acknowledged" | "resolved" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "firing", label: "Firing" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];
const isFilter = (s: unknown): s is Filter => FILTERS.some((f) => f.key === s);

const matches = (a: Alert, f: Filter) =>
  f === "all"
    ? true
    : f === "open"
      ? a.state === "firing" || a.state === "acknowledged"
      : a.state === f;

export const Route = createFileRoute("/alerts")({
  validateSearch: (s: Record<string, unknown>): { alert?: string; filter?: Filter } => ({
    alert: typeof s.alert === "string" ? s.alert : undefined,
    filter: isFilter(s.filter) ? s.filter : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Alerts · Vigil" },
      { name: "description", content: "Alert rules, history and firing alerts." },
      { property: "og:title", content: "Alerts · Vigil" },
      { property: "og:description", content: "Alert rules, history and firing alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AlertsPage,
});

const ORDER: Record<AlertState, number> = { firing: 0, acknowledged: 1, ok: 2, resolved: 3 };

function AlertsPage() {
  const { alert: selectedId, filter = "open" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const alerts = useLive((s) => s.alerts);
  const ready = useLive((s) => s.ready);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f.key, alerts.filter((a) => matches(a, f.key)).length]),
      ),
    [alerts],
  ) as Record<Filter, number>;
  const list = useMemo(
    () =>
      alerts
        .filter((a) => matches(a, filter))
        .sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.startedAt - a.startedAt),
    [alerts, filter],
  );
  const selected = alerts.find((a) => a.id === selectedId);

  return (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <PageHeader
        title="Alerts"
        description={
          counts.firing
            ? `${counts.firing} firing, ${counts.acknowledged} acknowledged. Pages go to one person, not the channel.`
            : "Nothing is firing. Every rule is evaluated every second."
        }
      />
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter alerts">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant="chip"
            role="tab"
            aria-selected={filter === f.key}
            aria-pressed={filter === f.key}
            onClick={() => navigate({ search: (s) => ({ ...s, filter: f.key }), replace: true })}
          >
            {f.label}
            <span className="num opacity-70">{counts[f.key]}</span>
          </Button>
        ))}
      </div>

      <div
        className={cn("grid items-start gap-3", selected && "xl:grid-cols-[minmax(0,1fr)_420px]")}
      >
        <Panel title={`${list.length} alert${list.length === 1 ? "" : "s"}`}>
          {!ready && alerts.length === 0 ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title="All quiet. Nothing needs you."
              body="No alerts match this filter."
            />
          ) : (
            <ol className="divide-y divide-border" aria-label="Alerts">
              {list.map((a) => (
                <AlertRow
                  key={a.id}
                  alert={a}
                  selected={a.id === selectedId}
                  onSelect={() =>
                    navigate({
                      search: (s) => ({ ...s, alert: a.id === selectedId ? undefined : a.id }),
                      replace: true,
                    })
                  }
                />
              ))}
            </ol>
          )}
        </Panel>
        {selected && (
          <ErrorBoundary label="alert-detail">
            <AlertDetail
              key={selected.id}
              alert={selected}
              onClose={() =>
                navigate({ search: (s) => ({ ...s, alert: undefined }), replace: true })
              }
            />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

function AlertRow({
  alert: a,
  selected,
  onSelect,
}: {
  alert: Alert;
  selected: boolean;
  onSelect: () => void;
}) {
  const unit = METRIC_UNITS[a.metric];
  const end = a.resolvedAt ?? Date.now();
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 md:grid-cols-[auto_minmax(0,1fr)_140px_110px_auto]",
          selected && "bg-accent/60",
          a.state === "firing" && "border-l-2 border-l-critical",
        )}
      >
        <StatusIcon meta={SEVERITY_META[a.severity]} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] text-foreground">{a.ruleName}</span>
          <span className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[11px] text-muted-foreground">
            <span>{a.service}</span>
            <span className="num">
              {fmtMetric(a.value, unit)} {a.op} {fmtMetric(a.threshold, unit)}
            </span>
          </span>
        </span>
        <span className="num hidden font-mono text-[11px] text-muted-foreground md:block">
          {fmtAgo(a.startedAt)}
        </span>
        <span className="num hidden font-mono text-[11px] text-muted-foreground md:block">
          {a.state === "resolved" ? "lasted " : "for "}
          {fmtDuration(end - a.startedAt)}
        </span>
        <StatusPill meta={ALERT_STATE_META[a.state]} />
      </button>
    </li>
  );
}

function AlertDetail({ alert: a, onClose }: { alert: Alert; onClose: () => void }) {
  const ticks = useLive((s) => s.ticks);
  const upsert = useLive((s) => s.upsertAlert);
  const unit = METRIC_UNITS[a.metric];
  const series = useMemo(
    () => [
      {
        key: a.service,
        label: `${a.service} ${METRIC_LABEL[a.metric]}`,
        color: a.state === "firing" ? "var(--critical)" : "var(--foreground)",
        points: ticks.map((t) => ({ t: t.t, v: metricValue(t.services[a.service], a.metric) })),
      },
    ],
    [ticks, a.service, a.metric, a.state],
  );
  const now = ticks.length
    ? metricValue(ticks[ticks.length - 1].services[a.service], a.metric)
    : a.value;
  const breaching = a.op === ">" ? now > a.threshold : now < a.threshold;

  const act = useMutation({
    mutationFn: (kind: "ack" | "resolve") =>
      kind === "ack" ? vigil.acknowledgeAlert(a.id, "you") : vigil.resolveAlert(a.id, "you"),
    onSuccess: (next, kind) => {
      upsert(next);
      toast.success(kind === "ack" ? "Acknowledged. It's yours." : "Resolved.", {
        description: `${next.ruleName} · ${next.service}`,
      });
    },
    onError: (e) => toast.error("That didn't go through", { description: String(e) }),
  });

  return (
    <aside
      aria-label="Alert details"
      className="panel flex min-w-0 flex-col animate-in fade-in slide-in-from-right-4 duration-300"
    >
      <header className="flex items-start gap-2 border-b-2 border-foreground p-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill meta={SEVERITY_META[a.severity]} />
            <StatusPill meta={ALERT_STATE_META[a.state]} />
          </div>
          <h2 className="mt-2 text-base font-semibold leading-tight">{a.ruleName}</h2>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Fires when <span className="text-foreground">{METRIC_LABEL[a.metric]}</span> on{" "}
            <span className="text-foreground">{a.service}</span> is{" "}
            {a.op === ">" ? "above" : "below"}{" "}
            <span className="text-foreground">{fmtMetric(a.threshold, unit)}</span>.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details">
          <X aria-hidden />
        </Button>
      </header>

      <div className="grid grid-cols-3 gap-px border-b bg-border">
        {[
          { label: "Now", value: fmtMetric(now, unit), tone: breaching ? "text-critical" : "" },
          { label: "Peak", value: fmtMetric(a.value, unit), tone: "" },
          { label: "Threshold", value: `${a.op} ${fmtMetric(a.threshold, unit)}`, tone: "" },
        ].map((s) => (
          <div key={s.label} className="bg-surface p-2.5">
            <p className="eyebrow">{s.label}</p>
            <p className={cn("num mt-0.5 font-mono text-sm font-semibold", s.tone)}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="border-b p-2">
        <TimeSeriesChart
          series={series}
          unit={unit}
          kind="area"
          height={150}
          threshold={a.threshold}
          compact
          ariaLabel={`${METRIC_LABEL[a.metric]} on ${a.service}, last five minutes, with threshold`}
        />
      </div>

      <section className="border-b p-3">
        <h3 className="eyebrow mb-3">Timeline</h3>
        <ol className="relative ml-1.5 space-y-3 border-l border-border pl-4">
          {a.history
            .slice()
            .sort((x, y) => x.at - y.at)
            .map((h, i) => {
              const meta = ALERT_STATE_META[h.to];
              return (
                <li key={i} className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -left-[21px] top-1 size-2.5 border-2 border-background",
                      h.to === "firing"
                        ? "bg-critical"
                        : h.to === "acknowledged"
                          ? "bg-warning"
                          : "bg-muted-foreground",
                    )}
                  />
                  <p className="text-xs">
                    <span className={meta.tone}>{meta.label}</span>
                    <span className="text-muted-foreground"> · {h.by}</span>
                  </p>
                  <p className="num font-mono text-[10.5px] text-muted-foreground">
                    {fmtClock(h.at)} · {fmtAgo(h.at)}
                  </p>
                  {h.note && <p className="mt-0.5 text-xs text-muted-foreground">{h.note}</p>}
                </li>
              );
            })}
        </ol>
      </section>

      <div className="flex gap-2 p-3">
        {a.state === "firing" && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={act.isPending}
            onClick={() => act.mutate("ack")}
          >
            <Eye aria-hidden /> Acknowledge
          </Button>
        )}
        {a.state !== "resolved" ? (
          <Button
            size="sm"
            className="flex-1"
            disabled={act.isPending}
            onClick={() => act.mutate("resolve")}
          >
            <Check aria-hidden /> Resolve
          </Button>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCheck className="size-3.5" aria-hidden />
            Resolved {a.resolvedAt ? fmtAgo(a.resolvedAt) : ""}. Nothing left to do.
          </p>
        )}
      </div>
    </aside>
  );
}
