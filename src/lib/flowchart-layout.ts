/**
 * Build-time layout helper for the recommendation flowchart.
 *
 * Runs entirely on the server during `astro build` (or `astro dev`'s SSR
 * pass): walks the typed `FlowchartData`, validates references, resolves
 * each book's cover via the existing `resolveCover` helper, calls Graphviz
 * `neato` for x/y positions, and emits arrays already typed as xyflow's
 * `Node<T, K>` / `Edge<T, K>` so the Svelte island accepts them without casts.
 *
 * Node sizes are passed per-node as `width`/`height`/`fixedsize=true` DOT
 * attributes so the 320×90 pills, 640×180 large pills, and 520×400 book cards
 * each occupy their correct footprint. Graphviz returns centre coordinates in
 * `plain` format; these are converted to top-left (with y-axis flip) before
 * being written to the positions map or the on-disk cache.
 *
 * Because this module imports `@hpcc-js/wasm-graphviz` and `astro:content`,
 * it is never bundled into client output — it is only ever reached from
 * `.astro` frontmatter. That keeps the layout library off the wire and the
 * `getImage()` cover URLs pre-resolved before hydration.
 */
import { Graphviz } from '@hpcc-js/wasm-graphviz';
import { getEntry } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { Node, Edge } from '@xyflow/svelte';
import { MarkerType } from '@xyflow/svelte';
import { resolveCover } from './covers';
import type {
  FlowchartData,
  DecisionNode,
  EdgeType,
  PaletteColor,
} from '../data/flowchart';
import {
  buildEdgeGeometry,
  closestPointOnSegment,
  pickSide,
  polylineCrossing,
  rectCentre,
  type EdgeSpec,
  type Vec2,
} from './flowchart-edge-geometry';
import { scoreLayout, type LayoutScore } from './flowchart-score';
import {
  classifyCoverage,
  loadPositions,
  savePositions,
} from './flowchart-positions';

// Book nodes mirror the "wide" review card layout from the main reviews
// page: 250x400 cover on the left, title/sentence/tags pane on the right,
// total card 520x400. ELK treats every book the same so the graph stays
// visually consistent. Decision nodes are smaller pills above them.
const COVER_W = 250;
const COVER_H = 400;
const NODE_SIZES = {
  decision: { width: 320, height: 90 },
  book: { width: 520, height: 400 },
} as const;

/**
 * Resolve the rendered footprint for a decision node. Defaults to the
 * 320x90 pill, doubles to 640x180 when the author opts in via
 * `size: 'large'` on the data file. The CSS in `.decision-node` is
 * `width/height: 100%` so the prompt scales by container — no need to
 * tweak the component for the larger variant.
 */
function decisionSize(d: DecisionNode): { width: number; height: number } {
  const base = NODE_SIZES.decision;
  if (d.size === 'large') {
    return { width: base.width * 2, height: base.height * 2 };
  }
  return base;
}

const ROOT_ID = 'd_start';

// ── Graphviz WASM singleton ─────────────────────────────────────────────────
let _graphvizPromise: Promise<Graphviz> | null = null;
function getGraphviz(): Promise<Graphviz> {
  if (!_graphvizPromise) _graphvizPromise = Graphviz.load();
  return _graphvizPromise;
}

/** Scale factor applied to node centre positions after conversion from inches.
 *  Values < 1 pack the layout tighter; 1.0 = raw Graphviz output. */
const LAYOUT_SCALE = 0.7;

function buildDotString(
  data: FlowchartData,
  sizes: Map<string, { w: number; h: number }>,
): string {
  const lines: string[] = [];
  lines.push('digraph G {');
  // overlap=prism removes node overlaps; sep adds padding between nodes.
  lines.push('  graph [overlap=scale splines=spline];');
  lines.push('  edge [len=1];');
  for (const d of data.decisions) {
    const sz = sizes.get(d.id)!;
    const wIn = (sz.w / 72).toFixed(6);
    const hIn = (sz.h / 72).toFixed(6);
    lines.push(`  "${d.id}" [width=${wIn} height=${hIn} shape=box fixedsize=true];`);
  }
  for (const b of data.books) {
    const sz = sizes.get(b.id)!;
    const wIn = (sz.w / 72).toFixed(6);
    const hIn = (sz.h / 72).toFixed(6);
    lines.push(`  "${b.id}" [width=${wIn} height=${hIn} shape=box fixedsize=true];`);
  }
  for (const e of data.edges) {
    lines.push(`  "${e.source}" -> "${e.target}";`);
  }
  lines.push('}');
  return lines.join('\n');
}

function parsePlainOutput(
  plain: string,
  sizes: Map<string, { w: number; h: number }>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  let totalHeightIn = 0;
  for (const line of plain.split('\n')) {
    if (line.startsWith('graph ')) {
      totalHeightIn = parseFloat(line.split(' ')[3]);
      break;
    }
  }
  for (const line of plain.split('\n')) {
    if (!line.startsWith('node ')) continue;
    const parts = line.split(' ');
    const rawName = parts[1];
    const id = rawName.startsWith('"') ? rawName.slice(1, -1) : rawName;
    const cxIn = parseFloat(parts[2]);
    const cyIn = parseFloat(parts[3]);
    const sz = sizes.get(id);
    if (!sz) continue;
    const cxPx = cxIn * 72 * LAYOUT_SCALE;
    const cyFlippedPx = (totalHeightIn - cyIn) * 72 * LAYOUT_SCALE;
    positions.set(id, {
      x: cxPx - sz.w / 2,
      y: cyFlippedPx - sz.h / 2,
    });
  }
  return positions;
}

function normaliseOrigin(positions: Map<string, { x: number; y: number }>): void {
  const root = positions.get(ROOT_ID);
  if (!root) return;
  const dx = root.x;
  const dy = root.y;
  if (dx === 0 && dy === 0) return;
  for (const p of positions.values()) {
    p.x -= dx;
    p.y -= dy;
  }
}

async function computeGraphvizLayout(
  data: FlowchartData,
  sizes: Map<string, { w: number; h: number }>,
): Promise<Map<string, { x: number; y: number }>> {
  const gv = await getGraphviz();
  const dotSrc = buildDotString(data, sizes);
  const plain = gv.neato(dotSrc, 'plain');
  return parsePlainOutput(plain, sizes);
}

// Tailwind palette pairs: `line` is the 500-shade used for the path
// stroke and the label background; `text` is the brightest 50-shade
// used for the label text. Kept here (not in SCSS) because the values
// have to ship to two places — the SVG path's `stroke` AND the HTML
// label's `background` — and the label is portalled out of the edge
// element by xyflow's `EdgeLabelRenderer`, which breaks any CSS-
// custom-property cascade scoped to `.svelte-flow__edge`. Inline
// `style` / `labelStyle` is the only reliable way to keep both ends
// in lockstep without writing 18 colour pairs of duplicate CSS.
const EDGE_PALETTE: Record<PaletteColor | 'default', { line: string; text: string }> = {
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
  /** Pre-lowercased "title sentence author tags search_terms" string for
   *  cheap substring matching by the in-canvas search bar. Mirrors the
   *  shape used by `src/pages/reviews/index.astro`'s `Post.search_term`
   *  so a query that finds a book on `/reviews/` finds it here too.
   *  Built once at build time inside `getLayoutedElements`; never
   *  re-derived on the client. */
  searchHaystack: string;
}

export interface DecisionNodePayload extends Record<string, unknown> {
  kind: 'decision';
  prompt: string;
  /** Resolved palette so the Svelte component can apply the colour
   *  inline — same reasoning as edges (xyflow portals/scopes break
   *  the CSS cascade for variables defined on `.svelte-flow__node`). */
  accent: { line: string; text: string };
  /** Mirrors `DecisionNode.size` from `flowchart.ts`. The Svelte
   *  component reads this and toggles `.decision-node--large`, which
   *  bumps the prompt's font-size and padding so the doubled pill
   *  doesn't render with timid 1.5rem text in a 640x180 box. */
  size: 'normal' | 'large';
  /** Pre-lowercased prompt for the in-canvas search bar. See
   *  `BookNodePayload.searchHaystack`. */
  searchHaystack: string;
}

// Tighten against xyflow's own `Node<TData, TType>` so the island accepts
// these directly into `let nodes = $state<FlowNode[]>(initialNodes)` with
// no cast. Same trick for edges.
export type BookFlowNode = Node<BookNodePayload, 'book'>;
export type DecisionFlowNode = Node<DecisionNodePayload, 'decision'>;
export type FlowNode = BookFlowNode | DecisionFlowNode;

/**
 * All edges share a single custom xyflow type that re-implements the
 * built-in path renderers and shifts the label toward the source. The
 * original `EdgeType` from the data file is carried in `data.pathType`
 * and read inside `OffsetLabelEdge.svelte` to pick the right path
 * helper (bezier / smoothstep / step / straight).
 */
const CUSTOM_EDGE_TYPE = 'offsetLabel';

export type FlowEdge = Edge<
  {
    color?: PaletteColor;
    pathType: EdgeType;
    /** Pre-lowercased edge label for the in-canvas search bar. Empty
     *  string for unlabelled edges — they can never match a non-empty
     *  query, which is the correct behaviour. See
     *  `BookNodePayload.searchHaystack`. */
    searchHaystack: string;
    /** Toggled by the search bar in `Flowchart.svelte`. We carry it on
     *  `data` (rather than on `edge.class`) because the edge label is
     *  portalled outside `.svelte-flow__edge` by xyflow's
     *  `EdgeLabelRenderer`, so a class on the parent edge group cannot
     *  cascade into it. `OffsetLabelEdge` reads this flag and applies
     *  the `flowchart-dim` class to BOTH the path and the label
     *  consistently. Default false (full opacity). */
    dim?: boolean;
  },
  typeof CUSTOM_EDGE_TYPE
>;

/**
 * Force-simulation tuning knobs. All in scaled pixel-units so they're
 * roughly intuitive: a `K_LEN` of 0.01 means "for every pixel of stretch
 * past the desired edge length, apply 0.01 px/step² of acceleration to
 * each endpoint", and the integrator's `dt` is 1.
 *
 * Tuned by inspecting the build-time before/after score deltas printed
 * in `getLayoutedElements`. The objective is monotonically decreasing
 * `nodeNodeOverlaps + edgeNodeIntrusions + edgeEdgeCrossings +
 * labelNodeOverlaps + labelLabelOverlaps` while leaving the macro shape
 * ELK established largely intact (controlled by `K_LEN` — too high and
 * we tear things back to a regular grid, too low and the sim drifts
 * away from ELK's solution).
 */
const RELAX_OPTS = {
  /** Edge-length spring strength when an edge is SHORTER than the
   *  desired length. Deliberately weak: a compact subtree where every
   *  edge is at 600 instead of 850 isn't a defect, and pushing it apart
   *  would create more crossings + force the rest of the layout out to
   *  make room. Only here so that if the other forces ever pull two
   *  endpoints onto the same point, there's a tiny restoring push. */
  K_LEN_COMPRESS: 0.0005,
  /** Edge-length spring strength when an edge is LONGER than the
   *  desired length. The previous symmetric `K_LEN = 0.001` could not
   *  hold the layout together against the cumulative drift the new
   *  label-vs-* terms inject — endpoint-translation forces from
   *  label-label and label-node have no opposing pull, so the network
   *  spread out by hundreds of px over the longer 4000-iter budget.
   *  This is set ~10x higher so over-stretched edges genuinely pull
   *  back, anchoring the topology to the macro spacing without
   *  needing a separate per-node anchor force. */
  K_LEN_STRETCH: 0.01,
  /** Rectangular node-node repulsion. Scales linearly with overlap depth.
   *  This is the term that actually fixes the 520x400 book-on-book
   *  collisions ELK's `sporeOverlap` couldn't resolve. */
  K_NODE_NODE: 0.3,
  /** Edge-vs-non-endpoint-node repulsion. Quadratic in intrusion depth
   *  so deep clips break out of their basin even when the surrounding
   *  springs are pulling the card back. The dominant force in the sim
   *  by design — the visible problem we set out to solve. */
  K_EDGE_NODE: 0.5,
  /** Edge-vs-edge decrossing. Translates each crossing edge perpendicular
   *  to its OWN direction (away from the other edge's midpoint), scaled
   *  by sin(crossingAngle) so a near-parallel grazing pair barely moves
   *  while a perpendicular one feels real pressure. Deliberately weak —
   *  empirically a stronger term creates as many new crossings as it
   *  removes (translating an edge to clear one crossing tends to push
   *  it across a third edge). Treated as a "gentle hint" rather than
   *  a hard constraint; the edge-length spring + node-node basin do
   *  most of the topological work. */
  K_EDGE_EDGE: 0.02,
  /** Label-vs-non-endpoint-node repulsion. Linear in overlap depth and
   *  weaker than `K_EDGE_NODE` because the label is a derived position
   *  (a function of both endpoints' coordinates) — pushing on it ends
   *  up moving two nodes by half each, so the same K constant makes
   *  the actual coordinate motion comparable to the edge-node term. */
  K_LABEL_NODE: 0.4,
  /** Label-vs-label repulsion. Linear in overlap depth. Slightly weaker
   *  than `K_LABEL_NODE` because labels are small (~ a few hundred px²)
   *  and a fan-out of sibling answers from the same decision is the
   *  common case — we want a gentle spread, not aggressive pushing
   *  that rotates the whole subtree. The relax sim's other terms
   *  (length spring, node-node basin) dominate the macro shape; this
   *  term only does the local untangle. */
  K_LABEL_LABEL: 0.25,
  /** Per-step velocity damping. < 1 to shed energy each step; > 0 to
   *  preserve enough momentum for slow constraints (long edges) to keep
   *  pulling. Lower = more "ringing" but better basin escape. */
  DAMPING: 0.75,
  /** Integration step. Verlet with constant dt; the K_* constants above
   *  are calibrated for dt=1, so don't change this without rescaling
   *  them all. */
  DT: 1.0,
  /** Maximum per-step velocity. Catches single-frame blowups when many
   *  forces pile onto the same endpoint of a high-fan-out node. Set
   *  higher than typical equilibrium velocities so it only clamps
   *  pathological iterations, not normal motion. */
  V_MAX: 120,
  /** Padding added to every separation criterion (node-node, edge-node,
   *  label-*). This is the breathing room the sim refuses to give up
   *  on. */
  PADDING: 80,
  /** Hard iteration cap. Graphviz produces a clean initial layout, so the
   *  sim needs fewer iterations to reach equilibrium. 1500 is enough budget
   *  for the KE threshold to trigger naturally on most runs; the best-snapshot
   *  revert handles the rare case where it doesn't. */
  MAX_ITERS: 1500,
  /** Total kinetic-energy threshold below which the sim declares
   *  convergence and exits early. Units: sum of |v|² across all nodes.
   *  For ~250 nodes a value of 20 corresponds to a per-node speed of
   *  about sqrt(20/250) ≈ 0.28 px/step — tight enough to catch genuine
   *  convergence without running to the iteration cap on settled layouts. */
  CONVERGENCE_KE: 20.0,
  /** How long the sim must hold below `CONVERGENCE_KE` before exiting.
   *  A single low-KE frame can be a momentary phase-cancellation of
   *  oscillating forces; a sustained quiet window confirms true rest. */
  CONVERGENCE_HOLD_ITERS: 25,
} as const;

/**
 * Deterministic Verlet force-simulation pass. Replaces the old
 * straight-segment `decongestEdges` with a multi-term physics solver that
 * shares its geometry with the analytic scorer.
 *
 * Per iteration:
 *   1. Rebuild every edge's exact rendered polyline via `buildEdgeGeometry`.
 *   2. Accumulate forces from four terms (length spring, rectangular
 *      node-node repulsion, edge-node repulsion, edge-edge decrossing).
 *   3. Integrate with damped Verlet, clamped to `V_MAX` per step.
 *   4. Track total kinetic energy; exit early when it drops below
 *      `CONVERGENCE_KE`.
 *
 * Mutates `positions` in place. Pinned nodes never receive force or
 * velocity — they retain their authored coordinates exactly.
 *
 * Determinism: no RNG anywhere. Tiebreak directions (exact-overlap
 * along centre-to-centre, exact crossing point) use the segment normal
 * as a deterministic fallback. Map iteration order is insertion order
 * which is fixed by the upstream ELK output.
 */
/**
 * Pretty-print the worst-offender lists from a `LayoutScore` for the
 * build-time warning. We deliberately keep this one-line-per-offender
 * because the console truncates huge multi-line warnings in CI logs.
 */
function formatOffenders(score: LayoutScore): string {
  const lines: string[] = [];
  if (score.worstOffenders.nodeNode.length) {
    lines.push('  node-node:');
    for (const o of score.worstOffenders.nodeNode) {
      lines.push(`    ${o.a} ↔ ${o.b}  (${o.overlapPx.toFixed(0)}px overlap)`);
    }
  }
  if (score.worstOffenders.edgeNode.length) {
    lines.push('  edge-node:');
    for (const o of score.worstOffenders.edgeNode) {
      lines.push(`    ${o.edgeId} clips ${o.nodeId}  (${o.depthPx.toFixed(0)}px deep)`);
    }
  }
  if (score.worstOffenders.edgeEdge.length) {
    lines.push('  edge-edge:');
    for (const o of score.worstOffenders.edgeEdge) {
      lines.push(`    ${o.aId} × ${o.bId}  (${o.angleDeg.toFixed(0)}°)`);
    }
  }
  if (score.worstOffenders.labelNode.length) {
    lines.push('  label-node:');
    for (const o of score.worstOffenders.labelNode) {
      lines.push(`    ${o.edgeId}'s label clips ${o.nodeId}  (${o.overlapPx.toFixed(0)}px overlap)`);
    }
  }
  if (score.worstOffenders.labelLabel.length) {
    lines.push('  label-label:');
    for (const o of score.worstOffenders.labelLabel) {
      lines.push(`    ${o.aId}'s label ↔ ${o.bId}'s label  (${o.overlapPx.toFixed(0)}px overlap)`);
    }
  }
  if (score.worstOffenders.stretch.length) {
    lines.push('  most-stretched edges:');
    for (const o of score.worstOffenders.stretch) {
      lines.push(`    ${o.edgeId}  (${o.lengthPx.toFixed(0)}px, ${o.excessPx.toFixed(0)}px over target)`);
    }
  }
  if (score.worstOffenders.compression.length) {
    lines.push('  most-compressed edges:');
    for (const o of score.worstOffenders.compression) {
      lines.push(`    ${o.edgeId}  (${o.lengthPx.toFixed(0)}px, ${o.deficitPx.toFixed(0)}px under minimum)`);
    }
  }
  return lines.join('\n');
}

/**
 * Aggregate a `LayoutScore` into a single comparable badness number.
 *
 * Weights chosen by visual severity rather than raw count:
 *   - node-on-node overlaps and edge-on-node intrusions are the loudest
 *     defects (a card visibly under another card; an arrow visibly
 *     piercing a card), so their counts dominate.
 *   - label-on-node sits below them but above edge-edge because a label
 *     covering a different node's content is more disruptive than a
 *     line crossing.
 *   - edge-edge crossings are the gentlest defect — even a 90° crossing
 *     of two coloured curves is legible.
 *   - edge stretch is a continuous term, weighted as cost-per-pixel-
 *     of-excess. With `LAYOUT_DESIRED_EDGE_LENGTH = 850` and ~230
 *     edges, average excess of ~50px → ~11500 stretch px → ~575 cost
 *     units (about the equivalent of 50-ish edge-edge crossings or one
 *     edge-node intrusion). Tuned so genuinely sprawled layouts cost
 *     more than tightly-packed ones, but a small amount of stretch
 *     can't outweigh fixing a real overlap.
 *
 * Used by the best-snapshot revert in `relax`. Treating this as a
 * single scalar lets the simulation run its full budget, periodically
 * snapshot positions when the cost drops, and revert to the lowest-
 * cost snapshot at the end. The "do no harm" property: a longer
 * iteration budget cannot make the layout worse than the input.
 */
function layoutCost(s: LayoutScore): number {
  return (
    s.nodeNodeOverlaps * 100 +
    s.edgeNodeIntrusions * 50 +
    s.labelNodeOverlaps * 30 +
    s.labelLabelOverlaps * 20 +
    s.edgeEdgeCrossings * 10 +
    // Symmetric length-deviation penalty. Same per-pixel weight on both
    // sides of the sweet spot — an edge that's 100px too short is just
    // as visually problematic as one that's 100px too long (one squashes
    // arrows into stubs, the other sprawls the layout).
    s.totalStretchPx * 0.05 +
    s.totalCompressionPx * 0.05
  );
}

/** Upper bound of the edge-length sweet spot — the relax sim's K_LEN
 *  spring pulls every over-stretched edge toward this length, and the
 *  scorer counts excess over it as `totalStretchPx`. Hoisted to a
 *  module constant so the tuner only edits one number. */
const LAYOUT_DESIRED_EDGE_LENGTH = 1000;

/** Lower bound of the edge-length sweet spot — edges shorter than this
 *  contribute to `totalCompressionPx` in the layout score, biasing the
 *  best-snapshot revert away from layouts where overlapping label and
 *  edge-node basins have squashed two endpoints almost on top of each
 *  other. The relax sim's K_LEN spring still pulls toward
 *  `LAYOUT_DESIRED_EDGE_LENGTH` (not this minimum) — the constant
 *  defines the boundary of the cost-free band, not a separate force
 *  target. Edges with length in [`LAYOUT_MINIMUM_DESIRED_EDGE_LENGTH`,
 *  `LAYOUT_DESIRED_EDGE_LENGTH`] pay no length cost. */
const LAYOUT_MINIMUM_DESIRED_EDGE_LENGTH = 450;

/** Standard deviation of the Gaussian jitter applied to every
 *  non-pinned node before relax on the Reset path. Pulls each node
 *  into a slightly different basin so the relax sim can settle into a
 *  different local minimum. ~400 is comparable to one node-width —
 *  enough to perturb the topology without destroying Graphviz's macro
 *  shape entirely. */
const RESET_JITTER_SIGMA_PX = 400;

/**
 * Mulberry32 — a tiny seeded PRNG. Output is uniform on [0, 1) and
 * deterministic for a given 32-bit integer seed, so two Reset clicks
 * with the same seed produce the same layout (useful for reproducing
 * a specific outcome the user liked) while different seeds produce
 * different layouts.
 *
 * Source: public-domain implementation by Tommy Ettinger, also used
 * verbatim in xoshiro / spline-related demos. Six lines of code, no
 * dependencies, passes BigCrush-light tests adequate for layout
 * randomisation.
 */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box–Muller polar form: turn two uniform [0, 1) draws from `rng`
 * into one pair of independent N(0, 1) Gaussians. We need one number
 * per axis (x, y) so returning both halves of the transform is
 * convenient — neither value is "wasted" the way the basic-form
 * unused cosine is.
 */
function gaussianPair(rng: () => number): [number, number] {
  let u: number;
  let v: number;
  let s: number;
  do {
    u = rng() * 2 - 1;
    v = rng() * 2 - 1;
    s = u * u + v * v;
  } while (s === 0 || s >= 1);
  const factor = Math.sqrt((-2 * Math.log(s)) / s);
  return [u * factor, v * factor];
}


function relax(opts: {
  positions: Map<string, Vec2>;
  sizes: Map<string, { w: number; h: number }>;
  edges: EdgeSpec[];
  pinnedIds: ReadonlySet<string>;
  desiredEdgeLength: number;
  minDesiredEdgeLength: number;
}): {
  iterationsUsed: number;
  finalScore: LayoutScore;
  bestCost: number;
  bestIter: number;
  revertedFromIter: number | null;
} {
  const {
    positions,
    sizes,
    edges,
    pinnedIds,
    desiredEdgeLength,
    minDesiredEdgeLength,
  } = opts;
  const {
    K_LEN_COMPRESS,
    K_LEN_STRETCH,
    K_NODE_NODE,
    K_EDGE_NODE,
    K_EDGE_EDGE,
    K_LABEL_NODE,
    K_LABEL_LABEL,
    DAMPING,
    DT,
    V_MAX,
    PADDING,
    MAX_ITERS,
    CONVERGENCE_KE,
    CONVERGENCE_HOLD_ITERS,
  } = RELAX_OPTS;

  const ids = [...positions.keys()];
  const idIndex = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) idIndex.set(ids[i], i);

  const vx = new Float64Array(ids.length);
  const vy = new Float64Array(ids.length);
  const fx = new Float64Array(ids.length);
  const fy = new Float64Array(ids.length);

  const isPinned = new Uint8Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    if (pinnedIds.has(ids[i])) isPinned[i] = 1;
  }

  const addForce = (id: string, dx: number, dy: number): void => {
    const i = idIndex.get(id)!;
    if (isPinned[i]) return;
    fx[i] += dx;
    fy[i] += dy;
  };

  // ── best-snapshot revert ─────────────────────────────────────────────
  // Score every `SCORE_EVERY` iterations and remember the layout with
  // the lowest aggregate cost. At the end we revert to that snapshot
  // (which may be the input itself) so the longer iteration budget
  // genuinely "lets shapes converge into more uniform layouts" without
  // ever drifting past a better intermediate state — the failure mode
  // when many force terms compete with no global energy minimum the
  // pure Verlet integrator can find.
  //
  // Cost tip: scoreLayout is O(N² + N·E + E²) — comparable to one
  // iteration of force computation. Sampling every 25 iters adds ~4%
  // overhead; sampling every iter would roughly double total runtime.
  const SCORE_EVERY = 25;
  let bestCost = Infinity;
  let bestIter = -1;
  const bestX = new Float64Array(ids.length);
  const bestY = new Float64Array(ids.length);
  const snapshotBest = (cost: number, atIter: number): void => {
    bestCost = cost;
    bestIter = atIter;
    for (let i = 0; i < ids.length; i++) {
      const p = positions.get(ids[i])!;
      bestX[i] = p.x;
      bestY[i] = p.y;
    }
  };

  let iter = 0;
  let quietStreak = 0;
  for (; iter < MAX_ITERS; iter++) {
    fx.fill(0);
    fy.fill(0);
    const geometry = buildEdgeGeometry(positions, sizes, edges);

    // Snapshot-if-better at sample iterations. We do this BEFORE the
    // force terms run so the geometry we just built (and the positions
    // it was built from) describe the same instant — there's no cross-
    // iteration smearing in the captured state. The first sample
    // (iter=0) baselines bestCost against the input layout, so the
    // revert below is guaranteed to never produce a worse layout than
    // we were handed.
    if (iter % SCORE_EVERY === 0) {
      const stepScore = scoreLayout({
        positions,
        sizes,
        geometry,
        edges,
        desiredEdgeLength,
        minDesiredEdgeLength,
      });
      const cost = layoutCost(stepScore);
      if (cost < bestCost) snapshotBest(cost, iter);
    }

    // --- 1. edge-length spring (asymmetric) -----------------------------
    // Pulls every edge's centre-to-centre distance toward
    // `desiredEdgeLength`. The constants split: `K_LEN_STRETCH` for
    // edges longer than the target (strong pull-together — this is the
    // term that fights the cumulative drift the label terms inject);
    // `K_LEN_COMPRESS` for edges shorter than the target (very weak —
    // a dense subtree at 600px is fine, we don't want to push it apart
    // and create new overlaps to "fix" a non-defect). Linear (Hookean)
    // either way so far-from-target pairs feel large forces and
    // near-target pairs feel almost none.
    for (const e of edges) {
      const sp = positions.get(e.source)!;
      const ss = sizes.get(e.source)!;
      const tp = positions.get(e.target)!;
      const ts = sizes.get(e.target)!;
      const scx = sp.x + ss.w / 2;
      const scy = sp.y + ss.h / 2;
      const tcx = tp.x + ts.w / 2;
      const tcy = tp.y + ts.h / 2;
      const dx = tcx - scx;
      const dy = tcy - scy;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-6) continue;
      const stretch = dist - desiredEdgeLength;
      const k = stretch > 0 ? K_LEN_STRETCH : K_LEN_COMPRESS;
      const mag = (k * stretch) / dist;
      addForce(e.source, dx * mag, dy * mag);
      addForce(e.target, -dx * mag, -dy * mag);
    }

    // --- 2. rectangular node-node repulsion -----------------------------
    // True AABB overlap, not circumscribing-circle overlap. The fix for
    // the 520x400 book cards ELK's circle-based reasoning forced apart
    // by their long-axis radius rather than their actual gap.
    for (let i = 0; i < ids.length; i++) {
      const ap = positions.get(ids[i])!;
      const aSz = sizes.get(ids[i])!;
      const ax2 = ap.x + aSz.w;
      const ay2 = ap.y + aSz.h;
      const acx = ap.x + aSz.w / 2;
      const acy = ap.y + aSz.h / 2;
      for (let j = i + 1; j < ids.length; j++) {
        const bp = positions.get(ids[j])!;
        const bSz = sizes.get(ids[j])!;
        const bx2 = bp.x + bSz.w;
        const by2 = bp.y + bSz.h;
        // Padded-overlap measure: positive only when the inflated AABBs
        // intersect. `padOvX/Y < 0` means the boxes are further apart
        // than `PADDING` in that axis — no force.
        const padOvX = Math.min(ax2, bx2) - Math.max(ap.x, bp.x) + PADDING;
        if (padOvX <= 0) continue;
        const padOvY = Math.min(ay2, by2) - Math.max(ap.y, bp.y) + PADDING;
        if (padOvY <= 0) continue;
        // The smaller axis is the cheap separation direction — push along
        // centre-to-centre but use that axis's overlap as the magnitude.
        const overlap = Math.min(padOvX, padOvY);
        const bcx = bp.x + bSz.w / 2;
        const bcy = bp.y + bSz.h / 2;
        let dx = bcx - acx;
        let dy = bcy - acy;
        let dlen = Math.hypot(dx, dy);
        if (dlen < 1e-6) {
          // Centres coincident — pick a deterministic axis. (ELK
          // never emits this in practice; this is just a guard.)
          dx = 1;
          dy = 0;
          dlen = 1;
        }
        dx /= dlen;
        dy /= dlen;
        const force = K_NODE_NODE * overlap;
        addForce(ids[j], dx * force, dy * force);
        addForce(ids[i], -dx * force, -dy * force);
      }
    }

    // --- 3. edge-node repulsion against the real polyline ---------------
    // The current pass-3 lie was treating each edge as a straight segment
    // between centres. Now we walk the *actual* sampled bezier polyline
    // and find the closest segment, then push the node perpendicular to
    // it. That fixes the case of a curve gracefully arcing through a
    // card the straight-line solver thought was clear.
    for (const g of geometry) {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (id === g.source || id === g.target) continue;
        if (isPinned[i]) continue;
        const np = positions.get(id)!;
        const nSz = sizes.get(id)!;
        // bbox prune (with padding) — most edges are far from most nodes
        // and the per-segment loop below isn't free.
        if (g.bbox.maxX < np.x - PADDING || g.bbox.minX > np.x + nSz.w + PADDING) continue;
        if (g.bbox.maxY < np.y - PADDING || g.bbox.minY > np.y + nSz.h + PADDING) continue;
        const ncx = np.x + nSz.w / 2;
        const ncy = np.y + nSz.h / 2;
        // Use the half-extent of the side facing the closest segment
        // (cheaper: pre-compute as max half-extent so we definitely
        // clear the corner case). Min half-extent under-pushes for
        // book cards; max half-extent over-pushes for decision pills.
        // The geometric mean is a fine compromise.
        const buffer = Math.sqrt((nSz.w * nSz.h) / 4) + PADDING;
        let minDist = Infinity;
        let closestPt: Vec2 = { x: 0, y: 0 };
        let closestSegA: Vec2 = { x: 0, y: 0 };
        let closestSegB: Vec2 = { x: 0, y: 0 };
        for (let s = 0; s < g.samples.length - 1; s++) {
          const cps = closestPointOnSegment(
            { x: ncx, y: ncy },
            g.samples[s],
            g.samples[s + 1],
          );
          if (cps.distance < minDist) {
            minDist = cps.distance;
            closestPt = cps.point;
            closestSegA = g.samples[s];
            closestSegB = g.samples[s + 1];
          }
        }
        if (minDist >= buffer) continue;
        // Normal of the closest segment, oriented toward the node.
        const segDx = closestSegB.x - closestSegA.x;
        const segDy = closestSegB.y - closestSegA.y;
        const segLen = Math.hypot(segDx, segDy);
        let nx: number;
        let ny: number;
        if (segLen > 1e-6) {
          nx = -segDy / segLen;
          ny = segDx / segLen;
          // Flip toward node centre.
          if (nx * (ncx - closestPt.x) + ny * (ncy - closestPt.y) < 0) {
            nx = -nx;
            ny = -ny;
          }
        } else {
          // Degenerate segment — fall back to the centre-to-closest
          // vector; if that's also zero, pick +x deterministically.
          const dx = ncx - closestPt.x;
          const dy = ncy - closestPt.y;
          const dlen = Math.hypot(dx, dy);
          if (dlen > 1e-6) {
            nx = dx / dlen;
            ny = dy / dlen;
          } else {
            nx = 1;
            ny = 0;
          }
        }
        // Quadratic intrusion → force mapping. Linear was too gentle on
        // the worst cases (edge cleanly bisecting a 520x400 card), where
        // the surrounding spring + node-node basin held the card in
        // place against the linear push. The quadratic term kicks in
        // hard when intrusion > buffer/2 so deep clips actually break
        // free of their basin.
        const intrusion = buffer - minDist;
        const force = K_EDGE_NODE * (intrusion + (intrusion * intrusion) / buffer);
        // Push the node away from the curve (+n is segment→node).
        addForce(id, nx * force, ny * force);
        // Pull the edge's endpoints in -n (away from the node) at a
        // fraction of full strength. This translates the entire curve
        // away from the card, doubling the effective separation rate
        // when the card is constrained by its own neighbours and can't
        // do all the relative motion alone. Keeping this <1 prevents
        // the edge from "leading" the node (which would just chase the
        // node away from the rest of its subtree).
        const ENDPOINT_SHARE = 0.4;
        addForce(g.source, -nx * force * ENDPOINT_SHARE, -ny * force * ENDPOINT_SHARE);
        addForce(g.target, -nx * force * ENDPOINT_SHARE, -ny * force * ENDPOINT_SHARE);
      }
    }

    // --- 4. edge-edge decrossing ----------------------------------------
    // For each crossing pair, translate each edge perpendicular to the
    // OTHER edge's direction, scaled by |sin(angle)|. Two near-parallel
    // edges (angle ~0°) feel almost nothing; perpendicular crossings get
    // the full force. Translation (rather than rotation) is enacted by
    // applying the same force to both endpoint nodes of each edge.
    for (let i = 0; i < geometry.length; i++) {
      const ga = geometry[i];
      for (let j = i + 1; j < geometry.length; j++) {
        const gb = geometry[j];
        if (
          ga.source === gb.source ||
          ga.source === gb.target ||
          ga.target === gb.source ||
          ga.target === gb.target
        ) {
          continue;
        }
        if (ga.bbox.maxX < gb.bbox.minX || gb.bbox.maxX < ga.bbox.minX) continue;
        if (ga.bbox.maxY < gb.bbox.minY || gb.bbox.maxY < ga.bbox.minY) continue;
        const cross = polylineCrossing(ga.samples, gb.samples);
        if (!cross) continue;

        const sinTheta = Math.abs(Math.sin((cross.angleDeg * Math.PI) / 180));
        const weight = K_EDGE_EDGE * sinTheta;

        // Endpoint-to-endpoint chord direction for each edge — using the
        // chord (not a single sampled segment) keeps the push direction
        // stable across iterations even as the bezier curls move.
        const a0 = ga.sourceHandle;
        const a1 = ga.targetHandle;
        const b0 = gb.sourceHandle;
        const b1 = gb.targetHandle;
        const aMidX = (a0.x + a1.x) / 2;
        const aMidY = (a0.y + a1.y) / 2;
        const bMidX = (b0.x + b1.x) / 2;
        const bMidY = (b0.y + b1.y) / 2;

        // Translate each edge along its OWN normal (perpendicular to
        // itself), with the sign chosen to move it AWAY from the other
        // edge's midpoint. Two perpendicular crossing edges this way
        // separate by sliding orthogonally to themselves, which is the
        // direction that actually removes the crossing — pushing along
        // the *other* edge's normal would just slide each edge along
        // its own length and never decross.
        const adx = a1.x - a0.x;
        const ady = a1.y - a0.y;
        const alen = Math.hypot(adx, ady) || 1;
        let anx = -ady / alen;
        let any = adx / alen;
        // Sign: push A away from B's midpoint along A's normal.
        if ((bMidX - aMidX) * anx + (bMidY - aMidY) * any > 0) {
          anx = -anx;
          any = -any;
        }

        const bdx = b1.x - b0.x;
        const bdy = b1.y - b0.y;
        const blen = Math.hypot(bdx, bdy) || 1;
        let bnx = -bdy / blen;
        let bny = bdx / blen;
        if ((aMidX - bMidX) * bnx + (aMidY - bMidY) * bny > 0) {
          bnx = -bnx;
          bny = -bny;
        }

        // Both endpoints of A move the same way (translation, not
        // rotation) along A's own normal; ditto B.
        addForce(ga.source, anx * weight, any * weight);
        addForce(ga.target, anx * weight, any * weight);
        addForce(gb.source, bnx * weight, bny * weight);
        addForce(gb.target, bnx * weight, bny * weight);
      }
    }

    // --- 5. label-vs-non-endpoint-node repulsion ------------------------
    // The HTML edge labels live on top of the canvas. A label sliding
    // under a book card or onto a decision pill is exactly as broken as
    // an edge polyline doing the same. Treated as AABB-AABB (the label
    // is a small horizontal rectangle, no need for the polyline math
    // the edge-node term uses).
    //
    // Forces apply to the EDGE'S endpoints, not the label itself — the
    // label is a derived position, so to push it we have to translate
    // the edge that hosts it. We split the push 50/50 across both
    // endpoints so the edge translates roughly bodily without snapping
    // either end faster than the other.
    for (const g of geometry) {
      if (!g.label) continue;
      const lx2 = g.label.x + g.label.w;
      const ly2 = g.label.y + g.label.h;
      const lcx = g.label.centre.x;
      const lcy = g.label.centre.y;
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (id === g.source || id === g.target) continue;
        const np = positions.get(id)!;
        const nSz = sizes.get(id)!;
        // Padded-overlap measure: positive only when the inflated AABBs
        // intersect.
        const padOvX = Math.min(lx2, np.x + nSz.w) - Math.max(g.label.x, np.x) + PADDING;
        if (padOvX <= 0) continue;
        const padOvY = Math.min(ly2, np.y + nSz.h) - Math.max(g.label.y, np.y) + PADDING;
        if (padOvY <= 0) continue;
        const overlap = Math.min(padOvX, padOvY);
        const ncx = np.x + nSz.w / 2;
        const ncy = np.y + nSz.h / 2;
        let dx = ncx - lcx;
        let dy = ncy - lcy;
        let dlen = Math.hypot(dx, dy);
        if (dlen < 1e-6) {
          // Centres coincident — pick the smaller padded-overlap axis as
          // the deterministic separation direction.
          if (padOvX < padOvY) {
            dx = 1;
            dy = 0;
          } else {
            dx = 0;
            dy = 1;
          }
          dlen = 1;
        }
        dx /= dlen;
        dy /= dlen;
        const force = K_LABEL_NODE * overlap;
        // Push the node away from the label.
        addForce(id, dx * force, dy * force);
        // Translate the edge (and therefore its label) the other way.
        // Half on each endpoint = unit translation magnitude on the
        // label, matching the per-iteration "intent" the K_LABEL_NODE
        // constant was tuned for.
        const ENDPOINT_SHARE = 0.5;
        addForce(g.source, -dx * force * ENDPOINT_SHARE, -dy * force * ENDPOINT_SHARE);
        addForce(g.target, -dx * force * ENDPOINT_SHARE, -dy * force * ENDPOINT_SHARE);
      }
    }

    // --- 6. label-vs-label repulsion ------------------------------------
    // Two answers stacking on top of each other turn the diagram into
    // visual noise. Includes shared-endpoint pairs (siblings of one
    // decision node) — they're the most common collision in practice
    // because every decision node fans out 2-5 sibling answers, and
    // they need to spread before the eye can read them. The math falls
    // out cleanly: the shared endpoint receives equal-and-opposite
    // pushes that cancel, and the non-shared endpoints pull apart,
    // which is exactly the right motion (rotate the siblings around
    // the shared node).
    for (let i = 0; i < geometry.length; i++) {
      const ga = geometry[i];
      if (!ga.label) continue;
      const ax2 = ga.label.x + ga.label.w;
      const ay2 = ga.label.y + ga.label.h;
      for (let j = i + 1; j < geometry.length; j++) {
        const gb = geometry[j];
        if (!gb.label) continue;
        const bx2 = gb.label.x + gb.label.w;
        const by2 = gb.label.y + gb.label.h;
        const padOvX =
          Math.min(ax2, bx2) - Math.max(ga.label.x, gb.label.x) + PADDING;
        if (padOvX <= 0) continue;
        const padOvY =
          Math.min(ay2, by2) - Math.max(ga.label.y, gb.label.y) + PADDING;
        if (padOvY <= 0) continue;
        const overlap = Math.min(padOvX, padOvY);
        let dx = gb.label.centre.x - ga.label.centre.x;
        let dy = gb.label.centre.y - ga.label.centre.y;
        let dlen = Math.hypot(dx, dy);
        if (dlen < 1e-6) {
          // Labels exactly coincident — push along the smaller padded
          // axis. (Common with two siblings whose answers happen to
          // produce the same arc-length midpoint at iteration 0.)
          if (padOvX < padOvY) {
            dx = 1;
            dy = 0;
          } else {
            dx = 0;
            dy = 1;
          }
          dlen = 1;
        }
        dx /= dlen;
        dy /= dlen;
        const force = K_LABEL_LABEL * overlap;
        // Translate edge A along -d (its label moves away from B's),
        // edge B along +d. Both endpoints of each edge get the same
        // push so the motion is translation, not rotation. For a
        // shared-endpoint pair the shared node receives both pushes
        // (one from each edge in opposite signs) and they cancel; the
        // other endpoints are pulled apart, which is the desired
        // behaviour for sibling answers.
        addForce(ga.source, -dx * force, -dy * force);
        addForce(ga.target, -dx * force, -dy * force);
        addForce(gb.source, dx * force, dy * force);
        addForce(gb.target, dx * force, dy * force);
      }
    }

    // --- integrate ------------------------------------------------------
    let totalKE = 0;
    for (let i = 0; i < ids.length; i++) {
      if (isPinned[i]) {
        vx[i] = 0;
        vy[i] = 0;
        continue;
      }
      let vxi = vx[i] * DAMPING + fx[i] * DT;
      let vyi = vy[i] * DAMPING + fy[i] * DT;
      const speed = Math.hypot(vxi, vyi);
      if (speed > V_MAX) {
        const scale = V_MAX / speed;
        vxi *= scale;
        vyi *= scale;
      }
      vx[i] = vxi;
      vy[i] = vyi;
      const p = positions.get(ids[i])!;
      p.x += vxi * DT;
      p.y += vyi * DT;
      totalKE += vxi * vxi + vyi * vyi;
    }
    if (totalKE < CONVERGENCE_KE) {
      // A single low-KE frame can be a momentary phase-cancellation of
      // oscillating forces (most common with the two label terms,
      // which pull endpoints together symmetrically). Require a
      // sustained quiet window before declaring victory so we don't
      // exit on a false floor that the sim would have climbed back out
      // of.
      quietStreak++;
      if (quietStreak >= CONVERGENCE_HOLD_ITERS) {
        iter++;
        break;
      }
    } else {
      quietStreak = 0;
    }
  }

  // Final scoring: snapshot the very last iteration too, in case it
  // happens to be the best (common when convergence cleanly fires).
  {
    const finalGeom = buildEdgeGeometry(positions, sizes, edges);
    const finalCost = layoutCost(
      scoreLayout({
        positions,
        sizes,
        geometry: finalGeom,
        edges,
        desiredEdgeLength,
        minDesiredEdgeLength,
      }),
    );
    if (finalCost < bestCost) snapshotBest(finalCost, iter);
  }

  // Revert to the best-cost snapshot. If `bestIter` is the last iter
  // we just measured, this is a no-op; if it's earlier, we throw away
  // the post-best drift. Either way the caller observes the lowest-
  // cost layout this run produced, and the score we report below
  // matches the positions we leave in the map.
  let revertedFromIter: number | null = null;
  if (bestIter >= 0 && bestIter !== iter) {
    revertedFromIter = iter;
    for (let i = 0; i < ids.length; i++) {
      const p = positions.get(ids[i])!;
      p.x = bestX[i];
      p.y = bestY[i];
    }
  }

  const finalGeometry = buildEdgeGeometry(positions, sizes, edges);
  const finalScore = scoreLayout({
    positions,
    sizes,
    geometry: finalGeometry,
    edges,
    desiredEdgeLength,
    minDesiredEdgeLength,
  });
  return {
    iterationsUsed: iter,
    finalScore,
    bestCost,
    bestIter,
    revertedFromIter,
  };
}

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
  if (!ids.has(ROOT_ID)) {
    errors.push(`root node "${ROOT_ID}" not found in decisions`);
  }
  // `reviewId` existence is checked during entry resolution below — we let
  // `getEntry` throw with a precise filesystem-aware message there so the
  // author sees both the bad id AND the surrounding collection state.
  if (errors.length) {
    throw new Error(`flowchart data invalid:\n  - ${errors.join('\n  - ')}`);
  }
}

/**
 * Resolve every node's top-left coordinate and emit the typed xyflow
 * `nodes` / `edges` arrays the page renders.
 *
 * Determinism contract:
 *   - The full pipeline (Graphviz dot + Verlet `relax`) is deterministic
 *     given fixed input data AND no `seed` option. The seed parameter is
 *     the single, opt-in escape hatch: when supplied we drive a `mulberry32`
 *     PRNG to Gaussian-jitter every non-pinned node before relax. Identical
 *     seeds still produce identical layouts.
 *   - The on-disk file `src/data/flowchart-positions.json` is the source
 *     of truth across restarts and across machines. It is committed to
 *     git so a fresh checkout sees the SAME positions the author saw.
 *   - Recomputation (full Graphviz + relax) only fires when the data
 *     file's id set changes versus what's on disk, or when the file is
 *     missing entirely.
 *
 * @param options.refine When `true` AND the cache is fully covering,
 *   skip Graphviz but still run the relax pass over the cached positions.
 * @param options.seed Optional 32-bit integer seed for the Reset path.
 *   Gaussian-jitters every non-pinned node before relax, giving each
 *   Reset click a different convergence basin while keeping each
 *   individual seed reproducible.
 */
export async function getLayoutedElements(
  data: FlowchartData,
  options?: { refine?: boolean; seed?: number },
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> {
  validateFlowchart(data);
  const refine = options?.refine ?? false;
  const seed = options?.seed;

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
      const tags = [...entry.data.tags].sort().map((t) => t.toLowerCase());
      const title = entry.data.short_title ?? entry.data.name;
      // Mirror the haystack composition from `src/pages/reviews/index.astro`
      // (auth + name + search_terms) and add the on-card text the user
      // can actually see in the flowchart (title, sentence, tags) so a
      // search for a tag like "audio" or a phrase from the one-liner
      // matches even when the book's frontmatter `search_terms` doesn't
      // mention it.
      const searchHaystack = [
        title,
        entry.data.sentence,
        entry.data.auth,
        tags.join(' '),
        entry.data.search_terms ?? '',
      ]
        .join(' ')
        .toLowerCase();
      const payload: BookNodePayload = {
        kind: 'book',
        reviewId: entry.id,
        title,
        sentence: entry.data.sentence,
        tags,
        tier: entry.data.review,
        cover,
        link: `/reviews/${entry.id}/`,
        searchHaystack,
      };
      return { node: book, size, payload };
    }),
  );

  // Both ELK output and the on-disk cache populate `positions` (top-left
  // coords) and `sizes` (per-node w/h). The four cache branches below
  // each fill these maps; everything after the branch (relax, edge
  // construction) shares a single code path.
  const positions = new Map<string, { x: number; y: number }>();
  const sizes = new Map<string, { w: number; h: number }>();

  // Pre-fill `sizes` from the static node-kind table — it's the same
  // regardless of which branch we take. Graphviz and the cache branches
  // both need it because relax + scoring depend on it.
  for (const d of data.decisions) {
    const ds = decisionSize(d);
    sizes.set(d.id, { w: ds.width, h: ds.height });
  }
  for (const b of data.books) {
    sizes.set(b.id, {
      w: NODE_SIZES.book.width,
      h: NODE_SIZES.book.height,
    });
  }

  const allCurrentIds: string[] = [
    ...data.decisions.map((d) => d.id),
    ...data.books.map((b) => b.id),
  ];

  const pinnedIds = new Set<string>([
    ROOT_ID,
    ...data.decisions.filter((d) => d.pinned).map((d) => d.id),
    ...data.books.filter((b) => b.pinned).map((b) => b.id),
  ]);

  const defaultEdgeType: EdgeType = data.defaultEdgeType ?? 'bezier';
  const edgeSpecs: EdgeSpec[] = data.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    pathType: e.type ?? defaultEdgeType,
    // Pass the label through so `buildEdgeGeometry` can compute the
    // rendered label bbox; the relax sim and scorer then treat labels
    // as first-class collision targets the same way they treat nodes
    // and edge polylines.
    label: e.label,
  }));

  // Decide which of the four code paths to take based on the disk cache.
  // The rule of thumb: ELK + relax is ~2-4 seconds, file IO + JSON parse
  // is sub-millisecond, so any fully-covering cache is worth using.
  const loadedPositions = loadPositions();
  const coverage = classifyCoverage(loadedPositions, allCurrentIds);

  if (coverage.kind === 'full' && !refine) {
    // ── BRANCH 1: full cache hit, no refine ────────────────────────────
    // Every current node id is in the file, so use those coordinates
    // verbatim and skip both ELK passes AND the relax pass. We still go
    // through the edge construction at the bottom (pickSide depends on
    // node centres, which depend on positions, which we now have).
    for (const id of allCurrentIds) {
      const p = coverage.positions.get(id)!;
      positions.set(id, { x: p.x, y: p.y });
    }
    console.log(
      `flowchart-layout: cache hit (${allCurrentIds.length} nodes), skipped layout`,
    );
  } else {
    // The partial-coverage branch additionally pins every cached id
    // during relax so the user's existing layout doesn't drift even by
    // a sub-pixel — only the newly added nodes get pulled into place
    // by the surrounding forces. For missing/refine the relax just
    // honours the authored pins.
    const effectivePinnedIds = new Set<string>(pinnedIds);
    // Cached positions for the partial path — re-stamped after Graphviz
    // so existing nodes don't move. `null` for the missing/refine paths.
    const seedPositions: Map<string, { x: number; y: number }> | null =
      coverage.kind === 'partial' ? coverage.known : null;

    // Randomisation gate: only the missing-cache path consults the
    // caller's `seed`. The partial path is contractually deterministic
    // (must not move existing nodes) and the refine path explicitly
    // re-runs physics over user-authored coordinates, so injecting
    // randomness there would defeat both. `rng` stays `null` outside
    // the missing+seed combination, and every randomisation call
    // below short-circuits on it — the seed is silent unless the
    // caller meant it.
    const rng =
      coverage.kind === 'missing' && seed != null ? mulberry32(seed) : null;

    // ── Diagnostic preamble for the three "do work" branches ──────────
    if (coverage.kind === 'missing') {
      if (rng) {
        console.log(
          `flowchart-layout: cache missing; running graphviz layout with ` +
            `randomised seed ${seed} (jitter σ=${RESET_JITTER_SIGMA_PX}px)`,
        );
      } else {
        console.log('flowchart-layout: cache missing; running graphviz layout');
      }
    } else if (coverage.kind === 'partial') {
      for (const id of coverage.known.keys()) effectivePinnedIds.add(id);
      console.log(
        `flowchart-layout: cache partial (${coverage.known.size} known, ` +
          `${coverage.missing.length} new); re-stamping known positions post-layout`,
      );
    } else {
      console.log('flowchart-layout: refine over cached positions...');
    }

    if (coverage.kind === 'full' && refine) {
      // ── BRANCH 2: cache hit + refine ─────────────────────────────────
      // Trust the on-disk positions but re-run the relax pass over them
      // (so e.g. a future drag-and-save's hand-nudged coordinates get
      // their physics polished before being committed back).
      for (const id of allCurrentIds) {
        const p = coverage.positions.get(id)!;
        positions.set(id, { x: p.x, y: p.y });
      }
    } else {
      // ── BRANCHES 3+4: Graphviz dot layout ────────────────────────────
      // Either the cache was missing entirely or only partially covered
      // the current id set. Graphviz lays out all nodes, then the partial
      // path re-stamps cached positions on top so existing nodes don't move.
      const rawPositions = await computeGraphvizLayout(data, sizes);
      normaliseOrigin(rawPositions);

      // Re-stamp authored pins on top of Graphviz output.
      for (const d of data.decisions) {
        if (d.pinned) rawPositions.set(d.id, { x: d.pinned.x, y: d.pinned.y });
      }
      for (const b of data.books) {
        if (b.pinned) rawPositions.set(b.id, { x: b.pinned.x, y: b.pinned.y });
      }

      for (const [id, p] of rawPositions) {
        positions.set(id, p);
      }

      // On the partial path, re-stamp every cached id back to its EXACT
      // saved coordinate before relax sees it. Pinning in relax is cheap;
      // this stamp means the user observes ZERO motion on existing nodes.
      if (seedPositions) {
        for (const [id, p] of seedPositions) {
          positions.set(id, { x: p.x, y: p.y });
        }
      }
    }

    // ── Pre-relax jitter (Reset path only) ───────────────────────────
    // Graphviz dot is deterministic. This Gaussian perturbation pushes
    // us into a different basin before relax runs. The best-snapshot
    // revert in relax compares every iteration's layoutCost against the
    // input — if jitter made things worse, relax falls back to its best
    // intermediate snapshot. The "do no harm" guarantee survives.
    if (rng) {
      let jittered = 0;
      for (const id of allCurrentIds) {
        if (effectivePinnedIds.has(id)) continue;
        const p = positions.get(id);
        if (!p) continue;
        const [gx, gy] = gaussianPair(rng);
        p.x += gx * RESET_JITTER_SIGMA_PX;
        p.y += gy * RESET_JITTER_SIGMA_PX;
        jittered++;
      }
      console.log(
        `flowchart-layout: jittered ${jittered} non-pinned nodes pre-relax`,
      );
    }

    // RELAX DISABLED — skipping Verlet force simulation pass

    // Save the freshly computed (or re-relaxed) positions back to disk
    // so the next run starts from a warm cache. Best-effort — see
    // `savePositions` for the failure semantics.
    savePositions(positions);
  }

  const placeDecision = (d: DecisionNode): DecisionFlowNode => {
    const size = decisionSize(d);
    const position = d.pinned ?? positions.get(d.id) ?? { x: 0, y: 0 };
    const accent = EDGE_PALETTE[d.color ?? 'gray'];
    return {
      id: d.id,
      type: 'decision',
      position,
      width: size.width,
      height: size.height,
      ariaLabel: `Decision: ${d.prompt}`,
      data: {
        kind: 'decision',
        prompt: d.prompt,
        accent,
        size: d.size ?? 'normal',
        searchHaystack: d.prompt.toLowerCase(),
      },
    };
  };

  const placeBook = (b: (typeof bookPayloads)[number]): BookFlowNode => {
    const { node, payload, size } = b;
    const position = node.pinned ?? positions.get(node.id) ?? { x: 0, y: 0 };
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

  // Build a centre-of-node lookup keyed by id so we can compute the angle
  // between every edge's two endpoints. The centre is `top-left + size/2`,
  // and `size` depends on whether the node is a 320x90 decision pill or a
  // 520x400 book card — so we need both the position map and the kind.
  // (`pickSide` and `rectCentre` come from `flowchart-edge-geometry` so
  // the edge construction here uses the EXACT same side-picking the
  // force sim and scorer use against the rendered curve.)
  const centres = new Map<string, Vec2>();
  for (const n of nodes) {
    const w = n.width ?? 0;
    const h = n.height ?? 0;
    centres.set(n.id, rectCentre({ x: n.position.x, y: n.position.y, w, h }));
  }

  const edges: FlowEdge[] = data.edges.map((e) => {
    const palette = EDGE_PALETTE[e.color ?? 'default'];
    const sourceCentre = centres.get(e.source);
    const targetCentre = centres.get(e.target);
    // If either centre is missing we already failed validateFlowchart, so
    // this is just a type guard. Fall through to no-handle (xyflow then
    // picks the first declared handle, which preserves the legacy
    // top/bottom-only behaviour for that single edge).
    const sourceHandle =
      sourceCentre && targetCentre ? pickSide(sourceCentre, targetCentre) : undefined;
    const targetHandle =
      sourceCentre && targetCentre ? pickSide(targetCentre, sourceCentre) : undefined;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle,
      targetHandle,
      label: e.label,
      type: CUSTOM_EDGE_TYPE,
      ariaLabel: e.label ? `Edge labelled "${e.label}"` : undefined,
      // `style` reaches the SVG path inside `.svelte-flow__edge`; xyflow
      // applies it via the `style` attribute on `<path>`, where SVG
      // `stroke` is honoured exactly like CSS.
      style: `stroke: ${palette.line};`,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: palette.line,
      },
      // `labelStyle` reaches the portalled HTML `<div>` rendered by
      // `EdgeLabelRenderer` — we set the solid 500-shade background
      // and the brightest-shade hue tint for the text in the same
      // string so the two sides of the colour pair can never drift.
      labelStyle: `background: ${palette.line}; color: ${palette.text};`,
      data: {
        color: e.color,
        pathType: e.type ?? defaultEdgeType,
        searchHaystack: (e.label ?? '').toLowerCase(),
      },
    };
  });

  return { nodes, edges };
}
