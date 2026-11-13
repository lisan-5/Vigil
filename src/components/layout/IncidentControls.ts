import { useMutation } from "@tanstack/react-query";
import { vigil } from "@/api";
import { useLive } from "@/stores/live";

/** The most recent active incident, plus a mutation to resolve it. */
export function useIncidentControls() {
  const incidents = useLive((s) => s.incidents);
  const active = incidents[incidents.length - 1];
  const end = useMutation({
    mutationFn: (id: string) => vigil.endIncident!(id),
    onSuccess: (_, id) => {
      const s = useLive.getState();
      s.setIncidents(s.incidents.filter((i) => i.id !== id));
    },
  });
  return { active, end, supported: !!vigil.endIncident };
}
