import { createFileRoute, Link } from "@tanstack/react-router";
import { MotionConfig, motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EASE, FadeUp, MaskLine, RevealLine, ScrollProgress } from "@/components/landing/motion";
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
const FIXED = 259; // 02:19
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

type Status = { label: string; loud: boolean };
function statusAt(m: number): Status {
  if (m >= SPIKE && m < SPIKE + 1.2) return { label: "Alert fired · payments", loud: true };
  if (m >= SPIKE && m < FIXED) return { label: "Paging Dana · payments", loud: true };
  if (m >= FIXED && m < FIXED + 10) return { label: "Rolled back · settling", loud: false };
  if (m >= NIGHT) return { label: "Shift over · 1 page, 5 minutes", loud: false };
  return { label: "All quiet", loud: false };
}

/** Replays the night like a chart recorder. Starts at 22:00 so server and client render the same frame. */
function useNight() {
  const [m, setM] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const start = useRef(0);
  const restart = () => (start.current = performance.now());

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setM(NIGHT);
      return;
    }
    const DUR = 24000;
    const HOLD = 5000;
    let raf = 0;
    start.current = performance.now();
    const loop = (now: number) => {
      const e = (now - start.current) % (DUR + HOLD);
      setM(Math.min(NIGHT, (e / DUR) * NIGHT));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { m: scrub ?? m, scrubbing: scrub !== null, setScrub, restart };
}

/* ───────────────────────── page ───────────────────────── */

function Landing() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-clip bg-paper font-archivo text-ink selection:bg-signal/25">
        <ScrollProgress />
        <Night />
        <Inside />
        <Parts />
        <Rules />
        <Closing />
      </div>
    </MotionConfig>
  );
}

const wrap = "mx-auto w-full max-w-[1240px] px-5 sm:px-8";
const mono = "font-plexmono";

function Night() {
  const { m, scrubbing, setScrub, restart } = useNight();
  const st = statusAt(m);
  // Parallax: as the hero scrolls away the headline drifts up and fades a little.
  const hero = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: hero, offset: ["start start", "end start"] });
  const headY = useTransform(scrollYProgress, [0, 1], [0, -140]);
  const headO = useTransform(scrollYProgress, [0, 0.7], [1, 0.15]);

  return (
    <section ref={hero} className="relative isolate">
      <Smoke
        intensity={0.3}
        className="-z-10 [mask-image:linear-gradient(to_bottom,transparent_0%,black_12%,black_80%,transparent_100%)]"
      />
      {/* masthead */}
      <motion.header
        className={cn(wrap, "pt-5")}
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
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
            <a href="#inside" className="hidden underline-offset-4 hover:underline md:inline">
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
          <span
            aria-live="polite"
            className={cn("flex items-center gap-2 tabular-nums", st.loud && "text-signal")}
          >
            <span
              className={cn("inline-block h-2 w-2", st.loud ? "animate-blink bg-signal" : "bg-ink")}
            />
            {hhmm(m)} — {st.label}
          </span>
        </div>
      </motion.header>

      {/* headline */}
      <div className={cn(wrap, "grid gap-8 pb-10 pt-12 md:grid-cols-12 md:gap-6 md:pt-16")}>
        <motion.h1
          style={{ y: headY, opacity: headO }}
          className="condensed text-[clamp(3.6rem,12.5vw,10.5rem)] font-extrabold uppercase leading-[0.84] tracking-[-0.01em] md:col-span-8"
        >
          <MaskLine delay={0.15}>Nothing</MaskLine>
          <MaskLine delay={0.27}>happened</MaskLine>
          <MaskLine delay={0.39}>last night.</MaskLine>
        </motion.h1>
        <FadeUp delay={0.65} className="flex flex-col justify-end md:col-span-4">
          <p className="text-lg leading-snug text-ink md:text-[1.2rem]">
            Well — something did. At 02:14 payments started timing out. Vigil noticed in eleven
            seconds, woke{" "}
            <em className="not-italic underline decoration-signal decoration-2 underline-offset-4">
              exactly one person
            </em>
            , and showed her the line that mattered. Rolled back by 02:19. Everyone else slept.
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
              href="#inside"
              className={cn(mono, "text-[13px] underline underline-offset-4 hover:text-ink-muted")}
            >
              read the incident ↓
            </a>
          </div>
        </FadeUp>
      </div>

      {/* the chart recorder */}
      <FadeUp delay={0.9} y={32} className={wrap}>
        <div
          className={cn(
            mono,
            "flex items-end justify-between gap-4 pb-9 text-[11px] text-ink-muted",
          )}
        >
          <span>
            Fig. 1 — error rate<span className="hidden sm:inline">, all services</span>, last night
            {scrubbing ? " · scrubbing" : ""}
          </span>
          <button onClick={restart} className="underline-offset-4 hover:text-ink hover:underline">
            ↺ replay
          </button>
        </div>
        <Recorder m={m} setScrub={setScrub} />
      </FadeUp>
    </section>
  );
}

function Recorder({ m, setScrub }: { m: number; setScrub: (v: number | null) => void }) {
  const pct = (m / NIGHT) * 100;
  const passed = (at: number) => m >= at;
  const scrubFrom = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setScrub(Math.max(0, Math.min(NIGHT, ((e.clientX - r.left) / r.width) * NIGHT)));
  };

  return (
    <figure>
      <div
        className="relative h-[260px] cursor-crosshair touch-pan-y select-none border-y-2 border-ink sm:h-[360px]"
        onPointerMove={scrubFrom}
        onPointerDown={scrubFrom}
        onPointerLeave={() => setScrub(null)}
        aria-label="Error rate chart for last night. Flat except a spike between 02:14 and 02:19."
        role="img"
      >
        {/* graph paper */}
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
          {[1, 2].map((v) => (
            <line
              key={v}
              x1={0}
              x2={W}
              y1={Y(v)}
              y2={Y(v)}
              stroke="var(--rule)"
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

        {/* the trace, revealed up to the needle */}
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
              strokeWidth={2.2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        {/* axis notes */}
        <span
          className={cn(mono, "absolute left-1.5 text-[10px] text-signal")}
          style={{ top: `calc(${(Y(1) / H) * 100}% - 16px)` }}
        >
          1% — page someone
        </span>
        <span
          className={cn(mono, "absolute left-1.5 text-[10px] text-ink-muted")}
          style={{ top: `calc(${(Y(2) / H) * 100}% - 16px)` }}
        >
          2%
        </span>
        <span
          className={cn(
            mono,
            "absolute bottom-1.5 right-1.5 hidden text-[10px] text-ink-muted sm:block",
          )}
        >
          ···· traffic &nbsp; —— errors
        </span>

        {/* margin notes */}
        <Note at={102} top="34%" show={passed(102)} className="hidden sm:block">
          23:40 checkout v412 ships.
          <br />
          Nothing moves. Good.
        </Note>
        <Note at={SPIKE} top="4%" show={passed(SPIKE)} loud>
          02:14 payments → Stripe timeouts.
          <br />
          Dana is paged. Only Dana.
        </Note>
        <Note at={FIXED + 3} top="40%" show={passed(FIXED + 3)}>
          02:19 rolled back.
          <br />
          Back to sleep.
        </Note>
        <Note at={432} top="20%" show={passed(432)} flip className="hidden sm:block">
          05:12 nightly batch.
          <br />
          Expected, so silent.
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
  loud,
  flip,
  className,
  children,
}: {
  at: number;
  top: string;
  show: boolean;
  loud?: boolean;
  flip?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        mono,
        "pointer-events-none absolute whitespace-nowrap py-0.5 text-[10.5px] leading-snug transition-opacity duration-300 sm:text-[11.5px]",
        flip ? "-translate-x-full border-r pr-2 text-right" : "border-l pl-2",
        loud ? "border-signal text-signal" : "border-ink text-ink",
        show ? "opacity-100" : "opacity-0",
        className,
      )}
      style={{ left: `${(at / NIGHT) * 100}%`, top }}
    >
      {children}
    </p>
  );
}

/* ───────────────────────── § 2 — 02:14 from the inside ───────────────────────── */

const ENTRIES: { t: string; src: string; line: string; note: string; loud?: boolean }[] = [
  {
    t: "02:14:03",
    src: "log · payments",
    line: "ERROR stripe timeout after 3 retries",
    note: "First error. The next 412 identical lines fold into this one, with a counter.",
    loud: true,
  },
  {
    t: "02:14:14",
    src: "alert",
    line: "error_rate{svc=payments} 1.3% > 1% for 10s",
    note: "Alert fires. One page, to the payments on-call. Not the whole channel.",
    loud: true,
  },
  {
    t: "02:15:40",
    src: "trace · 9f2c…a1",
    line: "POST /orders 2,912ms — 2,700ms in stripe.charge",
    note: "Dana opens the alert on her phone. The slow span is already highlighted.",
  },
  {
    t: "02:17:02",
    src: "deploy",
    line: "rollback payments v88 → v87",
    note: "The 01:50 deploy is pinned right on the chart, so the question answers itself.",
  },
  {
    t: "02:19:30",
    src: "alert",
    line: "RESOLVED error_rate{svc=payments} 0.3%",
    note: "Under 1% for two minutes. Resolves on its own; nobody has to click anything.",
  },
  { t: "02:21", src: "dana", line: "back to sleep", note: "The part we actually care about." },
];

function Inside() {
  return (
    <section id="inside" className={cn(wrap, "scroll-mt-6 pt-24 sm:pt-32")}>
      <SectionHead
        n="2"
        title="02:14, from the inside."
        aside="Five minutes, six entries. This is the whole incident."
      />
      <ol className="border-t-2 border-ink">
        {ENTRIES.map((e, i) => (
          <motion.li
            key={e.t}
            initial={{ opacity: 0, x: -40, y: 0 }}
            whileInView={{ opacity: 1, x: 0, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -8% 0px" }}
            transition={{ duration: 0.8, ease: EASE, delay: i * 0.07 }}
            className="grid gap-x-6 gap-y-1 border-b border-rule py-5 md:grid-cols-12 md:items-baseline"
          >
            <span
              className={cn(
                mono,
                "text-2xl font-medium tabular-nums md:col-span-2",
                e.loud && "text-signal",
              )}
            >
              {e.t}
            </span>
            <span
              className={cn(
                mono,
                "text-[11px] uppercase tracking-wider text-ink-muted md:col-span-2",
              )}
            >
              {e.src}
            </span>
            <code className={cn(mono, "text-[13px] md:col-span-4", e.loud && "text-signal")}>
              {e.line}
            </code>
            <span className="text-[15px] leading-snug text-ink-muted md:col-span-4">{e.note}</span>
          </motion.li>
        ))}
      </ol>
    </section>
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
