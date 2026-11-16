/**
 * Live service dependency graph.
 *
 * Nodes are laid out in columns by call depth from the edge (longest path), edges are
 * drawn as curves whose width and dash speed scale with traffic. Hovering a node
 * spotlights it and its direct neighbours; clicking selects it.
 */
import { useMemo, useState } from "react";
import type { Alert, Service, ServiceEdge, ServiceName, ServiceSnapshot } from "@/api/types";
import { HEALTH_META, StatusIcon } from "@/components/status/StatusIcon";
import { fmtCompact, fmtMs, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { healthOf, type Health } from "@/stores/live";

const VW = 1000;
const VH = 560;

interface Placed {
  name: ServiceName;
  x: number;
  y: number;
  depth: number;
}

/** Longest-path depth from any root, so every edge points left → right. */
function layout(services: Service[]): Record<ServiceName, Placed> {
  const callers = new Map<ServiceName, ServiceName[]>();
  for (const s of services)
    for (const d of s.dependencies) callers.set(d, [...(callers.get(d) ?? []), s.name]);
  const depth = new Map<ServiceName, number>();
  const visit = (n: ServiceName, seen: Set<ServiceName>): number => {
    if (depth.has(n)) return depth.get(n)!;
    if (seen.has(n)) return 0; // cycle guard
    seen.add(n);
    const ups = callers.get(n) ?? [];
    const d = ups.length ? Math.max(...ups.map((u) => visit(u, seen) + 1)) : 0;
    depth.set(n, d);
    return d;
  };
  for (const s of services) visit(s.name, new Set());

  const cols = new Map<number, ServiceName[]>();
  for (const s of services) {
    const d = depth.get(s.name)!;
    cols.set(d, [...(cols.get(d) ?? []), s.name]);
  }
  const maxDepth = Math.max(0, ...cols.keys());
  const out = {} as Record<ServiceName, Placed>;
  for (const [d, names] of cols) {
    names.forEach((name, i) => {
      out[name] = {
        name,
        depth: d,
        x: maxDepth ? 110 + (d / maxDepth) * (VW - 220) : VW / 2,
        y: ((i + 1) / (names.length + 1)) * VH,
      };
    });
  }
  return out;
}

const HEALTH_STROKE: Record<Health, string> = {
  healthy: "var(--muted-foreground)",
  degraded: "var(--warning)",
  critical: "var(--critical)",
};

export function ServiceGraph({
  services,
  edges,
  snapshots,
  alerts,
  selected,
  onSelect,
}: {
  services: Service[];
  edges: ServiceEdge[];
  snapshots: Record<ServiceName, ServiceSnapshot> | undefined;
  alerts: Alert[];
  selected?: ServiceName;
  onSelect: (s: ServiceName | undefined) => void;
}) {
  const [hover, setHover] = useState<ServiceName | null>(null);
  const pos = useMemo(() => layout(services), [services]);
  const focus = hover ?? selected ?? null;
  const neighbours = useMemo(() => {
    if (!focus) return null;
    const set = new Set<ServiceName>([focus]);
    for (const e of edges) {
      if (e.source === focus) set.add(e.target);
      if (e.target === focus) set.add(e.source);
    }
    return set;
  }, [focus, edges]);

  const maxRps = Math.max(1, ...edges.map((e) => e.rps));

  return (
    <div className="relative w-full overflow-x-auto">
      <div className="relative min-w-[760px]" style={{ aspectRatio: `${VW} / ${VH}` }}>
        {/* graph paper */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-60 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:40px_40px]"
        />
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          {edges.map((e) => {
            const a = pos[e.source];
            const b = pos[e.target];
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2;
            const d = `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
            const health = healthOf(snapshots?.[e.target], alerts, e.target);
            const w = 1 + (Math.log10(1 + e.rps) / Math.log10(1 + maxRps)) * 3.5;
            const speed = Math.max(0.5, 3.2 - Math.log10(1 + e.rps) * 0.75);
            const dim = neighbours && !(neighbours.has(e.source) && neighbours.has(e.target));
            const hot = focus && (e.source === focus || e.target === focus);
            return (
              <g
                key={`${e.source}-${e.target}`}
                className="transition-opacity duration-300"
                opacity={dim ? 0.12 : 1}
              >
                <path
                  d={d}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={w + 4}
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={d}
                  fill="none"
                  stroke={
                    health === "healthy"
                      ? hot
                        ? "var(--foreground)"
                        : "var(--muted-foreground)"
                      : HEALTH_STROKE[health]
                  }
                  strokeWidth={w}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  className="edge-flow"
                  style={{ animationDuration: `${speed}s` }}
                />
              </g>
            );
          })}
        </svg>

        {services.map((s) => {
          const p = pos[s.name];
          const snap = snapshots?.[s.name];
          const health = healthOf(snap, alerts, s.name);
          const meta = HEALTH_META[health];
          const dim = neighbours && !neighbours.has(s.name);
          const isSel = selected === s.name;
          return (
            <button
              key={s.name}
              type="button"
              onMouseEnter={() => setHover(s.name)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(s.name)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect(isSel ? undefined : s.name)}
              aria-pressed={isSel}
              aria-label={`${s.name}, ${meta.label}`}
              className={cn(
                "absolute w-[150px] -translate-x-1/2 -translate-y-1/2 border bg-surface px-2.5 py-2 text-left transition-all duration-300 hover:-translate-y-[calc(50%+2px)] hover:shadow-[4px_4px_0_var(--foreground)]",
                isSel ? "border-foreground shadow-[4px_4px_0_var(--foreground)]" : "border-input",
                health === "critical" && "border-critical bg-critical/5",
                health === "degraded" && "border-warning",
                dim ? "opacity-30" : "opacity-100",
              )}
              style={{ left: `${(p.x / VW) * 100}%`, top: `${(p.y / VH) * 100}%` }}
            >
              {health === "critical" && (
                <span
                  aria-hidden
                  className="absolute -inset-1.5 -z-10 animate-ping border border-critical/60"
                />
              )}
              <span className="flex items-center gap-1.5">
                <StatusIcon meta={meta} className="size-3.5 shrink-0" />
                <span className="truncate font-mono text-[12px] font-medium text-foreground">
                  {s.name}
                </span>
              </span>
              <span className="num mt-1 flex justify-between gap-1 font-mono text-[10.5px] text-muted-foreground">
                <span>{snap ? `${fmtCompact(snap.rps)}/s` : "—"}</span>
                <span className={cn(snap && snap.errorRate > 0.015 && meta.tone)}>
                  {snap ? fmtPct(snap.errorRate, 1) : "—"}
                </span>
                <span>{snap ? fmtMs(snap.p95) : "—"}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
