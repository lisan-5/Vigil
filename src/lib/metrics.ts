import type { MetricName, ServiceSnapshot } from "@/api/types";

/** Read one named metric off a service snapshot, in the metric's display unit. */
export function metricValue(s: ServiceSnapshot, metric: MetricName): number {
  switch (metric) {
    case "requests.rate":
      return s.rps;
    case "errors.rate":
      return s.errorRate * 100;
    case "latency.avg":
      return s.p50 * 1.18;
    case "latency.p50":
      return s.p50;
    case "latency.p95":
      return s.p95;
    case "latency.p99":
      return s.p99;
    case "cpu.usage":
      return s.cpu;
    case "memory.usage":
      return s.memory;
  }
}

export const METRIC_LABEL: Record<MetricName, string> = {
  "requests.rate": "request rate",
  "errors.rate": "error rate",
  "latency.avg": "avg latency",
  "latency.p50": "p50 latency",
  "latency.p95": "p95 latency",
  "latency.p99": "p99 latency",
  "cpu.usage": "CPU",
  "memory.usage": "memory",
};
