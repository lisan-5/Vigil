import { createFileRoute } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";

export const Route = createFileRoute("/metrics")({
  head: () => ({
    meta: [
      { title: "Metrics · Vigil" },
      { name: "description", content: "Chart builder with group-by, aggregations and zoom." },
      { property: "og:title", content: "Metrics · Vigil" },
      {
        property: "og:description",
        content: "Chart builder with group-by, aggregations and zoom.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <PageHeader
        title="Metrics"
        description="Chart builder with group-by, aggregations and zoom."
      />
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
