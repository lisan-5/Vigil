/**
 * Client-side VigilQL executor used by MockVigilClient. A real backend receives the raw
 * query string (see docs/API_CONTRACT.md) and returns the same QueryResult shape.
 */
import type { LogEvent, Metric, QueryResult, ServiceName } from "../types";
import type { Filter, ParsedQuery } from "@/lib/vigilql/types";
import { FIELD_ALIASES } from "@/lib/vigilql/parser";
import { scanLogs } from "./logs";
import { queryMetrics } from "./metrics";
import { percentile } from "./random";
import type { MockWorld } from "./world";

const DEFAULT_RANGE = 15 * 60_000;

export class QueryError extends Error {}

function fieldValue(l: LogEvent, field: string): string | number | undefined {
  switch (field) {
    case "service":
      return l.service;
    case "level":
      return l.level;
    case "message":
      return l.message;
    case "trace_id":
      return l.trace_id;
    default: {
      const v = l.fields[FIELD_ALIASES[field] ?? field];
      return typeof v === "boolean" ? String(v) : v;
    }
  }
}

function wildcard(pattern: string): (v: string) => boolean {
  if (!pattern.includes("*")) return (v) => v.toLowerCase() === pattern.toLowerCase();
  const re = new RegExp(
    "^" +
      pattern
        .split("*")
        .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      "$",
    "i",
  );
  return (v) => re.test(v);
}

function filterPredicate(f: Filter): (l: LogEvent) => boolean {
  const matchers = f.values.map(wildcard);
  return (l) => {
    const raw = fieldValue(l, f.field);
    let ok: boolean;
    if (raw === undefined) ok = false;
    else if (f.op === ":")
      ok =
        f.field === "message"
          ? String(raw).toLowerCase().includes(f.values[0].toLowerCase())
          : matchers.some((m) => m(String(raw)));
    else if (f.op === "!=") ok = !matchers.some((m) => m(String(raw)));
    else {
      const n = Number(raw);
      const t = Number(f.values[0]);
      ok = f.op === ">" ? n > t : f.op === "<" ? n < t : f.op === ">=" ? n >= t : n <= t;
    }
    return f.negate ? !ok : ok;
  };
}

function textPredicate(term: string): (l: LogEvent) => boolean {
  const t = term.toLowerCase();
  return (l) =>
    l.message.toLowerCase().includes(t) ||
    Object.values(l.fields).some((v) => String(v).toLowerCase().includes(t)) ||
    !!l.trace_id?.includes(t);
}

const key = (l: LogEvent, by: string[]) => by.map((b) => String(fieldValue(l, b) ?? "—"));

function agg(values: number[], fn: string): number {
  if (values.length === 0) return 0;
  if (fn === "avg") return values.reduce((s, v) => s + v, 0) / values.length;
  if (fn === "sum") return values.reduce((s, v) => s + v, 0);
  if (fn === "min") return Math.min(...values);
  if (fn === "max") return Math.max(...values);
  return percentile(values, Number(fn.slice(1)));
}

export function executeQuery(world: MockWorld, q: ParsedQuery): QueryResult {
  const started = performance.now();
  const last = q.stages.find((s) => s.type === "last");
  const to = Date.now();
  const from = to - (last && last.type === "last" ? last.durationMs : DEFAULT_RANGE);
  return q.source === "metrics"
    ? runMetrics(world, q, from, to, started)
    : runLogs(world, q, from, to, started);
}

function runLogs(
  world: MockWorld,
  q: ParsedQuery,
  from: number,
  to: number,
  started: number,
): QueryResult {
  const preds = [...q.filters.map(filterPredicate), ...q.text.map(textPredicate)];
  const { logs, sampled, scale } = scanLogs(world, from, to, 14_400);
  let rows: LogEvent[] = logs.filter((l) => preds.every((p) => p(l)));
  const scanned = logs.length;
  type Row = Record<string, string | number>;
  let table: Row[] | null = null;
  let columns: { key: string; label: string; type: "string" | "number" | "time" }[] = [];
  const meta = () => ({
    scanned: scanned * scale,
    tookMs: Math.round(performance.now() - started),
    sampled,
    from,
    to,
  });

  for (const stage of q.stages) {
    if (stage.type === "count" || stage.type === "agg") {
      const groups = new Map<string, { keys: string[]; values: number[]; count: number }>();
      for (const l of rows) {
        const k = key(l, stage.by);
        const id = k.join("\u0000");
        const g = groups.get(id) ?? { keys: k, values: [], count: 0 };
        g.count++;
        if (stage.type === "agg" && stage.field) g.values.push(Number(fieldValue(l, stage.field)));
        groups.set(id, g);
      }
      const valueKey = stage.type === "count" ? "count" : `${stage.fn}(${stage.field})`;
      table = [...groups.values()].map((g) => {
        const r: Row = {};
        stage.by.forEach((b, i) => (r[b] = g.keys[i]));
        r[valueKey] =
          stage.type === "count"
            ? Math.round(g.count * scale)
            : Math.round(agg(g.values, stage.fn) * 100) / 100;
        return r;
      });
      table.sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]));
      columns = [
        ...stage.by.map((b) => ({ key: b, label: b, type: "string" as const })),
        { key: valueKey, label: valueKey, type: "number" as const },
      ];
    } else if (stage.type === "timeseries") {
      const by = stage.by[0];
      const step = stage.intervalMs;
      const buckets = Math.ceil((to - from) / step);
      if (buckets > 720)
        throw new QueryError(
          `That's ${buckets.toLocaleString()} points per series. Try a larger interval.`,
        );
      const start = Math.floor(from / step) * step;
      const series = new Map<string, number[]>();
      for (const l of rows) {
        const label = by ? String(fieldValue(l, by) ?? "—") : "count";
        const arr = series.get(label) ?? new Array(buckets + 1).fill(0);
        arr[Math.floor((l.timestamp - start) / step)] += scale;
        series.set(label, arr);
      }
      const out: Metric[] = [...series.entries()].map(([label, arr]) => ({
        name: "requests.rate",
        unit: "rps",
        labels: by ? { [by]: label } : {},
        points: arr.map((v, i) => ({ t: start + i * step, v })),
      }));
      return { kind: "timeseries", series: out.slice(0, 12), meta: meta() };
    } else if (stage.type === "sort") {
      const f = stage.field;
      const dir = stage.dir === "asc" ? 1 : -1;
      if (table) table.sort((a, b) => (a[f] > b[f] ? dir : a[f] < b[f] ? -dir : 0));
      else
        rows = [...rows].sort((a, b) =>
          (fieldValue(a, f) ?? "") > (fieldValue(b, f) ?? "") ? dir : -dir,
        );
    } else if (stage.type === "limit") {
      if (table) table = table.slice(0, stage.n);
      else rows = rows.slice(-stage.n);
    } else if (stage.type === "fields") {
      if (table) {
        const keep = new Set(stage.fields);
        columns = columns.filter((c) => keep.has(c.key));
      } else {
        columns = [
          { key: "timestamp", label: "time", type: "time" },
          ...stage.fields.map((f) => ({ key: f, label: f, type: "string" as const })),
        ];
        table = rows
          .slice(-500)
          .reverse()
          .map((l) => {
            const r: Row = { timestamp: l.timestamp };
            for (const f of stage.fields) r[f] = fieldValue(l, f) ?? "—";
            return r;
          });
      }
    }
  }

  if (!table) {
    columns = [
      { key: "timestamp", label: "time", type: "time" },
      { key: "service", label: "service", type: "string" },
      { key: "level", label: "level", type: "string" },
      { key: "status", label: "status", type: "number" },
      { key: "message", label: "message", type: "string" },
    ];
    table = rows
      .slice(-200)
      .reverse()
      .map((l) => ({
        timestamp: l.timestamp,
        service: l.service,
        level: l.level,
        status: Number(l.fields["http.status"]),
        message: l.message,
      }));
  }
  return { kind: "table", columns, rows: table, meta: meta() };
}

function runMetrics(
  world: MockWorld,
  q: ParsedQuery,
  from: number,
  to: number,
  started: number,
): QueryResult {
  const svcFilter = q.filters.find((f) => f.field === "service");
  let services: ServiceName[] | undefined;
  if (svcFilter) {
    const all = [
      "api-gateway",
      "auth",
      "checkout",
      "payments",
      "inventory",
      "notifications",
      "search",
      "ledger",
    ] as ServiceName[];
    const ms = svcFilter.values.map(wildcard);
    services = all.filter((s) =>
      svcFilter.negate || svcFilter.op === "!=" ? !ms.some((m) => m(s)) : ms.some((m) => m(s)),
    );
  }
  const ts = q.stages.find((s) => s.type === "timeseries");
  const ag = q.stages.find((s) => s.type === "agg");
  const regionFilter = q.filters.find((f) => f.field === "region" || f.field === "version");
  const byField =
    (ts?.type === "timeseries" && ts.by[0]) ||
    (ag?.type === "agg" && ag.by[0]) ||
    regionFilter?.field ||
    "none";
  const aggregation = ag?.type === "agg" ? ag.fn : "avg";
  const span = to - from;
  const step = ts?.type === "timeseries" ? ts.intervalMs : Math.max(1000, Math.floor(span / 60));
  if (span / step > 720)
    throw new QueryError(
      `That's ${Math.ceil(span / step).toLocaleString()} points per series. Try a larger interval.`,
    );
  let series = queryMetrics(world, {
    metric: q.metric!,
    from,
    to,
    stepMs: step,
    aggregation,
    groupBy: byField as "none" | "service" | "region" | "version",
    services,
  });
  if (regionFilter)
    series = series.filter((s) => regionFilter.values.includes(s.labels[regionFilter.field]));
  const limit = q.stages.find((s) => s.type === "limit");
  if (limit?.type === "limit") series = series.slice(0, limit.n);
  const meta = {
    scanned: series.reduce((s, x) => s + x.points.length, 0),
    tookMs: Math.round(performance.now() - started),
    sampled: false,
    from,
    to,
  };
  if (ts) return { kind: "timeseries", series, meta };

  const label = byField === "none" ? "series" : byField;
  const vk = `${aggregation}(${q.metric})`;
  return {
    kind: "table",
    columns: [
      { key: label, label, type: "string" },
      { key: vk, label: vk, type: "number" },
    ],
    rows: series.map((s) => ({
      [label]: byField === "none" ? q.metric! : s.labels[byField],
      [vk]:
        Math.round(
          agg(
            s.points.map((p) => p.v),
            aggregation,
          ) * 100,
        ) / 100,
    })),
    meta,
  };
}
