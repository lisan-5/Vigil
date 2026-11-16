import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { vigil } from "@/api";
import { SERVICE_NAMES, type ServiceName } from "@/api/types";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { PageHeader, Panel } from "@/components/common/PageHeader";
import { ServiceGraph } from "@/components/service-map/ServiceGraph";
import { Skeleton } from "@/components/ui/skeleton";
import { useLatestTick, useLive } from "@/stores/live";

const isService = (s: unknown): s is ServiceName =>
  typeof s === "string" && (SERVICE_NAMES as readonly string[]).includes(s);

export const Route = createFileRoute("/service-map")({
  validateSearch: (s: Record<string, unknown>): { service?: ServiceName } => ({
    service: isService(s.service) ? s.service : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Service map · Vigil" },
      { name: "description", content: "Graph of services, traffic and error rates." },
      { property: "og:title", content: "Service map · Vigil" },
      { property: "og:description", content: "Graph of services, traffic and error rates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ServiceMap,
});

function ServiceMap() {
  const { service } = Route.useSearch();
  const navigate = Route.useNavigate();
  const tick = useLatestTick();
  const alerts = useLive((s) => s.alerts);
  const services = useQuery({ queryKey: ["services"], queryFn: () => vigil.listServices() });
  const edges = useQuery({
    queryKey: ["service-edges"],
    queryFn: () => {
      const to = Date.now();
      return vigil.getServiceEdges({ from: to - 60_000, to });
    },
    refetchInterval: 2000,
  });

  return (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <PageHeader
        title="Service map"
        description="Who calls whom, right now. Line weight is traffic; colour is the health of the callee."
        actions={<Legend />}
      />
      <Panel title={`${SERVICE_NAMES.length} services · ${edges.data?.length ?? "—"} dependencies`}>
        <ErrorBoundary label="service-graph">
          {services.data && edges.data ? (
            <ServiceGraph
              services={services.data}
              edges={edges.data}
              snapshots={tick?.services}
              alerts={alerts}
              selected={service}
              onSelect={(s) => navigate({ search: { service: s }, replace: true })}
            />
          ) : (
            <Skeleton className="m-3 aspect-[1000/560]" />
          )}
        </ErrorBoundary>
      </Panel>
    </div>
  );
}

function Legend() {
  const item = (cls: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-[3px] w-5 ${cls}`} aria-hidden />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted-foreground">
      {item("bg-muted-foreground", "healthy")}
      {item("bg-warning", "degraded")}
      {item("bg-critical", "critical")}
    </div>
  );
}
