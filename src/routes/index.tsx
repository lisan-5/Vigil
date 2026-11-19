import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionStyle,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { EASE, FadeUp, MaskLine, RevealLine, ScrollProgress } from "@/components/landing/motion";
import { Grain, TorchField } from "@/components/landing/Torch";
import { Boot } from "@/components/landing/Boot";
import { Constellation } from "@/components/landing/Constellation";
import { Crosshair } from "@/components/landing/Crosshair";
import { KineticText, useKinetic } from "@/components/landing/Kinetic";
import { ScrollSlide, Ticker } from "@/components/landing/Marquee";
import { Smoke } from "@/components/landing/Smoke";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vigil — Nothing happened last night" },
      {
        name: "description",
        content:
          "Vigil watches your logs, traces and metrics overnight and wakes exactly one person when it matters.",
      },
      { property: "og:title", content: "Vigil — Nothing happened last night" },
      {
        property: "og:description",
        content: "Logs, traces, metrics and alerts for teams who are on call.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

/* ───────────────────────── last night, as data ───────────────────────── */

const NIGHT = 480; // minutes, 22:00 → 06:00
const SPIKE = 254; // 02:14
const Y_MAX = 3; // % error rate
const W = 1000;
const H = 300;

const hhmm = (m: number) => {
  const t = (22 * 60 + Math.floor(m)) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POINTS = (() => {
  const r = rng(412);
  return Array.from({ length: NIGHT + 1 }, (_, m) => {
    let v = 0.22 + Math.sin(m / 37) * 0.04 + (r() - 0.5) * 0.09;
    if (m >= 98 && m <= 108) v += 0.12 * Math.sin(((m - 98) / 10) * Math.PI); // 23:40 deploy, barely a ripple
    if (m >= 425 && m <= 445) v += 0.32 * Math.sin(((m - 425) / 20) * Math.PI); // 05:05 nightly batch
    const d = m - (SPIKE - 1);
    if (d >= 0 && d <= 3) v += (d / 3) * 2.45;
    else if (d > 3 && d < 30) v += 2.45 * Math.exp(-(d - 3) / 2.6);
    const traffic =
      0.35 + 1.25 * (0.5 + 0.5 * Math.cos((m / NIGHT) * Math.PI * 1.15)) + (r() - 0.5) * 0.06;
    return { m, v: Math.max(0.04, v), traffic };
  });
})();

const X = (m: number) => (m / NIGHT) * W;
const Y = (v: number) => H - (v / Y_MAX) * H * 0.9;
const toPath = (pts: { m: number; y: number }[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${X(p.m).toFixed(1)},${p.y.toFixed(1)}`).join("");
const ERR_PATH = toPath(POINTS.map((p) => ({ m: p.m, y: Y(p.v) })));
const SPIKE_PATH = toPath(POINTS.filter((p) => p.v > 1).map((p) => ({ m: p.m, y: Y(p.v) })));
const TRAFFIC_PATH = toPath(POINTS.map((p) => ({ m: p.m, y: Y(p.traffic) })));

/* ───────────────────────── palettes ───────────────────────── */

/** The landing page is a printed log. At night the print is reversed. */
const NIGHT_INK = {
  paper: "#16120f",
  paper2: "#201b17",
  ink: "#efe8dc",
  muted: "#9b9187",
  rule: "rgba(239,232,220,0.14)",
};
const NIGHT_VARS = {
  "--paper": NIGHT_INK.paper,
  "--paper-2": NIGHT_INK.paper2,
  "--ink": NIGHT_INK.ink,
  "--ink-muted": NIGHT_INK.muted,
  "--rule": NIGHT_INK.rule,
} as CSSProperties;

const DAWN = {
  paper: "#f4efe6",
  paper2: "#ebe4d8",
  ink: "#1c1814",
  muted: "#665d54",
  rule: "rgba(28,24,20,0.16)",
};

/* ───────────────────────── page ───────────────────────── */

function Landing() {
  const [ready, setReady] = useState(false);
  const onBooted = useCallback(() => setReady(true), []);
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-clip bg-paper font-archivo text-ink selection:bg-signal/25">
        <Boot onDone={onBooted} />
        <Grain />
        <Crosshair />
        <ScrollProgress />
        <Hero ready={ready} />
        <Shift />
        <LogBand />
        <Parts />
        <Rules />
        <ScrollSlide
          text="Always watching · Rarely loud ·"
          className="condensed mt-24 select-none text-[clamp(4rem,14vw,12rem)] font-extrabold uppercase leading-none text-ink outline-type sm:mt-32"
        />
        <Closing />
      </div>
    </MotionConfig>
  );
}

const wrap = "mx-auto w-full max-w-[1240px] px-5 sm:px-8";
const mono = "font-plexmono";

/* ───────────────────────── 22:00 — the hero ───────────────────────── */

function Masthead({ status, play = true }: { status: ReactNode; play?: boolean }) {
  return (
    <motion.header
      className={cn(wrap, "relative pt-5")}
      initial={{ opacity: 0, y: -24 }}
      animate={play ? { opacity: 1, y: 0 } : { opacity: 0, y: -24 }}
      transition={{ duration: 0.8, ease: EASE }}
    >
      <div className="flex items-center justify-between gap-4 border-b-2 border-ink pb-3">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="condensed text-3xl font-black uppercase leading-none tracking-tight">
            Vigil
          </span>
          <span className={cn(mono, "hidden text-[11px] text-ink-muted sm:inline")}>
            night log no. 0412
          </span>
        </Link>
        <nav className={cn(mono, "flex items-center gap-5 text-[12px]")}>
          <a href="#shift" className="hidden underline-offset-4 hover:underline md:inline">
            02:14
          </a>
          <a href="#parts" className="hidden underline-offset-4 hover:underline md:inline">
            Parts
          </a>
          <a href="#rules" className="hidden underline-offset-4 hover:underline md:inline">
            House rules
          </a>
          <Link
            to="/overview"
            className="bg-ink px-3 py-1.5 text-paper transition-opacity hover:opacity-85"
          >
            Open Vigil
          </Link>
        </nav>
      </div>
      <div
        className={cn(
          mono,
          "flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-rule py-2 text-[11px] text-ink-muted",
        )}
      >
        <span>Shift 22:00 – 06:00 · on call: Dana K.</span>
        {status}
      </div>
    </motion.header>
  );
}

function Hero({ ready }: { ready: boolean }) {
  const headline = useRef<HTMLHeadingElement>(null);
  useKinetic(headline, ready);
  return (
    <section
      style={NIGHT_VARS}
      className="relative isolate flex min-h-svh flex-col overflow-hidden bg-paper text-ink"
    >
      <TorchField className="-z-10 opacity-70" />
      <motion.div
        aria-hidden
        className="absolute inset-x-0 top-[6%] -z-10 h-[56%] [mask-image:radial-gradient(closest-side,black_55%,transparent)] md:inset-x-auto md:right-[-4%] md:top-[4%] md:h-[86%] md:w-[64%]"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={ready ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
        transition={{ duration: 2.4, ease: EASE, delay: 0.3 }}
      >
        <Constellation />
      </motion.div>
      <Smoke
        rgb="239,232,220"
        intensity={0.22}
        className="-z-10 [mask-image:linear-gradient(to_top,black_10%,transparent_75%)]"
      />
      {/* keep the headline legible over the wall */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_60%_at_20%_75%,var(--paper)_10%,transparent_70%)] opacity-80"
      />

      <Masthead
        play={ready}
        status={
          <span className="flex items-center gap-2 tabular-nums">
            <span className="inline-block h-2 w-2 animate-pulse-soft bg-ink" />
            22:00 — All quiet
          </span>
        }
      />

      <div
        className={cn(wrap, "grid flex-1 content-end gap-8 pb-10 pt-16 md:grid-cols-12 md:gap-6")}
      >
        <h1
          ref={headline}
          aria-label="Nothing happened last night."
          className="condensed text-[clamp(3.6rem,12.5vw,10.5rem)] font-extrabold uppercase leading-[0.84] tracking-[-0.01em] md:col-span-8"
        >
          <MaskLine play={ready} delay={0.2}>
            <KineticText text="Nothing" />
          </MaskLine>
          <MaskLine play={ready} delay={0.32}>
            <KineticText text="happened" />
          </MaskLine>
          <MaskLine play={ready} delay={0.44}>
            <KineticText text="last night." />
          </MaskLine>
        </h1>
        <FadeUp play={ready} delay={0.75} className="flex flex-col justify-end md:col-span-4">
          <p className="text-lg leading-snug md:text-[1.2rem]">
            Well — something did. At 02:14 payments started timing out. Vigil noticed in eleven
            seconds, woke{" "}
            <em className="not-italic underline decoration-signal decoration-2 underline-offset-4">
              exactly one person
            </em>
            , and showed her the line that mattered. Everyone else slept.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              to="/overview"
              className="group bg-ink px-5 py-3 text-sm font-semibold text-paper transition-opacity hover:opacity-85"
            >
              Open Vigil{" "}
              <span className="inline-block transition-transform duration-300 group-hover:translate-x-1.5">
                →
              </span>
            </Link>
            <a
              href="#shift"
              className={cn(mono, "text-[13px] underline underline-offset-4 hover:text-ink-muted")}
            >
              live through the night ↓
            </a>
          </div>
        </FadeUp>
      </div>

      <FadeUp
        play={ready}
        delay={1.3}
        y={0}
        className={cn(
          wrap,
          mono,
          "flex items-center justify-between gap-4 border-t border-rule py-3 text-[11px] text-ink-muted",
        )}
      >
        <span className="hidden sm:inline">↖ shine a light. one of these lines woke Dana.</span>
        <span className="flex items-center gap-3">
          scroll to start the shift
          <span className="relative block h-6 w-px overflow-hidden bg-rule">
            <motion.span
              className="absolute inset-x-0 top-0 h-2 bg-ink"
              animate={{ y: [-8, 24] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          </span>
        </span>
      </FadeUp>
    </section>
  );
}

/* ───────────────────────── 22:00 → 06:00 — the shift, on scroll ───────────────────────── */

/** Scroll → minutes past 22:00. Fast-forwards the quiet hours, slows to real time at 02:14. */
const SCROLL_STOPS = [0, 0.06, 0.34, 0.41, 0.71, 0.78, 0.94, 1];
const MINUTE_STOPS = [0, 0, 240, 253, 262, 290, NIGHT, NIGHT];
const SLOW = [253, 262] as const;

const CAPTIONS: { from: number; t: string; text: ReactNode; loud?: boolean }[] = [
  { from: 0, t: "22:00", text: "Shift starts. Eight services, all green. Dana goes to bed." },
  { from: 95, t: "23:40", text: "checkout v412 ships. Nothing moves. Good." },
  { from: 140, t: "00:20", text: "Hours of nothing. Vigil reads every line so nobody has to." },
  {
    from: 253.9,
    t: "02:14:03",
    text: "payments starts timing out against Stripe. 412 identical errors fold into one.",
    loud: true,
  },
  {
    from: 254.23,
    t: "02:14:14",
    text: "Error rate 1.3% for ten seconds. One page — to Dana. Not the channel.",
    loud: true,
  },
  {
    from: 255.67,
    t: "02:15:40",
    text: "Dana opens the trace on her phone. 2,700ms in stripe.charge, already highlighted.",
  },
  {
    from: 257.03,
    t: "02:17:02",
    text: "The 01:50 deploy is pinned on the chart. Rollback v88 → v87.",
  },
  {
    from: 259.5,
    t: "02:19:30",
    text: "Under 1%. The alert resolves itself. Nobody clicks anything.",
  },
  { from: 261, t: "02:21", text: "Dana goes back to sleep. The part we actually care about." },
  { from: 432, t: "05:12", text: "Nightly batch. Expected, so silent." },
  { from: 470, t: "06:00", text: "Shift over. One page, five minutes, eight hours of sleep." },
];

function clock(m: number, seconds: boolean) {
  const base = hhmm(m);
  if (!seconds) return base;
  return (
    <>
      {base}
      <span className="ml-1 align-top text-[0.32em] leading-none">
        :{String(Math.floor((m % 1) * 60)).padStart(2, "0")}
      </span>
    </>
  );
}

function Shift() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const minutes = useTransform(p, SCROLL_STOPS, MINUTE_STOPS);
  const [m, setM] = useState(0);
  useMotionValueEvent(minutes, "change", setM);

  // Night palette until the last stretch, then dawn breaks.
  const dawn = [0.8, 0.97];
  const vars = {
    "--paper": useTransform(p, dawn, [NIGHT_INK.paper, DAWN.paper]),
    "--paper-2": useTransform(p, dawn, [NIGHT_INK.paper2, DAWN.paper2]),
    "--ink": useTransform(p, dawn, [NIGHT_INK.ink, DAWN.ink]),
    "--ink-muted": useTransform(p, dawn, [NIGHT_INK.muted, DAWN.muted]),
    "--rule": useTransform(p, dawn, [NIGHT_INK.rule, DAWN.rule]),
  };

  const slow = m >= SLOW[0] && m < SLOW[1];
  const alarm = m >= 254.23 && m < 259.5;
  const caption = [...CAPTIONS].reverse().find((c) => m >= c.from) ?? CAPTIONS[0];

  return (
    <motion.section
      ref={ref}
      id="shift"
      style={vars as unknown as MotionStyle}
      className="relative h-[720vh] bg-paper text-ink"
      aria-label="The night of the incident, minute by minute"
    >
      <div className="sticky top-0 flex h-svh flex-col overflow-hidden">
        {/* the room goes red while the pager rings */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-500",
            alarm ? "opacity-100" : "opacity-0",
          )}
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 35%, color-mix(in oklab, var(--signal) 38%, transparent) 100%)",
          }}
        >
          <div className="absolute inset-0 animate-pulse-soft bg-signal/[0.06]" />
        </div>

        <div className={cn(wrap, "flex flex-1 flex-col pt-6 sm:pt-10")}>
          <div
            className={cn(
              mono,
              "flex items-center justify-between gap-4 border-b border-rule pb-2 text-[11px] text-ink-muted",
            )}
          >
            <span>
              § 1 — <span className="hidden sm:inline">the night of 0412, </span>minute by minute
            </span>
            <span className={cn("flex items-center gap-2", slow && "text-signal")}>
              <span
                className={cn("inline-block h-2 w-2", slow ? "animate-blink bg-signal" : "bg-ink")}
              />
              {m >= NIGHT ? "end of shift" : slow ? "▶ real time" : "▶▶ fast-forward ×600"}
            </span>
          </div>

          <div className="grid flex-1 items-center gap-6 py-6 md:grid-cols-12">
            <p
              className={cn(
                "condensed num text-[clamp(5rem,19vw,17rem)] font-extrabold leading-[0.8] tracking-tight transition-colors duration-300 md:col-span-7",
                alarm && "text-signal",
                m >= 254.23 && m < 254.75 && "animate-glitch",
              )}
              aria-live="off"
            >
              {clock(m, slow)}
            </p>
            <div className="relative md:col-span-5 md:min-h-[9rem]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={caption.t}
                  initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -14, filter: "blur(6px)" }}
                  transition={{ duration: 0.45, ease: EASE }}
                >
                  <p
                    className={cn(
                      mono,
                      "text-[12px]",
                      caption.loud ? "text-signal" : "text-ink-muted",
                    )}
                  >
                    {caption.t}
                  </p>
                  <p className="semi-condensed mt-2 text-[clamp(1.5rem,2.6vw,2.25rem)] font-bold leading-[1.08]">
                    {caption.text}
                  </p>
                </motion.div>
              </AnimatePresence>
              <Pager m={m} />
            </div>
          </div>

          <div className="pb-6 sm:pb-8">
            <Recorder m={m} />
          </div>
        </div>
      </div>
    </motion.section>
  );
}

/** The phone on Dana's nightstand. */
function Pager({ m }: { m: number }) {
  const show = m >= 254.23 && m < 262;
  const state = m >= 259.5 ? "resolved" : m >= 255.67 ? "acked" : "ringing";
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, x: 60, rotate: 4 }}
          animate={{ opacity: 1, x: 0, rotate: -1.5 }}
          exit={{ opacity: 0, x: 40, rotate: 3 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className={cn(
            mono,
            "mt-4 w-[min(100%,300px)] border-2 border-ink bg-paper p-3 text-[11px] shadow-[6px_6px_0_var(--signal)] md:absolute md:-bottom-6 md:right-0 md:mt-0 md:translate-y-full",
          )}
          role="status"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold tracking-wider">VIGIL · PAGE</span>
            <span className="text-ink-muted">02:14:14</span>
          </div>
          <p className="mt-2 text-[12.5px] leading-snug">
            <span className="text-signal">payments</span> error_rate 1.3% &gt; 1% for 10s
          </p>
          <p className="mt-1 text-ink-muted">→ Dana K. · payments on-call</p>
          <div className="mt-2.5 flex items-center gap-2 border-t border-rule pt-2">
            <span
              className={cn(
                "inline-block h-2 w-2",
                state === "ringing" && "animate-blink bg-signal",
                state === "acked" && "bg-ink",
                state === "resolved" && "bg-ink-muted",
              )}
            />
            {state === "ringing" && <span className="text-signal">ringing…</span>}
            {state === "acked" && <span>acknowledged by Dana · 02:15:40</span>}
            {state === "resolved" && <span className="text-ink-muted">resolved · 02:19:30</span>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Recorder({ m }: { m: number }) {
  const pct = (m / NIGHT) * 100;
  const passed = (at: number) => m >= at;

  return (
    <figure>
      <div
        className="relative h-[22vh] min-h-[150px] select-none border-y-2 border-ink sm:h-[26vh]"
        aria-label="Error rate chart for last night. Flat except a spike between 02:14 and 02:19."
        role="img"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          {Array.from({ length: 16 }, (_, i) => (i + 1) * 30).map((x) => (
            <line
              key={x}
              x1={X(x)}
              x2={X(x)}
              y1={0}
              y2={H}
              stroke="var(--rule)"
              strokeDasharray={x % 60 ? "2 4" : undefined}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1={0}
            x2={W}
            y1={Y(1)}
            y2={Y(1)}
            stroke="var(--signal)"
            strokeDasharray="6 5"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(-20px ${100 - pct}% -20px 0)` }}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-full w-full"
            aria-hidden
          >
            <path
              d={TRAFFIC_PATH}
              fill="none"
              stroke="var(--ink-muted)"
              strokeWidth={1}
              strokeDasharray="1 3"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={ERR_PATH}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={1.6}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={SPIKE_PATH}
              fill="none"
              stroke="var(--signal)"
              strokeWidth={2.4}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <span
          className={cn(mono, "absolute left-1.5 text-[10px] text-signal")}
          style={{ top: `calc(${(Y(1) / H) * 100}% - 16px)` }}
        >
          1% — page someone
        </span>
        <Note at={102} top="30%" show={passed(102)} className="hidden sm:block">
          23:40 checkout v412
        </Note>
        <Note at={432} top="22%" show={passed(432)} flip className="hidden sm:block">
          05:12 nightly batch
        </Note>
        {/* needle */}
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-ink"
          style={{ left: `${pct}%` }}
        >
          <span
            className={cn(
              mono,
              "absolute -top-6 left-1/2 -translate-x-1/2 bg-ink px-1.5 py-0.5 text-[10px] tabular-nums text-paper",
            )}
          >
            {hhmm(m)}
          </span>
        </div>
      </div>
      <div className={cn(mono, "relative h-6 text-[10px] text-ink-muted")}>
        {Array.from({ length: 9 }, (_, i) => i * 60).map((x) => (
          <span
            key={x}
            className={cn(
              "absolute top-1.5 -translate-x-1/2",
              x === 0 && "translate-x-0",
              x === NIGHT && "-translate-x-full",
              x % 120 && "hidden sm:inline",
            )}
            style={{ left: `${(x / NIGHT) * 100}%` }}
          >
            {hhmm(x)}
          </span>
        ))}
      </div>
    </figure>
  );
}

function Note({
  at,
  top,
  show,
  flip,
  className,
  children,
}: {
  at: number;
  top: string;
  show: boolean;
  flip?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        mono,
        "pointer-events-none absolute whitespace-nowrap border-ink py-0.5 text-[10.5px] text-ink transition-opacity duration-300",
        flip ? "-translate-x-full border-r pr-2 text-right" : "border-l pl-2",
        show ? "opacity-100" : "opacity-0",
        className,
      )}
      style={{ left: `${(at / NIGHT) * 100}%`, top }}
    >
      {children}
    </p>
  );
}

/* ───────────────────────── the night, scrolling past ───────────────────────── */

const BAND = [
  "22:00:00 shift start · 8 services green",
  "23:40:12 deploy checkout v412",
  "00:31:07 p95 api-gateway 14ms",
  "01:50:44 deploy payments v88",
  "02:14:14 ALERT payments error_rate 1.3%",
  "02:17:02 rollback payments v88 → v87",
  "02:19:30 RESOLVED payments 0.3%",
  "03:02:55 search cache warm 98.2%",
  "05:12:00 nightly batch · expected",
  "06:00:00 shift over · 1 page, 5 minutes",
];

function LogBand() {
  return (
    <div className={cn(mono, "mt-16 border-y-2 border-ink py-3 text-[12px] sm:mt-20")}>
      <Ticker
        items={BAND}
        seconds={55}
        render={(line) => (
          <span className={line.includes("ALERT") ? "text-signal" : undefined}>{line}</span>
        )}
      />
    </div>
  );
}

function SectionHead({ n, title, aside }: { n: string; title: string; aside: string }) {
  return (
    <div className="grid gap-3 pb-6 md:grid-cols-12 md:items-end md:gap-6">
      <span className={cn(mono, "text-[12px] text-ink-muted md:col-span-2")}>§ {n}</span>
      <h2 className="condensed text-[clamp(2.4rem,6vw,4.5rem)] font-extrabold uppercase leading-[0.9] md:col-span-6">
        <RevealLine>{title}</RevealLine>
      </h2>
      <p className="max-w-sm text-[15px] leading-snug text-ink-muted md:col-span-4">{aside}</p>
    </div>
  );
}

/* ───────────────────────── § 3 — parts list ───────────────────────── */

const TAIL = [
  "INFO  checkout  POST /orders 201 · 84ms",
  "DEBUG cart      cache hit sku=A-1182",
  "INFO  auth      token refreshed u_8812",
  "INFO  search    GET /q?term=boots · 31ms",
  "INFO  payments  charge ok 48.00 · 212ms",
  "INFO  inventory reserve ok qty=2",
];

function Tail() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setN((x) => x + 1), 1100);
    return () => clearInterval(h);
  }, []);
  return (
    <pre className={cn(mono, "overflow-hidden text-[11.5px] leading-5")}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            "overflow-hidden text-ellipsis whitespace-pre",
            i === 2 ? "text-ink" : "text-ink-muted",
          )}
        >
          {TAIL[(n + i) % TAIL.length]}
        </div>
      ))}
    </pre>
  );
}

const SPANS = [
  { name: "gateway", a: 0, b: 100 },
  { name: "checkout", a: 3, b: 97 },
  { name: "payments", a: 8, b: 95, loud: true },
  { name: "stripe.charge", a: 10, b: 93, loud: true },
  { name: "postgres", a: 95, b: 97 },
];

function Waterfall() {
  return (
    <div className={cn(mono, "space-y-1 text-[10.5px]")}>
      {SPANS.map((s) => (
        <div key={s.name} className="flex items-center gap-2">
          <span className={cn("w-24 shrink-0 truncate", s.loud ? "text-signal" : "text-ink-muted")}>
            {s.name}
          </span>
          <span className="relative h-2 flex-1">
            <span
              className={cn("absolute inset-y-0", s.loud ? "bg-signal" : "bg-ink")}
              style={{ left: `${s.a}%`, width: `${Math.max(1.5, s.b - s.a)}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

const P95 = Array.from(
  { length: 40 },
  (_, i) =>
    180 +
    Math.sin(i / 2.2) * 14 +
    (i > 26 && i < 31 ? 520 * Math.sin(((i - 26) / 5) * Math.PI) : 0),
);

function TinyLine() {
  const max = Math.max(...P95);
  const d = P95.map(
    (v, i) => `${i ? "L" : "M"}${(i / (P95.length - 1)) * 200},${48 - (v / max) * 44}`,
  ).join("");
  return (
    <svg viewBox="0 0 200 50" className="h-12 w-full" preserveAspectRatio="none" aria-hidden>
      <line
        x1="0"
        x2="200"
        y1="49"
        y2="49"
        stroke="var(--rule)"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const PARTS: {
  name: string;
  does: string;
  to: "/overview" | "/logs" | "/traces" | "/metrics" | "/service-map" | "/alerts" | "/query";
  shows: ReactNode;
}[] = [
  {
    name: "Logs",
    does: "Tail everything as it happens. Filter while it streams; identical lines fold up instead of scrolling past.",
    to: "/logs",
    shows: <Tail />,
  },
  {
    name: "Traces",
    does: "Every request as a waterfall. The span that ate the time is the one you see first.",
    to: "/traces",
    shows: <Waterfall />,
  },
  {
    name: "Metrics",
    does: "Latency, errors, traffic and saturation per service, with deploys drawn right on the line.",
    to: "/metrics",
    shows: <TinyLine />,
  },
  {
    name: "Map",
    does: "Who calls whom, in real time. A failing dependency shows up as a broken link, not a mystery.",
    to: "/service-map",
    shows: (
      <pre className={cn(mono, "text-[11px] leading-5")}>
        {"gateway ─▶ checkout ─▶ "}
        <span className="text-signal">payments ✕</span>
        {"\n                └──▶ inventory"}
      </pre>
    ),
  },
  {
    name: "Alerts",
    does: "Rules written like sentences. Pages go to a person with a name, and resolve themselves.",
    to: "/alerts",
    shows: (
      <code className={cn(mono, "block text-[11px] leading-5")}>
        error_rate{"{svc=payments}"} &gt; 1%
        <br />
        for 10s → page @payments-oncall
      </code>
    ),
  },
  {
    name: "VigilQL",
    does: "One small query language for all of it. Pipes, not dashboards you have to remember to build.",
    to: "/query",
    shows: (
      <code className={cn(mono, "block text-[11px] leading-5")}>
        logs | where svc = "payments"
        <br />| count by msg | top 5<span className="animate-blink">▍</span>
      </code>
    ),
  },
];

function Parts() {
  return (
    <section id="parts" className={cn(wrap, "scroll-mt-6 pt-24 sm:pt-32")}>
      <SectionHead
        n="3"
        title="Parts list."
        aside="Six tools that share one clock, so a spike on a chart is one click from the log line behind it."
      />
      <div
        className={cn(
          mono,
          "hidden grid-cols-12 gap-6 border-t-2 border-ink py-2 text-[10.5px] uppercase tracking-wider text-ink-muted md:grid",
        )}
      >
        <span className="col-span-1">No.</span>
        <span className="col-span-3">Part</span>
        <span className="col-span-4">What it does</span>
        <span className="col-span-4">Looks like</span>
      </div>
      <ol className="border-t-2 border-ink md:border-t">
        {PARTS.map((p, i) => (
          <motion.li
            key={p.name}
            initial={{ opacity: 0, x: i % 2 ? 70 : -70, y: 0 }}
            whileInView={{ opacity: 1, x: 0, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -8% 0px" }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.05 }}
            className="group grid gap-x-6 gap-y-3 border-b border-rule py-6 md:grid-cols-12 md:items-center"
          >
            <span className={cn(mono, "text-[12px] text-ink-muted md:col-span-1")}>0{i + 1}</span>
            <Link
              to={p.to}
              className="condensed text-5xl font-extrabold uppercase leading-none underline-offset-[6px] group-hover:underline md:col-span-3"
            >
              {p.name}
            </Link>
            <p className="max-w-md text-[15px] leading-snug text-ink-muted md:col-span-4">
              {p.does}
            </p>
            <div className="border border-rule bg-paper-2 p-3 md:col-span-4">{p.shows}</div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

/* ───────────────────────── § 4 — house rules ───────────────────────── */

const RULES = [
  [
    "Red means someone should get up.",
    "Nothing else on the screen is allowed to be red. Not a logo, not a button, not a chart line for fun.",
  ],
  [
    "Every number carries its unit.",
    "212 is not a latency. 212ms is. 2.4% of what, over how long — it says.",
  ],
  [
    "The first screen answers one question.",
    "Is it fine? Yes or no, before you have read anything else.",
  ],
];

function Rules() {
  return (
    <section id="rules" className={cn(wrap, "scroll-mt-6 pt-24 sm:pt-32")}>
      <SectionHead
        n="4"
        title="House rules."
        aside="Things we will not change, however many people ask for a neon dashboard."
      />
      <ol className="grid border-t-2 border-ink md:grid-cols-3">
        {RULES.map(([rule, why], i) => (
          <motion.li
            key={rule}
            initial={{ opacity: 0, x: 0, y: 48 }}
            whileInView={{ opacity: 1, x: 0, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -8% 0px" }}
            transition={{ duration: 0.8, ease: EASE, delay: i * 0.14 }}
            className={cn(
              "border-b border-rule py-8 md:border-b-0 md:py-10",
              i > 0 && "md:border-l md:pl-8",
              i < 2 && "md:pr-8",
            )}
          >
            <span className={cn(mono, "text-[12px] text-ink-muted")}>Rule {i + 1}</span>
            <p className="semi-condensed mt-3 text-[1.9rem] font-bold leading-[1.05]">
              {i === 0 ? (
                <>
                  <span className="text-signal">Red</span> means someone should get up.
                </>
              ) : (
                rule
              )}
            </p>
            <p className="mt-4 text-[15px] leading-snug text-ink-muted">{why}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

/* ───────────────────────── closing ───────────────────────── */

function Closing() {
  return (
    <footer className="relative isolate mt-24 overflow-hidden bg-ink text-paper sm:mt-32">
      <Smoke
        rgb="243,238,228"
        intensity={0.35}
        className="-z-10 [mask-image:linear-gradient(to_top,black_40%,transparent_100%)]"
      />
      <div className={cn(wrap, "pb-10 pt-16 sm:pt-24")}>
        <p className={cn(mono, "text-[12px] opacity-60")}>06:00 — end of shift</p>
        <h2 className="condensed mt-4 text-[clamp(3.6rem,13vw,11rem)] font-extrabold uppercase leading-[0.84]">
          <RevealLine>Go back</RevealLine>
          <RevealLine>to sleep.</RevealLine>
        </h2>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            to="/overview"
            className="group bg-paper px-5 py-3 text-sm font-semibold text-ink transition-opacity hover:opacity-85"
          >
            Open Vigil{" "}
            <span className="inline-block transition-transform duration-300 group-hover:translate-x-1.5">
              →
            </span>
          </Link>
          <Link
            to="/logs"
            className={cn(
              mono,
              "text-[13px] underline underline-offset-4 opacity-80 hover:opacity-100",
            )}
          >
            or go straight to the logs
          </Link>
        </div>
        <div
          className={cn(
            mono,
            "mt-20 flex flex-wrap justify-between gap-4 border-t border-paper/20 pt-4 text-[11px] opacity-60",
          )}
        >
          <span>© {new Date().getFullYear()} Vigil. Always watching. Rarely loud.</span>
          <span className="flex gap-5">
            <Link to="/overview" className="hover:underline">
              Overview
            </Link>
            <Link to="/logs" className="hover:underline">
              Logs
            </Link>
            <Link to="/traces" className="hover:underline">
              Traces
            </Link>
            <Link to="/query" className="hover:underline">
              Query
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
