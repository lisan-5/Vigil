import { createFileRoute } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";

export const Route = createFileRoute("/query")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Query console · Vigil" },
      { name: "description", content: "Run VigilQL against logs and metrics." },
      { property: "og:title", content: "Query console · Vigil" },
      { property: "og:description", content: "Run VigilQL against logs and metrics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <PageHeader title="Query console" description="Run VigilQL against logs and metrics." />
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
