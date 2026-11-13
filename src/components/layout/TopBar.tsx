import { Link } from "@tanstack/react-router";
import { Bell, Menu, Moon, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLive, useOpenAlerts } from "@/stores/live";
import { useUI } from "@/stores/ui";
import { TimeRangePicker } from "./TimeRangePicker";

export function TopBar({
  onOpenPalette,
  onOpenMenu,
}: {
  onOpenPalette: () => void;
  onOpenMenu: () => void;
}) {
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const status = useLive((s) => s.status);
  const open = useOpenAlerts();
  const firing = open.filter((a) => a.state === "firing").length;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-foreground bg-background px-3 md:px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={onOpenMenu}
        aria-label="Open navigation"
      >
        <Menu aria-hidden />
      </Button>
      <button
        type="button"
        onClick={onOpenPalette}
        data-tour="search"
        className="flex h-8 min-w-0 flex-1 items-center gap-2 border border-input bg-transparent px-2.5 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:border-foreground sm:max-w-sm"
        aria-label="Open command palette"
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">Search, jump, or run a command</span>
        <span className="ml-auto hidden items-center gap-0.5 sm:flex" aria-hidden>
          <span className="kbd">⌘</span>
          <span className="kbd">K</span>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <span
          className="hidden items-center gap-1.5 px-1 font-mono text-[11px] text-muted-foreground sm:flex"
          role="status"
          aria-live="polite"
        >
          <span
            className={cn(
              "size-2",
              status === "open"
                ? "bg-healthy animate-pulse-soft"
                : status === "connecting"
                  ? "bg-warning"
                  : "bg-critical",
            )}
            aria-hidden
          />
          {status === "open" ? "Connected" : status === "connecting" ? "Connecting" : "Offline"}
        </span>
        <TimeRangePicker compact />
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={firing ? `${firing} alerts firing` : "Alerts"}
        >
          <Link to="/alerts">
            <Bell aria-hidden />
            {firing > 0 && (
              <span
                className="absolute right-1 top-1 size-2 bg-critical ring-2 ring-background"
                aria-hidden
              />
            )}
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
        </Button>
      </div>
    </header>
  );
}
