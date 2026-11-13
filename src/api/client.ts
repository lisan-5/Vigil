/**
 * Client interfaces. The UI only ever talks to these — never to a concrete implementation —
 * so a real backend can be plugged in by providing an HTTP/WebSocket implementation.
 */
import type {
  Alert,
  AlertRule,
  ApiKey,
  IncidentInfo,
  LogEvent,
  LogQuery,
  LogQueryResult,
  Metric,
  MetricQuery,
  MetricTick,
  NotificationChannel,
  QueryResult,
  Service,
  ServiceEdge,
  Trace,
  TraceQuery,
  TraceSummary,
} from "./types";
import type { ParsedQuery } from "@/lib/vigilql/types";

export interface VigilClient {
  /** Service catalog with dependency information. */
  listServices(): Promise<Service[]>;
  /** Traffic edges between services, aggregated over the range. */
  getServiceEdges(range: { from: number; to: number }): Promise<ServiceEdge[]>;
  /** Per-service health snapshots at a fixed step — used to backfill live charts. */
  getSnapshots(range: { from: number; to: number; stepMs: number }): Promise<MetricTick[]>;

  queryLogs(query: LogQuery): Promise<LogQueryResult>;
  queryMetrics(query: MetricQuery): Promise<Metric[]>;
  queryTraces(query: TraceQuery): Promise<TraceSummary[]>;
  getTrace(traceId: string): Promise<Trace | null>;

  listAlerts(): Promise<Alert[]>;
  acknowledgeAlert(id: string, by: string): Promise<Alert>;
  resolveAlert(id: string, by: string): Promise<Alert>;
  listAlertRules(): Promise<AlertRule[]>;
  saveAlertRule(rule: Omit<AlertRule, "id" | "createdAt"> & { id?: string }): Promise<AlertRule>;
  deleteAlertRule(id: string): Promise<void>;

  listChannels(): Promise<NotificationChannel[]>;
  saveChannel(
    channel: Omit<NotificationChannel, "id"> & { id?: string },
  ): Promise<NotificationChannel>;
  deleteChannel(id: string): Promise<void>;

  listApiKeys(): Promise<ApiKey[]>;
  /** Returns the key record plus the full secret, which is only ever shown once. */
  createApiKey(input: {
    name: string;
    scopes: ApiKey["scopes"];
  }): Promise<{ key: ApiKey; secret: string }>;
  revokeApiKey(id: string): Promise<void>;

  /** Execute a parsed VigilQL query. */
  runQuery(query: ParsedQuery): Promise<QueryResult>;

  /** Currently active incidents (demo + real). */
  listIncidents(): Promise<IncidentInfo[]>;
  /**
   * Demo hook: inject an error spike into one service. Real backends may leave this
   * unimplemented — the UI hides the button when it is undefined.
   */
  simulateIncident?(service?: Service["name"]): Promise<IncidentInfo>;
  endIncident?(id: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Streaming                                                           */
/* ------------------------------------------------------------------ */

export interface AlertStreamEvent {
  type: "alert.fired" | "alert.updated" | "alert.resolved";
  alert: Alert;
}

export interface IncidentStreamEvent {
  type: "incident.started" | "incident.ended";
  incident: IncidentInfo;
}

/** Map of topic name → message payload. */
export interface StreamTopics {
  /** Batches of newly ingested log lines (roughly every 250ms). */
  logs: LogEvent[];
  /** One health snapshot for every service, every second. */
  metrics: MetricTick;
  /** Alert state changes. */
  alerts: AlertStreamEvent;
  /** Incident lifecycle. */
  incidents: IncidentStreamEvent;
}
export type StreamTopic = keyof StreamTopics;
export type ConnectionStatus = "connecting" | "open" | "closed";
export type Unsubscribe = () => void;

export interface StreamClient {
  subscribe<T extends StreamTopic>(
    topic: T,
    handler: (message: StreamTopics[T]) => void,
  ): Unsubscribe;
  getStatus(): ConnectionStatus;
  onStatusChange(handler: (status: ConnectionStatus) => void): Unsubscribe;
}
