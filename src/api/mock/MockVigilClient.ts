/**
 * MockVigilClient — implements VigilClient entirely in the browser.
 * Calls resolve after a short artificial delay so loading states are visible and honest.
 */
import type { VigilClient } from "../client";
import type {
  AlertRule,
  ApiKey,
  LogQuery,
  NotificationChannel,
  ServiceEdge,
  TraceSummary,
} from "../types";
import { SERVICE_NAMES } from "../types";
import type { ParsedQuery } from "@/lib/vigilql/types";
import { SERVICES, SERVICE_LIST } from "./catalog";
import { executeQuery } from "./execute";
import { logPredicate, scanLogs } from "./logs";
import { queryMetrics } from "./metrics";
import { hex, mulberry32, pick } from "./random";
import { buildTrace, makeTraceId, summarize } from "./traces";
import { MockWorld, nextId } from "./world";

const delay = <T>(value: T, ms = 120 + Math.random() * 220): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));
const clone = <T>(v: T): T => structuredClone(v);

export class MockVigilClient implements VigilClient {
  constructor(readonly world: MockWorld) {}

  listServices() {
    return delay(
      SERVICE_LIST.map(({ name, description, team, language, dependencies, version }) => ({
        name,
        description,
        team,
        language,
        dependencies,
        version,
      })),
    );
  }

  getServiceEdges({ to }: { from: number; to: number }) {
    const edges: ServiceEdge[] = [];
    for (const s of SERVICE_NAMES) {
      const caller = this.world.snapshotAt(s, to);
      for (const d of SERVICES[s].dependencies) {
        const target = this.world.snapshotAt(d, to);
        const share = 1 / SERVICES[s].dependencies.length;
        edges.push({
          source: s,
          target: d,
          rps: Math.min(caller.rps * share * 1.2, target.rps),
          errorRate: target.errorRate,
          p95: target.p95,
        });
      }
    }
    return delay(edges, 80);
  }

  getSnapshots({ from, to, stepMs }: { from: number; to: number; stepMs: number }) {
    const ticks = [];
    for (let t = Math.floor(from / stepMs) * stepMs; t <= to; t += stepMs)
      ticks.push({ t, services: this.world.snapshotsAt(t) });
    return delay(ticks, 150);
  }

  queryLogs(q: LogQuery) {
    const { logs, sampled } = scanLogs(this.world, q.from, q.to, 420_000);
    const pred = logPredicate(q);
    const matched = logs.filter(pred);
    const limit = q.limit ?? 1000;
    return delay({ logs: matched.slice(-limit), total: matched.length, sampled }, 200);
  }

  queryMetrics(q: Parameters<VigilClient["queryMetrics"]>[0]) {
    return delay(queryMetrics(this.world, q), 180);
  }

  queryTraces(q: Parameters<VigilClient["queryTraces"]>[0]) {
    const rng = mulberry32(Math.floor(q.to / 10_000));
    const limit = q.limit ?? 200;
    const out: TraceSummary[] = [];
    const span = q.to - q.from;
    const attempts = limit * (q.errorsOnly ? 8 : 2);
    for (let i = 0; i < attempts && out.length < limit; i++) {
      const start = q.to - rng() * span;
      const focus = q.service ?? pick(rng, SERVICE_NAMES);
      const state = this.world.snapshotAt(focus, start);
      const err = rng() < state.errorRate * 6 + 0.03;
      const id = makeTraceId(start, focus, err, rng);
      const trace = buildTrace(this.world, id);
      if (!trace) continue;
      const s = summarize(id, trace.spans);
      if (q.errorsOnly && s.error_count === 0) continue;
      if (q.minDuration && s.duration < q.minDuration) continue;
      if (q.text) {
        const t = q.text.toLowerCase();
        if (
          !s.trace_id.includes(t) &&
          !s.root_name.toLowerCase().includes(t) &&
          !s.services.some((x) => x.includes(t))
        )
          continue;
      }
      out.push(s);
    }
    out.sort((a, b) => b.start - a.start);
    return delay(out, 250);
  }

  getTrace(id: string) {
    return delay(buildTrace(this.world, id.toLowerCase()), 200);
  }

  listAlerts() {
    return delay(clone(this.world.alerts), 150);
  }

  acknowledgeAlert(id: string, by: string) {
    const a = this.world.alerts.find((x) => x.id === id);
    if (!a) return Promise.reject(new Error("Alert not found"));
    if (a.state === "firing") this.world.transition(a, "acknowledged", by);
    return delay(clone(a), 100);
  }

  resolveAlert(id: string, by: string) {
    const a = this.world.alerts.find((x) => x.id === id);
    if (!a) return Promise.reject(new Error("Alert not found"));
    if (a.state !== "resolved") this.world.transition(a, "resolved", by, "Resolved manually");
    return delay(clone(a), 100);
  }

  listAlertRules() {
    return delay(clone(this.world.rules));
  }

  saveAlertRule(input: Omit<AlertRule, "id" | "createdAt"> & { id?: string }) {
    const existing = input.id ? this.world.rules.find((r) => r.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input);
      return delay(clone(existing));
    }
    const rule: AlertRule = { ...input, id: nextId("rule"), createdAt: Date.now() };
    this.world.rules.push(rule);
    return delay(clone(rule));
  }

  deleteAlertRule(id: string) {
    this.world.rules = this.world.rules.filter((r) => r.id !== id);
    return delay(undefined);
  }

  listChannels() {
    return delay(clone(this.world.channels));
  }

  saveChannel(input: Omit<NotificationChannel, "id"> & { id?: string }) {
    const existing = input.id ? this.world.channels.find((c) => c.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input);
      return delay(clone(existing));
    }
    const ch: NotificationChannel = { ...input, id: nextId("ch") };
    this.world.channels.push(ch);
    return delay(clone(ch));
  }

  deleteChannel(id: string) {
    this.world.channels = this.world.channels.filter((c) => c.id !== id);
    return delay(undefined);
  }

  listApiKeys() {
    return delay(clone(this.world.apiKeys));
  }

  createApiKey(input: { name: string; scopes: ApiKey["scopes"] }) {
    const rng = mulberry32(Date.now() >>> 0);
    const secret = `vgl_live_${hex(rng, 32)}`;
    const key: ApiKey = {
      id: nextId("key"),
      name: input.name,
      scopes: input.scopes,
      prefix: secret.slice(0, 13),
      createdAt: Date.now(),
    };
    this.world.apiKeys.unshift(key);
    return delay({ key: clone(key), secret });
  }

  revokeApiKey(id: string) {
    this.world.apiKeys = this.world.apiKeys.filter((k) => k.id !== id);
    return delay(undefined);
  }

  async runQuery(q: ParsedQuery) {
    await delay(null, 160);
    return executeQuery(this.world, q);
  }

  listIncidents() {
    return delay(clone(this.world.activeIncidents()), 60);
  }

  simulateIncident(service?: Parameters<NonNullable<VigilClient["simulateIncident"]>>[0]) {
    return delay(clone(this.world.simulateIncident(service)), 60);
  }

  endIncident(id: string) {
    this.world.endIncident(id);
    return delay(undefined, 60);
  }
}
