import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b-2 border-foreground pb-3">
      <div className="min-w-0">
        <h1 className="condensed text-4xl font-extrabold uppercase leading-[0.9] tracking-tight text-foreground sm:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`panel flex min-w-0 flex-col ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="eyebrow truncate">{title}</h2>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
