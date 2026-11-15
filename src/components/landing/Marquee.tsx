/**
 * Horizontal motion bands for the landing page.
 *
 * - <Ticker>: an endless, CSS-driven strip (content is duplicated so the loop is seamless).
 *   Hovering pauses it so a line can actually be read.
 * - <ScrollSlide>: oversized outline type that slides sideways as the page scrolls.
 */
import { motion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Ticker({
  items,
  reverse = false,
  seconds = 60,
  className,
  render,
}: {
  items: string[];
  reverse?: boolean;
  seconds?: number;
  className?: string;
  render?: (item: string) => ReactNode;
}) {
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((it, i) => (
        <li key={i} className="flex items-center whitespace-nowrap">
          {render ? render(it) : it}
          <span className="px-6 opacity-40" aria-hidden>
            ✕
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <div
      className={cn(
        "group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]",
        className,
      )}
    >
      <div
        className="flex w-max animate-marquee group-hover:[animation-play-state:paused]"
        style={{
          animationDuration: `${seconds}s`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

export function ScrollSlide({
  text,
  className,
  distance = 35,
}: {
  text: string;
  className?: string;
  /** How far (in % of its own width) the line travels across the scroll. */
  distance?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const x = useTransform(scrollYProgress, [0, 1], ["0%", `-${distance}%`]);
  return (
    <div ref={ref} className={cn("overflow-hidden", className)} aria-hidden>
      <motion.p style={{ x }} className="w-max whitespace-nowrap">
        {text} {text} {text}
      </motion.p>
    </div>
  );
}
