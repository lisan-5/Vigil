/**
 * Drifting smoke, drawn on a canvas.
 *
 * A handful of pre-rendered, textured puffs are stamped with rotation, scale and alpha.
 * They rise, curl on a cheap sine "wind" field and get pushed aside by the pointer.
 * The loop pauses while the canvas is off-screen or the tab is hidden, and the effect
 * is skipped entirely for prefers-reduced-motion.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  grow: number;
  /** Horizontal stretch — smoke spreads more than it rises. */
  stretch: number;
  rot: number;
  spin: number;
  life: number;
  ttl: number;
  sprite: number;
}

const SPRITES = 4;
const SPRITE_SIZE = 256;

function makeSprite(rgb: string, seed: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = SPRITE_SIZE;
  const g = c.getContext("2d")!;
  let s = seed * 9301 + 49297;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const half = SPRITE_SIZE / 2;
  // Many soft overlapping blobs make a wispy, uneven puff instead of a flat disc.
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.pow(rand(), 0.7) * half * 0.62;
    const x = half + Math.cos(a) * d;
    const y = half + Math.sin(a) * d;
    const r = half * (0.12 + rand() * 0.3);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${rgb},${0.035 + rand() * 0.05})`);
    grad.addColorStop(0.55, `rgba(${rgb},${0.012 + rand() * 0.02})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  }
  // Soften the whole sprite so edges never read as a disc.
  const soft = document.createElement("canvas");
  soft.width = soft.height = SPRITE_SIZE;
  const sg = soft.getContext("2d")!;
  sg.filter = "blur(10px)";
  sg.drawImage(c, 0, 0);
  return soft;
}

export function Smoke({
  rgb = "38,33,29",
  intensity = 1,
  origin = "bottom",
  className,
}: {
  /** Smoke colour as "r,g,b". */
  rgb?: string;
  /** Multiplier for puff count and opacity. */
  intensity?: number;
  /** Where puffs are born. */
  origin?: "bottom" | "left";
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sprites = Array.from({ length: SPRITES }, (_, i) => makeSprite(rgb, i + 1));
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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

    const pointer = { x: -9999, y: -9999, vx: 0, vy: 0 };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      pointer.vx = x - pointer.x;
      pointer.vy = y - pointer.y;
      pointer.x = x;
      pointer.y = y;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const max = Math.round((w < 640 ? 34 : 70) * Math.max(0.6, intensity));
    const puffs: Puff[] = [];
    const spawn = (anywhere: boolean): Puff => {
      const fromLeft = origin === "left";
      const ttl = 9 + Math.random() * 9;
      return {
        x: fromLeft ? -60 + Math.random() * w * 0.3 : Math.random() * w,
        y: anywhere ? Math.random() * h : h + 40 + Math.random() * 60,
        vx: fromLeft ? 12 + Math.random() * 18 : (Math.random() - 0.5) * 10,
        vy: -(10 + Math.random() * 22),
        r: 140 + Math.random() * 200,
        grow: 10 + Math.random() * 16,
        stretch: 1.5 + Math.random() * 0.9,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.25,
        life: anywhere ? Math.random() * ttl : 0,
        ttl,
        sprite: Math.floor(Math.random() * SPRITES),
      };
    };
    for (let i = 0; i < max; i++) puffs.push(spawn(true));

    let raf = 0;
    let last = performance.now();
    let running = false;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < puffs.length; i++) {
        let p = puffs[i];
        p.life += dt;
        if (p.life > p.ttl || p.y < -p.r * 2 || p.x > w + p.r * 2) {
          p = puffs[i] = spawn(false);
        }
        // Wind: slow sine field so neighbouring puffs curl together.
        const wind = Math.sin(p.y * 0.006 + t * 0.35) * 14 + Math.cos(p.x * 0.004 - t * 0.2) * 8;
        // Pointer pushes nearby smoke away and drags it along a little.
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        const reach = p.r * 1.4;
        if (d2 < reach * reach) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / reach) * 90;
          p.vx += (dx / d) * f * dt + pointer.vx * 0.6 * dt;
          p.vy += (dy / d) * f * dt + pointer.vy * 0.6 * dt;
        }
        p.vx *= 0.995;
        p.vy *= 0.995;
        p.x += (p.vx + wind) * dt;
        p.y += p.vy * dt;
        p.r += p.grow * dt;
        p.rot += p.spin * dt;

        // Fade in, hold, fade out.
        const k = p.life / p.ttl;
        const alpha = Math.min(1, k * 4) * Math.min(1, (1 - k) * 2.5) * 0.9 * intensity;
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(p.rot) * 0.35);
        ctx.scale(p.stretch, 1);
        ctx.drawImage(sprites[p.sprite], -p.r, -p.r, p.r * 2, p.r * 2);
        ctx.restore();
      }
      pointer.vx *= 0.8;
      pointer.vy *= 0.8;
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running) return;
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
    start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [rgb, intensity, origin]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    />
  );
}
