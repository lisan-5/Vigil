import { createFileRoute } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Vigil" },
      { name: "description", content: "API keys, notification channels, theme and shortcuts." },
      { property: "og:title", content: "Settings · Vigil" },
      {
        property: "og:description",
        content: "API keys, notification channels, theme and shortcuts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <PageHeader
        title="Settings"
        description="API keys, notification channels, theme and shortcuts."
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
