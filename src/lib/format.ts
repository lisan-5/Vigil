/** Formatting helpers. Numbers are always rendered with tabular figures in the UI. */
import type { RelativeRange, TimeRange } from "@/api/types";

export const RANGE_MS: Record<RelativeRange, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": 7 * 24 * 3_600_000,
};
export const RANGE_LABEL: Record<RelativeRange, string> = {
  "5m": "Last 5 minutes",
  "15m": "Last 15 minutes",
  "1h": "Last hour",
  "6h": "Last 6 hours",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
};

export function resolveRange(r: TimeRange, now = Date.now()): { from: number; to: number } {
  return r.kind === "relative"
    ? { from: now - RANGE_MS[r.value], to: now }
    : { from: r.from, to: r.to };
}

/** A sensible chart step for a range: ~120 points. */
export function stepFor(spanMs: number): number {
  const raw = spanMs / 120;
  const steps = [1000, 5000, 10_000, 30_000, 60_000, 300_000, 600_000, 1_800_000, 3_600_000];
  return steps.find((s) => s >= raw) ?? 3_600_000;
}

export function rangeLabel(r: TimeRange): string {
  if (r.kind === "relative") return RANGE_LABEL[r.value];
  return `${fmtClock(r.from)} – ${fmtClock(r.to)}`;
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 10_000) return (n / 1000).toFixed(1) + "k";
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(2) + "k";
  return n.toFixed(n < 10 && n % 1 !== 0 ? 1 : 0);
}

export function fmtMs(ms: number): string {
  if (ms >= 10_000) return (ms / 1000).toFixed(1) + "s";
  if (ms >= 1000) return (ms / 1000).toFixed(2) + "s";
  if (ms >= 100) return Math.round(ms) + "ms";
  if (ms >= 1) return ms.toFixed(1) + "ms";
  return (ms * 1000).toFixed(0) + "µs";
}

export const fmtPct = (ratio: number, digits = 2) => (ratio * 100).toFixed(digits) + "%";

export function fmtClock(t: number, withSeconds = true): string {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return withSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

export function fmtLogTime(t: number): string {
  return `${fmtClock(t)}.${String(new Date(t).getMilliseconds()).padStart(3, "0")}`;
}

export function fmtDateTime(t: number): string {
  const d = new Date(t);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${fmtClock(t, false)}`;
}

export function fmtAgo(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Format a metric value given its unit. */
export function fmtMetric(v: number, unit: string): string {
  switch (unit) {
    case "ms":
      return fmtMs(v);
    case "percent":
      return v.toFixed(v < 10 ? 2 : 1) + "%";
    case "rps":
      return fmtCompact(v) + "/s";
    case "bytes":
      return v >= 1024 ? (v / 1024).toFixed(2) + " GB" : Math.round(v) + " MB";
    default:
      return fmtCompact(v);
  }
}
