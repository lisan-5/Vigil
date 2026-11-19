/**
 * The fleet as a constellation.
 *
 * Eight services are stars placed in 3D; their real call graph is drawn as faint arcs,
 * and thousands of request "packets" stream along those arcs (additive blending, short
 * trails). The sky turns slowly and tilts toward the pointer; hovering a star names it.
 * Plain canvas 2D with a hand-rolled perspective projection — no WebGL dependency.
 * Pauses off-screen / in hidden tabs; a single still frame for reduced motion.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type V3 = [number, number, number];

const NODES: { name: string; p: V3; rps: number }[] = [
  { name: "api-gateway", p: [-1.05, 0.05, 0.1], rps: 1240 },
  { name: "checkout", p: [-0.2, -0.55, 0.45], rps: 260 },
  { name: "search", p: [-0.25, 0.62, -0.35], rps: 640 },
  { name: "auth", p: [0.45, -0.1, -0.7], rps: 1150 },
  { name: "payments", p: [0.62, -0.72, 0.25], rps: 160 },
  { name: "inventory", p: [0.55, 0.55, 0.4], rps: 520 },
  { name: "notifications", p: [0.2, -0.2, 0.95], rps: 180 },
  { name: "ledger", p: [1.2, -0.35, -0.2], rps: 150 },
];
const EDGES: [number, number][] = [
  [0, 3],
  [0, 1],
  [0, 2],
  [0, 5],
  [1, 3],
  [1, 4],
  [1, 5],
  [1, 6],
  [4, 7],
  [2, 5],
];

const INK = "239,232,220";

function glowSprite(rgb: string, size = 64) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(0.12, `rgba(${rgb},0.85)`);
  grad.addColorStop(0.35, `rgba(${rgb},0.18)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Point on a quadratic arc from a to b, bowed away from the origin. */
function arc(a: V3, b: V3, t: number): V3 {
  const m: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const len = Math.hypot(...m) || 1;
  const c: V3 = [
    m[0] + (m[0] / len) * 0.35,
    m[1] + (m[1] / len) * 0.35,
    m[2] + (m[2] / len) * 0.35,
  ];
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    u * u * a[2] + 2 * u * t * c[2] + t * t * b[2],
  ];
}

export function Constellation({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sprite = glowSprite(INK);

    let w = 0;
    let h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Background stars on a big shell, plus packets riding the edges.
    let seed = 412;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const stars = Array.from({ length: 420 }, () => {
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      const r = 2.4 + rand() * 2.2;
      return {
        p: [
          r * Math.sin(ph) * Math.cos(th),
          r * Math.cos(ph),
          r * Math.sin(ph) * Math.sin(th),
        ] as V3,
        tw: rand() * Math.PI * 2,
        s: 0.4 + rand() * 0.9,
      };
    });
    const packets = EDGES.flatMap(([a, b]) => {
      const load = Math.sqrt(Math.min(NODES[a].rps, NODES[b].rps));
      const n = Math.round(load * 1.3);
      return Array.from({ length: n }, () => ({
        a,
        b,
        t: rand(),
        v: 0.12 + rand() * 0.22,
        jitter: (rand() - 0.5) * 0.05,
      }));
    });

    const pointer = { x: 0, y: 0, tx: 0, ty: 0, px: -1, py: -1 };
    const onMove = (e: PointerEvent) => {
      pointer.tx = (e.clientX / innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / innerHeight) * 2 - 1;
      const r = canvas.getBoundingClientRect();
      pointer.px = e.clientX - r.left;
      pointer.py = e.clientY - r.top;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let yaw = 0.6;
    let raf = 0;
    let last = performance.now();
    let running = false;

    const project = (p: V3, ry: number, rx: number) => {
      // rotate around Y then X
      const cy = Math.cos(ry);
      const sy = Math.sin(ry);
      const x1 = p[0] * cy + p[2] * sy;
      const z1 = -p[0] * sy + p[2] * cy;
      const cx = Math.cos(rx);
      const sx = Math.sin(rx);
      const y2 = p[1] * cx - z1 * sx;
      const z2 = p[1] * sx + z1 * cx;
      const scale = Math.min(w, h) * 0.42;
      const persp = 3.2 / (3.2 + z2);
      return { x: w / 2 + x1 * scale * persp, y: h / 2 + y2 * scale * persp, z: z2, k: persp };
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) yaw += dt * 0.06;
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      const ry = yaw + pointer.x * 0.35;
      const rx = -0.18 + pointer.y * 0.22;
      const t = now / 1000;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      for (const s of stars) {
        const q = project(s.p, ry * 0.4, rx * 0.4);
        const a = (0.25 + 0.35 * Math.sin(t * 1.3 + s.tw)) * Math.max(0, q.k - 0.35);
        if (a <= 0.02) continue;
        ctx.fillStyle = `rgba(${INK},${a})`;
        ctx.fillRect(q.x, q.y, s.s, s.s);
      }

      const proj = NODES.map((n) => project(n.p, ry, rx));

      // faint arcs
      ctx.lineWidth = 1;
      for (const [a, b] of EDGES) {
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const q = project(arc(NODES[a].p, NODES[b].p, i / 24), ry, rx);
          if (i) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
        }
        ctx.strokeStyle = `rgba(${INK},0.07)`;
        ctx.stroke();
      }

      // packets with short trails
      for (const pk of packets) {
        if (!reduced) pk.t += pk.v * dt;
        if (pk.t > 1) pk.t -= 1;
        const head = project(arc(NODES[pk.a].p, NODES[pk.b].p, pk.t), ry, rx);
        const tail = project(arc(NODES[pk.a].p, NODES[pk.b].p, Math.max(0, pk.t - 0.035)), ry, rx);
        const fade = Math.sin(pk.t * Math.PI);
        ctx.strokeStyle = `rgba(${INK},${0.5 * fade * head.k})`;
        ctx.lineWidth = 1.2 * head.k;
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y + pk.jitter * 20);
        ctx.lineTo(head.x, head.y + pk.jitter * 20);
        ctx.stroke();
      }

      // stars for services, nearest last
      const order = proj.map((q, i) => ({ q, i })).sort((x, y) => x.q.z - y.q.z);
      let hover = -1;
      for (const { q, i } of order) {
        if (Math.hypot(q.x - pointer.px, q.y - pointer.py) < 26) hover = i;
      }
      for (const { q, i } of order) {
        const base = 26 + Math.sqrt(NODES[i].rps) * 1.1;
        const pulse = 1 + 0.08 * Math.sin(t * 2 + i);
        const size = base * q.k * pulse * (i === hover ? 1.5 : 1);
        ctx.globalAlpha = Math.min(1, 0.55 + q.k * 0.4);
        ctx.drawImage(sprite, q.x - size / 2, q.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // labels
      ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.textBaseline = "middle";
      for (const { q, i } of order) {
        const on = i === hover;
        ctx.fillStyle = `rgba(${INK},${on ? 0.95 : 0.32 * q.k})`;
        ctx.fillText(NODES[i].name, q.x + 12 * q.k + 4, q.y);
        if (on) {
          ctx.fillStyle = `rgba(${INK},0.55)`;
          ctx.fillText(`${NODES[i].rps} req/s · ok`, q.x + 12 * q.k + 4, q.y + 13);
        }
      }

      if (!reduced) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || reduced) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    });
    io.observe(canvas);
    const onVis = () => (document.hidden || !visible ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    if (reduced) frame(performance.now());
    else start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-label="The eight services as a constellation, with requests flowing between them"
      role="img"
      className={cn("h-full w-full", className)}
    />
  );
}
