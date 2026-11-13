import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CircleX, RefreshCw, Search } from "lucide-react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { vigil } from "@/api";
import { SERVICE_NAMES, type ServiceName, type TraceSummary } from "@/api/types";
import { SERVICE_COLOR } from "@/components/charts/colors";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader, Panel } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useListNav } from "@/hooks/useListNav";
import { fmtAgo, fmtClock, fmtMs, RANGE_MS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useUI } from "@/stores/ui";

interface TracesSearch {
  service?: string;
  q?: string;
}

export const Route = createFileRoute("/traces/")({
  validateSearch: (s: Record<string, unknown>): TracesSearch => ({
    service: typeof s.service === "string" ? s.service : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Traces · Vigil" },
      {
        name: "description",
        content: "Search distributed traces by service, duration and errors.",
      },
      { property: "og:title", content: "Traces · Vigil" },
      {
        property: "og:description",
        content: "Find the slow request. Follow it through every service.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TracesPage,
});

const MIN_DURATIONS = [0, 50, 100, 250, 500, 1000];

function TracesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const range = useUI((s) => s.timeRange);
  const [text, setText] = useState(search.q ?? "");
  const [service, setService] = useState<ServiceName | "all">(
    (SERVICE_NAMES as readonly string[]).includes(search.service ?? "")
      ? (search.service as ServiceName)
      : "all",
  );
  const [minDuration, setMinDuration] = useState(0);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [debounced, setDebounced] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 200);
    return () => clearTimeout(t);
  }, [text]);

  // Trace search is capped at the last hour: older traces are sampled away in this demo.
  const span =
    range.kind === "relative"
      ? Math.min(RANGE_MS[range.value], 3_600_000)
      : Math.min(range.to - range.from, 3_600_000);
  const q = useQuery({
    queryKey: [
      "traces",
      service,
      minDuration,
      errorsOnly,
      debounced,
      span,
      range.kind === "absolute" ? range.to : 0,
    ],
    queryFn: () => {
      const to = range.kind === "absolute" ? range.to : Date.now();
      return vigil.queryTraces({
        from: to - span,
        to,
        service: service === "all" ? undefined : service,
        minDuration,
        errorsOnly,
        text: debounced || undefined,
        limit: 150,
      });
    },
  });
  const traces = useMemo(() => q.data ?? [], [q.data]);
  const open = (i: number) =>
    traces[i] && navigate({ to: "/traces/$traceId", params: { traceId: traces[i].trace_id } });
  const { active } = useListNav(traces.length, open);
  const maxDur = useMemo(() => Math.max(1, ...traces.map((t) => t.duration)), [traces]);

  return (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <PageHeader
        title="Traces"
        description="Requests as they travel through the fleet. j/k to move, Enter to open."
        actions={
          <Button
            variant="subtle"
            size="sm"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            aria-label="Refresh traces"
          >
            <RefreshCw className={cn(q.isFetching && "animate-spin")} aria-hidden /> Refresh
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            data-search
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Trace ID, endpoint or service…"
            aria-label="Search traces"
            className="h-8 bg-surface pl-8 font-mono text-xs"
          />
        </div>
        <Select value={service} onValueChange={(v) => setService(v as ServiceName | "all")}>
          <SelectTrigger className="h-8 w-44 bg-surface text-xs" aria-label="Service">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            {SERVICE_NAMES.map((s) => (
              <SelectItem key={s} value={s} className="font-mono text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(minDuration)} onValueChange={(v) => setMinDuration(Number(v))}>
          <SelectTrigger className="h-8 w-36 bg-surface text-xs" aria-label="Minimum duration">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MIN_DURATIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d === 0 ? "Any duration" : `≥ ${fmtMs(d)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-xs">
          <Switch checked={errorsOnly} onCheckedChange={setErrorsOnly} aria-label="Errors only" />
          Errors only
        </label>
      </div>

      <Panel title="Duration over time" bodyClassName="p-2">
        {q.isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <TraceScatter
            traces={traces}
            onOpen={(id) => navigate({ to: "/traces/$traceId", params: { traceId: id } })}
          />
        )}
      </Panel>

      <Panel title={`${traces.length} traces`} className="mt-3">
        {q.isLoading ? (
          <div className="space-y-1.5 p-3">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : q.isError ? (
          <EmptyState
            title="Traces didn't load."
            body={(q.error as Error).message}
            action={
              <Button size="sm" variant="subtle" onClick={() => q.refetch()}>
                Try again
              </Button>
            }
          />
        ) : traces.length === 0 ? (
          <EmptyState
            title="No traces match."
            body="Fewer filters, or a wider window, usually helps."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Started</th>
                  <th className="px-3 py-2 font-medium">Root</th>
                  <th className="w-[28%] px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 text-right font-medium">Spans</th>
                  <th className="px-3 py-2 text-right font-medium">Errors</th>
                  <th className="px-3 py-2 font-medium">Services</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((t, i) => (
                  <TraceRow
                    key={t.trace_id}
                    trace={t}
                    index={i}
                    active={i === active}
                    maxDur={maxDur}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function TraceRow({
  trace: t,
  index,
  active,
  maxDur,
}: {
  trace: TraceSummary;
  index: number;
  active: boolean;
  maxDur: number;
}) {
  return (
    <tr
      data-nav-index={index}
      className={cn(
        "border-b border-border/50 transition-colors hover:bg-accent/40",
        active && "bg-accent/60",
      )}
    >
      <td className="whitespace-nowrap px-3 py-2">
        <div className="num font-mono text-foreground">{fmtClock(t.start)}</div>
        <div className="text-[10px] text-muted-foreground">{fmtAgo(t.start)}</div>
      </td>
      <td className="px-3 py-2">
        <Link
          to="/traces/$traceId"
          params={{ traceId: t.trace_id }}
          className="block focus-visible:outline-none"
        >
          <div className="font-mono text-foreground hover:text-primary">{t.root_name}</div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {t.trace_id.slice(0, 16)}…
          </div>
        </Link>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden bg-muted">
            <div
              className={cn("h-full", t.error_count ? "bg-critical" : "bg-trace")}
              style={{ width: `${Math.max(2, (t.duration / maxDur) * 100)}%` }}
            />
          </div>
          <span className="num w-14 text-right font-mono">{fmtMs(t.duration)}</span>
        </div>
      </td>
      <td className="num px-3 py-2 text-right font-mono">{t.span_count}</td>
      <td className="px-3 py-2 text-right">
        {t.error_count > 0 ? (
          <span className="inline-flex items-center gap-1 font-mono text-critical">
            <CircleX className="size-3" aria-hidden />
            {t.error_count}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {t.services.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded border border-border px-1 font-mono text-[10px] text-muted-foreground"
            >
              <span className="size-1.5" style={{ background: SERVICE_COLOR[s] }} aria-hidden />
              {s}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

function TraceScatter({
  traces,
  onOpen,
}: {
  traces: TraceSummary[];
  onOpen: (id: string) => void;
}) {
  const ok = traces
    .filter((t) => !t.error_count)
    .map((t) => ({ x: t.start, y: t.duration, id: t.trace_id }));
  const err = traces
    .filter((t) => t.error_count)
    .map((t) => ({ x: t.start, y: t.duration, id: t.trace_id }));
  return (
    <div className="h-40" role="img" aria-label="Trace durations over time; errors in red">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => fmtClock(t, false)}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            dataKey="y"
            type="number"
            tickFormatter={(v) => fmtMs(v)}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={52}
            scale="log"
            domain={["auto", "auto"]}
            allowDataOverflow
          />
          <ZAxis range={[24, 24]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: "var(--muted-foreground)" }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <div className="rounded-md border border-border bg-popover px-2 py-1.5 font-mono text-[11px]">
                  {fmtMs(Number(payload[0].payload.y))} · {fmtClock(Number(payload[0].payload.x))}
                </div>
              ) : null
            }
          />
          <Scatter
            data={ok}
            fill="var(--trace)"
            fillOpacity={0.6}
            onClick={(d: { id?: string }) => d.id && onOpen(d.id)}
            className="cursor-pointer"
            isAnimationActive={false}
          />
          <Scatter
            data={err}
            fill="var(--critical)"
            shape="cross"
            onClick={(d: { id?: string }) => d.id && onOpen(d.id)}
            className="cursor-pointer"
            isAnimationActive={false}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
