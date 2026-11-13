import { Link, useRouterState } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { VigilLogo } from "@/components/brand/VigilLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useOpenAlerts } from "@/stores/live";
import { useUI } from "@/stores/ui";
import { NAV } from "./nav";

/**
 * Navigation. Full labels on desktop (lg+), an icon rail on tablet (md), and
 * rendered inside a sheet on phones (see AppShell).
 */
export function Sidebar({
  variant = "auto",
  onNavigate,
}: {
  variant?: "auto" | "full";
  onNavigate?: () => void;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const open = useOpenAlerts();
  const firing = open.filter((a) => a.state === "firing").length;
  const setTour = useUI((s) => s.setTour);
  const full = variant === "full";
  const label = full ? "" : "hidden lg:inline";

  return (
    <nav
      aria-label="Main"
      data-tour="nav"
      className={cn(
        "flex h-full flex-col gap-1 bg-sidebar p-2 text-sidebar-foreground",
        full ? "w-full" : "w-14 border-r border-sidebar-border lg:w-52",
      )}
    >
      <Link
        to="/"
        onClick={onNavigate}
        className="mb-3 flex items-center gap-2 border-b-2 border-sidebar-border px-2 pb-3 pt-2"
        aria-label="Vigil home"
      >
        <VigilLogo alerting={open.length > 0} size={22} />
        <span
          className={cn(
            "condensed text-2xl font-black uppercase leading-none tracking-tight text-foreground",
            label,
          )}
        >
          Vigil
        </span>
      </Link>
      {NAV.map((item) => {
        const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
        const Icon = item.icon;
        const link = (
          <Link
            to={item.to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-foreground/[0.06] hover:text-sidebar-foreground",
              !full && "justify-center lg:justify-start",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className={cn("flex-1", label)}>{item.label}</span>
            {item.to === "/alerts" && firing > 0 && (
              <span
                className={cn(
                  "num bg-critical px-1.5 text-[10px] font-semibold leading-4 text-critical-foreground",
                  !full && "absolute right-1 top-0.5 lg:static",
                )}
                aria-label={`${firing} firing`}
              >
                {firing}
              </span>
            )}
            <span
              className={cn(
                "kbd border-current text-current opacity-0 transition-opacity group-hover:opacity-100",
                full ? "hidden" : "hidden lg:inline-flex",
              )}
              aria-hidden
            >
              g {item.key}
            </span>
          </Link>
        );
        return full ? (
          <div key={item.to}>{link}</div>
        ) : (
          <Tooltip key={item.to}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right" className="lg:hidden">
              {item.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
      <div className="mt-auto">
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            setTour(true);
          }}
          className={cn(
            "flex w-full items-center gap-2.5 px-2.5 py-1.5 text-[13px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
            !full && "justify-center lg:justify-start",
          )}
        >
          <Compass className="size-4" aria-hidden />
          <span className={label}>Take the tour</span>
        </button>
        <p
          className={cn(
            "px-2.5 pt-2 font-mono text-[10px] text-muted-foreground",
            full ? "" : "hidden lg:block",
          )}
        >
          Always watching. Rarely loud.
        </p>
      </div>
    </nav>
  );
}
