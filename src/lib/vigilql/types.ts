/** VigilQL abstract syntax. Produced by the parser, consumed by executors (mock or server). */
import type { MetricName } from "@/api/types";

export type FilterOp = ":" | "!=" | ">" | "<" | ">=" | "<=";

export interface Filter {
  field: string;
  op: FilterOp;
  /** One or more values (comma separated in source = OR). */
  values: string[];
  negate: boolean;
}

export type AggFn = "avg" | "p50" | "p95" | "p99" | "sum" | "min" | "max";

export type Stage =
  | { type: "count"; by: string[] }
  | { type: "timeseries"; intervalMs: number; by: string[] }
  | { type: "last"; durationMs: number }
  | { type: "limit"; n: number }
  | { type: "sort"; field: string; dir: "asc" | "desc" }
  | { type: "fields"; fields: string[] }
  | { type: "agg"; fn: AggFn; field?: string; by: string[] };

export interface ParsedQuery {
  raw: string;
  source: "logs" | "metrics";
  metric?: MetricName;
  filters: Filter[];
  /** Free-text terms, ANDed together. */
  text: string[];
  stages: Stage[];
}

export interface ParseError {
  message: string;
  start: number;
  end: number;
}

export type TokenKind =
  | "key"
  | "op"
  | "value"
  | "text"
  | "string"
  | "pipe"
  | "keyword"
  | "number"
  | "duration"
  | "punct"
  | "space"
  | "error";

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}
