import { cn } from "@/lib/utils";

/**
 * Vigil mark: a geometric shield with a pulse line.
 * Calm: the pulse lies flat and breathes in teal. Alerting: it spikes, in amber.
 */
export function VigilLogo({
  alerting = false,
  className,
  size = 24,
}: {
  alerting?: boolean;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={alerting ? "Vigil — alert active" : "Vigil — all quiet"}
      className={cn(
        "shrink-0 transition-colors duration-500",
        alerting ? "text-critical" : "text-foreground",
        className,
      )}
    >
      <path
        d="M12 2.25 19.75 5.1v5.9c0 5.1-3.2 8.95-7.75 10.75C7.45 19.95 4.25 16.1 4.25 11V5.1L12 2.25Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        className="opacity-90"
      />
      <path
        d="M7 12.25h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        className={cn(
          "transition-opacity duration-500",
          alerting ? "opacity-0" : "animate-pulse-soft opacity-100",
        )}
      />
      <path
        d="M6.5 12.5h2.4l1.5-3.8 2.1 7.3 1.6-5 1 1.5h2.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("transition-opacity duration-300", alerting ? "opacity-100" : "opacity-0")}
      />
    </svg>
  );
}
