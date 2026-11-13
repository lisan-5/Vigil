import { createFileRoute } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";

export const Route = createFileRoute("/alerts")({
  validateSearch: (s: Record<string, unknown>): { alert?: string } => ({
    alert: typeof s.alert === "string" ? s.alert : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Alerts · Vigil" },
      { name: "description", content: "Alert rules, history and firing alerts." },
      { property: "og:title", content: "Alerts · Vigil" },
      { property: "og:description", content: "Alert rules, history and firing alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <PageHeader title="Alerts" description="Alert rules, history and firing alerts." />
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
