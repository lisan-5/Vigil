/**
 * Live state fed by the StreamClient (see components/live/LiveBridge).
 * Holds a rolling window of per-service snapshots, the alert list and active incidents,
 * so every page reacts to the same stream without opening its own subscriptions.
 */
import { create } from "zustand";
import type { Alert, IncidentInfo, MetricTick, ServiceName, ServiceSnapshot } from "@/api/types";
import { SERVICE_NAMES } from "@/api/types";
import type { ConnectionStatus } from "@/api/client";

const MAX_TICKS = 300;

interface LiveState {
  ticks: MetricTick[];
  alerts: Alert[];
  incidents: IncidentInfo[];
  status: ConnectionStatus;
  ready: boolean;
  setBackfill: (ticks: MetricTick[]) => void;
  pushTick: (tick: MetricTick) => void;
  setAlerts: (alerts: Alert[]) => void;
  upsertAlert: (alert: Alert) => void;
  setIncidents: (incidents: IncidentInfo[]) => void;
  setStatus: (s: ConnectionStatus) => void;
}

export const useLive = create<LiveState>()((set) => ({
  ticks: [],
  alerts: [],
  incidents: [],
  status: "connecting",
  ready: false,
  setBackfill: (ticks) => set({ ticks: ticks.slice(-MAX_TICKS), ready: true }),
  pushTick: (tick) =>
    set((s) => {
      if (s.ticks.length && s.ticks[s.ticks.length - 1].t >= tick.t) return s;
      const ticks = s.ticks.length >= MAX_TICKS ? s.ticks.slice(1) : s.ticks.slice();
      ticks.push(tick);
      return { ticks };
    }),
  setAlerts: (alerts) => set({ alerts }),
  upsertAlert: (alert) =>
    set((s) => {
      const i = s.alerts.findIndex((a) => a.id === alert.id);
      if (i === -1) return { alerts: [alert, ...s.alerts] };
      const alerts = s.alerts.slice();
      alerts[i] = alert;
      return { alerts };
    }),
  setIncidents: (incidents) => set({ incidents }),
  setStatus: (status) => set({ status }),
}));

/* ------------------------------ derived helpers ------------------------------ */

export const isOpen = (a: Alert) => a.state === "firing" || a.state === "acknowledged";

export function useOpenAlerts() {
  return useLive((s) => s.alerts).filter(isOpen);
}

export function useLatestTick(): MetricTick | undefined {
  return useLive((s) => s.ticks[s.ticks.length - 1]);
}

/** Fleet-wide totals for a tick: total rps, weighted error rate, weighted p95. */
export function fleetTotals(tick: MetricTick | undefined) {
  if (!tick) return { rps: 0, errorRate: 0, p95: 0 };
  let rps = 0;
  let err = 0;
  for (const s of SERVICE_NAMES) {
    rps += tick.services[s].rps;
    err += tick.services[s].rps * tick.services[s].errorRate;
  }
  // User-facing p95 is measured at the edge.
  return { rps, errorRate: rps ? err / rps : 0, p95: tick.services["api-gateway"].p95 };
}

export type Health = "healthy" | "degraded" | "critical";

export function healthOf(
  s: ServiceSnapshot | undefined,
  alerts: Alert[],
  name: ServiceName,
): Health {
  const open = alerts.filter((a) => isOpen(a) && a.service === name);
  if (open.some((a) => a.severity === "critical") || (s && s.errorRate > 0.05)) return "critical";
  if (open.length || (s && s.errorRate > 0.015)) return "degraded";
  return "healthy";
}
