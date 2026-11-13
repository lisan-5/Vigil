import { createFileRoute } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";

export const Route = createFileRoute("/service-map")({
  validateSearch: (s: Record<string, unknown>): { service?: string } => ({
    service: typeof s.service === "string" ? s.service : undefined,
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
  component: () => (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <PageHeader title="Service map" description="Graph of services, traffic and error rates." />
      <div className="panel">
        <EmptyState
          icon={Hourglass}
          title="Under construction"
          body="We are building this page. Everything else keeps watching in the meantime."
        />
      </div>
    </div>
  ),
});
