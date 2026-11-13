import { Fragment, type ReactNode } from "react";

/** Small, dependency-free pretty printer with syntax colouring for expanded log lines. */
export function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed">
      {render(value, 0)}
    </pre>
  );
}

const pad = (n: number) => "  ".repeat(n);

function render(v: unknown, depth: number): ReactNode {
  if (v === null || v === undefined) return <span className="text-muted-foreground">null</span>;
  if (typeof v === "string") return <span className="text-healthy">{JSON.stringify(v)}</span>;
  if (typeof v === "number") return <span className="text-primary">{v}</span>;
  if (typeof v === "boolean") return <span className="text-warning">{String(v)}</span>;
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    return (
      <>
        {"[\n"}
        {v.map((x, i) => (
          <Fragment key={i}>
            {pad(depth + 1)}
            {render(x, depth + 1)}
            {i < v.length - 1 ? ",\n" : "\n"}
          </Fragment>
        ))}
        {pad(depth)}
        {"]"}
      </>
    );
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    if (!entries.length) return "{}";
    return (
      <>
        {"{\n"}
        {entries.map(([k, x], i) => (
          <Fragment key={k}>
            {pad(depth + 1)}
            <span className="text-foreground">{JSON.stringify(k)}</span>
            {": "}
            {render(x, depth + 1)}
            {i < entries.length - 1 ? ",\n" : "\n"}
          </Fragment>
        ))}
        {pad(depth)}
        {"}"}
      </>
    );
  }
  return String(v);
}
