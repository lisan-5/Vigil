/**
 * Small motion primitives for the landing page, built on `motion/react`.
 * Every effect honours prefers-reduced-motion via the <MotionConfig reducedMotion="user">
 * wrapper on the page.
 */
import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** House easing: fast out, long settle — like a pen coming to rest. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** One line of display type that slides up from behind a mask. */
export function MaskLine({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <span className={cn("block overflow-hidden pb-[0.06em]", className)}>
      <motion.span
        className="block will-change-transform"
        initial={{ y: "105%", rotate: 2 }}
        animate={{ y: "0%", rotate: 0 }}
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
  className,
  children,
  ...rest
}: { delay?: number; y?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
