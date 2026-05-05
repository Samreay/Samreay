/**
 * Build-time layout helper for the recommendation flowchart.
 *
 * Runs entirely on the server during `astro build` (or `astro dev`'s SSR
 * pass): walks the typed `FlowchartData`, validates references, resolves
 * each book's cover via the existing `resolveCover` helper, calls ELK's
 * `stress` algorithm for x/y positions, and emits arrays already typed
 * as xyflow's `Node<T, K>` / `Edge<T, K>` so the Svelte island accepts
 * them without casts.
 *
 * Why stress instead of dagre's top-down layered layout: the source data
 * is a decision tree rooted at `d_start`. Rendered top-down with 520x400
 * book cards, the bottom rank gets too wide to read and edges criss-cross
 * heavily. Stress minimisation places connected nodes near each other and
 * unconnected nodes far apart, with no inherent direction — pinning
 * `d_start` at the origin then gives a "pick your path outward from the
 * middle" feel instead of a strict top-to-bottom flow.
 *
 * Other ELK algorithms considered:
 *   - `radial` produced a hollow donut on this graph because `d_start`'s
 *     two children have very lopsided subtree sizes; even `RADIAL_COMPACTION`
 *     can't fix the wedge-width math when the outer ring carries ~100 leaves.
 *   - `force` is non-deterministic across builds (bad for screenshot diffs).
 *   - `mrtree` lays out top-down, defeating the centre-out goal.
 *   - `layered` is what dagre already did, just slightly nicer.
 *
 * `stress` accepts arbitrary graphs (no tree constraint), so we feed it the
 * full edge set unmodified.
 *
 * Because this module imports `elkjs` and `astro:content`, it is never
 * bundled into client output — it is only ever reached from `.astro`
 * frontmatter. That keeps ELK (~500 KB minified) off the wire and the
 * `getImage()` cover URLs pre-resolved before hydration.
 */
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import { getEntry } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { Node, Edge } from '@xyflow/svelte';
import { resolveCover } from './covers';
import type {
  FlowchartData,
  DecisionNode,
  EdgeType,
  PaletteColor,
} from '../data/flowchart';

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

// The node ELK plants at the centre. Everything else is laid out on
// concentric rings around it, keyed by BFS distance.
const ROOT_ID = 'd_start';

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
  /** Resolved palette so the Svelte component can apply the colour
   *  inline — same reasoning as edges (xyflow portals/scopes break
   *  the CSS cascade for variables defined on `.svelte-flow__node`). */
  accent: { line: string; text: string };
}

// Tighten against xyflow's own `Node<TData, TType>` so the island accepts
// these directly into `let nodes = $state<FlowNode[]>(initialNodes)` with
// no cast. Same trick for edges.
export type BookFlowNode = Node<BookNodePayload, 'book'>;
export type DecisionFlowNode = Node<DecisionNodePayload, 'decision'>;
export type FlowNode = BookFlowNode | DecisionFlowNode;
/** xyflow's built-in edge renderer ids. `'default'` is its bezier path;
 *  the others map 1:1 onto our friendlier `EdgeType` names. */
type XyEdgeType = 'default' | 'simplebezier' | 'smoothstep' | 'step' | 'straight';

const EDGE_TYPE_TO_XY: Record<EdgeType, XyEdgeType> = {
  bezier: 'default',
  simplebezier: 'simplebezier',
  smoothstep: 'smoothstep',
  step: 'step',
  straight: 'straight',
};

export type FlowEdge = Edge<{ color?: PaletteColor }, XyEdgeType>;

/**
 * Closest point on segment AB to point P, plus the unsigned distance.
 * Standard parameteric projection clamped to [0, 1] so the closest point
 * stays on the segment rather than its infinite-line extension.
 */
function closestPointOnSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { point: { x: number; y: number }; distance: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  // Degenerate edge (source == target). Distance is just |P - A|.
  if (lenSq === 0) {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    return { point: { x: a.x, y: a.y }, distance: Math.hypot(dx, dy), t: 0 };
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  const point = { x: a.x + t * abx, y: a.y + t * aby };
  return { point, distance: Math.hypot(p.x - point.x, p.y - point.y), t };
}

/**
 * Iteratively push nodes off edges they shouldn't be sitting on.
 *
 * Treats each edge as a straight segment between source-centre and
 * target-centre and each node as a circle whose radius is its
 * half-diagonal. For every (edge, non-endpoint node) pair where the
 * circle intersects the segment, we move the node along the perpendicular
 * by `(intersection_depth) * stepFactor`, away from the segment.
 *
 * Convergence: each iteration tracks the total movement applied to all
 * nodes (sum of per-push magnitudes). We stop when one of:
 *   1. Nothing moved at all (the strict convergence case).
 *   2. Total motion this iteration falls below `minTotalMotion`. With
 *      ~200 nodes and many overlapping edges, the system can't always
 *      reach perfect equilibrium — two nodes squeezed between three
 *      edges can ping-pong by a few pixels indefinitely. Once the total
 *      system motion is at the sub-card scale, we've extracted all the
 *      visual benefit pass 3 can offer and further iterations only
 *      shuffle pixels.
 *   3. We hit `maxIterations` as the hard cap.
 *
 * Damping: the per-iteration step is multiplied by an exponentially-
 * decaying annealing coefficient. Combined with the early-exit on total
 * motion, this turns the loop into a classic simulated-annealing-style
 * relaxation that lands in a clean local minimum without oscillating.
 *
 * Mutates `positions` in place. Pinned nodes are read but never written.
 *
 * @returns the number of iterations actually performed (1-based; equal to
 *   `maxIterations` if convergence was not reached, so callers can warn).
 */
function decongestEdges(opts: {
  positions: Map<string, { x: number; y: number }>;
  sizes: Map<string, { w: number; h: number }>;
  edges: ElkExtendedEdge[];
  pinnedIds: ReadonlySet<string>;
  padding: number;
  maxIterations: number;
  stepFactor: number;
  /** Stop once total per-iteration motion across all nodes drops below
   *  this many pixels. ~node-corner radius is a sensible default. */
  minTotalMotion?: number;
}): number {
  const {
    positions,
    sizes,
    edges,
    pinnedIds,
    padding,
    maxIterations,
    stepFactor,
    minTotalMotion = 8,
  } = opts;
  // Exponential cooling: at iteration i out of N, temperature = e^(-3i/N).
  // Picks up most of the cooling in the back half so early iterations
  // can do real work and late iterations are forced into stillness.
  // (3 = ln(20), so the final iteration runs at ~5% of starting strength.)
  const COOLING_RATE = 3;

  // Pre-compute each node's bounding-circle radius once. It doesn't
  // change between iterations and the dominant cost is the per-pair
  // distance check, not the radius math, but caching keeps the inner
  // loop tight.
  const radii = new Map<string, number>();
  for (const [id, size] of sizes) {
    radii.set(id, Math.hypot(size.w, size.h) / 2);
  }

  const centreOf = (id: string): { x: number; y: number } => {
    const p = positions.get(id)!;
    const s = sizes.get(id)!;
    return { x: p.x + s.w / 2, y: p.y + s.h / 2 };
  };

  for (let iter = 0; iter < maxIterations; iter++) {
    const temperature = Math.exp((-COOLING_RATE * iter) / Math.max(1, maxIterations - 1));
    let totalMotion = 0;
    for (const edge of edges) {
      const sourceId = edge.sources[0];
      const targetId = edge.targets[0];
      const a = centreOf(sourceId);
      const b = centreOf(targetId);
      // A pure self-edge or a zero-length placement edge has nothing to
      // push against — skip it instead of dividing by zero downstream.
      if (a.x === b.x && a.y === b.y) continue;

      for (const [id, pos] of positions) {
        if (id === sourceId || id === targetId) continue;
        if (pinnedIds.has(id)) continue;

        const cN = centreOf(id);
        const { point: closest, distance, t } = closestPointOnSegment(cN, a, b);
        // If the closest point is one of the segment endpoints (t hit
        // the [0,1] clamp), the node is "past" the edge in segment-
        // parameter space — sporeOverlap already handles that case as
        // node-on-node, so skip to avoid double-counting and weird
        // tangential pushes near the endpoints.
        if (t <= 0 || t >= 1) continue;

        const minClearance = radii.get(id)! + padding;
        if (distance >= minClearance) continue;

        // Push perpendicular to the segment, away from it. When the
        // node centre lies exactly on the segment (distance === 0)
        // the perpendicular direction is ambiguous; pick the segment's
        // left-hand normal as a deterministic fallback so successive
        // builds produce identical output.
        let dx: number;
        let dy: number;
        if (distance > 1e-6) {
          dx = (cN.x - closest.x) / distance;
          dy = (cN.y - closest.y) / distance;
        } else {
          const segLen = Math.hypot(b.x - a.x, b.y - a.y);
          dx = -(b.y - a.y) / segLen;
          dy = (b.x - a.x) / segLen;
        }
        const push = (minClearance - distance) * stepFactor * temperature;
        const moveX = dx * push;
        const moveY = dy * push;
        pos.x += moveX;
        pos.y += moveY;
        totalMotion += Math.hypot(moveX, moveY);
      }
    }
    if (totalMotion < minTotalMotion) return iter + 1;
  }
  return maxIterations;
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

const elk = new ELK();

export async function getLayoutedElements(
  data: FlowchartData,
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> {
  validateFlowchart(data);

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

  // Stress accepts arbitrary graphs (including DAG cross-references), so
  // every edge goes in unmodified. The per-node `elk.position` on the
  // root pins it at (0, 0); ELK's stress solver then arranges everything
  // else around it to minimise edge-length / graph-distance mismatch.
  const elkChildren: ElkNode[] = [
    ...data.decisions.map((d) => ({
      id: d.id,
      width: NODE_SIZES.decision.width,
      height: NODE_SIZES.decision.height,
      ...(d.id === ROOT_ID
        ? { layoutOptions: { 'elk.position': '(0, 0)' } }
        : {}),
    })),
    ...bookPayloads.map((b) => ({
      id: b.node.id,
      width: NODE_SIZES.book.width,
      height: NODE_SIZES.book.height,
    })),
  ];

  const elkEdges: ElkExtendedEdge[] = data.edges.map((e) => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }));

  // ELK option keys are stringly-typed and live in the official reference at
  // https://eclipse.dev/elk/reference.html. The pipeline is two passes:
  //
  // PASS 1 — `stress` (Kamada-Kawai stress minimisation): produces the
  // overall shape by trying to make geometric distance proportional to
  // graph-theoretic distance (BFS hop count). Nodes far from the root
  // drift outward naturally, with no rigid rings. Knobs:
  //   - `elk.stress.desiredEdgeLength` target distance between edge
  //     endpoints. Bigger = more breathing room, larger overall canvas.
  //   - `elk.stress.epsilon` convergence threshold. Lower = more
  //     iterations, smoother result.
  //   - `elk.stress.iterationLimit` work cap; large enough that
  //     `epsilon` governs convergence in practice.
  //   - `elk.interactive: true` honours the per-node `elk.position`
  //     override that pins `d_start` at (0, 0).
  //
  // Stress doesn't strictly forbid overlap — it minimises stress globally
  // and accepts collisions as a worthwhile trade-off. With 520x400 book
  // cards that produces a noticeable amount of card-on-card overlap on
  // any tightly-coupled subtree, so:
  //
  // PASS 2 — `sporeOverlap` (Spore overlap removal): takes the stress
  // positions and runs a scanline overlap removal that nudges only the
  // colliding nodes apart. Preserves the broad shape while guaranteeing
  // a hard `spacing.nodeNode` gap between every pair. Knobs:
  //   - `elk.spacing.nodeNode` the *enforced* minimum gap. Bigger here
  //     means more aggressive nudging when pass 1 leaves overlaps.
  //   - `elk.spore.overlapRemoval.runScanline: true` enables the
  //     scanline pass that does the actual O(n log n) collision sweep.
  //   - `elk.interactive: true` is critical — without it, sporeOverlap
  //     ignores the incoming positions and starts from scratch.
  const stressPass = await elk.layout({
    id: 'flowchart-root',
    layoutOptions: {
      'elk.algorithm': 'stress',
      'elk.stress.desiredEdgeLength': '850',
      'elk.stress.epsilon': '0.0001',
      'elk.stress.iterationLimit': '10000',
      'elk.interactive': 'true',
    },
    children: elkChildren,
    edges: elkEdges,
  });

  // Re-feed the stress output into sporeOverlap. Each child already has
  // `x`/`y` from pass 1; sporeOverlap reads those, finds collisions
  // against the spacing gap, and writes back nudged positions.
  const layout = await elk.layout({
    id: 'flowchart-root',
    layoutOptions: {
      'elk.algorithm': 'sporeOverlap',
      'elk.spacing.nodeNode': '80',
      'elk.spore.overlapRemoval.runScanline': 'true',
      'elk.interactive': 'true',
    },
    children: stressPass.children,
    edges: elkEdges,
  });

  // ELK already returns top-left coordinates (unlike dagre which returns
  // the centre), so no per-node centring shift is needed. We do however
  // translate the whole graph so the root lands at (0, 0) — the data file
  // pins `d_start` at that origin and the existing `pinned` escape hatch
  // is authored relative to it.
  const positions = new Map<string, { x: number; y: number }>();
  const sizes = new Map<string, { w: number; h: number }>();
  let originDx = 0;
  let originDy = 0;
  for (const child of layout.children ?? []) {
    if (child.id === ROOT_ID) {
      originDx = child.x ?? 0;
      originDy = child.y ?? 0;
    }
  }
  for (const child of layout.children ?? []) {
    positions.set(child.id, {
      x: (child.x ?? 0) - originDx,
      y: (child.y ?? 0) - originDy,
    });
    sizes.set(child.id, {
      w: child.width ?? 0,
      h: child.height ?? 0,
    });
  }

  // PASS 3 — edge-aware decongestion. sporeOverlap (pass 2) treats nodes
  // as the only obstacles and is blind to edges, so it happily leaves a
  // bezier slicing through a book card it doesn't connect to. This pass
  // walks every (edge, non-endpoint node) pair, treats the edge as a
  // straight segment between node centres, and if the segment passes
  // closer to a node centre than the node's circumscribing radius plus a
  // safety margin, pushes that node *perpendicular to the segment* by
  // enough to clear it. We iterate until a full sweep moves nothing
  // (or we hit the cap), which is the same idempotency contract
  // sporeOverlap promises for node-on-node.
  //
  // We approximate node hitboxes as circles (radius = the half-diagonal)
  // rather than computing exact box/segment distance: it slightly
  // overestimates collisions, which in practice means a marginally more
  // generous gap than strictly needed — fine, because the visual cost
  // of an under-clearance (edge clipping a card corner) is much higher
  // than a slightly bigger graph.
  //
  // Pinned nodes (currently just `d_start`) are skipped — moving them
  // would defeat the `pinned` escape hatch authored against (0, 0).
  // Edges whose endpoint is pinned are still considered as obstacles
  // for *other* nodes; we just can't push the pinned node itself.
  const pinnedIds = new Set<string>([
    ROOT_ID,
    ...data.decisions.filter((d) => d.pinned).map((d) => d.id),
    ...data.books.filter((b) => b.pinned).map((b) => b.id),
  ]);
  const DECONGEST_ITER_CAP = 80;
  const decongestionIterations = decongestEdges({
    positions,
    sizes,
    edges: elkEdges,
    pinnedIds,
    padding: 30, // extra clearance beyond the node's bounding circle.
    maxIterations: DECONGEST_ITER_CAP,
    stepFactor: 1.05, // overshoot fractionally so we converge in fewer sweeps.
  });
  if (decongestionIterations >= DECONGEST_ITER_CAP) {
    // We hit the iteration cap without convergence — either the graph
    // genuinely can't be untangled at this density, or two nodes are
    // ping-ponging between two edges. Surface it during build/dev so
    // we notice rather than silently shipping a degraded layout.
    console.warn(
      `flowchart-layout: edge decongestion did not converge within ${DECONGEST_ITER_CAP} iterations; ` +
        `consider raising spacing.nodeNode (pass 2) or padding (pass 3).`,
    );
  }

  const placeDecision = (d: DecisionNode): DecisionFlowNode => {
    const size = NODE_SIZES.decision;
    const position = d.pinned ?? positions.get(d.id) ?? { x: 0, y: 0 };
    const accent = EDGE_PALETTE[d.color ?? 'gray'];
    return {
      id: d.id,
      type: 'decision',
      position,
      width: size.width,
      height: size.height,
      ariaLabel: `Decision: ${d.prompt}`,
      data: { kind: 'decision', prompt: d.prompt, accent },
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
  const centres = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const w = n.width ?? 0;
    const h = n.height ?? 0;
    centres.set(n.id, { x: n.position.x + w / 2, y: n.position.y + h / 2 });
  }

  /**
   * Pick which side of `from` the edge should leave from, given that it's
   * heading toward `to`. Snaps the centre-to-centre vector to the nearest
   * cardinal direction:
   *
   *     |dx| > |dy|  →  the connection is "more horizontal than vertical",
   *                     so leave from the right or left side
   *     otherwise    →  more vertical, so leave from the top or bottom
   *
   * This is the same idea xyflow's `simple-floating-edge` example uses,
   * just discretised to four sides instead of computing exact box-line
   * intersection points (sufficient because we have hidden cardinal
   * handles to attach to and the bezier renderer takes the curve from
   * there). The sign of the dominant component picks which of the two
   * candidate sides wins.
   *
   * In screen coordinates +y points DOWN, so dy > 0 means "below".
   */
  type Side = 'top' | 'right' | 'bottom' | 'left';
  const pickSide = (
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Side => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'bottom' : 'top';
  };

  const defaultEdgeType: EdgeType = data.defaultEdgeType ?? 'bezier';
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
      type: EDGE_TYPE_TO_XY[e.type ?? defaultEdgeType],
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
