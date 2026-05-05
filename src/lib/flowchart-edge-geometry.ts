/**
 * Build-time geometry helper for the recommendation flowchart.
 *
 * Given the same `positions` / `sizes` maps that `flowchart-layout.ts`
 * carries between its layout passes, plus the typed edge list, this
 * module produces the *exact polyline* that xyflow's renderer will draw
 * for every edge. The polyline is what the layout scorer measures
 * against and what the force simulation pushes against — so the solver
 * and the screen are always looking at the same geometry instead of the
 * straight centre-to-centre approximation pass 3 used to use.
 *
 * Implementation notes:
 *   - The bezier control-point math is a port of @xyflow/system's
 *     `getControlWithCurvature`. We re-derive the points so we can
 *     sample the curve analytically without a DOM (build runs in Node).
 *   - The smoothstep corner extraction is a port of @xyflow/system's
 *     internal `getPoints`. We render the corners as straight segments
 *     and ignore the radius-5 rounded bends — at our zoom level the
 *     rounding is invisible to both the eye and the scorer.
 *   - Every helper here is deterministic and pure. No randomness, no
 *     DOM, no I/O. Same inputs always produce byte-identical outputs.
 */
import type { EdgeType } from '../data/flowchart';

/** Cardinal sides — matches xyflow's `Position` enum string values. */
export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The per-edge spec the geometry helper consumes. `pathType` is the
 *  resolved type (with `FlowchartData.defaultEdgeType` already applied)
 *  so this module never has to know about defaults. */
export interface EdgeSpec {
  id: string;
  source: string;
  target: string;
  pathType: EdgeType;
}

export interface EdgeGeometry {
  id: string;
  source: string;
  target: string;
  /** Polyline samples in world coordinates, ordered source -> target.
   *  Bezier edges produce `BEZIER_SAMPLES + 1` points; straight edges
   *  produce 2; smoothstep / step produce one point per linear segment
   *  corner including endpoints. */
  samples: Vec2[];
  /** AABB of every sample. Lets pair-tests short-circuit in O(1). */
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  sourceHandle: Vec2;
  targetHandle: Vec2;
  sourceSide: Side;
  targetSide: Side;
}

/** Bezier curve sampling resolution. 12 segments balances visual fidelity
 *  (where the renderer's actual curve passes) with the per-iteration cost
 *  the force sim pays for every (edge, *) test. Bumping this up costs
 *  the sim O(N²) extra work for N segments per edge in the edge-edge
 *  term; bumping it down lets near-tangent crossings slip through. */
const BEZIER_SAMPLES = 12;

/** xyflow's default bezier curvature (0.25). Documented at
 *  https://reactflow.dev/api-reference/utils/get-bezier-path */
const BEZIER_CURVATURE = 0.25;

/** xyflow's smoothstep gap offset (20px) and stepPosition (0.5). Both
 *  match the defaults in `getSmoothStepPath` so our corner-extraction
 *  matches the renderer pixel-for-pixel at the corners. */
const SMOOTHSTEP_OFFSET = 20;
const SMOOTHSTEP_STEP_POSITION = 0.5;

const HANDLE_DIR: Record<Side, Vec2> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/**
 * Pick which side of `from` the edge should leave from, given that it's
 * heading toward `to`. Snaps the centre-to-centre vector to the nearest
 * cardinal direction.
 *
 * Lifted out of `flowchart-layout.ts` so the geometry helper can call
 * the SAME side-picking logic that the actual rendered edges use; if
 * the two ever disagreed the scorer would measure a different curve
 * than the one on screen.
 */
export function pickSide(from: Vec2, to: Vec2): Side {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/** World coordinates of the handle attachment for the given side. The
 *  Svelte node components anchor each `<Handle>` at the centre of the
 *  side, so we mirror that here. */
export function handlePoint(rect: Rect, side: Side): Vec2 {
  switch (side) {
    case 'top':
      return { x: rect.x + rect.w / 2, y: rect.y };
    case 'right':
      return { x: rect.x + rect.w, y: rect.y + rect.h / 2 };
    case 'bottom':
      return { x: rect.x + rect.w / 2, y: rect.y + rect.h };
    case 'left':
      return { x: rect.x, y: rect.y + rect.h / 2 };
  }
}

export function rectCentre(rect: Rect): Vec2 {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

// --- bezier ---------------------------------------------------------------

/** Direct port of @xyflow/system's `calculateControlOffset`. Positive
 *  distances get a 50% offset; negative distances (target "behind" the
 *  source) get a sqrt-shaped offset that grows slowly so the control
 *  point doesn't fly off to infinity. */
function calcControlOffset(distance: number, curvature: number): number {
  if (distance >= 0) return 0.5 * distance;
  return curvature * 25 * Math.sqrt(-distance);
}

/** Cubic bezier control point for the given handle side, mirroring
 *  @xyflow/system's `getControlWithCurvature`. */
function controlPoint(
  side: Side,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Vec2 {
  const c = BEZIER_CURVATURE;
  switch (side) {
    case 'left':
      return { x: x1 - calcControlOffset(x1 - x2, c), y: y1 };
    case 'right':
      return { x: x1 + calcControlOffset(x2 - x1, c), y: y1 };
    case 'top':
      return { x: x1, y: y1 - calcControlOffset(y1 - y2, c) };
    case 'bottom':
      return { x: x1, y: y1 + calcControlOffset(y2 - y1, c) };
  }
}

/** Sample a cubic bezier at `n + 1` evenly-spaced parameter values. */
function sampleCubicBezier(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  n: number,
): Vec2[] {
  const out: Vec2[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const it = 1 - t;
    const a = it * it * it;
    const b = 3 * it * it * t;
    const c = 3 * it * t * t;
    const d = t * t * t;
    out[i] = {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    };
  }
  return out;
}

// --- smoothstep -----------------------------------------------------------

/**
 * Faithful port of @xyflow/system's internal `getPoints`. Returns the
 * polyline corners (excluding the radius-5 rounded bends — at our scale
 * the bends are invisible). The full sequence is
 *   [source, sourceGapped?, ...bend points..., targetGapped?, target]
 * with the gapped points dropped when they coincide with their neighbour
 * to avoid duplicate samples.
 */
function smoothStepCorners(
  source: Vec2,
  sourceSide: Side,
  target: Vec2,
  targetSide: Side,
): Vec2[] {
  const sourceDir = HANDLE_DIR[sourceSide];
  const targetDir = HANDLE_DIR[targetSide];
  const sourceGapped: Vec2 = {
    x: source.x + sourceDir.x * SMOOTHSTEP_OFFSET,
    y: source.y + sourceDir.y * SMOOTHSTEP_OFFSET,
  };
  const targetGapped: Vec2 = {
    x: target.x + targetDir.x * SMOOTHSTEP_OFFSET,
    y: target.y + targetDir.y * SMOOTHSTEP_OFFSET,
  };

  const dirAccessor: 'x' | 'y' =
    sourceSide === 'left' || sourceSide === 'right' ? 'x' : 'y';
  const currDir =
    dirAccessor === 'x'
      ? sourceGapped.x < targetGapped.x
        ? 1
        : -1
      : sourceGapped.y < targetGapped.y
        ? 1
        : -1;

  let bendPoints: Vec2[] = [];
  if (sourceDir[dirAccessor] * targetDir[dirAccessor] === -1) {
    // Opposite-handle case: two bend points around a "centre" gridline.
    const t = SMOOTHSTEP_STEP_POSITION;
    let centerX: number;
    let centerY: number;
    if (dirAccessor === 'x') {
      centerX = sourceGapped.x + (targetGapped.x - sourceGapped.x) * t;
      centerY = (sourceGapped.y + targetGapped.y) / 2;
    } else {
      centerX = (sourceGapped.x + targetGapped.x) / 2;
      centerY = sourceGapped.y + (targetGapped.y - sourceGapped.y) * t;
    }
    const verticalSplit: Vec2[] = [
      { x: centerX, y: sourceGapped.y },
      { x: centerX, y: targetGapped.y },
    ];
    const horizontalSplit: Vec2[] = [
      { x: sourceGapped.x, y: centerY },
      { x: targetGapped.x, y: centerY },
    ];
    if (sourceDir[dirAccessor] === currDir) {
      bendPoints = dirAccessor === 'x' ? verticalSplit : horizontalSplit;
    } else {
      bendPoints = dirAccessor === 'x' ? horizontalSplit : verticalSplit;
    }
  } else {
    // Mixed-or-same handle case: a single L-bend.
    const sourceTarget: Vec2[] = [{ x: sourceGapped.x, y: targetGapped.y }];
    const targetSource: Vec2[] = [{ x: targetGapped.x, y: sourceGapped.y }];
    if (dirAccessor === 'x') {
      bendPoints = sourceDir.x === currDir ? targetSource : sourceTarget;
    } else {
      bendPoints = sourceDir.y === currDir ? sourceTarget : targetSource;
    }
  }

  const result: Vec2[] = [source];
  if (
    sourceGapped.x !== bendPoints[0].x ||
    sourceGapped.y !== bendPoints[0].y
  ) {
    result.push(sourceGapped);
  }
  for (const p of bendPoints) result.push(p);
  const last = bendPoints[bendPoints.length - 1];
  if (targetGapped.x !== last.x || targetGapped.y !== last.y) {
    result.push(targetGapped);
  }
  result.push(target);
  return result;
}

// --- public API -----------------------------------------------------------

/**
 * Build polyline geometry for every edge in `edges`. The returned array
 * preserves input order and skips edges whose source or target is
 * missing from the position/size maps (validation happens upstream in
 * `validateFlowchart`, so a missing entry here is a programmer error,
 * not user input — we silently skip rather than throw to keep the
 * force sim's hot loop branch-free).
 */
export function buildEdgeGeometry(
  positions: Map<string, Vec2>,
  sizes: Map<string, { w: number; h: number }>,
  edges: EdgeSpec[],
): EdgeGeometry[] {
  const result: EdgeGeometry[] = [];
  for (const e of edges) {
    const sp = positions.get(e.source);
    const tp = positions.get(e.target);
    const ss = sizes.get(e.source);
    const ts = sizes.get(e.target);
    if (!sp || !tp || !ss || !ts) continue;
    const sourceRect: Rect = { x: sp.x, y: sp.y, w: ss.w, h: ss.h };
    const targetRect: Rect = { x: tp.x, y: tp.y, w: ts.w, h: ts.h };
    const sourceCentre = rectCentre(sourceRect);
    const targetCentre = rectCentre(targetRect);
    const sourceSide = pickSide(sourceCentre, targetCentre);
    const targetSide = pickSide(targetCentre, sourceCentre);
    const sourceH = handlePoint(sourceRect, sourceSide);
    const targetH = handlePoint(targetRect, targetSide);

    let samples: Vec2[];
    switch (e.pathType) {
      case 'straight':
        samples = [sourceH, targetH];
        break;
      case 'smoothstep':
      case 'step':
        samples = smoothStepCorners(sourceH, sourceSide, targetH, targetSide);
        break;
      case 'bezier':
      case 'simplebezier':
      default: {
        const c1 = controlPoint(
          sourceSide,
          sourceH.x,
          sourceH.y,
          targetH.x,
          targetH.y,
        );
        const c2 = controlPoint(
          targetSide,
          targetH.x,
          targetH.y,
          sourceH.x,
          sourceH.y,
        );
        samples = sampleCubicBezier(sourceH, c1, c2, targetH, BEZIER_SAMPLES);
        break;
      }
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of samples) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    result.push({
      id: e.id,
      source: e.source,
      target: e.target,
      samples,
      bbox: { minX, minY, maxX, maxY },
      sourceHandle: sourceH,
      targetHandle: targetH,
      sourceSide,
      targetSide,
    });
  }
  return result;
}

// --- shared math primitives ----------------------------------------------

/**
 * Closest point on segment AB to point P, plus the unsigned distance and
 * the parametric t (clamped to [0, 1]). Standard projection.
 */
export function closestPointOnSegment(
  p: Vec2,
  a: Vec2,
  b: Vec2,
): { point: Vec2; distance: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) {
    return {
      point: { x: a.x, y: a.y },
      distance: Math.hypot(p.x - a.x, p.y - a.y),
      t: 0,
    };
  }
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq),
  );
  const point = { x: a.x + t * abx, y: a.y + t * aby };
  return {
    point,
    distance: Math.hypot(p.x - point.x, p.y - point.y),
    t,
  };
}

/**
 * Strict segment-segment intersection test. Returns the intersection
 * point and the canonicalised crossing angle in [0, 90] degrees, or
 * `null` if the segments don't cross.
 *
 * Uses the standard 2D cross-product parameterisation; treats parallel
 * segments (denom near zero) as non-intersecting even when collinear,
 * because for our use-case (bezier polyline samples) two segments
 * being exactly collinear is a numerical accident, not a real crossing
 * the eye would notice.
 */
export function segmentSegmentIntersection(
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  p4: Vec2,
): { point: Vec2; angleDeg: number } | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const sx = p3.x - p1.x;
  const sy = p3.y - p1.y;
  const t = (sx * d2y - sy * d2x) / denom;
  const u = (sx * d1y - sy * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  const point: Vec2 = { x: p1.x + t * d1x, y: p1.y + t * d1y };
  const la = Math.hypot(d1x, d1y);
  const lb = Math.hypot(d2x, d2y);
  const cos =
    la > 0 && lb > 0
      ? Math.max(-1, Math.min(1, (d1x * d2x + d1y * d2y) / (la * lb)))
      : 1;
  const ang = (Math.acos(cos) * 180) / Math.PI;
  return { point, angleDeg: Math.min(ang, 180 - ang) };
}

/**
 * First crossing between two polyline sample arrays, or `null`. We stop
 * at the first hit because for scoring we only care that the pair
 * crosses (and roughly how badly), not the exact number of self-crossing
 * lobes between them.
 */
export function polylineCrossing(
  a: Vec2[],
  b: Vec2[],
): { point: Vec2; angleDeg: number } | null {
  for (let i = 0; i < a.length - 1; i++) {
    const a0 = a[i];
    const a1 = a[i + 1];
    for (let j = 0; j < b.length - 1; j++) {
      const b0 = b[j];
      const b1 = b[j + 1];
      const hit = segmentSegmentIntersection(a0, a1, b0, b1);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Tightest segment-AABB test we need: returns the maximum penetration
 * depth (centre-of-segment distance from the closest box edge) when
 * the segment dips into the box, or 0 when it stays clear.
 *
 * Works in two phases:
 *   1. Endpoint check — if either endpoint is inside the box, that
 *      depth dominates (and is exact).
 *   2. Edge-crossing check — if neither endpoint is inside but the
 *      segment crosses any of the four box edges, report a small
 *      depth (we don't compute the exact penetration along the
 *      segment because the scorer only needs "yes/no" + magnitude
 *      hint, and the chord length from the crossing isn't well-
 *      defined without finding the second crossing too).
 */
export function segmentBoxPenetration(
  a: Vec2,
  b: Vec2,
  box: { x: number; y: number; w: number; h: number },
): number {
  const inside = (p: Vec2): boolean =>
    p.x >= box.x &&
    p.x <= box.x + box.w &&
    p.y >= box.y &&
    p.y <= box.y + box.h;
  let depth = 0;
  if (inside(a)) {
    depth = Math.max(
      depth,
      Math.min(
        a.x - box.x,
        box.x + box.w - a.x,
        a.y - box.y,
        box.y + box.h - a.y,
      ),
    );
  }
  if (inside(b)) {
    depth = Math.max(
      depth,
      Math.min(
        b.x - box.x,
        box.x + box.w - b.x,
        b.y - box.y,
        box.y + box.h - b.y,
      ),
    );
  }
  if (depth > 0) return depth;
  const tl: Vec2 = { x: box.x, y: box.y };
  const tr: Vec2 = { x: box.x + box.w, y: box.y };
  const bl: Vec2 = { x: box.x, y: box.y + box.h };
  const br: Vec2 = { x: box.x + box.w, y: box.y + box.h };
  if (
    segmentSegmentIntersection(a, b, tl, tr) ||
    segmentSegmentIntersection(a, b, tr, br) ||
    segmentSegmentIntersection(a, b, br, bl) ||
    segmentSegmentIntersection(a, b, bl, tl)
  ) {
    // Edge-crosses without endpoint inside — return a token positive
    // depth so the scorer counts the intrusion. The true depth is at
    // least the min half-extent of the box; report that as the floor
    // so worstOffenders ranks "bad clip" higher than "near miss".
    return Math.min(box.w, box.h) / 2;
  }
  return 0;
}
