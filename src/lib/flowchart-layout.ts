/**
 * Build-time layout helper for the recommendation flowchart.
 *
 * Runs entirely on the server during `astro build` (or `astro dev`'s SSR
 * pass): walks the typed `FlowchartData`, validates references, resolves
 * each book's cover via the existing `resolveCover` helper, calls dagre
 * for x/y positions, and emits arrays already typed as xyflow's
 * `Node<T, K>` / `Edge<T, K>` so the Svelte island accepts them without
 * casts.
 *
 * Because this module imports `@dagrejs/dagre` and `astro:content`, it is
 * never bundled into client output — it is only ever reached from `.astro`
 * frontmatter. That keeps dagre (~13 KB gzipped) off the wire and the
 * `getImage()` cover URLs pre-resolved before hydration.
 */
import dagre from '@dagrejs/dagre';
import { getEntry } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { Node, Edge } from '@xyflow/svelte';
import { resolveCover } from './covers';
import type { FlowchartData, DecisionNode, EdgeColor } from '../data/flowchart';

// Book nodes mirror the "wide" review card layout from the main reviews
// page: 250x400 cover on the left, title/sentence/tags pane on the right,
// total card 520x400. Dagre treats every book the same so the graph stays
// visually consistent. Decision nodes are smaller pills above them.
const COVER_W = 250;
const COVER_H = 400;
const NODE_SIZES = {
  decision: { width: 320, height: 90 },
  book: { width: 520, height: 400 },
} as const;

// Tailwind palette pairs: `line` is the 500-shade used for the path
// stroke and the label background; `text` is the brightest 50-shade
// used for the label text. Kept here (not in SCSS) because the values
// have to ship to two places — the SVG path's `stroke` AND the HTML
// label's `background` — and the label is portalled out of the edge
// element by xyflow's `EdgeLabelRenderer`, which breaks any CSS-
// custom-property cascade scoped to `.svelte-flow__edge`. Inline
// `style` / `labelStyle` is the only reliable way to keep both ends
// in lockstep without writing 18 colour pairs of duplicate CSS.
const EDGE_PALETTE: Record<EdgeColor | 'default', { line: string; text: string }> = {
  red:     { line: '#ef4444', text: '#fef2f2' },
  orange:  { line: '#f97316', text: '#fff7ed' },
  amber:   { line: '#f59e0b', text: '#fffbeb' },
  yellow:  { line: '#eab308', text: '#fefce8' },
  lime:    { line: '#84cc16', text: '#f7fee7' },
  green:   { line: '#22c55e', text: '#f0fdf4' },
  emerald: { line: '#10b981', text: '#ecfdf5' },
  teal:    { line: '#14b8a6', text: '#f0fdfa' },
  cyan:    { line: '#06b6d4', text: '#ecfeff' },
  sky:     { line: '#0ea5e9', text: '#f0f9ff' },
  blue:    { line: '#3b82f6', text: '#eff6ff' },
  indigo:  { line: '#6366f1', text: '#eef2ff' },
  violet:  { line: '#8b5cf6', text: '#f5f3ff' },
  purple:  { line: '#a855f7', text: '#faf5ff' },
  fuchsia: { line: '#d946ef', text: '#fdf4ff' },
  pink:    { line: '#ec4899', text: '#fdf2f8' },
  rose:    { line: '#f43f5e', text: '#fff1f2' },
  gray:    { line: '#6b7280', text: '#f9fafb' },
  // Default = main-500 (the SRH accent green).
  default: { line: '#10b981', text: '#ecfdf5' },
};

export interface BookNodePayload extends Record<string, unknown> {
  kind: 'book';
  reviewId: string;
  title: string;
  sentence: string;
  tags: readonly string[];
  tier: CollectionEntry<'reviews'>['data']['review'];
  cover: { src: string; width: number; height: number };
  link: string;
}

export interface DecisionNodePayload extends Record<string, unknown> {
  kind: 'decision';
  prompt: string;
}

// Tighten against xyflow's own `Node<TData, TType>` so the island accepts
// these directly into `let nodes = $state<FlowNode[]>(initialNodes)` with
// no cast. Same trick for edges.
export type BookFlowNode = Node<BookNodePayload, 'book'>;
export type DecisionFlowNode = Node<DecisionNodePayload, 'decision'>;
export type FlowNode = BookFlowNode | DecisionFlowNode;
export type FlowEdge = Edge<{ color?: EdgeColor }, 'smoothstep'>;

function validateFlowchart(data: FlowchartData): void {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const n of [...data.decisions, ...data.books]) {
    if (ids.has(n.id)) errors.push(`duplicate node id: ${n.id}`);
    ids.add(n.id);
  }
  for (const e of data.edges) {
    if (!ids.has(e.source)) errors.push(`edge ${e.id}: unknown source ${e.source}`);
    if (!ids.has(e.target)) errors.push(`edge ${e.id}: unknown target ${e.target}`);
  }
  // `reviewId` existence is checked during entry resolution below — we let
  // `getEntry` throw with a precise filesystem-aware message there so the
  // author sees both the bad id AND the surrounding collection state.
  if (errors.length) {
    throw new Error(`flowchart data invalid:\n  - ${errors.join('\n  - ')}`);
  }
}

export async function getLayoutedElements(
  data: FlowchartData,
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> {
  validateFlowchart(data);

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 120, edgesep: 30 });
  g.setDefaultEdgeLabel(() => ({}));

  // Resolve all book payloads in parallel. `resolveCover` calls `getImage`
  // which can block on sharp processing for first-time encodes.
  const bookPayloads = await Promise.all(
    data.books.map(async (book) => {
      const entry = await getEntry('reviews', book.reviewId);
      if (!entry) {
        throw new Error(
          `flowchart: review entry not found for reviewId "${book.reviewId}". ` +
            `Check that content/reviews/${book.reviewId}/index.md exists.`,
        );
      }
      const size = NODE_SIZES.book;
      // Resolve the cover at the wide-card cover dimensions, not the full
      // node dimensions — the right-hand pane holds title/sentence/tags.
      const cover = await resolveCover(entry, COVER_W, COVER_H);
      const payload: BookNodePayload = {
        kind: 'book',
        reviewId: entry.id,
        title: entry.data.short_title ?? entry.data.name,
        sentence: entry.data.sentence,
        tags: [...entry.data.tags].sort().map((t) => t.toLowerCase()),
        tier: entry.data.review,
        cover,
        link: `/reviews/${entry.id}/`,
      };
      return { node: book, size, payload };
    }),
  );

  // Clone the size objects per call: dagre mutates the label object during
  // `layout()` to attach `x`, `y`, `rank`, etc. Passing the same shared
  // `NODE_SIZES.book` reference for every book makes them all point to the
  // same record and overwrite each other's position. Spreading is enough.
  for (const d of data.decisions) g.setNode(d.id, { ...NODE_SIZES.decision });
  for (const b of bookPayloads) g.setNode(b.node.id, { ...b.size });
  for (const e of data.edges) {
    // Reserve label space inside dagre so labels don't crash into adjacent
    // ranks. `width`/`height` here describe the *label*, not the edge.
    g.setEdge(e.source, e.target, {
      label: e.label ?? '',
      width: e.label ? Math.max(60, e.label.length * 7) : 0,
      height: e.label ? 24 : 0,
      labelpos: 'c',
    });
  }

  dagre.layout(g);

  // dagre returns the node *centre*; xyflow expects *top-left*. Shift here
  // unless the node is pinned (pinned coordinates are already top-left).
  const placeDecision = (d: DecisionNode): DecisionFlowNode => {
    const size = NODE_SIZES.decision;
    let position: { x: number; y: number };
    if (d.pinned) {
      position = { x: d.pinned.x, y: d.pinned.y };
    } else {
      const laidOut = g.node(d.id);
      position = { x: laidOut.x - size.width / 2, y: laidOut.y - size.height / 2 };
    }
    return {
      id: d.id,
      type: 'decision',
      position,
      width: size.width,
      height: size.height,
      ariaLabel: `Decision: ${d.prompt}`,
      data: { kind: 'decision', prompt: d.prompt },
    };
  };

  const placeBook = (b: (typeof bookPayloads)[number]): BookFlowNode => {
    const { node, payload, size } = b;
    let position: { x: number; y: number };
    if (node.pinned) {
      position = { x: node.pinned.x, y: node.pinned.y };
    } else {
      const laidOut = g.node(node.id);
      position = { x: laidOut.x - size.width / 2, y: laidOut.y - size.height / 2 };
    }
    return {
      id: node.id,
      type: 'book',
      position,
      width: size.width,
      height: size.height,
      ariaLabel: `Recommendation: ${payload.title}`,
      data: payload,
    };
  };

  const nodes: FlowNode[] = [
    ...data.decisions.map(placeDecision),
    ...bookPayloads.map(placeBook),
  ];

  const edges: FlowEdge[] = data.edges.map((e) => {
    const palette = EDGE_PALETTE[e.color ?? 'default'];
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'smoothstep',
      ariaLabel: e.label ? `Edge labelled "${e.label}"` : undefined,
      // `style` reaches the SVG path inside `.svelte-flow__edge`; xyflow
      // applies it via the `style` attribute on `<path>`, where SVG
      // `stroke` is honoured exactly like CSS.
      style: `stroke: ${palette.line};`,
      // `labelStyle` reaches the portalled HTML `<div>` rendered by
      // `EdgeLabelRenderer` — we set the solid 500-shade background
      // and the brightest-shade hue tint for the text in the same
      // string so the two sides of the colour pair can never drift.
      labelStyle: `background: ${palette.line}; color: ${palette.text};`,
      data: { color: e.color },
    };
  });

  return { nodes, edges };
}
