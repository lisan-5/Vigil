/**
 * VigilQL parser.
 *
 *   query     := search ( "|" stage )*
 *   search    := term*
 *   term      := ["-"] field op value[,value]  |  "quoted text"  |  word
 *   op        := ":" | "!=" | ">=" | "<=" | ">" | "<"
 *   stage     := count [by f, ...] | timeseries <dur> [by f] | last <dur> | limit <n>
 *              | sort <field> [asc|desc] | fields f, ... | <agg>[(field)] [by f, ...]
 *   agg       := avg | p50 | p95 | p99 | sum | min | max
 *
 * `metric:<name>` in the search switches the query to the metrics source.
 * Errors are friendly and carry a character range so the editor can underline them.
 */
import type { MetricName } from "@/api/types";
import { SERVICE_NAMES, LOG_LEVELS } from "@/api/types";
import type { AggFn, Filter, FilterOp, ParseError, ParsedQuery, Stage, Token } from "./types";

export const METRIC_NAMES: MetricName[] = [
  "requests.rate",
  "errors.rate",
  "latency.avg",
  "latency.p50",
  "latency.p95",
  "latency.p99",
  "cpu.usage",
  "memory.usage",
];
export const LOG_FIELDS = [
  "service",
  "level",
  "status",
  "method",
  "route",
  "region",
  "pod",
  "version",
  "trace_id",
  "duration_ms",
  "user_id",
  "message",
] as const;
export const METRIC_FIELDS = ["metric", "service", "region", "version"] as const;
export const STAGES = [
  "count",
  "timeseries",
  "last",
  "limit",
  "sort",
  "fields",
  "avg",
  "p50",
  "p95",
  "p99",
  "sum",
  "min",
  "max",
];
const AGGS: AggFn[] = ["avg", "p50", "p95", "p99", "sum", "min", "max"];

/** Map short field names to the underlying structured log field. */
export const FIELD_ALIASES: Record<string, string> = {
  status: "http.status",
  method: "http.method",
  route: "http.route",
};

interface Word {
  text: string;
  start: number;
  end: number;
}

/** Split on unquoted pipes. */
function splitSegments(src: string): { segments: Word[]; error?: ParseError } {
  const segments: Word[] = [];
  let start = 0;
  let quote: number | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') quote = quote === null ? i : null;
    else if (c === "|" && quote === null) {
      segments.push({ text: src.slice(start, i), start, end: i });
      start = i + 1;
    }
  }
  segments.push({ text: src.slice(start), start, end: src.length });
  if (quote !== null)
    return {
      segments,
      error: { message: "This quote is never closed.", start: quote, end: src.length },
    };
  return { segments };
}

/** Split a segment into whitespace-separated words, respecting quotes. */
function splitWords(seg: Word): Word[] {
  const words: Word[] = [];
  let i = 0;
  const s = seg.text;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    const start = i;
    let quoted = false;
    while (i < s.length && (quoted || !/\s/.test(s[i]))) {
      if (s[i] === '"') quoted = !quoted;
      i++;
    }
    words.push({ text: s.slice(start, i), start: seg.start + start, end: seg.start + i });
  }
  return words;
}

export function parseDuration(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(text);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as "ms"];
  return n * mult;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[a.length][b.length];
}

export function closest(word: string, options: readonly string[]): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const o of options) {
    const d = levenshtein(word.toLowerCase(), o.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return bestD <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}
const didYouMean = (word: string, options: readonly string[]) => {
  const c = closest(word, options);
  return c ? ` Did you mean “${c}”?` : "";
};

const FILTER_RE = /^(-)?([a-zA-Z_][\w.]*)(!=|>=|<=|:|>|<)(.*)$/;

/** Parse a list of field names that may be separated by commas and/or spaces. */
function parseFieldList(words: Word[]): { fields: string[]; ranges: Word[] } {
  const fields: string[] = [];
  const ranges: Word[] = [];
  for (const w of words) {
    let offset = 0;
    for (const part of w.text.split(",")) {
      if (part) {
        fields.push(part);
        ranges.push({ text: part, start: w.start + offset, end: w.start + offset + part.length });
      }
      offset += part.length + 1;
    }
  }
  return { fields, ranges };
}

export type ParseResult = { ok: true; query: ParsedQuery } | { ok: false; error: ParseError };

export function parse(src: string): ParseResult {
  const { segments, error } = splitSegments(src);
  if (error) return { ok: false, error };
  const filters: Filter[] = [];
  const text: string[] = [];
  let metric: MetricName | undefined;

  for (const w of splitWords(segments[0])) {
    if (w.text.startsWith('"')) {
      text.push(w.text.replace(/^"|"$/g, ""));
      continue;
    }
    const m = FILTER_RE.exec(w.text);
    if (!m) {
      text.push(w.text);
      continue;
    }
    const [, neg, field, op, rawValue] = m;
    if (!rawValue)
      return {
        ok: false,
        error: {
          message: `“${field}${op}” needs a value, like ${field}${op}${field === "level" ? "error" : "checkout"}.`,
          start: w.start,
          end: w.end,
        },
      };
    const values = rawValue.replace(/^"|"$/g, "").split(",").filter(Boolean);
    if (field === "metric") {
      if (!METRIC_NAMES.includes(values[0] as MetricName))
        return {
          ok: false,
          error: {
            message: `Unknown metric “${values[0]}”.${didYouMean(values[0], METRIC_NAMES)}`,
            start: w.start,
            end: w.end,
          },
        };
      metric = values[0] as MetricName;
      continue;
    }
    const known = [...LOG_FIELDS, "metric"] as readonly string[];
    if (!known.includes(field))
      return {
        ok: false,
        error: {
          message: `Unknown field “${field}”.${didYouMean(field, known)}`,
          start: w.start,
          end: w.start + (neg ? 1 : 0) + field.length,
        },
      };
    if (field === "service")
      for (const v of values)
        if (!(SERVICE_NAMES as readonly string[]).includes(v) && !v.includes("*"))
          return {
            ok: false,
            error: {
              message: `No service called “${v}”.${didYouMean(v, SERVICE_NAMES)}`,
              start: w.start,
              end: w.end,
            },
          };
    if (field === "level")
      for (const v of values)
        if (!(LOG_LEVELS as string[]).includes(v))
          return {
            ok: false,
            error: {
              message: `“${v}” is not a level. Use debug, info, warn or error.`,
              start: w.start,
              end: w.end,
            },
          };
    if ((op === ">" || op === "<" || op === ">=" || op === "<=") && Number.isNaN(Number(values[0])))
      return {
        ok: false,
        error: {
          message: `“${field}${op}” compares numbers, but “${values[0]}” is not one.`,
          start: w.start,
          end: w.end,
        },
      };
    filters.push({ field, op: op as FilterOp, values, negate: !!neg });
  }

  const source: ParsedQuery["source"] = metric ? "metrics" : "logs";
  if (source === "metrics") {
    const bad = filters.find((f) => !(METRIC_FIELDS as readonly string[]).includes(f.field));
    if (bad)
      return {
        ok: false,
        error: {
          message: `Metric queries filter on ${METRIC_FIELDS.slice(1).join(", ")}. “${bad.field}” only exists on logs.`,
          start: 0,
          end: segments[0].end,
        },
      };
  }

  const stages: Stage[] = [];
  for (let si = 1; si < segments.length; si++) {
    const seg = segments[si];
    const words = splitWords(seg);
    if (words.length === 0)
      return {
        ok: false,
        error: {
          message: "Empty stage after “|”. Add one, like count or timeseries 1m.",
          start: seg.start - 1,
          end: seg.end,
        },
      };
    const [head, ...args] = words;
    const aggMatch = /^(avg|p50|p95|p99|sum|min|max)(?:\(([\w.]*)\))?$/.exec(head.text);
    const name = aggMatch ? "agg" : head.text;
    const err = (message: string, w: Word = head): ParseResult => ({
      ok: false,
      error: { message, start: w.start, end: w.end },
    });
    const parseBy = (rest: Word[]): { by: string[] } | ParseResult => {
      if (rest.length === 0) return { by: [] };
      if (rest[0].text !== "by")
        return err(`Expected “by” here, as in ${head.text} by service.`, rest[0]);
      const list = parseFieldList(rest.slice(1));
      if (list.fields.length === 0) return err("“by” needs at least one field.", rest[0]);
      const allowed =
        source === "metrics" ? ["service", "region", "version"] : (LOG_FIELDS as readonly string[]);
      for (let i = 0; i < list.fields.length; i++)
        if (!allowed.includes(list.fields[i]))
          return err(
            `Can't group by “${list.fields[i]}”.${didYouMean(list.fields[i], allowed)}`,
            list.ranges[i],
          );
      if (source === "metrics" && list.fields.length > 1)
        return err("Metric queries group by one field at a time.", list.ranges[1]);
      return { by: list.fields };
    };

    switch (name) {
      case "count": {
        if (source === "metrics")
          return err("count works on logs. For metrics, try timeseries 1m.");
        const r = parseBy(args);
        if ("ok" in r) return r;
        stages.push({ type: "count", by: r.by });
        break;
      }
      case "timeseries": {
        const d = args[0] && parseDuration(args[0].text);
        if (!d) return err("timeseries needs an interval, like timeseries 5m.", args[0] ?? head);
        if (d < 1000) return err("The smallest interval is 1s.", args[0]);
        const r = parseBy(args.slice(1));
        if ("ok" in r) return r;
        stages.push({ type: "timeseries", intervalMs: d, by: r.by });
        break;
      }
      case "last": {
        const d = args[0] && parseDuration(args[0].text);
        if (!d) return err("last needs a duration, like last 15m.", args[0] ?? head);
        if (d > 7 * 86_400_000) return err("Vigil keeps 7 days. Try last 7d or less.", args[0]);
        stages.push({ type: "last", durationMs: d });
        break;
      }
      case "limit": {
        const n = Number(args[0]?.text);
        if (!args[0] || !Number.isInteger(n) || n <= 0)
          return err("limit needs a positive whole number, like limit 50.", args[0] ?? head);
        stages.push({ type: "limit", n });
        break;
      }
      case "sort": {
        if (!args[0]) return err("sort needs a field, like sort count desc.");
        const dir = args[1]?.text ?? "desc";
        if (dir !== "asc" && dir !== "desc") return err("Sort direction is asc or desc.", args[1]);
        stages.push({ type: "sort", field: args[0].text, dir });
        break;
      }
      case "fields": {
        const list = parseFieldList(args);
        if (list.fields.length === 0) return err("fields needs at least one field name.");
        stages.push({ type: "fields", fields: list.fields });
        break;
      }
      case "agg": {
        const fn = aggMatch![1] as AggFn;
        const field = aggMatch![2] || undefined;
        if (source === "logs" && !field)
          return err(`${fn} on logs needs a numeric field, like ${fn}(duration_ms).`);
        if (field && field !== "duration_ms" && field !== "status")
          return err(`Only duration_ms and status are numeric on logs.`);
        const r = parseBy(args);
        if ("ok" in r) return r;
        stages.push({ type: "agg", fn, field, by: r.by });
        break;
      }
      default:
        return err(`Unknown stage “${head.text}”.${didYouMean(head.text, STAGES)}`);
    }
  }

  return { ok: true, query: { raw: src, source, metric, filters, text, stages } };
}

/* ------------------------------------------------------------------ */
/* Tokenizer for syntax highlighting (lenient; never throws)           */
/* ------------------------------------------------------------------ */

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const { segments } = splitSegments(src);
  let cursor = 0;
  const gap = (to: number) => {
    if (to > cursor)
      tokens.push({ kind: "space", text: src.slice(cursor, to), start: cursor, end: to });
    cursor = Math.max(cursor, to);
  };
  const push = (kind: Token["kind"], start: number, end: number) => {
    gap(start);
    if (end > start) tokens.push({ kind, text: src.slice(start, end), start, end });
    cursor = end;
  };

  segments.forEach((seg, si) => {
    if (si > 0) push("pipe", seg.start - 1, seg.start);
    const words = splitWords(seg);
    words.forEach((w, wi) => {
      if (si === 0) {
        if (w.text.startsWith('"')) return push("string", w.start, w.end);
        const m = FILTER_RE.exec(w.text);
        if (!m) return push("text", w.start, w.end);
        const keyLen = (m[1] ? 1 : 0) + m[2].length;
        push("key", w.start, w.start + keyLen);
        push("op", w.start + keyLen, w.start + keyLen + m[3].length);
        push(
          m[4].startsWith('"') ? "string" : /^\d+(\.\d+)?$/.test(m[4]) ? "number" : "value",
          w.start + keyLen + m[3].length,
          w.end,
        );
      } else if (wi === 0) {
        const am = /^(\w+)(\()?([\w.]*)(\))?$/.exec(w.text);
        if (am && am[2]) {
          push("keyword", w.start, w.start + am[1].length);
          push("punct", w.start + am[1].length, w.start + am[1].length + 1);
          push("key", w.start + am[1].length + 1, w.start + am[1].length + 1 + am[3].length);
          push("punct", w.end - (am[4] ? 1 : 0), w.end);
        } else push(STAGES.includes(w.text) ? "keyword" : "error", w.start, w.end);
      } else if (w.text === "by" || w.text === "asc" || w.text === "desc")
        push("keyword", w.start, w.end);
      else if (parseDuration(w.text) !== null) push("duration", w.start, w.end);
      else if (/^\d+$/.test(w.text)) push("number", w.start, w.end);
      else {
        let off = 0;
        for (const part of w.text.split(",")) {
          if (off > 0) push("punct", w.start + off - 1, w.start + off);
          push("key", w.start + off, w.start + off + part.length);
          off += part.length + 1;
        }
      }
    });
  });
  gap(src.length);
  return tokens;
}

/* ------------------------------------------------------------------ */
/* Autocomplete                                                        */
/* ------------------------------------------------------------------ */

export interface Suggestion {
  label: string;
  detail?: string;
  /** Text inserted in place of [from, to). */
  insert: string;
}

const VALUE_HINTS: Record<string, string[]> = {
  service: [...SERVICE_NAMES],
  level: [...LOG_LEVELS],
  metric: METRIC_NAMES,
  status: ["200", "404", "429", "500", "502", "503", "504"],
  method: ["GET", "POST"],
  region: ["us-east-1", "eu-west-1", "ap-south-1"],
};

const STAGE_DETAIL: Record<string, string> = {
  count: "count rows, optionally by field",
  timeseries: "bucket over time, e.g. timeseries 1m",
  last: "time range, e.g. last 15m",
  limit: "cap the number of rows",
  sort: "order rows by a field",
  fields: "choose columns to show",
  avg: "average of a field",
  p50: "median",
  p95: "95th percentile",
  p99: "99th percentile",
  sum: "sum of a field",
  min: "minimum",
  max: "maximum",
};

export function suggest(
  src: string,
  cursor: number,
): { from: number; to: number; items: Suggestion[] } {
  const before = src.slice(0, cursor);
  const wordStart =
    Math.max(before.lastIndexOf(" "), before.lastIndexOf("|"), before.lastIndexOf(",")) + 1;
  let wordEnd = cursor;
  while (wordEnd < src.length && !/[\s|,]/.test(src[wordEnd])) wordEnd++;
  const word = src.slice(wordStart, cursor);
  const segIndex = (before.match(/\|/g) ?? []).length;
  const segStart = before.lastIndexOf("|") + 1;
  const segWordsBefore = src.slice(segStart, wordStart).trim().split(/\s+/).filter(Boolean);
  const isMetric = /\bmetric:/.test(src);
  const match = (items: Suggestion[]) =>
    items
      .filter((s) => s.label.toLowerCase().startsWith(word.toLowerCase()) && s.label !== word)
      .slice(0, 8);

  if (segIndex === 0) {
    const colon = word.indexOf(":");
    if (colon >= 0) {
      const key = word.slice(0, colon).replace(/^-/, "");
      const valuePrefix = word.slice(colon + 1);
      const items = (VALUE_HINTS[key] ?? [])
        .filter((v) => v.startsWith(valuePrefix) && v !== valuePrefix)
        .map((v) => ({ label: v, detail: key, insert: `${word.slice(0, colon + 1)}${v} ` }));
      return { from: wordStart, to: wordEnd, items: items.slice(0, 8) };
    }
    const keys = (isMetric ? METRIC_FIELDS : ["metric", ...LOG_FIELDS]).map((k) => ({
      label: `${k}:`,
      detail: k === "metric" ? "switch to metrics" : "filter",
      insert: `${k}:`,
    }));
    return { from: wordStart, to: wordEnd, items: word ? match(keys) : keys.slice(0, 8) };
  }

  if (segWordsBefore.length === 0) {
    const stages = STAGES.filter((s) => !isMetric || s !== "count").map((s) => ({
      label: s,
      detail: STAGE_DETAIL[s],
      insert: `${s} `,
    }));
    return { from: wordStart, to: wordEnd, items: match(stages) };
  }
  const head = segWordsBefore[0];
  const prev = segWordsBefore[segWordsBefore.length - 1];
  if ((head === "timeseries" || head === "last") && segWordsBefore.length === 1) {
    const ds = (
      head === "last" ? ["5m", "15m", "1h", "6h", "24h", "7d"] : ["10s", "1m", "5m", "15m", "1h"]
    ).map((d) => ({ label: d, insert: `${d} ` }));
    return { from: wordStart, to: wordEnd, items: match(ds) };
  }
  if (
    prev === "by" ||
    src[wordStart - 1] === "," ||
    head === "fields" ||
    (head === "sort" && segWordsBefore.length === 1)
  ) {
    const fields = (
      isMetric
        ? ["service", "region", "version"]
        : [...LOG_FIELDS, ...(head === "sort" ? ["count"] : [])]
    ).map((f) => ({ label: f, detail: "field", insert: f }));
    return { from: wordStart, to: wordEnd, items: match(fields) };
  }
  if (head === "sort" && segWordsBefore.length === 2)
    return {
      from: wordStart,
      to: wordEnd,
      items: match([
        { label: "desc", insert: "desc" },
        { label: "asc", insert: "asc" },
      ]),
    };
  if (["count", "timeseries", ...AGGS].some((s) => head.startsWith(s)) && prev !== "by")
    return {
      from: wordStart,
      to: wordEnd,
      items: match([{ label: "by", detail: "group by", insert: "by " }]),
    };
  return { from: wordStart, to: wordEnd, items: [] };
}
