import { createFileRoute } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";

export const Route = createFileRoute("/dashboards")({
  head: () => ({
    meta: [
      { title: "Dashboards · Vigil" },
      { name: "description", content: "Drag-and-drop dashboards of saved widgets." },
      { property: "og:title", content: "Dashboards · Vigil" },
      { property: "og:description", content: "Drag-and-drop dashboards of saved widgets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <PageHeader title="Dashboards" description="Drag-and-drop dashboards of saved widgets." />
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
