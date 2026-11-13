/**
 * Multi-series time chart built on Recharts, with optional zoom-by-drag.
 * Drag across the plot to select a range; `onZoom(from, to)` receives epoch ms.
 */
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtClock, fmtDateTime, fmtMetric } from "@/lib/format";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  points: { t: number; v: number }[];
}

interface Props {
  series: ChartSeries[];
  unit: string;
  height?: number;
  kind?: "line" | "area" | "bar";
  stacked?: boolean;
  onZoom?: (from: number, to: number) => void;
  threshold?: number;
  compact?: boolean;
  ariaLabel?: string;
}

export function TimeSeriesChart({
  series,
  unit,
  height = 240,
  kind = "line",
  stacked = false,
  onZoom,
  threshold,
  compact = false,
  ariaLabel,
}: Props) {
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);

  const data = useMemo(() => {
    const map = new Map<number, Record<string, number>>();
    for (const s of series)
      for (const p of s.points) {
        const row = map.get(p.t) ?? { t: p.t };
        row[s.key] = p.v;
        map.set(p.t, row);
      }
    return [...map.values()].sort((a, b) => a.t - b.t);
  }, [series]);

  const span = data.length > 1 ? data[data.length - 1].t - data[0].t : 0;
  const tickFmt = (t: number) =>
    span > 36 * 3_600_000 ? fmtDateTime(t) : fmtClock(t, span < 30 * 60_000);

  const common = {
    data,
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
    onMouseDown: onZoom
      ? (e: { activeLabel?: string | number }) =>
          e?.activeLabel != null && setDragStart(Number(e.activeLabel))
      : undefined,
    onMouseMove: onZoom
      ? (e: { activeLabel?: string | number }) =>
          dragStart != null && e?.activeLabel != null && setDragEnd(Number(e.activeLabel))
      : undefined,
    onMouseUp: onZoom
      ? () => {
          if (dragStart != null && dragEnd != null && Math.abs(dragEnd - dragStart) > 0)
            onZoom(Math.min(dragStart, dragEnd), Math.max(dragStart, dragEnd));
          setDragStart(null);
          setDragEnd(null);
        }
      : undefined,
  };

  const axes = (
    <>
      <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
      <XAxis
        dataKey="t"
        type="number"
        scale="time"
        domain={["dataMin", "dataMax"]}
        tickFormatter={tickFmt}
        stroke="var(--muted-foreground)"
        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
        tickLine={false}
        axisLine={{ stroke: "var(--border)" }}
        minTickGap={40}
        hide={compact}
      />
      <YAxis
        tickFormatter={(v: number) => fmtMetric(v, unit)}
        stroke="var(--muted-foreground)"
        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
        tickLine={false}
        axisLine={false}
        width={compact ? 0 : 56}
        hide={compact}
      />
      <Tooltip
        isAnimationActive={false}
        cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
        content={({ active, payload, label }) =>
          active && payload?.length ? (
            <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs">
              <div className="mb-1 font-mono text-[10px] text-muted-foreground">
                {fmtDateTime(Number(label))}:
                {String(new Date(Number(label)).getSeconds()).padStart(2, "0")}
              </div>
              {payload
                .slice()
                .sort((a, b) => Number(b.value) - Number(a.value))
                .slice(0, 10)
                .map((p) => (
                  <div key={String(p.dataKey)} className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-sm"
                      style={{ background: p.color }}
                      aria-hidden
                    />
                    <span className="text-muted-foreground">
                      {series.find((s) => s.key === p.dataKey)?.label}
                    </span>
                    <span className="num ml-auto pl-3 font-mono text-foreground">
                      {fmtMetric(Number(p.value), unit)}
                    </span>
                  </div>
                ))}
            </div>
          ) : null
        }
      />
      {threshold !== undefined && (
        <ReferenceLine
          y={threshold}
          stroke="var(--critical)"
          strokeDasharray="4 4"
          label={{
            value: "threshold",
            fill: "var(--critical)",
            fontSize: 10,
            position: "insideTopRight",
          }}
        />
      )}
      {dragStart != null && dragEnd != null && (
        <ReferenceArea
          x1={dragStart}
          x2={dragEnd}
          fill="var(--primary)"
          fillOpacity={0.12}
          stroke="var(--primary)"
          strokeOpacity={0.4}
        />
      )}
    </>
  );

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? `Chart of ${series.map((s) => s.label).join(", ")}`}
      className={onZoom ? "cursor-crosshair select-none" : undefined}
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart {...common}>
            {axes}
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                fill={s.color}
                stackId={stacked ? "a" : undefined}
                isAnimationActive={false}
                radius={stacked ? 0 : [2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        ) : kind === "area" ? (
          <AreaChart {...common}>
            {axes}
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                fill={s.color}
                fillOpacity={stacked ? 0.16 : 0.08}
                strokeWidth={1.5}
                stackId={stacked ? "a" : undefined}
                isAnimationActive={false}
                dot={false}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart {...common}>
            {axes}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({
  series,
  hidden,
  onToggle,
}: {
  series: ChartSeries[];
  hidden?: Set<string>;
  onToggle?: (key: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]" aria-label="Series">
      {series.map((s) => (
        <li key={s.key}>
          <button
            type="button"
            disabled={!onToggle}
            aria-pressed={!hidden?.has(s.key)}
            onClick={() => onToggle?.(s.key)}
            className={`inline-flex items-center gap-1.5 rounded px-1 text-muted-foreground transition-opacity hover:text-foreground ${hidden?.has(s.key) ? "opacity-40" : ""}`}
          >
            <span className="size-2 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
