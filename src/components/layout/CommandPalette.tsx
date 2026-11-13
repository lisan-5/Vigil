import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Compass,
  Keyboard,
  Moon,
  Network,
  ScrollText,
  Siren,
  Terminal,
  Waypoints,
} from "lucide-react";
import { SERVICE_NAMES } from "@/api/types";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useUI } from "@/stores/ui";
import { NAV } from "./nav";
import { useIncidentControls } from "./IncidentControls";

export function CommandPalette({
  open,
  onOpenChange,
  onShowShortcuts,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onShowShortcuts: () => void;
}) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const saved = useUI((s) => s.savedQueries);
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const setTour = useUI((s) => s.setTour);
  const { active, end, supported } = useIncidentControls();

  const run = (fn: () => void) => {
    onOpenChange(false);
    setValue("");
    fn();
  };
  const looksLikeTrace = /^[0-9a-f]{32}$/i.test(value.trim());

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Type a command, a service, or text to search logs…"
        value={value}
        onValueChange={setValue}
      />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>Nothing matches. Try a page name or a service.</CommandEmpty>
        {value.trim() && (
          <CommandGroup heading="Search">
            <CommandItem
              value={`search-logs ${value}`}
              onSelect={() => run(() => navigate({ to: "/logs", search: { q: value.trim() } }))}
            >
              <ScrollText aria-hidden /> Search logs for “{value.trim()}”
            </CommandItem>
            {looksLikeTrace && (
              <CommandItem
                value={`open-trace ${value}`}
                onSelect={() =>
                  run(() =>
                    navigate({
                      to: "/traces/$traceId",
                      params: { traceId: value.trim().toLowerCase() },
                    }),
                  )
                }
              >
                <Waypoints aria-hidden /> Open trace {value.trim().slice(0, 12)}…
              </CommandItem>
            )}
            <CommandItem
              value={`run-query ${value}`}
              onSelect={() => run(() => navigate({ to: "/query", search: { q: value.trim() } }))}
            >
              <Terminal aria-hidden /> Run as VigilQL
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          {NAV.map((n) => (
            <CommandItem
              key={n.to}
              value={`go ${n.label}`}
              onSelect={() => run(() => navigate({ to: n.to }))}
            >
              <n.icon aria-hidden /> {n.label}
              <CommandShortcut>g {n.key}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          {supported && active && (
            <CommandItem value="resolve incident" onSelect={() => run(() => end.mutate(active.id))}>
              <Siren aria-hidden /> Resolve incident on {active.service}
            </CommandItem>
          )}
          <CommandItem
            value="toggle theme"
            onSelect={() => run(() => setTheme(theme === "dark" ? "light" : "dark"))}
          >
            <Moon aria-hidden /> Switch to {theme === "dark" ? "light" : "dark"} theme
          </CommandItem>
          <CommandItem value="keyboard shortcuts" onSelect={() => run(onShowShortcuts)}>
            <Keyboard aria-hidden /> Keyboard shortcuts
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
          <CommandItem value="take the tour" onSelect={() => run(() => setTour(true))}>
            <Compass aria-hidden /> Take the tour
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Services">
          {SERVICE_NAMES.map((s) => (
            <CommandItem
              key={s}
              value={`service ${s}`}
              onSelect={() => run(() => navigate({ to: "/service-map", search: { service: s } }))}
            >
              <Network aria-hidden /> <span className="font-mono">{s}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {saved.length > 0 && (
          <CommandGroup heading="Saved queries">
            {saved.map((q) => (
              <CommandItem
                key={q.id}
                value={`saved ${q.name} ${q.query}`}
                onSelect={() => run(() => navigate({ to: "/query", search: { q: q.query } }))}
              >
                <Terminal aria-hidden /> {q.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
