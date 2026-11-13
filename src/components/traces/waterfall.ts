/** Pure helpers for laying out a trace waterfall. */
import type { Span } from "@/api/types";

export interface SpanNode {
  span: Span;
  depth: number;
  children: SpanNode[];
}

export function buildTree(spans: Span[]): SpanNode[] {
  const byId = new Map<string, SpanNode>();
  for (const s of spans) byId.set(s.span_id, { span: s, depth: 0, children: [] });
  const roots: SpanNode[] = [];
  for (const node of byId.values()) {
    const parent = node.span.parent_id ? byId.get(node.span.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const setDepth = (n: SpanNode, d: number) => {
    n.depth = d;
    n.children.sort((a, b) => a.span.start - b.span.start);
    n.children.forEach((c) => setDepth(c, d + 1));
  };
  roots.forEach((r) => setDepth(r, 0));
  return roots;
}

/** Depth-first rows, skipping children of collapsed spans. */
export function flatten(roots: SpanNode[], collapsed: Set<string>): SpanNode[] {
  const out: SpanNode[] = [];
  const walk = (n: SpanNode) => {
    out.push(n);
    if (!collapsed.has(n.span.span_id)) n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

/**
 * Critical path: starting at the root, repeatedly follow the child that finishes last.
 * Those spans are the ones that actually determined the request's total latency.
 */
export function criticalPath(roots: SpanNode[]): Set<string> {
  const path = new Set<string>();
  let node: SpanNode | undefined = roots[0];
  while (node) {
    path.add(node.span.span_id);
    node = node.children.reduce<SpanNode | undefined>(
      (best, c) =>
        !best || c.span.start + c.span.duration > best.span.start + best.span.duration ? c : best,
      undefined,
    );
  }
  return path;
}

/** "Self time": duration not covered by child spans. */
export function selfTime(n: SpanNode): number {
  const intervals = n.children
    .map((c) => [c.span.start, c.span.start + c.span.duration] as const)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let cursor = n.span.start;
  for (const [s, e] of intervals) {
    const start = Math.max(s, cursor);
    if (e > start) {
      covered += e - start;
      cursor = e;
    }
  }
  return Math.max(0, n.span.duration - covered);
}
