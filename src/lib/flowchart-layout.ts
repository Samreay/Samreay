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

/**
 * All edges share a single custom xyflow type that re-implements the
 * built-in path renderers and shifts the label toward the source. The
 * original `EdgeType` from the data file is carried in `data.pathType`
 * and read inside `OffsetLabelEdge.svelte` to pick the right path
 * helper (bezier / smoothstep / step / straight).
 */
const CUSTOM_EDGE_TYPE = 'offsetLabel';

export type FlowEdge = Edge<
  { color?: PaletteColor; pathType: EdgeType },
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
 * `nodeNodeOverlaps + edgeNodeIntrusions + edgeEdgeCrossings` while
 * leaving the macro shape ELK established largely intact (controlled by
 * `K_LEN` — too high and we tear things back to a regular grid, too low
 * and the sim drifts away from ELK's solution).
 */
const RELAX_OPTS = {
  /** Edge-length spring strength. Pulls each edge back toward the macro
   *  spacing ELK established so the sim doesn't drift to its own
   *  unrelated equilibrium. Very small — its only job is to prevent
   *  long-range drift, not to fight the other terms. */
  K_LEN: 0.001,
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
  /** Padding added to every separation criterion (node-node, edge-node).
   *  This is the breathing room the sim refuses to give up on. */
  PADDING: 60,
  /** Hard iteration cap. */
  MAX_ITERS: 1000,
  /** Total kinetic-energy threshold below which the sim declares
   *  convergence and exits early. Units: sum of |v|² across all nodes,
   *  so for ~215 nodes this corresponds to a per-node speed of about
   *  sqrt(20/215) ≈ 0.3 px/step — slow enough that further iterations
   *  only shuffle pixels. */
  CONVERGENCE_KE: 20.0,
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
  return lines.join('\n');
}

function relax(opts: {
  positions: Map<string, Vec2>;
  sizes: Map<string, { w: number; h: number }>;
  edges: EdgeSpec[];
  pinnedIds: ReadonlySet<string>;
  desiredEdgeLength: number;
}): { iterationsUsed: number; finalScore: LayoutScore } {
  const { positions, sizes, edges, pinnedIds, desiredEdgeLength } = opts;
  const {
    K_LEN,
    K_NODE_NODE,
    K_EDGE_NODE,
    K_EDGE_EDGE,
    DAMPING,
    DT,
    V_MAX,
    PADDING,
    MAX_ITERS,
    CONVERGENCE_KE,
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

  let iter = 0;
  for (; iter < MAX_ITERS; iter++) {
    fx.fill(0);
    fy.fill(0);
    const geometry = buildEdgeGeometry(positions, sizes, edges);

    // --- 1. edge-length spring ------------------------------------------
    // Pulls every edge's centre-to-centre distance toward `desiredEdgeLength`.
    // Linear (Hookean) so far-from-target pairs feel large forces and
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
      const mag = (K_LEN * stretch) / dist;
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
      iter++;
      break;
    }
  }

  const finalGeometry = buildEdgeGeometry(positions, sizes, edges);
  const finalScore = scoreLayout({
    positions,
    sizes,
    geometry: finalGeometry,
    edges,
  });
  return { iterationsUsed: iter, finalScore };
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

/**
 * Resolve every node's top-left coordinate and emit the typed xyflow
 * `nodes` / `edges` arrays the page renders.
 *
 * Determinism contract:
 *   - The full pipeline (ELK stress + sporeOverlap + Verlet `relax`) is
 *     deterministic given fixed input data. No RNG, fixed-step Verlet,
 *     ELK uses its default seed.
 *   - The on-disk file `src/data/flowchart-positions.json` is the source
 *     of truth across restarts and across machines. It is committed to
 *     git so a fresh checkout sees the SAME positions the author saw.
 *   - Recomputation (full ELK + relax) only fires when the data file's
 *     id set changes versus what's on disk, or when the file is missing
 *     entirely. `classifyCoverage` makes that decision: every requested
 *     id present → cache hit; any id missing → recompute.
 *
 * @param options.refine When `true` AND the cache is fully covering,
 *   skip ELK but still run the relax pass over the cached positions.
 *   Used by the dev-mode drag-and-save flow (subagent 3) so manual
 *   nudges get cleaned up by the physics step before being saved back.
 *   Defaults to `false`.
 */
export async function getLayoutedElements(
  data: FlowchartData,
  options?: { refine?: boolean },
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> {
  validateFlowchart(data);
  const refine = options?.refine ?? false;

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

  // Both ELK output and the on-disk cache populate `positions` (top-left
  // coords) and `sizes` (per-node w/h). The four cache branches below
  // each fill these maps; everything after the branch (relax, edge
  // construction) shares a single code path.
  const positions = new Map<string, { x: number; y: number }>();
  const sizes = new Map<string, { w: number; h: number }>();

  // Pre-fill `sizes` from the static node-kind table — it's the same
  // regardless of which branch we take. ELK reads it from `elkChildren`,
  // and the cache branches need it too because relax + scoring depend
  // on it.
  for (const d of data.decisions) {
    sizes.set(d.id, {
      w: NODE_SIZES.decision.width,
      h: NODE_SIZES.decision.height,
    });
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
    // Cache lookup used by `elkChildren` below to seed each known node
    // with its previous coordinate. `null` for the missing/refine paths
    // so the seeded-position branch is dead code there.
    const seedPositions: Map<string, { x: number; y: number }> | null =
      coverage.kind === 'partial' ? coverage.known : null;

    // ── Diagnostic preamble for the three "do work" branches ──────────
    if (coverage.kind === 'missing') {
      console.log('flowchart-layout: cache missing; running full layout');
    } else if (coverage.kind === 'partial') {
      for (const id of coverage.known.keys()) effectivePinnedIds.add(id);
      console.log(
        `flowchart-layout: cache partial (${coverage.known.size} known, ` +
          `${coverage.missing.length} new); seeding ELK with known positions`,
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
      // ── BRANCHES 3+4: full ELK run ───────────────────────────────────
      // Either the cache was missing entirely or only partially covered
      // the current id set. The partial path SEEDS ELK with the known
      // coordinates (per-child `elk.position`) so stress treats them as
      // good starting points and slots only the new ids around them.
      // The missing path passes no seed and lets stress place every
      // node from scratch.

      // Stress accepts arbitrary graphs (including DAG cross-references),
      // so every edge goes in unmodified. The per-node `elk.position` on
      // the root pins it at (0, 0); on the partial path every cached id
      // also gets an `elk.position` to start it where it was last time.
      // ELK's stress solver then arranges everything else (the new ids)
      // around them to minimise edge-length / graph-distance mismatch.
      // `elk.position` is a SEED, not a hard pin — `elk.interactive: true`
      // honours it as the starting coordinate but the iterative solver
      // still moves the node. We re-stamp the cache values back on top
      // after ELK returns so any sub-pixel drift in known-id positions
      // is erased before relax pins them.
      const elkChildren: ElkNode[] = [
        ...data.decisions.map((d) => {
          const seeded = seedPositions?.get(d.id);
          return {
            id: d.id,
            width: NODE_SIZES.decision.width,
            height: NODE_SIZES.decision.height,
            // `d_start` always wins — it's authored at (0, 0) and the
            // post-ELK origin shift below depends on it landing there.
            ...(d.id === ROOT_ID
              ? { layoutOptions: { 'elk.position': '(0, 0)' } }
              : seeded
                ? {
                    layoutOptions: {
                      'elk.position': `(${seeded.x}, ${seeded.y})`,
                    },
                  }
                : {}),
          };
        }),
        ...bookPayloads.map((b) => {
          const seeded = seedPositions?.get(b.node.id);
          return {
            id: b.node.id,
            width: NODE_SIZES.book.width,
            height: NODE_SIZES.book.height,
            ...(seeded
              ? {
                  layoutOptions: {
                    'elk.position': `(${seeded.x}, ${seeded.y})`,
                  },
                }
              : {}),
          };
        }),
      ];

      const elkEdges: ElkExtendedEdge[] = data.edges.map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      }));

      // ELK option keys are stringly-typed and live in the official
      // reference at https://eclipse.dev/elk/reference.html. The pipeline
      // is two passes:
      //
      // PASS 1 — `stress` (Kamada-Kawai stress minimisation): produces
      // the overall shape by trying to make geometric distance
      // proportional to graph-theoretic distance (BFS hop count). Nodes
      // far from the root drift outward naturally, with no rigid rings.
      // Knobs:
      //   - `elk.stress.desiredEdgeLength` target distance between edge
      //     endpoints. Bigger = more breathing room, larger overall
      //     canvas.
      //   - `elk.stress.epsilon` convergence threshold. Lower = more
      //     iterations, smoother result.
      //   - `elk.stress.iterationLimit` work cap; large enough that
      //     `epsilon` governs convergence in practice.
      //   - `elk.interactive: true` honours the per-node `elk.position`
      //     override that pins `d_start` at (0, 0).
      //
      // Stress doesn't strictly forbid overlap — it minimises stress
      // globally and accepts collisions as a worthwhile trade-off. With
      // 520x400 book cards that produces a noticeable amount of card-on-
      // card overlap on any tightly-coupled subtree, so:
      //
      // PASS 2 — `sporeOverlap` (Spore overlap removal): takes the
      // stress positions and runs a scanline overlap removal that nudges
      // only the colliding nodes apart. Preserves the broad shape while
      // guaranteeing a hard `spacing.nodeNode` gap between every pair.
      // Knobs:
      //   - `elk.spacing.nodeNode` the *enforced* minimum gap. Bigger
      //     here means more aggressive nudging when pass 1 leaves
      //     overlaps.
      //   - `elk.spore.overlapRemoval.runScanline: true` enables the
      //     scanline pass that does the actual O(n log n) collision
      //     sweep.
      //   - `elk.interactive: true` is critical — without it,
      //     sporeOverlap ignores the incoming positions and starts from
      //     scratch.
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

      // Re-feed the stress output into sporeOverlap. Each child already
      // has `x`/`y` from pass 1; sporeOverlap reads those, finds
      // collisions against the spacing gap, and writes back nudged
      // positions.
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

      // ELK already returns top-left coordinates (unlike dagre which
      // returns the centre), so no per-node centring shift is needed.
      // We do however translate the whole graph so the root lands at
      // (0, 0) — the data file pins `d_start` at that origin and the
      // existing `pinned` escape hatch is authored relative to it.
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

      // On the partial path, re-stamp every cached id back to its EXACT
      // saved coordinate before relax sees it. ELK's stress solver
      // honours `elk.position` as a seed and is supposed to leave a
      // well-positioned node alone, but in practice it nudges them by a
      // few pixels as the global stress potential changes around them.
      // Pinning in relax is cheap; pinning at exactly the cache values
      // means the user observes ZERO motion on existing nodes, which is
      // the contract this branch is supposed to enforce.
      if (seedPositions) {
        for (const [id, p] of seedPositions) {
          positions.set(id, { x: p.x, y: p.y });
        }
      }
    }

    // ── PASS 3 (shared by branches 2/3/4) ────────────────────────────
    // Deterministic Verlet force simulation. Replaces the old straight-
    // segment `decongestEdges` with a multi-term physics solver
    // (`relax`) that uses the SAME bezier polylines the renderer draws.
    // sporeOverlap (pass 2) is blind to edges entirely, so it happily
    // leaves a curve slicing through a card it doesn't connect to. The
    // simulation lands the four force terms documented in `RELAX_OPTS`
    // (length spring, rectangular node-node repulsion, edge-node
    // repulsion against the rendered polyline, edge-edge decrossing).
    //
    // Pinned nodes (`d_start` plus anything authored with
    // `pinned: { x, y }`) are excluded from force accumulation and
    // integration. Edges whose endpoint is pinned still participate in
    // the geometry the sim pushes against — we just don't move the
    // pinned end.
    //
    // We score the layout *before* and *after* the sim so the build
    // output shows the delta. The "before" geometry uses the same
    // bezier sampler as the sim, so the comparison is apples-to-apples.
    const beforeGeometry = buildEdgeGeometry(positions, sizes, edgeSpecs);
    const before = scoreLayout({
      positions,
      sizes,
      geometry: beforeGeometry,
      edges: edgeSpecs,
    });

    const { iterationsUsed, finalScore: after } = relax({
      positions,
      sizes,
      edges: edgeSpecs,
      pinnedIds: effectivePinnedIds,
      desiredEdgeLength: 850,
    });

    console.log(
      `flowchart-layout: relaxation ran ${iterationsUsed} iterations\n` +
        `  node-node overlaps:   ${before.nodeNodeOverlaps} -> ${after.nodeNodeOverlaps}\n` +
        `  edge-node intrusions: ${before.edgeNodeIntrusions} -> ${after.edgeNodeIntrusions}\n` +
        `  edge-edge crossings:  ${before.edgeEdgeCrossings} -> ${after.edgeEdgeCrossings}`,
    );
    if (
      after.nodeNodeOverlaps > 0 ||
      after.edgeNodeIntrusions > 0 ||
      after.edgeEdgeCrossings > 0
    ) {
      console.warn(
        'flowchart-layout: residual collisions after relaxation:\n' +
          formatOffenders(after),
      );
    }

    // Save the freshly computed (or re-relaxed) positions back to disk
    // so the next run starts from a warm cache. Best-effort — see
    // `savePositions` for the failure semantics.
    savePositions(positions);
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
      // `labelStyle` reaches the portalled HTML `<div>` rendered by
      // `EdgeLabelRenderer` — we set the solid 500-shade background
      // and the brightest-shade hue tint for the text in the same
      // string so the two sides of the colour pair can never drift.
      labelStyle: `background: ${palette.line}; color: ${palette.text};`,
      data: { color: e.color, pathType: e.type ?? defaultEdgeType },
    };
  });

  return { nodes, edges };
}
