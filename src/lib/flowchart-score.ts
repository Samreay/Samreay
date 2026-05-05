/**
 * Analytic layout scorer. Walks the final positions/sizes/edge-geometry
 * triple produced by `flowchart-layout.ts` and counts the three classes
 * of visual defect we care about:
 *
 *   1. node-node overlaps  — two AABBs intersect.
 *   2. edge-node intrusions — an edge polyline dips into a non-endpoint
 *                              node's AABB.
 *   3. edge-edge crossings  — two edge polylines cross, and the edges
 *                              don't share an endpoint (a shared endpoint
 *                              cross is just two arrows leaving the same
 *                              node, which the eye reads correctly).
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
  worstOffenders: {
    nodeNode: { a: string; b: string; overlapPx: number }[];
    edgeNode: { edgeId: string; nodeId: string; depthPx: number }[];
    edgeEdge: { aId: string; bId: string; angleDeg: number }[];
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
}): LayoutScore {
  const { positions, sizes, geometry, edges } = args;
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

  // --- offender ranking -------------------------------------------------
  // node-node and edge-node sort by raw severity. edge-edge sorts by
  // |sin(angle)| — a 5° glancing crossing is barely visible while a 90°
  // perpendicular one is the eyesore we actually want to fix first.
  nodeNode.sort((a, b) => b.overlapPx - a.overlapPx);
  edgeNode.sort((a, b) => b.depthPx - a.depthPx);
  edgeEdge.sort(
    (a, b) =>
      Math.abs(Math.sin((b.angleDeg * Math.PI) / 180)) -
      Math.abs(Math.sin((a.angleDeg * Math.PI) / 180)),
  );

  return {
    nodeNodeOverlaps: nodeNode.length,
    edgeNodeIntrusions: edgeNode.length,
    edgeEdgeCrossings: edgeEdge.length,
    worstOffenders: {
      nodeNode: nodeNode.slice(0, MAX_OFFENDERS),
      edgeNode: edgeNode.slice(0, MAX_OFFENDERS),
      edgeEdge: edgeEdge.slice(0, MAX_OFFENDERS),
    },
  };
}
