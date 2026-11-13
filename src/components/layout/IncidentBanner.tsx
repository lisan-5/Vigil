import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { OctagonAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDuration, fmtPct } from "@/lib/format";
import { useLatestTick } from "@/stores/live";
import { useIncidentControls } from "./IncidentControls";

/** Thin status strip shown while an incident is in progress. */
export function IncidentBanner() {
  const { active, end } = useIncidentControls();
  const tick = useLatestTick();
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  if (!active) return null;
  const err = tick?.services[active.service].errorRate ?? 0;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-critical/30 bg-critical/10 px-4 py-1.5 text-xs text-foreground animate-fade-up"
    >
      <OctagonAlert className="size-3.5 text-critical" aria-hidden />
      <span>
        Incident in progress on <span className="font-mono font-medium">{active.service}</span>
      </span>
      <span className="num text-muted-foreground">
        for {fmtDuration(Date.now() - active.startedAt)}
      </span>
      <span className="num text-muted-foreground">
        error rate <span className="font-mono text-critical">{fmtPct(err, 1)}</span>
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button asChild variant="ghost" size="xs">
          <Link to="/logs" search={{ service: active.service, level: "error" }}>
            View error logs
          </Link>
        </Button>
        <Button asChild variant="ghost" size="xs">
          <Link to="/alerts">Alerts</Link>
        </Button>
        <Button variant="ghost" size="xs" onClick={() => end.mutate(active.id)}>
          Resolve
        </Button>
      </div>
    </div>
  );
}
