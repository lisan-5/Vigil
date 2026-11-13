import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  CircleX,
  Copy,
  Route as RouteIcon,
  ScrollText,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { vigil } from "@/api";
import type { Span } from "@/api/types";
import { SERVICE_COLOR } from "@/components/charts/colors";
import { EmptyState } from "@/components/common/EmptyState";
import { Panel } from "@/components/common/PageHeader";
import {
  buildTree,
  criticalPath,
  flatten,
  selfTime,
  type SpanNode,
} from "@/components/traces/waterfall";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useListNav } from "@/hooks/useListNav";
import { fmtDateTime, fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/traces/$traceId")({
  head: ({ params }) => ({
    meta: [
      { title: `Trace ${params.traceId.slice(0, 8)} · Vigil` },
      {
        name: "description",
        content: "Waterfall view of a distributed trace with critical path and span details.",
      },
      { property: "og:title", content: `Trace ${params.traceId.slice(0, 8)} · Vigil` },
      {
        property: "og:description",
        content: "Every span, in order, with the critical path highlighted.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TraceDetail,
});

function TraceDetail() {
  const { traceId } = Route.useParams();
  const q = useQuery({
    queryKey: ["trace", traceId],
    queryFn: () => vigil.getTrace(traceId),
    staleTime: Infinity,
  });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showCritical, setShowCritical] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const trace = q.data;
  const roots = useMemo(() => (trace ? buildTree(trace.spans) : []), [trace]);
  const rows = useMemo(() => flatten(roots, collapsed), [roots, collapsed]);
  const critical = useMemo(() => criticalPath(roots), [roots]);
  const { active } = useListNav(rows.length, (i) => rows[i] && setSelected(rows[i].span.span_id));
  const selectedNode =
    rows.find((r) => r.span.span_id === selected) ??
    (active >= 0 ? rows[active] : undefined) ??
    rows.find((r) => r.span.status === "error") ??
    rows[0];

  if (q.isLoading)
    return (
      <div className="space-y-3 p-4 lg:p-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-[420px]" />
      </div>
    );
  if (q.isError)
    return <EmptyState title="That trace didn't load." body={(q.error as Error).message} />;
  if (!trace)
    return (
      <EmptyState
        title="No trace with that ID."
        body="It may have aged out, or the ID has a typo. Traces are kept for 7 days."
        action={
          <Button asChild size="sm" variant="subtle">
            <Link to="/traces" search={{}}>
              Back to traces
            </Link>
          </Button>
        }
      />
    );

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <div className="mb-4 flex flex-wrap items-start gap-3 border-b-2 border-foreground pb-3">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Back to traces">
          <Link to="/traces" search={{}}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <div className="min-w-[15rem] flex-1">
          <h1 className="break-all font-mono text-xl font-semibold text-foreground">
            {trace.root_name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <button
              type="button"
              className="inline-flex items-center gap-1 font-mono hover:text-foreground"
              onClick={() => {
                void navigator.clipboard?.writeText(trace.trace_id);
                toast("Trace ID copied");
              }}
            >
              {trace.trace_id} <Copy className="size-3" aria-label="copy" />
            </button>
            <span>{fmtDateTime(trace.start)}</span>
            <span className="num">
              <span className="text-foreground">{fmtMs(trace.duration)}</span> total
            </span>
            <span className="num">{trace.span_count} spans</span>
            <span
              className={cn(
                "num inline-flex items-center gap-1",
                trace.error_count ? "text-critical" : "",
              )}
            >
              {trace.error_count > 0 && <CircleX className="size-3" aria-hidden />}
              {trace.error_count} errors
            </span>
          </div>
        </div>
        <label className="flex items-center gap-2 self-center text-xs">
          <Switch
            checked={showCritical}
            onCheckedChange={setShowCritical}
            aria-label="Highlight critical path"
          />
          <RouteIcon className="size-3.5 text-warning" aria-hidden /> Critical path
        </label>
        <Button asChild variant="subtle" size="sm">
          <Link to="/logs" search={{ q: trace.trace_id }}>
            <ScrollText aria-hidden /> Logs for this trace
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_380px]">
        <Panel title="Waterfall" bodyClassName="overflow-x-auto">
          <div className="min-w-[680px]" role="tree" aria-label="Spans">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(220px,34%)_1fr] border-b border-border bg-surface text-[10px] text-muted-foreground">
              <div className="px-3 py-1.5">Service · operation</div>
              <div className="relative h-full">
                {ticks.map((t) => (
                  <span
                    key={t}
                    className="num absolute top-1.5 -translate-x-1/2 font-mono"
                    style={{
                      left: `${t * 100}%`,
                      transform: t === 1 ? "translateX(-100%)" : t === 0 ? "none" : undefined,
                    }}
                  >
                    {fmtMs(trace.duration * t)}
                  </span>
                ))}
              </div>
            </div>
            {rows.map((n, i) => (
              <SpanRow
                key={n.span.span_id}
                node={n}
                index={i}
                traceStart={trace.start}
                traceDuration={trace.duration}
                collapsed={collapsed.has(n.span.span_id)}
                onToggle={() => toggle(n.span.span_id)}
                selected={selectedNode?.span.span_id === n.span.span_id}
                active={i === active}
                onSelect={() => setSelected(n.span.span_id)}
                critical={showCritical ? critical.has(n.span.span_id) : null}
              />
            ))}
          </div>
        </Panel>
        {selectedNode && (
          <SpanDetail node={selectedNode} critical={critical.has(selectedNode.span.span_id)} />
        )}
      </div>
    </div>
  );
}

function SpanRow({
  node,
  index,
  traceStart,
  traceDuration,
  collapsed,
  onToggle,
  selected,
  active,
  onSelect,
  critical,
}: {
  node: SpanNode;
  index: number;
  traceStart: number;
  traceDuration: number;
  collapsed: boolean;
  onToggle: () => void;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
  critical: boolean | null;
}) {
  const s = node.span;
  const left = ((s.start - traceStart) / traceDuration) * 100;
  const width = Math.max(0.4, (s.duration / traceDuration) * 100);
  const err = s.status === "error";
  const dim = critical === false;
  return (
    <div
      role="treeitem"
      aria-level={node.depth + 1}
      aria-expanded={node.children.length ? !collapsed : undefined}
      aria-selected={selected}
      data-nav-index={index}
      onClick={onSelect}
      className={cn(
        "grid cursor-pointer grid-cols-[minmax(220px,34%)_1fr] border-b border-border/40 text-xs transition-colors hover:bg-accent/40",
        selected && "bg-accent/70",
        active && !selected && "bg-accent/40",
      )}
    >
      <div
        className="flex min-w-0 items-center gap-1 py-1.5 pr-2"
        style={{ paddingLeft: 8 + node.depth * 14 }}
      >
        {node.children.length ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={collapsed ? `Expand ${s.name}` : `Collapse ${s.name}`}
          >
            <ChevronRight
              className={cn("size-3 transition-transform", !collapsed && "rotate-90")}
            />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span
          className="size-2 shrink-0 rounded-sm"
          style={{ background: SERVICE_COLOR[s.service] }}
          aria-hidden
        />
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{s.service}</span>
        <span className={cn("truncate font-mono", err ? "text-critical" : "text-foreground")}>
          {s.name}
        </span>
        {err && <CircleX className="size-3 shrink-0 text-critical" aria-label="error" />}
        {collapsed && (
          <span className="num ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">
            +{node.children.length}
          </span>
        )}
      </div>
      <div className="relative py-1.5 pr-3">
        <div
          className={cn(
            "relative h-4 rounded-sm transition-opacity",
            err ? "bg-critical/80" : "bg-trace/70",
            dim && "opacity-30",
            critical === true && "ring-1 ring-warning ring-offset-1 ring-offset-surface",
          )}
          style={{ marginLeft: `${left}%`, width: `${width}%` }}
          title={`${s.name} · ${fmtMs(s.duration)}`}
        >
          {critical === true && (
            <Zap
              className="absolute -left-3.5 top-0.5 size-3 text-warning"
              aria-label="on critical path"
            />
          )}
        </div>
        <span
          className="num pointer-events-none absolute top-1.5 font-mono text-[10px] text-muted-foreground"
          style={{ left: `calc(${Math.min(left + width, 88)}% + 6px)` }}
        >
          {fmtMs(s.duration)}
        </span>
      </div>
    </div>
  );
}

function SpanDetail({ node, critical }: { node: SpanNode; critical: boolean }) {
  const s: Span = node.span;
  return (
    <Panel title="Span" className="xl:sticky xl:top-4 xl:self-start" bodyClassName="p-3 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span
            className="size-2 rounded-sm"
            style={{ background: SERVICE_COLOR[s.service] }}
            aria-hidden
          />
          <span className="font-mono text-xs text-muted-foreground">{s.service}</span>
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 border px-2 text-[11px]",
              s.status === "error"
                ? "border-critical/40 text-critical"
                : "border-healthy/30 text-healthy",
            )}
          >
            {s.status === "error" ? <CircleX className="size-3" aria-hidden /> : null}
            {s.status === "error" ? "Error" : "OK"}
          </span>
        </div>
        <p className="mt-1 break-all font-mono text-sm text-foreground">{s.name}</p>
        <dl className="num mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <Stat label="Duration" value={fmtMs(s.duration)} />
          <Stat label="Self time" value={fmtMs(selfTime(node))} />
          <Stat label="Kind" value={s.kind} />
        </dl>
        {critical && (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-warning">
            <Zap className="size-3" aria-hidden /> On the critical path. Speeding this up speeds up
            the request.
          </p>
        )}
      </div>
      <div>
        <h3 className="eyebrow mb-1.5">Attributes</h3>
        <table className="w-full text-[11px]">
          <tbody>
            {Object.entries({
              span_id: s.span_id,
              parent_id: s.parent_id ?? "—",
              ...s.attributes,
            }).map(([k, v]) => (
              <tr key={k} className="border-b border-border/40 align-top">
                <td className="py-1 pr-3 font-mono text-syntax-key">{k}</td>
                <td className="break-all py-1 font-mono text-foreground">{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h3 className="eyebrow mb-1.5">Span logs</h3>
        {s.events.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No events on this span. It did its job quietly.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {s.events.map((e, i) => (
              <li
                key={i}
                className={cn(
                  "rounded border p-2 font-mono text-[11px]",
                  e.name === "exception"
                    ? "border-critical/40 bg-critical/5"
                    : "border-border bg-surface-2/50",
                )}
              >
                <div className="flex justify-between text-muted-foreground">
                  <span className={e.name === "exception" ? "text-critical" : "text-warning"}>
                    {e.name}
                  </span>
                  <span className="num">+{fmtMs(e.timestamp - s.start)}</span>
                </div>
                {e.attributes &&
                  Object.entries(e.attributes).map(([k, v]) => (
                    <div key={k} className="mt-0.5 break-all">
                      <span className="text-syntax-key">{k}</span>{" "}
                      <span className="text-foreground">{String(v)}</span>
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-surface-2/50 px-2 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-foreground">{value}</dd>
    </div>
  );
}
