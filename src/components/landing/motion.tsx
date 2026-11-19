/**
 * Small motion primitives for the landing page, built on `motion/react`.
 * Every effect honours prefers-reduced-motion via the <MotionConfig reducedMotion="user">
 * wrapper on the page.
 */
import { motion, useScroll, useSpring, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** House easing: fast out, long settle — like a pen coming to rest. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** One line of display type that slides up from behind a mask. */
export function MaskLine({
  children,
  delay = 0,
  className,
  play = true,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Hold the line hidden until this turns true. */
  play?: boolean;
}) {
  return (
    <span
      className={cn(
        "block overflow-x-visible overflow-y-clip whitespace-nowrap pb-[0.06em]",
        className,
      )}
    >
      <motion.span
        className="block will-change-transform"
        initial={{ y: "105%", rotate: 2 }}
        animate={play ? { y: "0%", rotate: 0 } : { y: "105%", rotate: 2 }}
        transition={{ duration: 1.1, ease: EASE, delay }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/** Fades and lifts its children in once, on mount. */
export function FadeUp({
  delay = 0,
  y = 16,
  play = true,
  className,
  children,
  ...rest
}: { delay?: number; y?: number; play?: boolean } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={play ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.9, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Reveals once when scrolled into view. */
export function Reveal({
  delay = 0,
  x = 0,
  y = 28,
  className,
  children,
  ...rest
}: { delay?: number; x?: number; y?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.9, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Display line that slides up from a mask when scrolled into view. */
export function RevealLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("block overflow-hidden pb-[0.06em]", className)}>
      <motion.span
        className="block"
        initial={{ y: "105%" }}
        whileInView={{ y: "0%" }}
        viewport={{ once: true, margin: "0px 0px -10% 0px" }}
        transition={{ duration: 1, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/** Thin signal-red bar across the top that tracks reading progress. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });
  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-signal"
      style={{ scaleX }}
    />
  );
}
