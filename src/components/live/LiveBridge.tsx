/**
 * Connects the StreamClient to the live store, once, for the whole app.
 * Also turns alert and incident events into calm, informative toasts.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { stream, vigil } from "@/api";
import { useLive } from "@/stores/live";
import { fmtMetric } from "@/lib/format";
import { METRIC_UNITS } from "@/api/mock/metrics";

export function LiveBridge() {
  const qc = useQueryClient();

  useEffect(() => {
    const live = useLive.getState();
    let cancelled = false;
    const now = Date.now();
    vigil
      .getSnapshots({ from: now - 300_000, to: now, stepMs: 1000 })
      .then((t) => !cancelled && live.setBackfill(t));
    vigil.listAlerts().then((a) => !cancelled && live.setAlerts(a));
    vigil.listIncidents().then((i) => !cancelled && live.setIncidents(i));

    const unsubs = [
      stream.subscribe("metrics", (tick) => useLive.getState().pushTick(tick)),
      stream.subscribe("alerts", (e) => {
        useLive.getState().upsertAlert(e.alert);
        qc.invalidateQueries({ queryKey: ["alerts"] });
        const v = fmtMetric(e.alert.value, METRIC_UNITS[e.alert.metric]);
        if (e.type === "alert.fired")
          toast[e.alert.severity === "critical" ? "error" : "warning"](
            `${e.alert.ruleName} · ${e.alert.service}`,
            {
              description: `Firing at ${v}. Threshold ${e.alert.op} ${fmtMetric(e.alert.threshold, METRIC_UNITS[e.alert.metric])}.`,
            },
          );
        if (e.type === "alert.resolved")
          toast.success(`Resolved · ${e.alert.service}`, { description: e.alert.ruleName });
      }),
      stream.subscribe("incidents", (e) => {
        const s = useLive.getState();
        if (e.type === "incident.started") {
          s.setIncidents([...s.incidents.filter((i) => i.id !== e.incident.id), e.incident]);
          toast.warning(`Incident started on ${e.incident.service}`, {
            description: "Error rates are climbing. Watch the overview.",
          });
        } else {
          s.setIncidents(s.incidents.filter((i) => i.id !== e.incident.id));
          toast(`Incident on ${e.incident.service} is winding down`, {
            description: "Alerts resolve once the error rate settles.",
          });
        }
      }),
      stream.onStatusChange((st) => useLive.getState().setStatus(st)),
    ];
    useLive.getState().setStatus(stream.getStatus());
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [qc]);

  return null;
}
