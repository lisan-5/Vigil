import { Component, type ReactNode } from "react";
import { reportError } from "@/lib/error-reporting";

/** Widget-level boundary: one broken panel never takes the page down. */
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string; fallback?: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    reportError(error, { boundary: `widget:${this.props.label ?? "unknown"}` });
  }

  override render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div
            role="alert"
            className="flex h-full min-h-24 flex-col items-center justify-center gap-2 p-4 text-center"
          >
            <p className="text-sm text-foreground">
              This panel stopped. The rest of Vigil is fine.
            </p>
            <p className="max-w-xs truncate font-mono text-[11px] text-muted-foreground">
              {this.state.error.message}
            </p>
            <button
              type="button"
              className="text-xs text-primary underline-offset-4 hover:underline"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
