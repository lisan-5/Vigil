/**
 * Chart-recorder crosshair: two hairlines across the whole viewport that follow the
 * pointer, with a small live readout. Inverts whatever is beneath it, so it works on the
 * night and day palettes alike. Fine pointers only; never replaces the system cursor.
 */
import { useEffect, useRef } from "react";

export function Crosshair() {
  const h = useRef<HTMLDivElement>(null);
  const v = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = { x: -100, y: -100 };
    const pos = { x: -100, y: -100 };
    let visible = false;
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      if (!visible) {
        visible = true;
        pos.x = target.x;
        pos.y = target.y;
        [h, v, tag].forEach((r) => r.current?.style.setProperty("opacity", "1"));
      }
    };
    const onLeave = () => {
      visible = false;
      [h, v, tag].forEach((r) => r.current?.style.setProperty("opacity", "0"));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    let raf = 0;
    const loop = () => {
      pos.x += (target.x - pos.x) * 0.35;
      pos.y += (target.y - pos.y) * 0.35;
      if (h.current) h.current.style.transform = `translate3d(0, ${pos.y}px, 0)`;
      if (v.current) v.current.style.transform = `translate3d(${pos.x}px, 0, 0)`;
      if (tag.current) {
        tag.current.style.transform = `translate3d(${pos.x + 12}px, ${pos.y + 10}px, 0)`;
        const d = new Date();
        const doc = document.documentElement;
        const pct = (window.scrollY / Math.max(1, doc.scrollHeight - innerHeight)) * 100;
        tag.current.textContent = `${d.toTimeString().slice(0, 8)} · ${String(Math.round(pos.x)).padStart(4, "0")},${String(Math.round(pos.y)).padStart(4, "0")} · ${pct.toFixed(0).padStart(2, "0")}%`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const line =
    "pointer-events-none fixed z-[70] bg-white opacity-0 mix-blend-difference transition-opacity duration-300";
  return (
    <div aria-hidden className="hidden [@media(pointer:fine)]:block">
      <div ref={h} className={`${line} inset-x-0 top-0 h-px`} />
      <div ref={v} className={`${line} inset-y-0 left-0 w-px`} />
      <span
        ref={tag}
        className="pointer-events-none fixed left-0 top-0 z-[70] whitespace-nowrap font-plexmono text-[10px] text-white opacity-0 mix-blend-difference transition-opacity duration-300"
      />
    </div>
  );
}
