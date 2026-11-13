import type { ServiceName } from "@/api/types";
import { SERVICE_NAMES } from "@/api/types";

export const PALETTE = Array.from({ length: 8 }, (_, i) => `var(--chart-${i + 1})`);

export const SERVICE_COLOR: Record<ServiceName, string> = Object.fromEntries(
  SERVICE_NAMES.map((s, i) => [s, PALETTE[i % PALETTE.length]]),
) as Record<ServiceName, string>;

export function colorFor(label: string, index: number): string {
  return (SERVICE_COLOR as Record<string, string>)[label] ?? PALETTE[index % PALETTE.length];
}
