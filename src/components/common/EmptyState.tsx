import type { LucideIcon } from "lucide-react";
import { Moon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Calm, dry empty states. "All quiet. Nothing needs you." */
export function EmptyState({
  icon: Icon = Moon,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-1 grid size-10 place-items-center border border-border bg-surface-2">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {body && <p className="max-w-sm text-xs text-muted-foreground">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
