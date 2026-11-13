/**
 * MockWorld — the single source of truth for the simulated system.
 *
 * Everything (metrics, logs, traces, alerts) is derived from `snapshotAt(service, t)`,
 * a deterministic function of time plus the list of incidents. That keeps every view
 * consistent: an error spike in the metrics shows up as error logs, red spans and alerts.
 */
import type {
  Alert,
  AlertRule,
  AlertState,
  ApiKey,
  IncidentInfo,
  MetricName,
  NotificationChannel,
  ServiceName,
  ServiceSnapshot,
} from "../types";
import { SERVICE_NAMES } from "../types";
import type { AlertStreamEvent, IncidentStreamEvent } from "../client";
import { CALLERS, SERVICES, SERVICE_INDEX } from "./catalog";
import { clamp, hash2, valueNoise } from "./random";

const MIN = 60_000;
const HOUR = 60 * MIN;
const RAMP_IN = 8_000;
const RAMP_OUT = 15_000;

type Listener<T> = (event: T) => void;

function smoothstep(x: number) {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
}

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

let idCounter = 0;
export const nextId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export class MockWorld {
  incidents: IncidentInfo[] = [];
  alerts: Alert[] = [];
  rules: AlertRule[] = [];
  channels: NotificationChannel[] = [];
  apiKeys: ApiKey[] = [];
  private simulatedCount = 0;
  private alertListeners = new Set<Listener<AlertStreamEvent>>();
  private incidentListeners = new Set<Listener<IncidentStreamEvent>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private clearSince = new Map<string, number>();
  private endedIncidents = new Set<string>();

  constructor(now = Date.now()) {
    this.seed(now);
  }

  /* ------------------------------ physics ------------------------------ */

  /** Incident effect in [0, 1] for a service at time t, including upstream propagation. */
  effectAt(service: ServiceName, t: number): number {
    let effect = 0;
    for (const inc of this.incidents) {
      if (t < inc.startedAt || t > inc.endsAt + RAMP_OUT) continue;
      const rampIn = smoothstep((t - inc.startedAt) / RAMP_IN);
      const rampOut = t > inc.endsAt ? 1 - smoothstep((t - inc.endsAt) / RAMP_OUT) : 1;
      const strength = rampIn * rampOut;
      const hops = this.hopsTo(service, inc.service);
      if (hops < 0) continue;
      effect = Math.max(effect, strength * Math.pow(0.45, hops));
    }
    return effect;
  }

  /** Number of caller hops from `from` down to `target`, -1 if `from` never calls it. */
  private hopsTo(from: ServiceName, target: ServiceName): number {
    if (from === target) return 0;
    const seen = new Set<ServiceName>([target]);
    let frontier: ServiceName[] = [target];
    for (let hops = 1; hops < 4; hops++) {
      const next: ServiceName[] = [];
      for (const s of frontier) {
        for (const caller of CALLERS[s]) {
          if (caller === from) return hops;
          if (!seen.has(caller)) {
            seen.add(caller);
            next.push(caller);
          }
        }
      }
      frontier = next;
    }
    return -1;
  }

  /** Deterministic health snapshot of a service at time t. */
  snapshotAt(service: ServiceName, t: number): ServiceSnapshot {
    const p = SERVICES[service];
    const idx = SERVICE_INDEX[service];
    const day = Math.sin((2 * Math.PI * t) / (24 * HOUR) - 1.2 + idx * 0.1);
    const diurnal = 1 + 0.22 * day;
    const wobble = 1 + 0.07 * Math.sin(t / 97_000 + idx) + 0.04 * Math.sin(t / 23_000 + idx * 2);
    const n1 = valueNoise(idx * 7 + 1, t, 5_000);
    const n2 = valueNoise(idx * 7 + 2, t, 3_000);
    const effect = this.effectAt(service, t);

    // Occasional short-lived error bursts (a few per day per service) keep things believable.
    const minute = Math.floor(t / MIN);
    const burst = hash2(idx + 100, minute) < 0.012 && (t % MIN) / MIN < 0.4 ? 0.018 : 0;

    const rps = p.baseRps * diurnal * wobble * (1 + 0.05 * n1) * (1 - effect * 0.12);
    const errorRate = clamp(p.baseError * (1 + 0.6 * Math.abs(n2)) + burst + effect * 0.17, 0, 1);
    const sigma = p.sigma + effect * 0.25;
    const p50 = p.p50 * (1 + 0.08 * n1 + 0.05 * day) * (1 + effect * 2.2);
    const p95 = p50 * Math.exp(1.645 * sigma);
    const p99 = p50 * Math.exp(2.326 * sigma) * (1 + 0.1 * Math.abs(n2));
    const cpu = clamp(p.baseCpu * (rps / p.baseRps) * (1 + effect * 0.7) + 3 * n2, 2, 99);
    const gc = ((t / 1000 + idx * 37) % 180) / 180; // GC sawtooth over 3 minutes
    const memory = p.baseMemory * (0.92 + 0.12 * gc) * (1 + effect * 0.15);
    return { service, rps, errorRate, p50, p95, p99, cpu, memory };
  }

  snapshotsAt(t: number): Record<ServiceName, ServiceSnapshot> {
    const out = {} as Record<ServiceName, ServiceSnapshot>;
    for (const s of SERVICE_NAMES) out[s] = this.snapshotAt(s, t);
    return out;
  }

  /* ------------------------------ incidents ------------------------------ */

  activeIncidents(now = Date.now()): IncidentInfo[] {
    return this.incidents.filter((i) => i.simulated && now >= i.startedAt && now <= i.endsAt);
  }

  simulateIncident(service?: ServiceName, durationMs = 120_000): IncidentInfo {
    const now = Date.now();
    const candidates: ServiceName[] = [
      "payments",
      "inventory",
      "auth",
      "search",
      "ledger",
      "notifications",
    ];
    // The first simulated incident always hits payments — the most dramatic cascade for a demo.
    const target =
      service ??
      (this.simulatedCount === 0
        ? "payments"
        : candidates[Math.floor(Math.random() * candidates.length)]);
    this.simulatedCount++;
    const incident: IncidentInfo = {
      id: nextId("inc"),
      service: target,
      startedAt: now,
      endsAt: now + durationMs,
      simulated: true,
    };
    this.incidents.push(incident);
    this.emitIncident({ type: "incident.started", incident });
    return incident;
  }

  endIncident(id: string) {
    const inc = this.incidents.find((i) => i.id === id);
    if (inc && inc.endsAt > Date.now()) inc.endsAt = Date.now();
    this.checkIncidentEnds();
  }

  private checkIncidentEnds() {
    const now = Date.now();
    for (const inc of this.incidents) {
      if (inc.simulated && inc.endsAt <= now && !this.endedIncidents.has(inc.id)) {
        this.endedIncidents.add(inc.id);
        this.emitIncident({ type: "incident.ended", incident: inc });
      }
    }
  }

  /* ------------------------------ alerts ------------------------------ */

  /** Evaluate every enabled rule against the current state. */
  evaluate(now = Date.now()) {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      const services = rule.service === "*" ? SERVICE_NAMES : [rule.service];
      // The mock compresses evaluation windows to at most 20s so the demo reacts quickly.
      const windowMs = Math.min(rule.windowSec, 20) * 1000;
      for (const service of services) {
        let sum = 0;
        const samples = 8;
        for (let i = 0; i < samples; i++) {
          sum += metricValue(this.snapshotAt(service, now - (windowMs * i) / samples), rule.metric);
        }
        const value = sum / samples;
        const breached = rule.op === ">" ? value > rule.threshold : value < rule.threshold;
        const key = `${rule.id}:${service}`;
        const open = this.alerts.find(
          (a) =>
            a.ruleId === rule.id &&
            a.service === service &&
            (a.state === "firing" || a.state === "acknowledged"),
        );
        if (breached) {
          this.clearSince.delete(key);
          if (!open) {
            const alert: Alert = {
              id: nextId("alr"),
              ruleId: rule.id,
              ruleName: rule.name,
              service,
              severity: rule.severity,
              state: "firing",
              metric: rule.metric,
              threshold: rule.threshold,
              op: rule.op,
              value,
              startedAt: now,
              updatedAt: now,
              history: [
                {
                  at: now,
                  from: "ok",
                  to: "firing",
                  by: "vigil",
                  note: `Observed ${value.toFixed(2)}`,
                },
              ],
            };
            this.alerts.unshift(alert);
            this.emitAlert({ type: "alert.fired", alert });
          } else {
            open.value = value;
          }
        } else if (open) {
          const since = this.clearSince.get(key) ?? now;
          this.clearSince.set(key, since);
          if (now - since >= 8_000) {
            this.transition(open, "resolved", "vigil", "Condition cleared");
            this.clearSince.delete(key);
          }
        }
      }
    }
  }

  transition(alert: Alert, to: AlertState, by: string, note?: string): Alert {
    const now = Date.now();
    alert.history.push({ at: now, from: alert.state, to, by, note });
    alert.state = to;
    alert.updatedAt = now;
    if (to === "resolved") alert.resolvedAt = now;
    this.emitAlert({ type: to === "resolved" ? "alert.resolved" : "alert.updated", alert });
    return alert;
  }

  /* ------------------------------ events ------------------------------ */

  onAlert(l: Listener<AlertStreamEvent>) {
    this.alertListeners.add(l);
    this.ensureRunning();
    return () => this.alertListeners.delete(l);
  }
  onIncident(l: Listener<IncidentStreamEvent>) {
    this.incidentListeners.add(l);
    this.ensureRunning();
    return () => this.incidentListeners.delete(l);
  }
  private emitAlert(e: AlertStreamEvent) {
    const copy = { ...e, alert: { ...e.alert, history: [...e.alert.history] } };
    this.alertListeners.forEach((l) => l(copy));
  }
  private emitIncident(e: IncidentStreamEvent) {
    this.incidentListeners.forEach((l) => l({ ...e, incident: { ...e.incident } }));
  }

  /** Background evaluation loop — only started in the browser, on first subscription. */
  ensureRunning() {
    if (this.timer || typeof window === "undefined") return;
    this.timer = setInterval(() => {
      this.evaluate();
      this.checkIncidentEnds();
    }, 2_000);
  }

  /* ------------------------------ seed data ------------------------------ */

  private seed(now: number) {
    this.channels = [
      {
        id: "ch_pager",
        kind: "pagerduty",
        name: "On-call pager",
        target: "vigil-primary",
        enabled: true,
      },
      { id: "ch_ops", kind: "slack", name: "#ops-alerts", target: "#ops-alerts", enabled: true },
      {
        id: "ch_email",
        kind: "email",
        name: "Platform team",
        target: "platform@acme.dev",
        enabled: true,
      },
      {
        id: "ch_hook",
        kind: "webhook",
        name: "Incident bot",
        target: "https://hooks.acme.dev/vigil",
        enabled: false,
      },
    ];
    const created = now - 30 * 24 * HOUR;
    this.rules = [
      {
        id: "rule_err",
        name: "Error rate above 5%",
        metric: "errors.rate",
        service: "*",
        op: ">",
        threshold: 5,
        windowSec: 60,
        severity: "critical",
        channelId: "ch_pager",
        enabled: true,
        createdAt: created,
      },
      {
        id: "rule_lat",
        name: "p95 latency above 800ms",
        metric: "latency.p95",
        service: "*",
        op: ">",
        threshold: 800,
        windowSec: 300,
        severity: "warning",
        channelId: "ch_ops",
        enabled: true,
        createdAt: created,
      },
      {
        id: "rule_tput",
        name: "Checkout throughput below 60 rps",
        metric: "requests.rate",
        service: "checkout",
        op: "<",
        threshold: 60,
        windowSec: 300,
        severity: "warning",
        channelId: "ch_ops",
        enabled: true,
        createdAt: created,
      },
      {
        id: "rule_cpu",
        name: "Search CPU above 90%",
        metric: "cpu.usage",
        service: "search",
        op: ">",
        threshold: 90,
        windowSec: 600,
        severity: "info",
        channelId: "ch_email",
        enabled: false,
        createdAt: created,
      },
    ];
    this.apiKeys = [
      {
        id: "key_1",
        name: "Production ingest",
        prefix: "vgl_live_3f9a",
        scopes: ["ingest"],
        createdAt: now - 41 * 24 * HOUR,
        lastUsedAt: now - 12_000,
      },
      {
        id: "key_2",
        name: "Grafana read-only",
        prefix: "vgl_live_b71c",
        scopes: ["read"],
        createdAt: now - 12 * 24 * HOUR,
        lastUsedAt: now - 3 * HOUR,
      },
      {
        id: "key_3",
        name: "CI deploy markers",
        prefix: "vgl_live_0d4e",
        scopes: ["write"],
        createdAt: now - 3 * 24 * HOUR,
      },
    ];

    // Historical incidents, so the past 24h has some texture.
    const past: { service: ServiceName; ago: number; dur: number }[] = [
      { service: "inventory", ago: 3.2 * HOUR, dur: 14 * MIN },
      { service: "auth", ago: 9.1 * HOUR, dur: 7 * MIN },
      { service: "notifications", ago: 17.5 * HOUR, dur: 22 * MIN },
    ];
    for (const p of past) {
      const startedAt = now - p.ago;
      this.incidents.push({
        id: nextId("inc"),
        service: p.service,
        startedAt,
        endsAt: startedAt + p.dur,
        simulated: false,
      });
      const ackAt = startedAt + 2.5 * MIN;
      const resolvedAt = startedAt + p.dur + 40_000;
      this.alerts.push({
        id: nextId("alr"),
        ruleId: "rule_err",
        ruleName: "Error rate above 5%",
        service: p.service,
        severity: "critical",
        state: "resolved",
        metric: "errors.rate",
        threshold: 5,
        op: ">",
        value: 13.4,
        startedAt,
        updatedAt: resolvedAt,
        resolvedAt,
        history: [
          { at: startedAt, from: "ok", to: "firing", by: "vigil", note: "Observed 13.40" },
          { at: ackAt, from: "firing", to: "acknowledged", by: "maya.chen" },
          {
            at: resolvedAt,
            from: "acknowledged",
            to: "resolved",
            by: "vigil",
            note: "Condition cleared",
          },
        ],
      });
    }
    const latAt = now - 5.6 * HOUR;
    this.alerts.push({
      id: nextId("alr"),
      ruleId: "rule_lat",
      ruleName: "p95 latency above 800ms",
      service: "search",
      severity: "warning",
      state: "resolved",
      metric: "latency.p95",
      threshold: 800,
      op: ">",
      value: 912,
      startedAt: latAt,
      updatedAt: latAt + 6 * MIN,
      resolvedAt: latAt + 6 * MIN,
      history: [
        { at: latAt, from: "ok", to: "firing", by: "vigil", note: "Observed 912.00" },
        {
          at: latAt + 6 * MIN,
          from: "firing",
          to: "resolved",
          by: "dev.okafor",
          note: "Reindex finished",
        },
      ],
    });
    this.alerts.sort((a, b) => b.startedAt - a.startedAt);
  }
}
