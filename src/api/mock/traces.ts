/**
 * Deterministic trace generation.
 *
 * A trace_id encodes everything needed to rebuild the trace:
 *   [12 hex: start ms][1 hex: focus service][1 hex: flags][18 hex: random]
 * so a log line can carry a trace_id and "jump to trace" always lands on a trace
 * that contains the log's service and span — no storage required.
 */
import type { ServiceName, Span, Trace, TraceSummary } from "../types";
import { SERVICE_NAMES } from "../types";
import { REGIONS, SERVICES, SERVICE_INDEX } from "./catalog";
import { hashString, hex, logNormal, mulberry32, pick } from "./random";
import type { MockWorld } from "./world";

const FLAG_ERROR = 1;

export function makeTraceId(
  start: number,
  focus: ServiceName,
  error: boolean,
  rng: () => number,
): string {
  const ts = Math.floor(start).toString(16).padStart(12, "0").slice(-12);
  return (
    ts + SERVICE_INDEX[focus].toString(16) + (error ? FLAG_ERROR : 0).toString(16) + hex(rng, 18)
  );
}

export function spanIdFor(traceId: string, service: ServiceName, ordinal = 0): string {
  const rng = mulberry32(hashString(`${traceId}:${service}:${ordinal}`));
  return hex(rng, 16);
}

function decode(traceId: string) {
  if (!/^[0-9a-f]{32}$/.test(traceId)) return null;
  const start = parseInt(traceId.slice(0, 12), 16);
  const focus = SERVICE_NAMES[parseInt(traceId[12], 16)];
  const flags = parseInt(traceId[13], 16);
  if (!focus || !Number.isFinite(start)) return null;
  return { start, focus, error: (flags & FLAG_ERROR) !== 0 };
}

/** A call-tree template: service, operation, children, and whether children run in parallel. */
interface CallNode {
  service: ServiceName;
  name: string;
  kind: Span["kind"];
  children?: CallNode[];
  parallel?: boolean;
  internal?: string[];
  weight?: number;
}

const ENDPOINTS: Record<string, CallNode> = {
  checkout: {
    service: "api-gateway",
    name: "POST /api/checkout",
    kind: "server",
    children: [
      {
        service: "auth",
        name: "POST /v1/token/verify",
        kind: "server",
        internal: ["redis GET session"],
        weight: 0.4,
      },
      {
        service: "checkout",
        name: "POST /checkout",
        kind: "server",
        internal: ["pg SELECT cart_items"],
        children: [
          {
            service: "inventory",
            name: "POST /reservations",
            kind: "server",
            internal: ["pg UPDATE stock"],
          },
          {
            service: "payments",
            name: "POST /v2/charges",
            kind: "server",
            internal: ["http POST processor.authorize"],
            children: [
              {
                service: "ledger",
                name: "POST /entries",
                kind: "server",
                internal: ["pg INSERT entries"],
              },
            ],
          },
          {
            service: "notifications",
            name: "publish order.confirmed",
            kind: "producer",
            weight: 0.3,
          },
        ],
      },
    ],
  },
  search: {
    service: "api-gateway",
    name: "GET /api/search",
    kind: "server",
    children: [
      { service: "auth", name: "POST /v1/token/verify", kind: "server", weight: 0.4 },
      {
        service: "search",
        name: "GET /search",
        kind: "server",
        internal: ["shard query", "rank results"],
        parallel: true,
        children: [
          { service: "inventory", name: "GET /stock/:sku", kind: "server", weight: 0.3 },
          { service: "inventory", name: "GET /stock/:sku", kind: "server", weight: 0.3 },
          { service: "inventory", name: "GET /stock/:sku", kind: "server", weight: 0.3 },
        ],
      },
    ],
  },
  product: {
    service: "api-gateway",
    name: "GET /api/products/:id",
    kind: "server",
    parallel: true,
    children: [
      { service: "auth", name: "POST /v1/token/verify", kind: "server", weight: 0.4 },
      {
        service: "inventory",
        name: "GET /products/:id",
        kind: "server",
        internal: ["cache GET product"],
      },
      { service: "search", name: "GET /suggest", kind: "server", weight: 0.6 },
    ],
  },
  login: {
    service: "api-gateway",
    name: "POST /api/login",
    kind: "server",
    children: [
      {
        service: "auth",
        name: "POST /v1/login",
        kind: "server",
        internal: ["argon2 verify", "redis SET session"],
        children: [
          {
            service: "notifications",
            name: "publish login.new_device",
            kind: "producer",
            weight: 0.3,
          },
        ],
      },
    ],
  },
};

const ENDPOINT_FOR: Record<ServiceName, string[]> = {
  "api-gateway": ["checkout", "search", "product", "login"],
  auth: ["login", "product", "search"],
  checkout: ["checkout"],
  payments: ["checkout"],
  inventory: ["product", "search", "checkout"],
  notifications: ["checkout", "login"],
  search: ["search", "product"],
  ledger: ["checkout"],
};

/** Rebuild a trace from its id. Returns null for ids that were not minted by the mock. */
export function buildTrace(world: MockWorld, traceId: string): Trace | null {
  const d = decode(traceId);
  if (!d) return null;
  const rng = mulberry32(hashString(traceId));
  const template = ENDPOINTS[pick(rng, ENDPOINT_FOR[d.focus])];
  const spans: Span[] = [];
  const ordinals = new Map<ServiceName, number>();
  const region = pick(rng, REGIONS);

  /** Recursively lay out spans. Returns [end time, errored]. */
  const visit = (node: CallNode, parentId: string | null, start: number): [number, boolean] => {
    const ord = ordinals.get(node.service) ?? 0;
    ordinals.set(node.service, ord + 1);
    const spanId = spanIdFor(traceId, node.service, ord);
    const state = world.snapshotAt(node.service, start);
    const profile = SERVICES[node.service];
    const self =
      logNormal(rng, profile.p50 * (node.weight ?? 0.55), profile.sigma) *
      (state.p50 / profile.p50);
    let cursor = start + Math.max(0.3, self * 0.25);
    let childError = false;
    const span: Span = {
      span_id: spanId,
      parent_id: parentId,
      trace_id: traceId,
      service: node.service,
      name: node.name,
      kind: node.kind,
      start,
      duration: 0,
      status: "ok",
      attributes: {
        "service.version": profile.version,
        "cloud.region": region,
        "host.name": `${node.service}-${Math.floor(rng() * 6) + 1}`,
      },
      events: [],
    };
    spans.push(span);

    for (const op of node.internal ?? []) {
      const dur = logNormal(rng, profile.p50 * 0.2, 0.5) * (state.p50 / profile.p50);
      spans.push({
        span_id: hex(rng, 16),
        parent_id: spanId,
        trace_id: traceId,
        service: node.service,
        name: op,
        kind: op.startsWith("http") ? "client" : "internal",
        start: cursor,
        duration: dur,
        status: "ok",
        attributes: {
          "db.system": op.startsWith("pg")
            ? "postgresql"
            : op.startsWith("redis")
              ? "redis"
              : "none",
        },
        events: [],
      });
      cursor += dur + 0.2;
    }

    let latest = cursor;
    for (const child of node.children ?? []) {
      const childStart = node.parallel ? cursor + rng() * 0.8 : latest + 0.3;
      const [end, err] = visit(child, spanId, childStart);
      latest = Math.max(latest, end);
      childError ||= err;
    }

    const isFocus = node.service === d.focus && ord === 0;
    const ownError = (isFocus && d.error) || rng() < state.errorRate * 0.3;
    const errored = ownError || (childError && node.kind === "server" && rng() < 0.85);
    const end = latest + Math.max(0.4, self * 0.35);
    span.duration = end - start;
    span.status = errored ? "error" : "ok";
    if (node.kind === "server") {
      const route = node.name.split(" ");
      span.attributes["http.method"] = route[0];
      span.attributes["http.route"] = route[1] ?? node.name;
      span.attributes["http.status_code"] = errored ? pick(rng, [500, 502, 503, 504]) : 200;
    }
    if (ownError) {
      const msg =
        world.effectAt(node.service, start) > 0.3
          ? pick(rng, profile.incidentMessages)
          : pick(rng, profile.errorMessages);
      span.events.push({
        timestamp: start + span.duration * 0.8,
        name: "exception",
        attributes: { "exception.message": msg },
      });
    } else if (span.duration > state.p95) {
      span.events.push({
        timestamp: start + span.duration * 0.5,
        name: "slow_operation",
        attributes: { budget_ms: Math.round(state.p95) },
      });
    }
    return [end, errored];
  };

  visit(template, null, d.start);
  spans.sort((a, b) => a.start - b.start);
  return { ...summarize(traceId, spans), spans };
}

export function summarize(traceId: string, spans: Span[]): TraceSummary {
  const root = spans.find((s) => s.parent_id === null) ?? spans[0];
  return {
    trace_id: traceId,
    root_service: root.service,
    root_name: root.name,
    start: root.start,
    duration: root.duration,
    span_count: spans.length,
    error_count: spans.filter((s) => s.status === "error").length,
    services: Array.from(new Set(spans.map((s) => s.service))),
  };
}
