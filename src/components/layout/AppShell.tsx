import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useUI } from "@/stores/ui";
import { LiveBridge } from "@/components/live/LiveBridge";
import { CommandPalette } from "./CommandPalette";
import { IncidentBanner } from "./IncidentBanner";
import { NAV } from "./nav";
import { PreferencesHydrator } from "./PreferencesHydrator";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Tour } from "./Tour";

/** App chrome: navigation, top bar, global shortcuts, live data bridge, tour and toasts. */
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [menu, setMenu] = useState(false);
  const theme = useUI((s) => s.theme);

  const goto = Object.fromEntries(NAV.map((n) => [`g ${n.key}`, () => navigate({ to: n.to })]));
  useHotkeys({
    "mod+k": () => setPalette((o) => !o),
    "?": () => setShortcuts(true),
    "/": () => {
      // Pages mark their primary search input with data-search; fall back to the palette.
      const el = Array.from(document.querySelectorAll<HTMLElement>("[data-search]")).find(
        (e) => e.offsetParent !== null,
      );
      if (el) el.focus();
      else setPalette(true);
    },
    ...goto,
  });

  return (
    <TooltipProvider delayDuration={300}>
      <PreferencesHydrator />
      <LiveBridge />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-1.5 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="flex h-dvh overflow-hidden bg-background">
        <aside className="hidden shrink-0 md:block">
          <Sidebar />
        </aside>
        <Sheet open={menu} onOpenChange={setMenu}>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar variant="full" onNavigate={() => setMenu(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenPalette={() => setPalette(true)} onOpenMenu={() => setMenu(true)} />
          <IncidentBanner />
          <main id="main" className="relative min-h-0 flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
      <CommandPalette
        open={palette}
        onOpenChange={setPalette}
        onShowShortcuts={() => setShortcuts(true)}
      />
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      <Tour />
      <Toaster theme={theme} position="bottom-right" closeButton />
    </TooltipProvider>
  );
}
