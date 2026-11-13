import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy URL: the landing page now lives at "/". */
export const Route = createFileRoute("/welcome")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
