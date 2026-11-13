/**
 * Vigil domain types.
 *
 * These are the shapes the frontend expects from any backend. They are mirrored in
 * docs/API_CONTRACT.md — keep the two in sync when changing anything here.
 * Timestamps are always epoch milliseconds (UTC). Durations are milliseconds.
 */

export const SERVICE_NAMES = [
  "api-gateway",
  "auth",
  "checkout",
  "payments",
  "inventory",
  "notifications",
  "search",
  "ledger",
] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

export type LogLevel = "debug" | "info" | "warn" | "error";
export const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

export type Severity = "info" | "warning" | "critical";
export type HealthStatus = "healthy" | "degraded" | "critical";

/** A single structured log line. */
export interface LogEvent {
  id: string;
  timestamp: number;
  service: ServiceName;
  level: LogLevel;
  message: string;
  /** Present when the log was emitted inside a traced request. */
  trace_id?: string;
  span_id?: string;
  /** Flat structured fields, e.g. { "http.status": 502, region: "eu-west-1" } */
  fields: Record<string, string | number | boolean>;
}

/** A point-in-time health snapshot for one service. */
export interface ServiceSnapshot {
  service: ServiceName;
  rps: number;
  /** 0..1 */
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  cpu: number;
  memory: number;
}

/** One tick of the live metrics stream: a snapshot for every service at time t. */
export interface MetricTick {
  t: number;
  services: Record<ServiceName, ServiceSnapshot>;
}

export interface Service {
  name: ServiceName;
  description: string;
  team: string;
  language: string;
  /** Downstream services this one calls. */
  dependencies: ServiceName[];
  version: string;
}

export interface ServiceEdge {
  source: ServiceName;
  target: ServiceName;
  rps: number;
  errorRate: number;
  p95: number;
}

export type MetricName =
  | "requests.rate"
  | "errors.rate"
  | "latency.avg"
  | "latency.p50"
  | "latency.p95"
  | "latency.p99"
  | "cpu.usage"
  | "memory.usage";

export type Aggregation = "avg" | "p50" | "p95" | "p99" | "sum" | "rate" | "max" | "min";
export type GroupBy = "none" | "service" | "region" | "version";

export interface MetricPoint {
  t: number;
  v: number;
}

/** A metric time series, labelled by its group-by values. */
export interface Metric {
  name: MetricName;
  unit: "rps" | "percent" | "ms" | "ratio" | "bytes";
  labels: Record<string, string>;
  points: MetricPoint[];
}

export interface Span {
  span_id: string;
  parent_id: string | null;
  trace_id: string;
  service: ServiceName;
  name: string;
  kind: "server" | "client" | "internal" | "producer" | "consumer";
  /** Start time, epoch ms. */
  start: number;
  duration: number;
  status: "ok" | "error";
  attributes: Record<string, string | number | boolean>;
  events: { timestamp: number; name: string; attributes?: Record<string, string | number> }[];
}

export interface TraceSummary {
  trace_id: string;
  root_service: ServiceName;
  root_name: string;
  start: number;
  duration: number;
  span_count: number;
  error_count: number;
  services: ServiceName[];
}

export interface Trace extends TraceSummary {
  spans: Span[];
}

export type AlertState = "ok" | "firing" | "acknowledged" | "resolved";
export type ComparisonOp = ">" | "<";
export type ChannelKind = "slack" | "pagerduty" | "email" | "webhook";

export interface NotificationChannel {
  id: string;
  kind: ChannelKind;
  name: string;
  target: string;
  enabled: boolean;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: MetricName;
  /** A specific service, or "*" to evaluate every service separately. */
  service: ServiceName | "*";
  op: ComparisonOp;
  threshold: number;
  /** Evaluation window in seconds. */
  windowSec: number;
  severity: Severity;
  channelId: string;
  enabled: boolean;
  createdAt: number;
}

export interface AlertTransition {
  at: number;
  from: AlertState;
  to: AlertState;
  by: string;
  note?: string;
}

/** A concrete alert instance raised by a rule for a service. */
export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  service: ServiceName;
  severity: Severity;
  state: AlertState;
  metric: MetricName;
  threshold: number;
  op: ComparisonOp;
  /** The observed value when the alert last changed state. */
  value: number;
  startedAt: number;
  updatedAt: number;
  resolvedAt?: number;
  history: AlertTransition[];
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: ("read" | "write" | "ingest")[];
  createdAt: number;
  lastUsedAt?: number;
}

/** Time range. Relative ranges are resolved against "now" at query time. */
export type TimeRange =
  { kind: "relative"; value: RelativeRange } | { kind: "absolute"; from: number; to: number };
export type RelativeRange = "5m" | "15m" | "1h" | "6h" | "24h" | "7d";

export interface LogQuery {
  from: number;
  to: number;
  services?: ServiceName[];
  levels?: LogLevel[];
  /** Free text, matched case-insensitively against message and field values. */
  text?: string;
  /** Exact-match field filters, e.g. { "http.status": "502" }. */
  fields?: Record<string, string>;
  limit?: number;
}

export interface LogQueryResult {
  logs: LogEvent[];
  /** Total matching rows (may exceed logs.length when limited). */
  total: number;
  /** True when the backend sampled the time range to answer quickly. */
  sampled: boolean;
}

export interface MetricQuery {
  metric: MetricName;
  from: number;
  to: number;
  stepMs: number;
  aggregation: Aggregation;
  groupBy: GroupBy;
  services?: ServiceName[];
}

export interface TraceQuery {
  from: number;
  to: number;
  service?: ServiceName;
  minDuration?: number;
  errorsOnly?: boolean;
  text?: string;
  limit?: number;
}

/** Result of a VigilQL query executed by the backend (or the client-side mock). */
export type QueryResult =
  | {
      kind: "table";
      columns: { key: string; label: string; type: "string" | "number" | "time" }[];
      rows: Record<string, string | number>[];
      meta: QueryMeta;
    }
  | { kind: "timeseries"; series: Metric[]; meta: QueryMeta };

export interface QueryMeta {
  scanned: number;
  tookMs: number;
  sampled: boolean;
  from: number;
  to: number;
}

export interface IncidentInfo {
  id: string;
  service: ServiceName;
  startedAt: number;
  endsAt: number;
  simulated: boolean;
}
