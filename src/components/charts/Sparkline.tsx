import { useId } from "react";
import { cn } from "@/lib/utils";

/** Lightweight SVG sparkline — cheap enough to render dozens that update every second. */
export function Sparkline({
  values,
  className,
  color = "var(--primary)",
  height = 28,
  fill = true,
}: {
  values: number[];
  className?: string;
  color?: string;
  height?: number;
  fill?: boolean;
}) {
  const id = useId();
  const w = 100;
  if (values.length < 2)
    return <div className={cn("w-full", className)} style={{ height }} aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    height - 2 - ((v - min) / span) * (height - 4),
  ]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join("");
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full overflow-visible", className)}
      style={{ height }}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.12} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={`${line}L${w},${height}L0,${height}Z`} fill={`url(#${id})`} />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
