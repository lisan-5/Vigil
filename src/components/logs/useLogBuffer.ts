/**
 * Keeps a rolling in-memory buffer of log lines: backfills the last hour, then appends
 * live batches from the stream. Filtering and facet counts run client-side on the buffer
 * so typing in the search box never waits on the network.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { stream, vigil } from "@/api";
import {
  LOG_LEVELS,
  SERVICE_NAMES,
  type LogEvent,
  type LogLevel,
  type ServiceName,
} from "@/api/types";

export const FACET_FIELDS = ["http.status", "http.method", "region", "http.route"] as const;

const MAX_LINES = 50_000;
const HOUR = 3_600_000;
const BUCKET = 60_000;

export interface LogFilters {
  levels: Set<LogLevel>;
  services: Set<ServiceName>;
  fields: Record<string, Set<string>>;
  text: string;
}

export interface Facets {
  levels: Record<LogLevel, number>;
  services: Partial<Record<ServiceName, number>>;
  fields: Record<string, Record<string, number>>;
  /** Per-minute buckets: [bucketStart, errors, warnings, other]. */
  histogram: [number, number, number, number][];
}

export function matchesFilters(l: LogEvent, f: LogFilters): boolean {
  if (f.levels.size && !f.levels.has(l.level)) return false;
  if (f.services.size && !f.services.has(l.service)) return false;
  for (const [k, vals] of Object.entries(f.fields)) {
    if (vals.size && !vals.has(String(l.fields[k]))) return false;
  }
  if (f.text) {
    const t = f.text.toLowerCase();
    if (l.message.toLowerCase().includes(t)) return true;
    if (l.trace_id?.includes(t)) return true;
    for (const v of Object.values(l.fields)) if (String(v).toLowerCase().includes(t)) return true;
    return false;
  }
  return true;
}

export function computeFacets(logs: LogEvent[], now = Date.now()): Facets {
  const levels = Object.fromEntries(LOG_LEVELS.map((l) => [l, 0])) as Record<LogLevel, number>;
  const services: Partial<Record<ServiceName, number>> = Object.fromEntries(
    SERVICE_NAMES.map((s) => [s, 0]),
  );
  const fields: Record<string, Record<string, number>> = Object.fromEntries(
    FACET_FIELDS.map((f) => [f, {}]),
  );
  const start = Math.floor((now - HOUR) / BUCKET) * BUCKET;
  const n = Math.ceil((now - start) / BUCKET);
  const histogram: [number, number, number, number][] = Array.from({ length: n }, (_, i) => [
    start + i * BUCKET,
    0,
    0,
    0,
  ]);
  for (const l of logs) {
    levels[l.level]++;
    services[l.service] = (services[l.service] ?? 0) + 1;
    for (const f of FACET_FIELDS) {
      const v = l.fields[f];
      if (v === undefined) continue;
      const key = String(v);
      fields[f][key] = (fields[f][key] ?? 0) + 1;
    }
    const b = Math.floor((l.timestamp - start) / BUCKET);
    if (b >= 0 && b < n) histogram[b][l.level === "error" ? 1 : l.level === "warn" ? 2 : 3]++;
  }
  return { levels, services, fields, histogram };
}

export function useLogBuffer(filters: LogFilters, paused: boolean) {
  const buffer = useRef<LogEvent[]>([]);
  const pending = useRef<LogEvent[]>([]);
  const pausedRef = useRef(paused);
  const filtersRef = useRef(filters);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [queued, setQueued] = useState(0);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [facets, setFacets] = useState<Facets | null>(null);

  pausedRef.current = paused;
  filtersRef.current = filters;

  // Backfill, then tail.
  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    vigil
      .queryLogs({ from: now - HOUR, to: now, limit: MAX_LINES })
      .then((r) => {
        if (cancelled) return;
        buffer.current = r.logs.slice().sort((a, b) => a.timestamp - b.timestamp);
        setLoading(false);
        setVersion((v) => v + 1);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      });

    const unsub = stream.subscribe("logs", (batch) => {
      if (pausedRef.current) {
        pending.current.push(...batch);
        const f = filtersRef.current;
        setQueued((q) => q + batch.filter((l) => matchesFilters(l, f)).length);
        return;
      }
      append(batch);
    });
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function append(batch: LogEvent[]) {
    if (!batch.length) return;
    const next = buffer.current.concat(batch);
    buffer.current = next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    const f = filtersRef.current;
    setNewIds(new Set(batch.filter((l) => matchesFilters(l, f)).map((l) => l.id)));
    setVersion((v) => v + 1);
  }

  // Flush lines that arrived while paused.
  useEffect(() => {
    if (!paused && pending.current.length) {
      const batch = pending.current;
      pending.current = [];
      append(batch);
    }
    if (!paused) setQueued(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // Fade the "new" highlight after a moment.
  useEffect(() => {
    if (!newIds.size) return;
    const t = setTimeout(() => setNewIds(new Set()), 1200);
    return () => clearTimeout(t);
  }, [newIds]);

  // Facets are relatively expensive; refresh at most once a second.
  useEffect(() => {
    if (loading) return;
    const run = () => setFacets(computeFacets(buffer.current));
    run();
    const t = setInterval(run, 1000);
    return () => clearInterval(t);
  }, [loading]);

  const all = useMemo(() => buffer.current, [version]);
  const rows = useMemo(() => all.filter((l) => matchesFilters(l, filters)), [all, filters]);

  return { rows, total: all.length, version, loading, error, queued, facets, newIds };
}
