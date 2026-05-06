/**
 * Analytic layout scorer. Walks the final positions/sizes/edge-geometry
 * triple produced by `flowchart-layout.ts` and counts the five classes
 * of visual defect we care about, plus a continuous "edge sprawl"
 * measure:
 *
 *   1. node-node overlaps   — two AABBs intersect.
 *   2. edge-node intrusions — an edge polyline dips into a non-endpoint
 *                              node's AABB.
 *   3. edge-edge crossings  — two edge polylines cross, and the edges
 *                              don't share an endpoint (a shared endpoint
 *                              cross is just two arrows leaving the same
 *                              node, which the eye reads correctly).
 *   4. label-node overlaps  — a label's bbox intersects a node's bbox
 *                              (excluding the label's own endpoints,
 *                              because the label is allowed to graze its
 *                              source/target without that being a bug).
 *   5. label-label overlaps — two labels' bboxes intersect. Pairs that
 *                              share an endpoint (sibling answers from
 *                              the same decision) are still counted —
 *                              two unreadable overlapping answers next
 *                              to the same decision diamond is exactly
 *                              the visual problem we're trying to fix.
 *   6. total stretch (px)   — Σ max(0, edgeLength − desiredEdgeLength)
 *                              across every edge. Asymmetric: edges
 *                              SHORTER than the target contribute zero
 *                              (compact = fine), edges LONGER contribute
 *                              their excess. Catches the failure mode
 *                              where the sim drifts apart to satisfy
 *                              local label/edge-node forces but spreads
 *                              the whole layout out by hundreds of
 *                              pixels — a layout the discrete count
 *                              metrics (1–5) can't see, because
 *                              "everything got further apart" looks
 *                              identical to "fewer overlaps".
 *   7. total compression(px)— Σ max(0, minDesiredEdgeLength − edgeLength)
 *                              across every edge. The mirror image of
 *                              stretch: edges LONGER than the minimum
 *                              contribute zero, edges SHORTER contribute
 *                              their deficit. Together with stretch,
 *                              defines a "sweet spot" length range —
 *                              anything in [min, desired] is free, only
 *                              edges outside the range pay. Catches the
 *                              opposite failure mode where two endpoints
 *                              get pulled almost on top of each other
 *                              by overlapping label/edge-node basins
 *                              and the resulting near-zero-length edge
 *                              renders as an arrow stub the eye can't
 *                              follow.
 *
 * The output is intentionally *flat counts* + a small "worst offenders"
 * list per category. The counts give the diagnostic loop a quantitative
 * before/after delta to print at build time; the offender ids tell us
 * which 5-10 nodes are worth pinning when we eventually re-introduce
 * the override layer.
 *
 * The scorer is side-effect free. The wiring decides what to log.
 */
import type { EdgeGeometry, Vec2 } from './flowchart-edge-geometry';
import {
  polylineCrossing,
  segmentBoxPenetration,
} from './flowchart-edge-geometry';

export interface LayoutScore {
  nodeNodeOverlaps: number;
  edgeNodeIntrusions: number;
  edgeEdgeCrossings: number;
  labelNodeOverlaps: number;
  labelLabelOverlaps: number;
  /** Sum of `max(0, length - desiredEdgeLength)` over every edge, in
   *  pixels. Zero when every edge is at-or-under the target length;
   *  grows linearly with sprawl. Used by the layout cost function
   *  inside `flowchart-layout.ts` so the best-snapshot revert prefers
   *  compact layouts to spread-out ones. */
  totalStretchPx: number;
  /** Sum of `max(0, minDesiredEdgeLength - length)` over every edge, in
   *  pixels. Zero when every edge is at-or-over the minimum length;
   *  grows linearly with how squashed the layout has become. Counterpart
   *  to `totalStretchPx` — together they define a "sweet spot" range
   *  `[min, desired]` that's free of length cost, with deviations in
   *  either direction penalised by the layout cost function. */
  totalCompressionPx: number;
  worstOffenders: {
    nodeNode: { a: string; b: string; overlapPx: number }[];
    edgeNode: { edgeId: string; nodeId: string; depthPx: number }[];
    edgeEdge: { aId: string; bId: string; angleDeg: number }[];
    labelNode: { edgeId: string; nodeId: string; overlapPx: number }[];
    labelLabel: { aId: string; bId: string; overlapPx: number }[];
    /** Top-N most over-stretched edges by `lengthPx − desiredEdgeLength`. */
    stretch: { edgeId: string; lengthPx: number; excessPx: number }[];
    /** Top-N most over-compressed edges by `minDesiredEdgeLength − lengthPx`. */
    compression: { edgeId: string; lengthPx: number; deficitPx: number }[];
  };
}

/** Cap each "worst offenders" list at this length. Past 10 the noise
 *  drowns the signal in console output. */
const MAX_OFFENDERS = 10;

export function scoreLayout(args: {
  positions: Map<string, Vec2>;
  sizes: Map<string, { w: number; h: number }>;
  geometry: EdgeGeometry[];
  edges: { id: string; source: string; target: string }[];
  /** Pulled in from the relax sim so the scorer can compute the same
   *  "stretch" the spring force is trying to minimise. Lets the caller
   *  weight stretch into the cost function and have the best-snapshot
   *  revert prefer compact layouts to sprawled ones. */
  desiredEdgeLength: number;
  /** Lower bound of the "sweet spot" length range. Edges shorter than
   *  this contribute their deficit to `totalCompressionPx`. Defines the
   *  symmetric counterpart to `desiredEdgeLength`'s upper bound — any
   *  edge with length in [`minDesiredEdgeLength`, `desiredEdgeLength`]
   *  is at zero length cost. */
  minDesiredEdgeLength: number;
}): LayoutScore {
  const {
    positions,
    sizes,
    geometry,
    edges,
    desiredEdgeLength,
    minDesiredEdgeLength,
  } = args;
  const ids = [...positions.keys()];

  // --- 1. node-node overlap ---------------------------------------------
  // O(n²) brute force. 215 nodes -> ~23k pairs, sub-millisecond.
  const nodeNode: { a: string; b: string; overlapPx: number }[] = [];
  for (let i = 0; i < ids.length; i++) {
    const aId = ids[i];
    const ap = positions.get(aId)!;
    const aSz = sizes.get(aId)!;
    const ax2 = ap.x + aSz.w;
    const ay2 = ap.y + aSz.h;
    for (let j = i + 1; j < ids.length; j++) {
      const bId = ids[j];
      const bp = positions.get(bId)!;
      const bSz = sizes.get(bId)!;
      const ovX = Math.min(ax2, bp.x + bSz.w) - Math.max(ap.x, bp.x);
      if (ovX <= 0) continue;
      const ovY = Math.min(ay2, bp.y + bSz.h) - Math.max(ap.y, bp.y);
      if (ovY <= 0) continue;
      // Use the smaller axis as overlap depth — that's the dimension that
      // would have to grow the smallest to pull the boxes apart, which is
      // the visually-meaningful quantity (a 1px x 400px sliver still
      // looks like a real card-on-card mishap).
      nodeNode.push({ a: aId, b: bId, overlapPx: Math.min(ovX, ovY) });
    }
  }

  // --- 2. edge-node intrusion -------------------------------------------
  const endpoints = new Map<string, readonly [string, string]>();
  for (const e of edges) endpoints.set(e.id, [e.source, e.target] as const);

  const edgeNode: { edgeId: string; nodeId: string; depthPx: number }[] = [];
  for (const g of geometry) {
    const ep = endpoints.get(g.id);
    if (!ep) continue;
    const [src, tgt] = ep;
    for (const id of ids) {
      if (id === src || id === tgt) continue;
      const np = positions.get(id)!;
      const nSz = sizes.get(id)!;
      // bbox-bbox short-circuit before the per-segment loop.
      if (g.bbox.maxX < np.x || g.bbox.minX > np.x + nSz.w) continue;
      if (g.bbox.maxY < np.y || g.bbox.minY > np.y + nSz.h) continue;
      let maxDepth = 0;
      const box = { x: np.x, y: np.y, w: nSz.w, h: nSz.h };
      for (let s = 0; s < g.samples.length - 1; s++) {
        const d = segmentBoxPenetration(g.samples[s], g.samples[s + 1], box);
        if (d > maxDepth) maxDepth = d;
      }
      if (maxDepth > 0) {
        edgeNode.push({ edgeId: g.id, nodeId: id, depthPx: maxDepth });
      }
    }
  }

  // --- 3. edge-edge crossing --------------------------------------------
  const edgeEdge: { aId: string; bId: string; angleDeg: number }[] = [];
  for (let i = 0; i < geometry.length; i++) {
    const ga = geometry[i];
    const epA = endpoints.get(ga.id);
    if (!epA) continue;
    for (let j = i + 1; j < geometry.length; j++) {
      const gb = geometry[j];
      const epB = endpoints.get(gb.id);
      if (!epB) continue;
      // Skip pairs that share an endpoint — those are "fan-out" or
      // "fan-in" crossings the eye reads as the same junction, not as
      // edge tangle.
      if (
        epA[0] === epB[0] ||
        epA[0] === epB[1] ||
        epA[1] === epB[0] ||
        epA[1] === epB[1]
      ) {
        continue;
      }
      if (ga.bbox.maxX < gb.bbox.minX || gb.bbox.maxX < ga.bbox.minX) continue;
      if (ga.bbox.maxY < gb.bbox.minY || gb.bbox.maxY < ga.bbox.minY) continue;
      const cross = polylineCrossing(ga.samples, gb.samples);
      if (cross) {
        edgeEdge.push({ aId: ga.id, bId: gb.id, angleDeg: cross.angleDeg });
      }
    }
  }

  // --- 4. label-vs-node overlap -----------------------------------------
  // Edge labels live on top of the canvas (svelte-flow puts them in a
  // portal) so a label sliding under a book card or decision pill is
  // exactly as visually broken as an edge sliding behind one. AABB-AABB
  // intersection is enough; labels are short rectangles, not curves.
  const labelNode: { edgeId: string; nodeId: string; overlapPx: number }[] = [];
  for (const g of geometry) {
    if (!g.label) continue;
    const ep = endpoints.get(g.id);
    if (!ep) continue;
    const [src, tgt] = ep;
    const lx2 = g.label.x + g.label.w;
    const ly2 = g.label.y + g.label.h;
    for (const id of ids) {
      // Allow labels to overlap their own endpoints — the label sits
      // 25% along the edge so it's geometrically near the source and a
      // small intrusion into a tightly-packed decision pill is part of
      // how xyflow renders these. We're protecting against labels
      // landing on UNRELATED nodes.
      if (id === src || id === tgt) continue;
      const np = positions.get(id)!;
      const nSz = sizes.get(id)!;
      const ovX = Math.min(lx2, np.x + nSz.w) - Math.max(g.label.x, np.x);
      if (ovX <= 0) continue;
      const ovY = Math.min(ly2, np.y + nSz.h) - Math.max(g.label.y, np.y);
      if (ovY <= 0) continue;
      labelNode.push({
        edgeId: g.id,
        nodeId: id,
        overlapPx: Math.min(ovX, ovY),
      });
    }
  }

  // --- 5. label-vs-label overlap ----------------------------------------
  // Two answer labels stacking on top of each other reduces the diagram
  // to noise. We INCLUDE shared-endpoint pairs (siblings of one
  // decision) here because that's the scenario the eye reads worst —
  // two answers leaving the same diamond and rendering on top of each
  // other is exactly the unreadable case we're trying to detect.
  const labelLabel: { aId: string; bId: string; overlapPx: number }[] = [];
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
      const ovX = Math.min(ax2, bx2) - Math.max(ga.label.x, gb.label.x);
      if (ovX <= 0) continue;
      const ovY = Math.min(ay2, by2) - Math.max(ga.label.y, gb.label.y);
      if (ovY <= 0) continue;
      labelLabel.push({
        aId: ga.id,
        bId: gb.id,
        overlapPx: Math.min(ovX, ovY),
      });
    }
  }

  // --- 6/7. edge length deviations (continuous sprawl + squash) ---------
  // Two measures sharing one loop:
  //   - stretch     = Σ max(0, length − desiredEdgeLength)
  //   - compression = Σ max(0, minDesiredEdgeLength − length)
  // They never both fire on the same edge — `min < desired` defines a
  // dead-band where edges sit at zero length cost. `lengthPx` is the
  // centre-to-centre straight-line distance (matches the reference the
  // relax sim's K_LEN spring uses), not the rendered curve's arc length
  // — using arc length would penalise bezier curls the renderer adds
  // for curvature 0.25, which the layout has no control over.
  const stretch: { edgeId: string; lengthPx: number; excessPx: number }[] = [];
  const compression: { edgeId: string; lengthPx: number; deficitPx: number }[] = [];
  let totalStretchPx = 0;
  let totalCompressionPx = 0;
  for (const g of geometry) {
    const sp = positions.get(g.source);
    const ss = sizes.get(g.source);
    const tp = positions.get(g.target);
    const ts = sizes.get(g.target);
    if (!sp || !ss || !tp || !ts) continue;
    const dx = tp.x + ts.w / 2 - (sp.x + ss.w / 2);
    const dy = tp.y + ts.h / 2 - (sp.y + ss.h / 2);
    const length = Math.hypot(dx, dy);
    if (length > desiredEdgeLength) {
      const excess = length - desiredEdgeLength;
      totalStretchPx += excess;
      stretch.push({ edgeId: g.id, lengthPx: length, excessPx: excess });
    } else if (length < minDesiredEdgeLength) {
      const deficit = minDesiredEdgeLength - length;
      totalCompressionPx += deficit;
      compression.push({ edgeId: g.id, lengthPx: length, deficitPx: deficit });
    }
  }

  // --- offender ranking -------------------------------------------------
  // node-node and edge-node sort by raw severity. edge-edge sorts by
  // |sin(angle)| — a 5° glancing crossing is barely visible while a 90°
  // perpendicular one is the eyesore we actually want to fix first.
  // Both label categories sort by raw overlap depth. Stretch sorts by
  // excess px so the worst sprawl rises to the top of the diagnostic.
  nodeNode.sort((a, b) => b.overlapPx - a.overlapPx);
  edgeNode.sort((a, b) => b.depthPx - a.depthPx);
  edgeEdge.sort(
    (a, b) =>
      Math.abs(Math.sin((b.angleDeg * Math.PI) / 180)) -
      Math.abs(Math.sin((a.angleDeg * Math.PI) / 180)),
  );
  labelNode.sort((a, b) => b.overlapPx - a.overlapPx);
  labelLabel.sort((a, b) => b.overlapPx - a.overlapPx);
  stretch.sort((a, b) => b.excessPx - a.excessPx);
  compression.sort((a, b) => b.deficitPx - a.deficitPx);

  return {
    nodeNodeOverlaps: nodeNode.length,
    edgeNodeIntrusions: edgeNode.length,
    edgeEdgeCrossings: edgeEdge.length,
    labelNodeOverlaps: labelNode.length,
    labelLabelOverlaps: labelLabel.length,
    totalStretchPx,
    totalCompressionPx,
    worstOffenders: {
      nodeNode: nodeNode.slice(0, MAX_OFFENDERS),
      edgeNode: edgeNode.slice(0, MAX_OFFENDERS),
      edgeEdge: edgeEdge.slice(0, MAX_OFFENDERS),
      labelNode: labelNode.slice(0, MAX_OFFENDERS),
      labelLabel: labelLabel.slice(0, MAX_OFFENDERS),
      stretch: stretch.slice(0, MAX_OFFENDERS),
      compression: compression.slice(0, MAX_OFFENDERS),
    },
  };
}
