// Hand-authored source of truth for the recommendation flowchart. The Astro
// page (`src/pages/reviews/flowchart.astro`) feeds this through
// `src/lib/flowchart-layout.ts` to produce dagre-positioned xyflow nodes.
//
// IDs are string-stable: edges reference them and the future migration off
// the Figma board (~150 nodes) expects to add more nodes incrementally
// without renumbering. Two parallel arrays of typed nodes (decisions and
// books) instead of a single polymorphic array, because authoring is easier
// when "another decision" and "another book" are visually distinct sections.

export interface DecisionNode {
  id: string;
  /** Headline question shown inside the diamond. */
  prompt: string;
  /** Pick a colour from the Tailwind 500 palette for the node's border
   *  and background tint. Omit for the default `'gray'`. */
  color?: PaletteColor;
  /** Layout escape hatch — if set, dagre's computed position is ignored and
   *  this top-left coordinate is used instead. Use sparingly; intended for
   *  the rare node that has to sit in a hand-tuned spot (section anchors,
   *  group headers, the very top of the tree). */
  pinned?: { x: number; y: number };
}

export interface BookNode {
  id: string;
  /** Matches the review collection entry id, i.e. `content/reviews/<reviewId>/`. */
  reviewId: string;
  /** See DecisionNode.pinned. */
  pinned?: { x: number; y: number };
}

/**
 * Named palette colours used for both edges and decision-node accents.
 * Each maps to a Tailwind 500-shade hex in `EDGE_PALETTE` inside
 * `flowchart-layout.ts`. Add new entries by editing both this union and
 * that map — the two are intentionally kept in lockstep so a typo here
 * fails type-checking instead of silently falling back to the default.
 */
export type PaletteColor =
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'rose'
  | 'gray';

/** @deprecated Use `PaletteColor`. Kept as an alias because the union
 *  is now shared with decision-node accents, not just edges. */
export type EdgeColor = PaletteColor;

/**
 * Edge path style. Friendly names that the layout helper maps onto
 * xyflow's built-in edge renderers (`'bezier'` → xyflow's `'default'`).
 */
export type EdgeType =
  | 'bezier'
  | 'simplebezier'
  | 'smoothstep'
  | 'step'
  | 'straight';

export interface FlowchartEdge {
  id: string;
  source: string;
  target: string;
  /** Answer text that labels the edge ("I will survive", etc.). */
  label?: string;
  /** Pick a colour from the Tailwind 500 palette. Omit for the default
   *  accent green. */
  color?: PaletteColor;
  /** Override the path style for this single edge. Falls back to
   *  `FlowchartData.defaultEdgeType` when omitted. */
  type?: EdgeType;
}

export interface FlowchartData {
  decisions: DecisionNode[];
  books: BookNode[];
  edges: FlowchartEdge[];
  /** Path style applied to every edge that doesn't set its own `type`.
   *  Defaults to `'bezier'` if omitted. */
  defaultEdgeType?: EdgeType;
}

export const flowchart: FlowchartData = {
  defaultEdgeType: 'bezier',
  decisions: [
    { id: 'd_start', prompt: 'Will you die without stats or a system?', color: 'amber' },
    { id: 'd_support', prompt: 'Want to support the flowchart maker?' }
  ],
  books: [
    { id: 'b_dotf', reviewId: 'defiance_of_the_fall' },
    { id: 'b_cradle', reviewId: 'cradle' },
    { id: 'b_soul_relic', reviewId: 'soul_relic' },
  ],
  edges: [
    { id: 'e_start_dotf', source: 'd_start', target: 'b_dotf', label: 'Instant death.', color: 'red' },
    { id: 'e_start_support', source: 'd_start', target: 'd_support', label: 'I will survive.', color: 'emerald' },
    { id: 'e_support_cradle', source: 'd_support', target: 'b_cradle', label: 'Nah', color: 'violet' },
    { id: 'e_support_soul_relic', source: 'd_support', target: 'b_soul_relic', label: 'Hell yeah!', color: 'sky' },
  ],
};
