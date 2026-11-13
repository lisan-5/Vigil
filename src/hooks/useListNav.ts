import { useEffect, useState } from "react";
import { useHotkeys } from "./useHotkeys";

/**
 * j/k list navigation. Returns the active index; Enter calls onOpen(index).
 * The consumer renders `data-nav-index` on rows so the active row is scrolled into view.
 */
export function useListNav(
  count: number,
  onOpen?: (index: number) => void,
  opts: { scrollTo?: (i: number) => void } = {},
) {
  const [active, setActive] = useState(-1);

  useEffect(() => {
    if (active >= count) setActive(count - 1);
  }, [count, active]);

  const move = (delta: number) => {
    if (count === 0) return;
    setActive((i) => {
      const next = Math.max(0, Math.min(count - 1, (i < 0 ? -1 : i) + delta));
      if (opts.scrollTo) opts.scrollTo(next);
      else
        document.querySelector(`[data-nav-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
      return next;
    });
  };

  useHotkeys({
    j: () => move(1),
    k: () => move(-1),
    enter: () => active >= 0 && onOpen?.(active),
  });

  return { active, setActive };
}
