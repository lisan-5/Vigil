import { createFileRoute, Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Copy,
  Filter,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Waypoints,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  LOG_LEVELS,
  SERVICE_NAMES,
  type LogEvent,
  type LogLevel,
  type ServiceName,
} from "@/api/types";
import { EmptyState } from "@/components/common/EmptyState";
import { JsonView } from "@/components/logs/JsonView";
import {
  FACET_FIELDS,
  type Facets,
  type LogFilters,
  useLogBuffer,
} from "@/components/logs/useLogBuffer";
import { LEVEL_META, StatusIcon } from "@/components/status/StatusIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useHotkeys } from "@/hooks/useHotkeys";
import { fmtClock, fmtInt, fmtLogTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface LogsSearch {
  q?: string;
  service?: string;
  level?: string;
}

export const Route = createFileRoute("/logs")({
  validateSearch: (s: Record<string, unknown>): LogsSearch => ({
    q: typeof s.q === "string" ? s.q : undefined,
    service: typeof s.service === "string" ? s.service : undefined,
    level: typeof s.level === "string" ? s.level : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Logs Explorer · Vigil" },
      {
        name: "description",
        content: "Real-time, searchable log stream with facets, filters and trace correlation.",
      },
      { property: "og:title", content: "Logs Explorer · Vigil" },
      {
        property: "og:description",
        content: "Tail, filter and search 100k log lines without breaking a sweat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LogsPage,
});

const ROW_H = 26;

function LogsPage() {
  const search = Route.useSearch();
  const [text, setText] = useState(search.q ?? "");
  const [debounced, setDebounced] = useState(text);
  const [levels, setLevels] = useState<Set<LogLevel>>(
    () =>
      new Set(
        search.level && (LOG_LEVELS as string[]).includes(search.level)
          ? [search.level as LogLevel]
          : [],
      ),
  );
  const [services, setServices] = useState<Set<ServiceName>>(
    () =>
      new Set(
        search.service && (SERVICE_NAMES as readonly string[]).includes(search.service)
          ? [search.service as ServiceName]
          : [],
      ),
  );
  const [fields, setFields] = useState<Record<string, Set<string>>>({});
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(-1);
  const [facetsOpen, setFacetsOpen] = useState(false);

  // Follow navigation from elsewhere (e.g. the incident banner).
  useEffect(() => {
    if (search.service && (SERVICE_NAMES as readonly string[]).includes(search.service))
      setServices(new Set([search.service as ServiceName]));
    if (search.level && (LOG_LEVELS as string[]).includes(search.level))
      setLevels(new Set([search.level as LogLevel]));
    if (search.q !== undefined) setText(search.q);
  }, [search.service, search.level, search.q]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 150);
    return () => clearTimeout(t);
  }, [text]);

  const filters: LogFilters = useMemo(
    () => ({ levels, services, fields, text: debounced }),
    [levels, services, fields, debounced],
  );
  const { rows, total, version, loading, error, queued, facets, newIds } = useLogBuffer(
    filters,
    paused,
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 24,
    getItemKey: (i) => rows[i]?.id ?? i,
  });

  // Auto-scroll to the newest line while tailing.
  const stick = useRef(true);
  useEffect(() => {
    if (!paused && stick.current && rows.length)
      virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, paused]);

  // Only a person scrolling should pause the tail — not our own auto-scroll or row measuring.
  const userScrolling = useRef(0);
  const markUserScroll = useCallback(() => {
    userScrolling.current = Date.now();
  }, []);
  const onScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < ROW_H * 2;
    const byUser = Date.now() - userScrolling.current < 400;
    if (!atBottom && byUser && stick.current && !paused) {
      // Scrolling up while tailing pauses, so the line you're reading stays put.
      stick.current = false;
      setPaused(true);
    } else if (atBottom) stick.current = true;
  }, [paused]);

  const resume = () => {
    stick.current = true;
    setPaused(false);
  };

  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };
  const toggleExpanded = (id: string) => setExpanded((e) => toggle(e, id));

  const move = (d: number) => {
    if (!rows.length) return;
    setPaused(true);
    stick.current = false;
    setActive((i) => {
      const next = Math.max(0, Math.min(rows.length - 1, (i < 0 ? rows.length : i) + d));
      virtualizer.scrollToIndex(next, { align: "auto" });
      return next;
    });
  };
  useHotkeys({
    j: () => move(1),
    k: () => move(-1),
    e: () => active >= 0 && rows[active] && toggleExpanded(rows[active].id),
    enter: () => active >= 0 && rows[active] && toggleExpanded(rows[active].id),
    " ": () => (paused ? resume() : setPaused(true)),
    escape: () => setActive(-1),
  });

  const activeFilterCount =
    levels.size +
    services.size +
    Object.values(fields).reduce((s, v) => s + v.size, 0) +
    (debounced ? 1 : 0);
  const clearAll = () => {
    setLevels(new Set());
    setServices(new Set());
    setFields({});
    setText("");
  };

  const facetPanel = (
    <FacetSidebar
      facets={facets}
      services={services}
      fields={fields}
      onService={(s) => setServices((x) => toggle(x, s))}
      onField={(f, v) => setFields((x) => ({ ...x, [f]: toggle(x[f] ?? new Set(), v) }))}
    />
  );

  return (
    <div className="flex h-full min-h-0">
      <aside
        className="hidden w-60 shrink-0 overflow-y-auto border-r border-border lg:block"
        aria-label="Log facets"
      >
        {facetPanel}
      </aside>
      <Sheet open={facetsOpen} onOpenChange={setFacetsOpen}>
        <SheetContent side="left" className="w-72 overflow-y-auto p-0">
          <SheetTitle className="sr-only">Log facets</SheetTitle>
          {facetPanel}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <Button
            variant="subtle"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setFacetsOpen(true)}
            aria-label="Show facets"
          >
            <SlidersHorizontal aria-hidden />
          </Button>
          <div className="relative min-w-48 flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              data-search
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur(), setText(""))}
              placeholder="Search messages, fields, trace IDs…"
              aria-label="Search logs"
              className="h-8 bg-surface pl-8 font-mono text-xs"
            />
            <span
              className="kbd pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
              aria-hidden
            >
              /
            </span>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Filter by level">
            {LOG_LEVELS.map((l) => {
              const meta = LEVEL_META[l];
              const Icon = meta.icon;
              return (
                <Button
                  key={l}
                  variant="chip"
                  size="xs"
                  aria-pressed={levels.has(l)}
                  onClick={() => setLevels((x) => toggle(x, l))}
                >
                  <Icon className={cn("size-3", meta.tone)} aria-hidden />
                  {meta.label.toLowerCase()}
                  <span className="num font-mono text-[10px] opacity-60">
                    {facets ? fmtCompactSafe(facets.levels[l]) : ""}
                  </span>
                </Button>
              );
            })}
          </div>
          <Button
            variant={paused ? "default" : "subtle"}
            size="sm"
            onClick={() => (paused ? resume() : setPaused(true))}
            aria-label={paused ? "Resume tailing" : "Pause tailing"}
          >
            {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
            {paused ? (queued ? `Resume · ${fmtInt(queued)} new` : "Resume") : "Pause"}
          </Button>
        </div>

        {/* Histogram + status */}
        <div className="flex items-center gap-3 border-b border-border px-3 py-1.5">
          <Histogram facets={facets} />
          <div className="flex shrink-0 flex-col items-end text-[11px] text-muted-foreground">
            <span className="num">
              <span className="text-foreground">{fmtInt(rows.length)}</span> of {fmtInt(total)}{" "}
              lines
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={cn("size-1.5", paused ? "bg-warning" : "bg-healthy animate-pulse-soft")}
                aria-hidden
              />
              {paused ? "Paused" : "Tailing"}
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="ml-1 text-primary hover:underline"
                >
                  Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
                </button>
              )}
            </span>
          </div>
        </div>

        {/* Stream */}
        {error ? (
          <EmptyState
            title="Logs didn't load."
            body={`${error.message}. Vigil will keep trying in the background.`}
          />
        ) : loading ? (
          <div className="space-y-1 p-3" aria-busy="true" aria-label="Loading logs">
            {Array.from({ length: 18 }, (_, i) => (
              <Skeleton key={i} className="h-4" style={{ width: `${60 + ((i * 37) % 40)}%` }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Filter}
            title="Nothing matches. That might be good news."
            body="Loosen a filter or widen the search."
            action={
              <Button size="sm" variant="subtle" onClick={clearAll}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <div
            ref={parentRef}
            onScroll={onScroll}
            onWheel={markUserScroll}
            onTouchMove={markUserScroll}
            onPointerDown={markUserScroll}
            onKeyDown={markUserScroll}
            className="relative min-h-0 flex-1 overflow-auto font-mono text-xs"
            role="log"
            aria-live="off"
            aria-label="Log stream"
          >
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((v) => {
                const log = rows[v.index];
                if (!log) return null;
                return (
                  <div
                    key={v.key}
                    data-index={v.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${v.start}px)` }}
                  >
                    <LogRow
                      log={log}
                      active={v.index === active}
                      expanded={expanded.has(log.id)}
                      isNew={newIds.has(log.id)}
                      highlight={debounced}
                      onToggle={() => {
                        setActive(v.index);
                        toggleExpanded(log.id);
                      }}
                      onFilterService={() => setServices(new Set([log.service]))}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {paused && !loading && rows.length > 0 && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 lg:left-[calc(50%+7.5rem)]">
            <Button size="sm" className="pointer-events-auto" onClick={resume}>
              <Play aria-hidden /> Jump to latest{queued ? ` · ${fmtInt(queued)} new` : ""}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtCompactSafe(n?: number) {
  if (!n) return "0";
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-warning/30 text-foreground">
        {text.slice(i, i + term.length)}
      </mark>
      {text.slice(i + term.length)}
    </>
  );
}

const LogRow = memo(function LogRow({
  log,
  active,
  expanded,
  isNew,
  highlight,
  onToggle,
  onFilterService,
}: {
  log: LogEvent;
  active: boolean;
  expanded: boolean;
  isNew: boolean;
  highlight: string;
  onToggle: () => void;
  onFilterService: () => void;
}) {
  const meta = LEVEL_META[log.level];
  const copy = () => {
    void navigator.clipboard?.writeText(JSON.stringify(log, null, 2));
    toast("Copied log as JSON");
  };
  return (
    <div
      className={cn(
        "border-b border-border/40",
        isNew && "animate-row-in",
        active && "bg-accent/60",
        log.level === "error" && !active && "bg-critical/[0.04]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 text-left hover:bg-accent/40 focus-visible:bg-accent/60 focus-visible:outline-none"
        style={{ height: ROW_H }}
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
          aria-hidden
        />
        <span className="num w-[86px] shrink-0 text-muted-foreground">
          {fmtLogTime(log.timestamp)}
        </span>
        <span className={cn("flex w-[58px] shrink-0 items-center gap-1 font-medium", meta.tone)}>
          <StatusIcon meta={meta} className="size-3" />
          {meta.label}
        </span>
        <span className="hidden w-[104px] shrink-0 truncate text-foreground/80 sm:inline">
          {log.service}
        </span>
        <span className="min-w-0 flex-1 truncate text-foreground">
          <Highlight text={log.message} term={highlight} />
          <span className="ml-2 text-muted-foreground">
            {String(log.fields["http.method"])} {String(log.fields["http.route"])}{" "}
            {String(log.fields["http.status"])} {String(log.fields.duration_ms)}ms
          </span>
        </span>
        {log.trace_id && (
          <Waypoints className="size-3 shrink-0 text-trace" aria-label="has trace" />
        )}
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-border/40 bg-surface/60 px-3 py-2.5 pl-8">
          <div className="flex flex-wrap gap-1.5 font-sans">
            {log.trace_id && (
              <Button asChild size="xs" variant="subtle">
                <Link to="/traces/$traceId" params={{ traceId: log.trace_id }}>
                  <Waypoints className="text-trace" aria-hidden /> Jump to trace
                </Link>
              </Button>
            )}
            <Button size="xs" variant="subtle" onClick={onFilterService}>
              <Filter aria-hidden /> Only {log.service}
            </Button>
            <Button size="xs" variant="subtle" onClick={copy}>
              <Copy aria-hidden /> Copy JSON
            </Button>
            <span className="ml-auto self-center text-[11px] text-muted-foreground">
              {fmtClock(log.timestamp)} · {new Date(log.timestamp).toISOString()}
            </span>
          </div>
          <JsonView value={log} />
        </div>
      )}
    </div>
  );
});

function Histogram({ facets }: { facets: Facets | null }) {
  if (!facets) return <Skeleton className="h-8 flex-1" />;
  const max = Math.max(1, ...facets.histogram.map(([, e, w, o]) => e + w + o));
  return (
    <div
      className="flex h-8 min-w-0 flex-1 items-end gap-px"
      role="img"
      aria-label="Log volume per minute, last hour"
    >
      {facets.histogram.map(([t, e, w, o]) => {
        const h = ((e + w + o) / max) * 100;
        return (
          <div
            key={t}
            className="flex h-full flex-1 flex-col justify-end"
            title={`${fmtClock(t, false)} · ${e} errors, ${w} warnings, ${o} other`}
          >
            <div
              className="flex flex-col overflow-hidden rounded-[1px]"
              style={{ height: `${h}%` }}
            >
              <div className="bg-critical" style={{ flex: e }} />
              <div className="bg-warning/80" style={{ flex: w }} />
              <div className="bg-muted-foreground/30" style={{ flex: o }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FacetSidebar({
  facets,
  services,
  fields,
  onService,
  onField,
}: {
  facets: Facets | null;
  services: Set<ServiceName>;
  fields: Record<string, Set<string>>;
  onService: (s: ServiceName) => void;
  onField: (f: string, v: string) => void;
}) {
  if (!facets)
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-5" />
        ))}
      </div>
    );
  return (
    <div className="space-y-5 p-3 text-xs">
      <FacetGroup
        title="Service"
        entries={SERVICE_NAMES.map((s) => [s, facets.services[s] ?? 0] as [string, number])}
        selected={services as Set<string>}
        onToggle={(v) => onService(v as ServiceName)}
        mono
      />
      {FACET_FIELDS.map((f) => (
        <FacetGroup
          key={f}
          title={f}
          entries={(Object.entries(facets.fields[f] ?? {}) as [string, number][])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)}
          selected={fields[f] ?? new Set()}
          onToggle={(v) => onField(f, v)}
          mono
        />
      ))}
    </div>
  );
}

function FacetGroup({
  title,
  entries,
  selected,
  onToggle,
  mono,
}: {
  title: string;
  entries: [string, number][];
  selected: Set<string>;
  onToggle: (v: string) => void;
  mono?: boolean;
}) {
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return (
    <fieldset>
      <legend className="eyebrow mb-1.5 flex w-full items-center justify-between">
        {title}
        {selected.size > 0 && <X className="size-3" aria-hidden />}
      </legend>
      <ul className="space-y-0.5">
        {entries.map(([v, n]) => (
          <li key={v}>
            <label className="group relative flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/50">
              <span
                className="absolute inset-y-0 left-0 rounded bg-primary/[0.07]"
                style={{ width: `${(n / max) * 100}%` }}
                aria-hidden
              />
              <input
                type="checkbox"
                checked={selected.has(v)}
                onChange={() => onToggle(v)}
                className="relative size-3 accent-[var(--primary)]"
              />
              <span
                className={cn(
                  "relative flex-1 truncate",
                  mono && "font-mono",
                  selected.has(v) ? "text-foreground" : "text-foreground/80",
                )}
              >
                {v}
              </span>
              <span className="num relative font-mono text-[10px] text-muted-foreground">
                {fmtCompactSafe(n)}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
