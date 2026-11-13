/** Metric queries over the simulated world. */
import type { Aggregation, Metric, MetricName, MetricQuery, ServiceName } from "../types";
import { SERVICE_NAMES } from "../types";
import { REGIONS, REGION_LATENCY, REGION_SHARE, VERSIONS, VERSION_SHARE } from "./catalog";
import { percentile } from "./random";
import { metricValue, type MockWorld } from "./world";

export const METRIC_UNITS: Record<MetricName, Metric["unit"]> = {
  "requests.rate": "rps",
  "errors.rate": "percent",
  "latency.avg": "ms",
  "latency.p50": "ms",
  "latency.p95": "ms",
  "latency.p99": "ms",
  "cpu.usage": "percent",
  "memory.usage": "bytes",
};

const isAdditive = (m: MetricName) => m === "requests.rate";
const isLatency = (m: MetricName) => m.startsWith("latency");

function aggregate(values: number[], agg: Aggregation, stepSec: number): number {
  if (values.length === 0) return 0;
  switch (agg) {
    case "avg":
      return values.reduce((s, v) => s + v, 0) / values.length;
    case "sum":
      // Sum over the bucket: per-second samples × seconds in the bucket.
      return (values.reduce((s, v) => s + v, 0) / values.length) * stepSec;
    case "rate":
      return values.reduce((s, v) => s + v, 0) / values.length;
    case "p50":
      return percentile(values, 50);
    case "p95":
      return percentile(values, 95);
    case "p99":
      return percentile(values, 99);
    case "max":
      return Math.max(...values);
    case "min":
      return Math.min(...values);
  }
}

/** Value of a metric for one service in one bucket. */
function bucketValue(
  world: MockWorld,
  service: ServiceName,
  metric: MetricName,
  t: number,
  stepMs: number,
  agg: Aggregation,
) {
  const samples = Math.max(1, Math.min(8, Math.round(stepMs / 1000)));
  const values: number[] = [];
  for (let i = 0; i < samples; i++)
    values.push(metricValue(world.snapshotAt(service, t + (stepMs * i) / samples), metric));
  return aggregate(values, agg, stepMs / 1000);
}

export function queryMetrics(world: MockWorld, q: MetricQuery): Metric[] {
  const services = q.services?.length ? q.services : [...SERVICE_NAMES];
  const step = Math.max(1000, q.stepMs);
  const start = Math.floor(q.from / step) * step;
  const end = Math.min(q.to, Date.now());
  const times: number[] = [];
  for (let t = start; t <= end; t += step) times.push(t);
  const unit = METRIC_UNITS[q.metric];

  // Per-service raw series first.
  const perService = services.map((s) => ({
    service: s,
    rps: q.metric === "requests.rate" ? null : times.map((t) => world.snapshotAt(s, t).rps),
    values: times.map((t) => bucketValue(world, s, q.metric, t, step, q.aggregation)),
  }));

  const combine = (weights: number[][], vals: number[][]) =>
    times.map((_, i) => {
      if (isAdditive(q.metric)) return vals.reduce((s, v) => s + v[i], 0);
      const w = weights.map((ws) => ws[i]);
      const total = w.reduce((s, x) => s + x, 0) || 1;
      return vals.reduce((s, v, k) => s + v[i] * w[k], 0) / total;
    });
  const weightsOf = (p: (typeof perService)[number]) => p.rps ?? times.map(() => 1);

  if (q.groupBy === "service") {
    return perService.map((p) => ({
      name: q.metric,
      unit,
      labels: { service: p.service },
      points: times.map((t, i) => ({ t, v: p.values[i] })),
    }));
  }

  const overall = combine(
    perService.map(weightsOf),
    perService.map((p) => p.values),
  );

  if (q.groupBy === "none") {
    return [
      { name: q.metric, unit, labels: {}, points: times.map((t, i) => ({ t, v: overall[i] })) },
    ];
  }

  const groups = q.groupBy === "region" ? REGIONS : VERSIONS;
  const shares = q.groupBy === "region" ? REGION_SHARE : VERSION_SHARE;
  return groups.map((g, gi) => {
    const factor = isAdditive(q.metric)
      ? shares[gi]
      : isLatency(q.metric)
        ? q.groupBy === "region"
          ? REGION_LATENCY[gi]
          : gi === 1
            ? 1.15
            : 1
        : q.metric === "errors.rate" && q.groupBy === "version" && gi === 1
          ? 1.6
          : 1 + (gi - 1) * 0.04;
    return {
      name: q.metric,
      unit,
      labels: { [q.groupBy]: g },
      points: times.map((t, i) => ({ t, v: overall[i] * factor })),
    };
  });
}
