/**
 * The fictional service fleet that the mock backend simulates.
 * Base values are tuned so the steady state looks like a healthy production system.
 */
import type { Service, ServiceName } from "../types";
import { SERVICE_NAMES } from "../types";

export interface ServiceProfile extends Service {
  baseRps: number;
  /** Baseline error ratio, 0..1 */
  baseError: number;
  /** Median latency in ms */
  p50: number;
  /** Log-normal spread of latency */
  sigma: number;
  baseCpu: number;
  baseMemory: number;
  routes: { method: string; route: string }[];
  /** What this service says when it is having a bad day. */
  incidentMessages: string[];
  /** Ordinary error lines. */
  errorMessages: string[];
  infoMessages: string[];
  warnMessages: string[];
}

export const SERVICES: Record<ServiceName, ServiceProfile> = {
  "api-gateway": {
    name: "api-gateway",
    description: "Edge router, auth handoff, rate limiting",
    team: "Platform",
    language: "Go",
    version: "v3.8.2",
    dependencies: ["auth", "checkout", "search", "inventory"],
    baseRps: 1240,
    baseError: 0.002,
    p50: 14,
    sigma: 0.42,
    baseCpu: 38,
    baseMemory: 612,
    routes: [
      { method: "GET", route: "/api/products/:id" },
      { method: "GET", route: "/api/search" },
      { method: "POST", route: "/api/checkout" },
      { method: "POST", route: "/api/login" },
    ],
    incidentMessages: [
      "upstream returned 502 Bad Gateway",
      "upstream request timed out after 5000ms",
    ],
    errorMessages: ["upstream connection reset by peer", "request body exceeds 1MB limit"],
    infoMessages: [
      "request completed",
      "proxied request to upstream",
      "rate limit bucket refilled",
    ],
    warnMessages: [
      "slow upstream response",
      "client closed connection early",
      "rate limit nearing threshold",
    ],
  },
  auth: {
    name: "auth",
    description: "Sessions, tokens, OAuth",
    team: "Identity",
    language: "Kotlin",
    version: "v2.21.0",
    dependencies: [],
    baseRps: 910,
    baseError: 0.003,
    p50: 8,
    sigma: 0.38,
    baseCpu: 29,
    baseMemory: 1180,
    routes: [
      { method: "POST", route: "/v1/token/verify" },
      { method: "POST", route: "/v1/login" },
      { method: "POST", route: "/v1/token/refresh" },
    ],
    incidentMessages: [
      "JWKS fetch failed: certificate has expired",
      "session store unreachable (redis: i/o timeout)",
    ],
    errorMessages: ["token signature verification failed", "refresh token reuse detected"],
    infoMessages: ["token verified", "session refreshed", "login succeeded"],
    warnMessages: ["invalid credentials", "token close to expiry", "MFA challenge timed out"],
  },
  checkout: {
    name: "checkout",
    description: "Cart to order orchestration",
    team: "Commerce",
    language: "TypeScript",
    version: "v5.4.1",
    dependencies: ["auth", "payments", "inventory", "notifications"],
    baseRps: 215,
    baseError: 0.005,
    p50: 82,
    sigma: 0.45,
    baseCpu: 44,
    baseMemory: 840,
    routes: [
      { method: "POST", route: "/checkout" },
      { method: "POST", route: "/checkout/quote" },
      { method: "GET", route: "/checkout/:id" },
    ],
    incidentMessages: [
      "payment step failed, order left pending",
      "saga compensation triggered for order",
    ],
    errorMessages: [
      "order validation failed: missing shipping address",
      "idempotency key conflict",
    ],
    infoMessages: ["order created", "quote computed", "cart locked for checkout"],
    warnMessages: ["retrying payment authorization", "inventory reservation slow"],
  },
  payments: {
    name: "payments",
    description: "Card authorization and capture",
    team: "Payments",
    language: "Java",
    version: "v4.0.7",
    dependencies: ["ledger"],
    baseRps: 138,
    baseError: 0.004,
    p50: 158,
    sigma: 0.45,
    baseCpu: 51,
    baseMemory: 2010,
    routes: [
      { method: "POST", route: "/v2/charges" },
      { method: "POST", route: "/v2/charges/:id/capture" },
      { method: "POST", route: "/v2/refunds" },
    ],
    incidentMessages: [
      "card processor timeout after 3000ms",
      "circuit breaker OPEN for processor=adyen",
      "charge failed: processor returned 503",
    ],
    errorMessages: ["card declined: insufficient_funds", "3DS challenge failed"],
    infoMessages: ["charge authorized", "capture succeeded", "refund issued"],
    warnMessages: ["processor latency above budget", "fraud score elevated, manual review"],
  },
  inventory: {
    name: "inventory",
    description: "Stock levels and reservations",
    team: "Commerce",
    language: "Go",
    version: "v1.19.3",
    dependencies: [],
    baseRps: 470,
    baseError: 0.002,
    p50: 22,
    sigma: 0.4,
    baseCpu: 33,
    baseMemory: 520,
    routes: [
      { method: "GET", route: "/stock/:sku" },
      { method: "POST", route: "/reservations" },
      { method: "GET", route: "/products/:id" },
    ],
    incidentMessages: [
      "pg: connection pool exhausted (max=50)",
      "reservation lock wait timeout exceeded",
    ],
    errorMessages: ["sku not found", "reservation expired before commit"],
    infoMessages: ["stock read", "reservation created", "cache hit for product"],
    warnMessages: ["cache miss, falling back to primary", "stock below reorder point"],
  },
  notifications: {
    name: "notifications",
    description: "Email, SMS and push fan-out",
    team: "Growth",
    language: "Python",
    version: "v0.42.0",
    dependencies: [],
    baseRps: 160,
    baseError: 0.006,
    p50: 38,
    sigma: 0.5,
    baseCpu: 22,
    baseMemory: 410,
    routes: [
      { method: "POST", route: "/send/email" },
      { method: "POST", route: "/send/push" },
    ],
    incidentMessages: ["smtp relay refused connection", "queue consumer lag above 30s"],
    errorMessages: ["invalid device token", "template render failed: missing var order_id"],
    infoMessages: ["email queued", "push delivered", "batch flushed"],
    warnMessages: ["provider throttled, backing off", "bounce rate elevated"],
  },
  search: {
    name: "search",
    description: "Catalog search and ranking",
    team: "Discovery",
    language: "Rust",
    version: "v2.3.0",
    dependencies: ["inventory"],
    baseRps: 590,
    baseError: 0.002,
    p50: 48,
    sigma: 0.44,
    baseCpu: 57,
    baseMemory: 3020,
    routes: [
      { method: "GET", route: "/search" },
      { method: "GET", route: "/suggest" },
    ],
    incidentMessages: [
      "shard search-3 unresponsive",
      "query exceeded 2000ms budget, partial results",
    ],
    errorMessages: ["malformed query syntax", "index segment checksum mismatch"],
    infoMessages: ["query served", "suggestions served", "index refreshed"],
    warnMessages: ["slow query", "result cache evicted"],
  },
  ledger: {
    name: "ledger",
    description: "Double-entry financial records",
    team: "Payments",
    language: "Elixir",
    version: "v1.7.5",
    dependencies: [],
    baseRps: 146,
    baseError: 0.001,
    p50: 28,
    sigma: 0.36,
    baseCpu: 27,
    baseMemory: 760,
    routes: [
      { method: "POST", route: "/entries" },
      { method: "GET", route: "/balances/:account" },
    ],
    incidentMessages: [
      "deadlock detected; transaction rolled back",
      "replica lag 14s, refusing reads",
    ],
    errorMessages: ["entry rejected: unbalanced transaction", "account frozen"],
    infoMessages: ["entry committed", "balance read", "reconciliation batch done"],
    warnMessages: ["write latency elevated", "retrying serialization failure"],
  },
};

export const SERVICE_LIST = SERVICE_NAMES.map((n) => SERVICES[n]);
export const SERVICE_INDEX: Record<ServiceName, number> = Object.fromEntries(
  SERVICE_NAMES.map((n, i) => [n, i]),
) as Record<ServiceName, number>;

/** Reverse dependency map: who calls me. */
export const CALLERS: Record<ServiceName, ServiceName[]> = Object.fromEntries(
  SERVICE_NAMES.map((n) => [n, SERVICE_NAMES.filter((m) => SERVICES[m].dependencies.includes(n))]),
) as Record<ServiceName, ServiceName[]>;

export const REGIONS = ["us-east-1", "eu-west-1", "ap-south-1"] as const;
export const REGION_SHARE = [0.52, 0.31, 0.17];
export const REGION_LATENCY = [1, 1.09, 1.34];
export const VERSIONS = ["stable", "canary"] as const;
export const VERSION_SHARE = [0.9, 0.1];
