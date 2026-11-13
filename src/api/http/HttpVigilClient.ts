/**
 * HttpVigilClient — REST implementation of VigilClient following docs/API_CONTRACT.md.
 * Selected automatically when VITE_VIGIL_API_URL is set.
 */
import type { VigilClient } from "../client";
import type {
  Alert,
  AlertRule,
  ApiKey,
  IncidentInfo,
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
} from "../types";
import type { ParsedQuery } from "@/lib/vigilql/types";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class HttpVigilClient implements VigilClient {
  constructor(
    private baseUrl: string,
    private getToken: () => string | null = () => null,
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(
      path.replace(/^\//, ""),
      this.baseUrl.endsWith("/") ? this.baseUrl : this.baseUrl + "/",
    );
    if (query)
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
      }
    const token = this.getToken();
    const res = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new HttpError(res.status, err?.error?.message ?? res.statusText);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  listServices = () => this.request<Service[]>("GET", "/v1/services");
  getServiceEdges = (r: { from: number; to: number }) =>
    this.request<ServiceEdge[]>("GET", "/v1/services/edges", undefined, r);
  getSnapshots = (r: { from: number; to: number; stepMs: number }) =>
    this.request<MetricTick[]>("GET", "/v1/services/snapshots", undefined, r);
  queryLogs = (q: LogQuery) => this.request<LogQueryResult>("POST", "/v1/logs/query", q);
  queryMetrics = (q: MetricQuery) => this.request<Metric[]>("POST", "/v1/metrics/query", q);
  queryTraces = (q: TraceQuery) => this.request<TraceSummary[]>("POST", "/v1/traces/query", q);
  getTrace = async (id: string) => {
    try {
      return await this.request<Trace>("GET", `/v1/traces/${encodeURIComponent(id)}`);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  };
  listAlerts = () => this.request<Alert[]>("GET", "/v1/alerts");
  acknowledgeAlert = (id: string, by: string) =>
    this.request<Alert>("POST", `/v1/alerts/${id}/acknowledge`, { by });
  resolveAlert = (id: string, by: string) =>
    this.request<Alert>("POST", `/v1/alerts/${id}/resolve`, { by });
  listAlertRules = () => this.request<AlertRule[]>("GET", "/v1/alert-rules");
  saveAlertRule = (r: Omit<AlertRule, "id" | "createdAt"> & { id?: string }) =>
    r.id
      ? this.request<AlertRule>("PUT", `/v1/alert-rules/${r.id}`, r)
      : this.request<AlertRule>("POST", "/v1/alert-rules", r);
  deleteAlertRule = (id: string) => this.request<void>("DELETE", `/v1/alert-rules/${id}`);
  listChannels = () => this.request<NotificationChannel[]>("GET", "/v1/channels");
  saveChannel = (c: Omit<NotificationChannel, "id"> & { id?: string }) =>
    c.id
      ? this.request<NotificationChannel>("PUT", `/v1/channels/${c.id}`, c)
      : this.request<NotificationChannel>("POST", "/v1/channels", c);
  deleteChannel = (id: string) => this.request<void>("DELETE", `/v1/channels/${id}`);
  listApiKeys = () => this.request<ApiKey[]>("GET", "/v1/api-keys");
  createApiKey = (input: { name: string; scopes: ApiKey["scopes"] }) =>
    this.request<{ key: ApiKey; secret: string }>("POST", "/v1/api-keys", input);
  revokeApiKey = (id: string) => this.request<void>("DELETE", `/v1/api-keys/${id}`);
  runQuery = (q: ParsedQuery) => this.request<QueryResult>("POST", "/v1/query", { query: q.raw });
  listIncidents = () => this.request<IncidentInfo[]>("GET", "/v1/incidents");
}
