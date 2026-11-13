import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { PageHeader, Panel } from "@/components/common/PageHeader";
import {
  IncidentFeed,
  KpiCard,
  ServiceHealthGrid,
  ThroughputChart,
} from "@/components/overview/widgets";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "Overview · Vigil" },
      {
        name: "description",
        content:
          "Real-time fleet health: throughput, error rate, latency, service status and recent incidents.",
      },
      { property: "og:title", content: "Overview · Vigil" },
      { property: "og:description", content: "Fleet health at a glance, in one calm screen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

function Overview() {
  return (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <PageHeader title="Overview" description="Watching 8 services. Updated every second." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["rps", "errors", "p95", "alerts"] as const).map((k) => (
          <ErrorBoundary key={k} label={`kpi-${k}`}>
            <KpiCard kind={k} />
          </ErrorBoundary>
        ))}
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Panel
          title="Throughput · last 5 minutes"
          className="xl:col-span-2"
          bodyClassName="p-3"
          actions={
            <Button asChild variant="ghost" size="xs">
              <Link to="/metrics">
                Metrics <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        >
          <ErrorBoundary label="throughput">
            <ThroughputChart height={260} />
          </ErrorBoundary>
        </Panel>
        <Panel
          title="Recent incidents"
          actions={
            <Button asChild variant="ghost" size="xs">
              <Link to="/alerts">
                All alerts <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        >
          <ErrorBoundary label="incidents">
            <IncidentFeed limit={6} />
          </ErrorBoundary>
        </Panel>
      </div>
      <Panel
        title="Service health"
        className="mt-3"
        actions={
          <Button asChild variant="ghost" size="xs">
            <Link to="/service-map" search={{}}>
              Service map <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      >
        <ErrorBoundary label="health-grid">
          <ServiceHealthGrid />
        </ErrorBoundary>
      </Panel>
    </div>
  );
}
