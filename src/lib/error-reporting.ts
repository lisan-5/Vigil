/**
 * Central hook for errors caught by React error boundaries.
 *
 * Today it logs to the console with context. Wire a real error tracker
 * (Sentry, Honeybadger, …) in here and every boundary picks it up.
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error("[vigil] uncaught render error", {
    message: describeThrown(error),
    route: window.location.pathname,
    ...context,
    error,
  });
}

const MAX_SERIALIZED_LENGTH = 2000;

// Loaders and server fns can throw raw Responses and plain objects,
// which String() reduces to "[object ...]".
export function describeThrown(error: unknown): string {
  if (error instanceof Response) {
    return `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  const { message } = (error ?? {}) as { message?: unknown };
  if (typeof message === "string" && message.length > 0) return message;
  try {
    return JSON.stringify(error)?.slice(0, MAX_SERIALIZED_LENGTH) ?? String(error);
  } catch {
    return String(error);
  }
}
