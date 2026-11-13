import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
const makeRouter = () => createRouter({ routeTree, context: { queryClient: new QueryClient() } });

describe("App routing", () => {
  it.each(["/", "/overview", "/logs", "/traces", "/metrics", "/service-map", "/alerts"])(
    "matches a page for %s instead of falling back to not found",
    (path) => {
      const matches = makeRouter().matchRoutes(path);
      expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    },
  );

  it("serves the landing page at / and the dashboard at /overview", () => {
    const router = makeRouter();
    expect(router.matchRoutes("/").at(-1)?.routeId).toBe("/");
    expect(router.matchRoutes("/overview").at(-1)?.routeId).toBe("/overview");
  });
});
