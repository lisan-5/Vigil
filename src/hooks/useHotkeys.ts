import { useEffect, useRef } from "react";

/** True when the event target is somewhere the user is typing. */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

type Handler = (e: KeyboardEvent) => void;

/**
 * Register single-key and sequence shortcuts.
 * Keys: "mod+k", "/", "?", "j", "g o" (sequence). Ignored while typing, except "mod+…" and "escape".
 */
export function useHotkeys(map: Record<string, Handler>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      const combos = ref.current;
      if (mod && combos[`mod+${k}`]) {
        e.preventDefault();
        combos[`mod+${k}`](e);
        return;
      }
      if (k === "escape" && combos.escape) return combos.escape(e);
      if (mod || e.altKey || isTypingTarget(e.target)) return;
      // Let Enter/Space keep activating focused buttons and links.
      if (k === "enter" && (e.target as HTMLElement)?.closest?.("button, a, [role=button]")) return;

      if (pending) {
        const seq = combos[`${pending} ${k}`];
        pending = null;
        clearTimeout(timer);
        if (seq) {
          e.preventDefault();
          seq(e);
          return;
        }
      }
      if (Object.keys(combos).some((c) => c.startsWith(`${k} `))) {
        pending = k;
        timer = setTimeout(() => (pending = null), 900);
        return;
      }
      const key = e.key === "?" ? "?" : k;
      if (combos[key]) {
        e.preventDefault();
        combos[key](e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [enabled]);
}
