/**
 * Kinetic display type. Each letter of the headline swells along Archivo's width and
 * weight axes as the pointer approaches — a lens moving over printed type.
 * Values ease every frame and are written straight to the DOM (no re-renders).
 * Fine pointers only; static for reduced motion and touch.
 */
import { useEffect, type RefObject } from "react";

const BASE_W = 62;
const MAX_W = 100;
const BASE_G = 800;
const MAX_G = 900;
const RADIUS = 170;

export function KineticText({ text }: { text: string }) {
  return (
    <>
      {[...text].map((ch, i) =>
        ch === " " ? (
          <span key={i}> </span>
        ) : (
          <span key={i} data-k className="inline-block">
            {ch}
          </span>
        ),
      )}
    </>
  );
}

export function useKinetic(root: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const el = root.current;
    if (!el || !enabled) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const letters = Array.from(el.querySelectorAll<HTMLElement>("[data-k]"));
    const state = letters.map(() => ({ w: BASE_W, g: BASE_G }));
    let centers: { x: number; y: number }[] = [];
    const measure = () => {
      centers = letters.map((l) => {
        const r = l.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
    };
    // Measure once the entrance animation has settled, and again on scroll / resize.
    const settle = window.setTimeout(measure, 1600);
    let dirty = true;
    const mark = () => (dirty = true);
    window.addEventListener("scroll", mark, { passive: true });
    window.addEventListener("resize", mark);

    const p = { x: -9999, y: -9999 };
    const onMove = (e: PointerEvent) => {
      p.x = e.clientX;
      p.y = e.clientY;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    const loop = () => {
      if (dirty && centers.length) {
        // Reset to base widths before measuring so positions are stable.
        letters.forEach((l) => (l.style.fontVariationSettings = ""));
        measure();
        letters.forEach((l, i) => apply(l, state[i]));
        dirty = false;
      }
      for (let i = 0; i < letters.length && i < centers.length; i++) {
        const c = centers[i];
        const d = Math.hypot(c.x - p.x, (c.y - p.y) * 1.3);
        const f = Math.exp(-((d / RADIUS) ** 2));
        const s = state[i];
        const tw = BASE_W + (MAX_W - BASE_W) * f;
        const tg = BASE_G + (MAX_G - BASE_G) * f;
        const nw = s.w + (tw - s.w) * 0.14;
        const ng = s.g + (tg - s.g) * 0.14;
        if (Math.abs(nw - s.w) > 0.05 || Math.abs(ng - s.g) > 0.1) {
          s.w = nw;
          s.g = ng;
          apply(letters[i], s);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      window.removeEventListener("scroll", mark);
      window.removeEventListener("resize", mark);
      window.removeEventListener("pointermove", onMove);
      letters.forEach((l) => (l.style.fontVariationSettings = ""));
    };
  }, [root, enabled]);
}

function apply(el: HTMLElement, s: { w: number; g: number }) {
  el.style.fontVariationSettings = `"wdth" ${s.w.toFixed(1)}, "wght" ${s.g.toFixed(0)}`;
}
