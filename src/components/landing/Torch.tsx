/**
 * A wall of log lines in the dark, lit by a torch that follows the pointer.
 *
 * Two copies of the same text are stacked: a barely-there base layer and a bright layer
 * masked by a radial gradient at the torch position. The position is eased toward the
 * pointer in a rAF loop and written straight to CSS variables (no React re-renders).
 * With no pointer (touch, or idle for a few seconds) the torch wanders on its own.
 * Somewhere in the wall is the one red line that woke Dana.
 */
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

const SERVICES = [
  "gateway",
  "auth",
  "checkout",
  "payments",
  "inventory",
  "search",
  "ledger",
  "notify",
];
const MSGS = [
  "GET /api/products/:id 200",
  "POST /orders 201",
  "cache hit sku=A-1182",
  "token refreshed",
  "charge ok 48.00",
  "reserve ok qty=2",
  "GET /q?term=boots 200",
  "batch flushed n=64",
  "conn pool 12/64",
  "heartbeat ok",
  "span exported",
  "retry scheduled backoff=200ms",
  "rate bucket refilled",
  "ledger entry committed",
];
const NEEDLE = "02:14:03.118 ERROR payments  stripe timeout after 3 retries  trace=9f2c…a1";
const NEEDLE_ROW = 0.62;

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function buildLines(rows: number) {
  const r = seeded(20140214);
  const lines: string[] = [];
  let sec = 7200 + 13 * 60;
  for (let i = 0; i < rows; i++) {
    let line = "";
    while (line.length < 260) {
      sec += Math.floor(r() * 3);
      const hh = String(Math.floor(sec / 3600) % 24).padStart(2, "0");
      const mm = String(Math.floor(sec / 60) % 60).padStart(2, "0");
      const ss = String(sec % 60).padStart(2, "0");
      const ms = String(Math.floor(r() * 1000)).padStart(3, "0");
      const lvl = r() < 0.12 ? "DEBUG" : "INFO ";
      const svc = SERVICES[Math.floor(r() * SERVICES.length)].padEnd(9);
      const msg = MSGS[Math.floor(r() * MSGS.length)];
      line += `${hh}:${mm}:${ss}.${ms} ${lvl} ${svc} ${msg} · ${Math.floor(4 + r() * 180)}ms    `;
    }
    lines.push(line);
  }
  return lines;
}

export function TorchField({ className, rows = 56 }: { className?: string; rows?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => buildLines(rows), [rows]);
  const needleAt = Math.floor(rows * NEEDLE_ROW);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    let rect = el.getBoundingClientRect();
    const target = { x: rect.width * 0.7, y: rect.height * 0.45 };
    const pos = { ...target };
    let lastMove = fine ? performance.now() - 10_000 : -Infinity;

    const set = () => {
      el.style.setProperty("--mx", `${pos.x}px`);
      el.style.setProperty("--my", `${pos.y}px`);
    };
    set();
    if (reduced) return;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      rect = el.getBoundingClientRect();
      target.x = e.clientX - rect.left;
      target.y = e.clientY - rect.top;
      lastMove = performance.now();
    };
    const onResize = () => (rect = el.getBoundingClientRect());
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", onResize);

    let raf = 0;
    const loop = (now: number) => {
      if (now - lastMove > 3500) {
        // Idle: wander a slow Lissajous path over the wall.
        const t = now / 1000;
        target.x = rect.width * (0.5 + 0.36 * Math.sin(t * 0.23));
        target.y = rect.height * (0.5 + 0.3 * Math.sin(t * 0.31 + 1.3));
      }
      pos.x += (target.x - pos.x) * 0.09;
      pos.y += (target.y - pos.y) * 0.09;
      set();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const wall = (lit: boolean) => (
    <pre
      aria-hidden
      className={cn(
        "absolute inset-0 m-0 select-none overflow-hidden whitespace-pre font-plexmono text-[11px] leading-[19px]",
        lit ? "text-ink/70" : "text-ink/[0.07]",
      )}
      style={
        lit
          ? {
              maskImage:
                "radial-gradient(circle 230px at var(--mx) var(--my), #000 0%, rgba(0,0,0,.55) 45%, transparent 100%)",
              WebkitMaskImage:
                "radial-gradient(circle 230px at var(--mx) var(--my), #000 0%, rgba(0,0,0,.55) 45%, transparent 100%)",
            }
          : undefined
      }
    >
      {lines.map((l, i) =>
        i === needleAt ? (
          <div key={i}>
            {l.slice(0, 38)}
            <span className={lit ? "text-signal" : "text-signal/40"}>{NEEDLE}</span>
            {l.slice(38 + NEEDLE.length)}
          </div>
        ) : (
          <div key={i}>{l}</div>
        ),
      )}
    </pre>
  );

  return (
    <div ref={ref} className={cn("pointer-events-none absolute inset-0", className)}>
      {wall(false)}
      {wall(true)}
      {/* the warm cone of light itself */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle 320px at var(--mx) var(--my), rgba(255,214,150,.07), transparent 70%)",
        }}
      />
    </div>
  );
}

/** Fine print-grain over the whole page — the "printed log" texture. */
export function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] opacity-[0.07] mix-blend-multiply"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      }}
    />
  );
}
