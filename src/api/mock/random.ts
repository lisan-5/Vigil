/**
 * Deterministic randomness helpers for the mock data layer.
 * Seeding from time buckets and IDs means the same query returns the same data,
 * and a trace can be regenerated from nothing but its trace_id.
 */

/** 32-bit string hash (FNV-1a variant). */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hash two integers into a float in [0, 1). */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Small fast seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box–Muller. */
export function normal(rng: () => number): number {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Log-normal sample around a median. */
export function logNormal(rng: () => number, median: number, sigma: number): number {
  return median * Math.exp(sigma * normal(rng));
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function weightedPick<T>(
  rng: () => number,
  items: readonly T[],
  weights: readonly number[],
): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function hex(rng: () => number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += Math.floor(rng() * 16).toString(16);
  return out;
}

/** Smooth value noise in [-1, 1], interpolated between keys every `periodMs`. */
export function valueNoise(seed: number, t: number, periodMs: number): number {
  const k = Math.floor(t / periodMs);
  const f = t / periodMs - k;
  const a = hash2(seed, k) * 2 - 1;
  const b = hash2(seed, k + 1) * 2 - 1;
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
