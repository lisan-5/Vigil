import { CalendarClock, Check, RotateCcw } from "lucide-react";
import type { RelativeRange } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RANGE_LABEL, rangeLabel } from "@/lib/format";
import { useUI } from "@/stores/ui";

const OPTIONS: RelativeRange[] = ["5m", "15m", "1h", "6h", "24h", "7d"];

/** Global time range. Absolute ranges come from zoom-by-drag on charts. */
export function TimeRangePicker({ compact = false }: { compact?: boolean }) {
  const range = useUI((s) => s.timeRange);
  const setRange = useUI((s) => s.setTimeRange);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="subtle"
          size="sm"
          data-tour="range"
          aria-label={`Time range: ${rangeLabel(range)}`}
        >
          <CalendarClock aria-hidden />
          <span className={compact ? "hidden xl:inline" : ""}>
            {range.kind === "relative" ? range.value : rangeLabel(range)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="eyebrow">Time range</DropdownMenuLabel>
        {OPTIONS.map((o) => (
          <DropdownMenuItem key={o} onSelect={() => setRange({ kind: "relative", value: o })}>
            <span className="flex-1">{RANGE_LABEL[o]}</span>
            {range.kind === "relative" && range.value === o && (
              <Check className="size-3.5 text-primary" aria-label="selected" />
            )}
          </DropdownMenuItem>
        ))}
        {range.kind === "absolute" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setRange({ kind: "relative", value: "1h" })}>
              <RotateCcw className="size-3.5" aria-hidden /> Reset zoom
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
