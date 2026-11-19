/**
 * Boot sequence: the landing page opens like a terminal attaching to the fleet, then the
 * screen splits like shutters to reveal the hero. Plays once per browser session; click,
 * key or reduced motion skips it. `onDone` fires as the shutters start to open.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE } from "./motion";

const LINES = [
  "vigil 4.12.0 · night watch",
  "attaching to api-gateway ........ ok",
  "attaching to auth ............... ok",
  "attaching to checkout ........... ok",
  "attaching to payments ........... ok",
  "attaching to inventory .......... ok",
  "attaching to search ............. ok",
  "attaching to notifications ...... ok",
  "attaching to ledger ............. ok",
  "8/8 green · 0 pages · on call: dana k.",
  "22:00:00 shift start",
];
const KEY = "vigil.booted";
const STEP = 95;

export function Boot({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* storage unavailable: just play it */
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      setOpen(false);
      onDone();
    };
    if (seen || reduced) {
      finish();
      return;
    }
    const timers: number[] = [];
    LINES.forEach((_, i) => timers.push(window.setTimeout(() => setShown(i + 1), 180 + i * STEP)));
    timers.push(window.setTimeout(finish, 180 + LINES.length * STEP + 650));
    const skip = () => {
      timers.forEach(clearTimeout);
      finish();
    };
    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("pointerdown", skip, { once: true });
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [onDone]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="boot"
          className="fixed inset-0 z-[90] font-plexmono text-[12px] text-[#efe8dc]"
          exit={{ pointerEvents: "none" }}
          aria-hidden
        >
          {/* two shutters: they part from the middle */}
          {(["top", "bottom"] as const).map((side) => (
            <motion.div
              key={side}
              className="absolute inset-x-0 h-1/2 bg-[#0d0b09]"
              style={side === "top" ? { top: 0 } : { bottom: 0 }}
              exit={{ y: side === "top" ? "-100%" : "100%" }}
              transition={{ duration: 0.9, ease: EASE }}
            />
          ))}
          <motion.div
            className="absolute inset-0 flex items-center justify-center px-6"
            exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            transition={{ duration: 0.25 }}
          >
            <pre className="w-full max-w-md whitespace-pre-wrap leading-6">
              {LINES.slice(0, shown).map((l, i) => (
                <div
                  key={i}
                  className={
                    i === 0
                      ? "mb-2 text-[#9b9187]"
                      : i >= LINES.length - 2
                        ? "mt-2 text-[#efe8dc]"
                        : "text-[#c9c0b3]"
                  }
                >
                  {l.endsWith(" ok") ? (
                    <>
                      {l.slice(0, -2)}
                      <span className="text-[#efe8dc]">ok</span>
                    </>
                  ) : (
                    l
                  )}
                </div>
              ))}
              <span className="inline-block h-3.5 w-2 translate-y-0.5 animate-blink bg-[#efe8dc]" />
            </pre>
            {/* the scanline sweeping down the terminal */}
            <motion.div
              className="pointer-events-none absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-[#efe8dc]/[0.05] to-transparent"
              initial={{ top: "-10%" }}
              animate={{ top: "110%" }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
