/**
 * Deterministic log generation in 250ms buckets.
 * The same bucket always yields the same lines, so historical queries are stable
 * and the live tail continues seamlessly from the backfill.
 */
import type { LogEvent, LogLevel, LogQuery, ServiceName } from "../types";
import { SERVICE_NAMES } from "../types";
import { REGIONS, SERVICES, SERVICE_INDEX, VERSIONS } from "./catalog";
import { hashString, logNormal, mulberry32, pick, weightedPick } from "./random";
import { makeTraceId, spanIdFor } from "./traces";
import type { MockWorld } from "./world";

export const BUCKET_MS = 250;
/** Sampled ingest rate: ~32 lines/second across the fleet. */
const WEIGHTS = SERVICE_NAMES.map((s) => Math.sqrt(SERVICES[s].baseRps));

const USERS = ["u_8f21", "u_19ac", "u_77d0", "u_3b5e", "u_c402", "u_5e91", "u_a0f3"];

export function generateBucket(world: MockWorld, bucket: number): LogEvent[] {
  const rng = mulberry32(hashString(`b${bucket}`));
  const start = bucket * BUCKET_MS;
  const count = 6 + Math.floor(rng() * 5);
  const out: LogEvent[] = [];
  // Incidents generate extra error chatter from the affected service.
  for (const inc of world.incidents) {
    if (start >= inc.startedAt && start <= inc.endsAt) {
      const extra = Math.floor(world.effectAt(inc.service, start) * 5);
      for (let i = 0; i < extra; i++)
        out.push(makeLog(world, rng, start, bucket, out.length, inc.service, true));
    }
  }
  for (let i = 0; i < count; i++) {
    const service = weightedPick(rng, SERVICE_NAMES, WEIGHTS);
    out.push(makeLog(world, rng, start, bucket, out.length, service, false));
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

function makeLog(
  world: MockWorld,
  rng: () => number,
  bucketStart: number,
  bucket: number,
  i: number,
  service: ServiceName,
  forceError: boolean,
): LogEvent {
  const ts = bucketStart + Math.floor(rng() * BUCKET_MS);
  const state = world.snapshotAt(service, ts);
  const profile = SERVICES[service];
  const effect = world.effectAt(service, ts);
  const r = rng();
  const pErr = Math.min(0.85, state.errorRate * 5 + 0.008);
  const level: LogLevel =
    forceError || r < pErr
      ? "error"
      : r < pErr + 0.07 + effect * 0.2
        ? "warn"
        : r < pErr + 0.2
          ? "debug"
          : "info";
  const route = pick(rng, profile.routes);
  const duration = Math.round(logNormal(rng, state.p50, profile.sigma + effect * 0.2) * 10) / 10;
  const status =
    level === "error"
      ? pick(rng, [500, 502, 503, 504])
      : level === "warn"
        ? pick(rng, [200, 404, 409, 429])
        : 200;
  const message =
    level === "error"
      ? effect > 0.25 || forceError
        ? pick(rng, profile.incidentMessages)
        : pick(rng, profile.errorMessages)
      : level === "warn"
        ? pick(rng, profile.warnMessages)
        : level === "debug"
          ? `${route.method} ${route.route} cache=${rng() < 0.7 ? "hit" : "miss"}`
          : pick(rng, profile.infoMessages);

  const fields: LogEvent["fields"] = {
    "http.method": route.method,
    "http.route": route.route,
    "http.status": status,
    duration_ms: duration,
    region: weightedPick(rng, REGIONS, [0.52, 0.31, 0.17]),
    pod: `${service}-${hashString(service + (bucket % 7))
      .toString(36)
      .slice(0, 5)}`,
    version: rng() < 0.9 ? profile.version : `${profile.version}-${VERSIONS[1]}`,
  };
  if (rng() < 0.5) fields.user_id = pick(rng, USERS);

  const log: LogEvent = {
    id: `${bucket.toString(36)}-${i}`,
    timestamp: ts,
    service,
    level,
    message,
    fields,
  };
  if (level !== "debug" && rng() < 0.6) {
    log.trace_id = makeTraceId(ts - duration * 0.3, service, level === "error", rng);
    log.span_id = spanIdFor(log.trace_id, service, 0);
  }
  return log;
}

/** Compile a LogQuery into a predicate. */
export function logPredicate(
  q: Pick<LogQuery, "services" | "levels" | "text" | "fields">,
): (l: LogEvent) => boolean {
  const services = q.services?.length ? new Set(q.services) : null;
  const levels = q.levels?.length ? new Set(q.levels) : null;
  const text = q.text?.trim().toLowerCase();
  const fields = q.fields && Object.entries(q.fields);
  return (l) => {
    if (services && !services.has(l.service)) return false;
    if (levels && !levels.has(l.level)) return false;
    if (fields)
      for (const [k, v] of fields) if (String(l.fields[k] ?? (l as never)[k]) !== v) return false;
    if (text) {
      if (l.message.toLowerCase().includes(text)) return true;
      if (l.trace_id?.includes(text)) return true;
      for (const v of Object.values(l.fields))
        if (String(v).toLowerCase().includes(text)) return true;
      return false;
    }
    return true;
  };
}

/**
 * Scan logs in [from, to). When the range holds more than `maxBuckets` buckets the scan
 * samples evenly and reports `sampled` + a scale factor for count-style aggregations.
 */
export function scanLogs(world: MockWorld, from: number, to: number, maxBuckets = 16_000) {
  const first = Math.floor(from / BUCKET_MS);
  const last = Math.floor(Math.min(to, Date.now()) / BUCKET_MS) - 1;
  const total = Math.max(0, last - first + 1);
  const stride = Math.max(1, Math.ceil(total / maxBuckets));
  const logs: LogEvent[] = [];
  for (let b = first; b <= last; b += stride) {
    for (const l of generateBucket(world, b))
      if (l.timestamp >= from && l.timestamp < to) logs.push(l);
  }
  return { logs, sampled: stride > 1, scale: stride };
}

export { SERVICE_INDEX };
