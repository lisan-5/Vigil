/**
 * First-run guided tour: four short steps, anchored to elements marked with data-tour.
 * Shown once; can be replayed from the sidebar, the command palette, or Settings.
 */
import { useEffect, useLayoutEffect, useState } from "react";
import { X } from "lucide-react";
import { VigilLogo } from "@/components/brand/VigilLogo";
import { Button } from "@/components/ui/button";
import { useUI } from "@/stores/ui";

const STEPS = [
  {
    target: null,
    title: "Welcome to Vigil",
    body: "Vigil watches your services so you don't have to stare at them. A few quick notes, then you're on your own.",
  },
  {
    target: "nav",
    title: "Everything in one column",
    body: "Logs, metrics, traces and alerts are all here. Press g then a letter to jump — g l opens logs.",
  },
  {
    target: "search",
    title: "Keyboard first",
    body: "⌘K opens the command palette from anywhere. / focuses search on the page you're on. ? lists every shortcut.",
  },
] as const;

export function Tour() {
  const open = useUI((s) => s.tourOpen);
  const done = useUI((s) => s.tourDone);
  const setTour = useUI((s) => s.setTour);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Auto-open on first run, after persisted preferences have loaded.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const maybeOpen = () => {
      if (!useUI.getState().tourDone)
        t = setTimeout(() => !useUI.getState().tourDone && useUI.getState().setTour(true), 800);
    };
    if (useUI.persist.hasHydrated()) maybeOpen();
    const unsub = useUI.persist.onFinishHydration(maybeOpen);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Esc dismisses the tour, like every other overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTour(false, true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setTour]);

  const current = STEPS[step];
  useLayoutEffect(() => {
    if (!open || !current.target) return setRect(null);
    const find = () => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tour="${current.target}"]`),
      );
      const el = els.find((e) => e.offsetParent !== null);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    find();
    window.addEventListener("resize", find);
    return () => window.removeEventListener("resize", find);
  }, [open, step, current.target]);

  if (!open) return null;
  const close = () => setTour(false, true);
  const last = step === STEPS.length - 1;

  // Position the card next to the target, clamped to the viewport.
  const card = { width: 320 };
  let style: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const right = rect.right + 16 + card.width < vw;
    const left = right
      ? rect.right + 16
      : Math.max(12, Math.min(vw - card.width - 12, rect.left + rect.width / 2 - card.width / 2));
    const top = right ? Math.min(vh - 220, Math.max(12, rect.top)) : rect.bottom + 12;
    style = { left, top };
  }
  void done;

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px]" onClick={close} />
      {rect && (
        <div
          className="pointer-events-none absolute ring-2 ring-primary transition-all duration-300"
          style={{
            left: rect.left - 4,
            top: rect.top - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px color-mix(in oklab, var(--background) 35%, transparent)",
          }}
          aria-hidden
        />
      )}
      <div className="panel absolute w-80 p-4 animate-fade-up" style={style}>
        <div className="mb-2 flex items-center gap-2">
          <VigilLogo size={18} />
          <span className="eyebrow">
            {step + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            onClick={close}
            className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Skip tour"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <h2 id="tour-title" className="text-sm font-semibold">
          {current.title}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{current.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1 w-4 ${i <= step ? "bg-primary" : "bg-border"}`} />
            ))}
          </div>
          <div className="flex gap-1.5">
            {step > 0 && (
              <Button size="xs" variant="ghost" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button size="xs" onClick={() => (last ? close() : setStep(step + 1))} autoFocus>
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
