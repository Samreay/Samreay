/**
 * Client-importable physics relaxation for the flowchart layout.
 *
 * Everything here is pure JS/TS: no `astro:content`, no Graphviz WASM,
 * no filesystem I/O. The module can be bundled into the client island
 * so the dev-mode "Simulate" toolbar can run the same physics solver
 * in-browser that the build-time `relax()` function runs on the server.
 *
 * `RelaxSimulator` is a stateful object that exposes `step()`: call it
 * once per animation frame to advance the simulation by one iteration
 * and read the updated positions back out of the shared `positions` map.
 */
import {
  buildEdgeGeometry,
  closestPointOnSegment,
  polylineCrossing,
  type EdgeSpec,
  type Vec2,
} from './flowchart-edge-geometry';
import { scoreLayout, type LayoutScore } from './flowchart-score';

export type { EdgeSpec, Vec2, LayoutScore };

export const RELAX_OPTS = {
  K_LEN_COMPRESS: 0.0005,
  K_LEN_STRETCH: 0.01,
  K_NODE_NODE: 0.3,
  K_EDGE_NODE: 0.5,
  K_EDGE_EDGE: 0.02,
  K_LABEL_NODE: 0.4,
  K_LABEL_LABEL: 0.25,
  DAMPING: 0.75,
  DT: 1.0,
  V_MAX: 10,
  F_MAX: 20,
  PADDING: 80,
  MAX_ITERS: 1500,
  CONVERGENCE_KE: 20.0,
  CONVERGENCE_HOLD_ITERS: 25,
  /** Fraction of a node's raw force passed to each direct child; compounds along paths. */
  FORCE_TRANSFER_SCALE: 0.9,
} as const;

export const LAYOUT_DESIRED_EDGE_LENGTH = 1000;
export const LAYOUT_MINIMUM_DESIRED_EDGE_LENGTH = 450;

const SCORE_EVERY = 25;

export function layoutCost(s: LayoutScore): number {
  return (
    s.nodeNodeOverlaps * 100 +
    s.edgeNodeIntrusions * 50 +
    s.labelNodeOverlaps * 30 +
    s.labelLabelOverlaps * 20 +
    s.edgeEdgeCrossings * 50 +
    s.totalStretchPx * 0.05 +
    s.totalCompressionPx * 0.05
  );
}

export interface StepResult {
  iter: number;
  totalKE: number;
  converged: boolean;
  /** Set when a better snapshot was captured this step. */
  newBestCost?: number;
}

/**
 * Stateful, step-by-step physics simulator. Holds velocity and snapshot
 * state between frames so the caller can drive it from rAF.
 *
 * Mutates `positions` in place after each `step()` call.
 */
export class RelaxSimulator {
  readonly positions: Map<string, Vec2>;
  readonly sizes: Map<string, { w: number; h: number }>;
  readonly edges: EdgeSpec[];
  readonly pinnedIds: ReadonlySet<string>;
  readonly desiredEdgeLength: number;
  readonly minDesiredEdgeLength: number;

  private ids: string[];
  private idIndex: Map<string, number>;
  private vx: Float64Array;
  private vy: Float64Array;
  private fx: Float64Array;
  private fy: Float64Array;
  private isPinned: Uint8Array;

  /**
   * Row-major force-transfer matrix (n×n). transferMatrix[j*n + i] is the
   * fraction of node i's raw force that node j experiences, accounting for
   * all DAG paths from i to j with per-hop scaling FORCE_TRANSFER_SCALE.
   * The diagonal is 1 (each node fully feels its own force).
   */
  private transferMatrix: Float64Array;
  /** Scratch arrays for the matrix-vector multiply each step. */
  private txScratch: Float64Array;
  private tyScratch: Float64Array;

  private bestCost: number = Infinity;
  private bestIter: number = -1;
  private bestX: Float64Array;
  private bestY: Float64Array;

  private quietStreak: number = 0;
  iter: number = 0;
  converged: boolean = false;
  finalScore: LayoutScore | undefined = undefined;

  constructor(opts: {
    positions: Map<string, Vec2>;
    sizes: Map<string, { w: number; h: number }>;
    edges: EdgeSpec[];
    pinnedIds: ReadonlySet<string>;
    desiredEdgeLength?: number;
    minDesiredEdgeLength?: number;
  }) {
    this.positions = opts.positions;
    this.sizes = opts.sizes;
    this.edges = opts.edges;
    this.pinnedIds = opts.pinnedIds;
    this.desiredEdgeLength = opts.desiredEdgeLength ?? LAYOUT_DESIRED_EDGE_LENGTH;
    this.minDesiredEdgeLength = opts.minDesiredEdgeLength ?? LAYOUT_MINIMUM_DESIRED_EDGE_LENGTH;

    this.ids = [...opts.positions.keys()];
    this.idIndex = new Map();
    for (let i = 0; i < this.ids.length; i++) this.idIndex.set(this.ids[i], i);

    const n = this.ids.length;
    this.vx = new Float64Array(n);
    this.vy = new Float64Array(n);
    this.fx = new Float64Array(n);
    this.fy = new Float64Array(n);
    this.isPinned = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (opts.pinnedIds.has(this.ids[i])) this.isPinned[i] = 1;
    }

    this.bestX = new Float64Array(n);
    this.bestY = new Float64Array(n);

    this.transferMatrix = this._buildTransferMatrix();
    this.txScratch = new Float64Array(n);
    this.tyScratch = new Float64Array(n);

    // Baseline cost so revert never worsens the input.
    this._snapshotIfBetter(0);
  }

  /**
   * Build the n×n force-transfer matrix using a topological propagation over
   * the DAG. M[j*n + i] = total fractional weight with which node i's raw
   * force is felt by node j. The diagonal is 1 (identity contribution); each
   * edge i→j adds FORCE_TRANSFER_SCALE * M[i*n + k] to M[j*n + k] for every
   * ancestor k of i (including i itself).
   *
   * Nodes that are not reachable from i contribute 0. The propagation is done
   * in topological order so every parent's row is complete before a child is
   * processed.
   */
  private _buildTransferMatrix(): Float64Array {
    const { FORCE_TRANSFER_SCALE } = RELAX_OPTS;
    const n = this.ids.length;
    // M[j * n + i]: fraction of i's force felt by j
    const M = new Float64Array(n * n);
    // Diagonal: each node fully feels its own force.
    for (let i = 0; i < n; i++) M[i * n + i] = 1;

    // Build adjacency list: children[i] = list of child indices
    const children: number[][] = Array.from({ length: n }, () => []);
    const inDegree = new Int32Array(n);
    for (const e of this.edges) {
      const si = this.idIndex.get(e.source);
      const ti = this.idIndex.get(e.target);
      if (si === undefined || ti === undefined) continue;
      children[si].push(ti);
      inDegree[ti]++;
    }

    // Kahn's topological sort
    const queue: number[] = [];
    for (let i = 0; i < n; i++) if (inDegree[i] === 0) queue.push(i);
    let head = 0;
    while (head < queue.length) {
      const u = queue[head++];
      for (const v of children[u]) {
        // For every column k, propagate: M[v*n + k] += scale * M[u*n + k]
        const uRow = u * n;
        const vRow = v * n;
        for (let k = 0; k < n; k++) {
          M[vRow + k] += FORCE_TRANSFER_SCALE * M[uRow + k];
        }
        if (--inDegree[v] === 0) queue.push(v);
      }
    }

    return M;
  }

  /** Apply the transfer matrix: out[j] = sum_i M[j*n+i] * in[i]. */
  private _applyTransfer(inArr: Float64Array, outArr: Float64Array): void {
    const n = this.ids.length;
    const M = this.transferMatrix;
    for (let j = 0; j < n; j++) {
      const row = j * n;
      let acc = 0;
      for (let i = 0; i < n; i++) acc += M[row + i] * inArr[i];
      outArr[j] = acc;
    }
  }

  private _snapshotIfBetter(atIter: number): number | undefined {
    const geom = buildEdgeGeometry(this.positions, this.sizes, this.edges);
    const score = scoreLayout({
      positions: this.positions,
      sizes: this.sizes,
      geometry: geom,
      edges: this.edges,
      desiredEdgeLength: this.desiredEdgeLength,
      minDesiredEdgeLength: this.minDesiredEdgeLength,
    });
    const cost = layoutCost(score);
    if (cost < this.bestCost) {
      this.bestCost = cost;
      this.bestIter = atIter;
      for (let i = 0; i < this.ids.length; i++) {
        const p = this.positions.get(this.ids[i])!;
        this.bestX[i] = p.x;
        this.bestY[i] = p.y;
      }
      return cost;
    }
    return undefined;
  }

  private _addForce(id: string, dx: number, dy: number): void {
    const i = this.idIndex.get(id)!;
    if (this.isPinned[i]) return;
    this.fx[i] += dx;
    this.fy[i] += dy;
  }

  step(): StepResult {
    if (this.converged) {
      return { iter: this.iter, totalKE: 0, converged: true };
    }

    const {
      K_LEN_COMPRESS, K_LEN_STRETCH, K_NODE_NODE, K_EDGE_NODE, K_EDGE_EDGE,
      K_LABEL_NODE, K_LABEL_LABEL, DAMPING, DT, V_MAX, F_MAX, PADDING,
      CONVERGENCE_KE, CONVERGENCE_HOLD_ITERS,
    } = RELAX_OPTS;
    const { positions, sizes, edges, ids, idIndex, isPinned, fx, fy, vx, vy } = this;

    fx.fill(0);
    fy.fill(0);
    const geometry = buildEdgeGeometry(positions, sizes, edges);

    // Snapshot check at sample intervals.
    let newBestCost: number | undefined;
    if (this.iter % SCORE_EVERY === 0) {
      newBestCost = this._snapshotIfBetter(this.iter);
    }

    // --- 1. edge-length spring (asymmetric) ---
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
      const stretch = dist - this.desiredEdgeLength;
      const k = stretch > 0 ? K_LEN_STRETCH : K_LEN_COMPRESS;
      const mag = (k * stretch) / dist;
      this._addForce(e.source, dx * mag, dy * mag);
      this._addForce(e.target, -dx * mag, -dy * mag);
    }

    // --- 2. rectangular node-node repulsion ---
    // Contact zone (gap < PADDING): force = K_NODE_NODE * overlap depth.
    // Falloff zone (PADDING <= gap < FALLOFF_DIST): linear decay to zero.
    const FALLOFF_DIST = 400;
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
        const bcx = bp.x + bSz.w / 2;
        const bcy = bp.y + bSz.h / 2;
        let dx = bcx - acx;
        let dy = bcy - acy;
        let dlen = Math.hypot(dx, dy);
        if (dlen < 1e-6) { dx = 1; dy = 0; dlen = 1; }
        dx /= dlen; dy /= dlen;

        const padOvX = Math.min(ax2, bx2) - Math.max(ap.x, bp.x) + PADDING;
        const padOvY = Math.min(ay2, by2) - Math.max(ap.y, bp.y) + PADDING;

        let force: number;
        if (padOvX > 0 && padOvY > 0) {
          // Contact zone: proportional to overlap depth.
          force = K_NODE_NODE * Math.min(padOvX, padOvY);
        } else {
          // Falloff zone: measure edge-to-edge gap along centre-to-centre axis,
          // then linearly decay the contact-zone peak force to zero at FALLOFF_DIST.
          const gapX = padOvX <= 0 ? -padOvX : 0;
          const gapY = padOvY <= 0 ? -padOvY : 0;
          const gap = Math.hypot(gapX, gapY);
          if (gap >= FALLOFF_DIST) continue;
          const t = 1 - gap / FALLOFF_DIST;
          force = K_NODE_NODE * PADDING * t * t;
        }

        this._addForce(ids[j], dx * force, dy * force);
        this._addForce(ids[i], -dx * force, -dy * force);
      }
    }

    // --- 3. edge-node repulsion ---
    for (const g of geometry) {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (id === g.source || id === g.target) continue;
        if (isPinned[i]) continue;
        const np = positions.get(id)!;
        const nSz = sizes.get(id)!;
        if (g.bbox.maxX < np.x - PADDING || g.bbox.minX > np.x + nSz.w + PADDING) continue;
        if (g.bbox.maxY < np.y - PADDING || g.bbox.minY > np.y + nSz.h + PADDING) continue;
        const ncx = np.x + nSz.w / 2;
        const ncy = np.y + nSz.h / 2;
        const buffer = Math.sqrt((nSz.w * nSz.h) / 4) + PADDING;
        let minDist = Infinity;
        let closestPt: Vec2 = { x: 0, y: 0 };
        let closestSegA: Vec2 = { x: 0, y: 0 };
        let closestSegB: Vec2 = { x: 0, y: 0 };
        for (let s = 0; s < g.samples.length - 1; s++) {
          const cps = closestPointOnSegment({ x: ncx, y: ncy }, g.samples[s], g.samples[s + 1]);
          if (cps.distance < minDist) {
            minDist = cps.distance;
            closestPt = cps.point;
            closestSegA = g.samples[s];
            closestSegB = g.samples[s + 1];
          }
        }
        if (minDist >= buffer) continue;
        const segDx = closestSegB.x - closestSegA.x;
        const segDy = closestSegB.y - closestSegA.y;
        const segLen = Math.hypot(segDx, segDy);
        let nx: number;
        let ny: number;
        if (segLen > 1e-6) {
          nx = -segDy / segLen;
          ny = segDx / segLen;
          if (nx * (ncx - closestPt.x) + ny * (ncy - closestPt.y) < 0) { nx = -nx; ny = -ny; }
        } else {
          const dx = ncx - closestPt.x;
          const dy = ncy - closestPt.y;
          const dlen = Math.hypot(dx, dy);
          if (dlen > 1e-6) { nx = dx / dlen; ny = dy / dlen; } else { nx = 1; ny = 0; }
        }
        const intrusion = buffer - minDist;
        const force = K_EDGE_NODE * (intrusion + (intrusion * intrusion) / buffer);
        this._addForce(id, nx * force, ny * force);
        const ENDPOINT_SHARE = 0.4;
        this._addForce(g.source, -nx * force * ENDPOINT_SHARE, -ny * force * ENDPOINT_SHARE);
        this._addForce(g.target, -nx * force * ENDPOINT_SHARE, -ny * force * ENDPOINT_SHARE);
      }
    }

    // --- 4. edge-edge decrossing ---
    for (let i = 0; i < geometry.length; i++) {
      const ga = geometry[i];
      for (let j = i + 1; j < geometry.length; j++) {
        const gb = geometry[j];
        if (
          ga.source === gb.source || ga.source === gb.target ||
          ga.target === gb.source || ga.target === gb.target
        ) continue;
        if (ga.bbox.maxX < gb.bbox.minX || gb.bbox.maxX < ga.bbox.minX) continue;
        if (ga.bbox.maxY < gb.bbox.minY || gb.bbox.maxY < ga.bbox.minY) continue;
        const cross = polylineCrossing(ga.samples, gb.samples);
        if (!cross) continue;
        const sinTheta = Math.abs(Math.sin((cross.angleDeg * Math.PI) / 180));
        const weight = K_EDGE_EDGE * sinTheta;
        const a0 = ga.sourceHandle; const a1 = ga.targetHandle;
        const b0 = gb.sourceHandle; const b1 = gb.targetHandle;
        const aMidX = (a0.x + a1.x) / 2; const aMidY = (a0.y + a1.y) / 2;
        const bMidX = (b0.x + b1.x) / 2; const bMidY = (b0.y + b1.y) / 2;
        const adx = a1.x - a0.x; const ady = a1.y - a0.y;
        const alen = Math.hypot(adx, ady) || 1;
        let anx = -ady / alen; let any = adx / alen;
        if ((bMidX - aMidX) * anx + (bMidY - aMidY) * any > 0) { anx = -anx; any = -any; }
        const bdx = b1.x - b0.x; const bdy = b1.y - b0.y;
        const blen = Math.hypot(bdx, bdy) || 1;
        let bnx = -bdy / blen; let bny = bdx / blen;
        if ((aMidX - bMidX) * bnx + (aMidY - bMidY) * bny > 0) { bnx = -bnx; bny = -bny; }
        this._addForce(ga.source, anx * weight, any * weight);
        this._addForce(ga.target, anx * weight, any * weight);
        this._addForce(gb.source, bnx * weight, bny * weight);
        this._addForce(gb.target, bnx * weight, bny * weight);
      }
    }

    // --- 5. label-vs-node repulsion ---
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
        const padOvX = Math.min(lx2, np.x + nSz.w) - Math.max(g.label.x, np.x) + PADDING;
        if (padOvX <= 0) continue;
        const padOvY = Math.min(ly2, np.y + nSz.h) - Math.max(g.label.y, np.y) + PADDING;
        if (padOvY <= 0) continue;
        const overlap = Math.min(padOvX, padOvY);
        const ncx = np.x + nSz.w / 2;
        const ncy = np.y + nSz.h / 2;
        let dx = ncx - lcx; let dy = ncy - lcy;
        let dlen = Math.hypot(dx, dy);
        if (dlen < 1e-6) {
          if (padOvX < padOvY) { dx = 1; dy = 0; } else { dx = 0; dy = 1; }
          dlen = 1;
        }
        dx /= dlen; dy /= dlen;
        const force = K_LABEL_NODE * overlap;
        this._addForce(id, dx * force, dy * force);
        const ENDPOINT_SHARE = 0.5;
        this._addForce(g.source, -dx * force * ENDPOINT_SHARE, -dy * force * ENDPOINT_SHARE);
        this._addForce(g.target, -dx * force * ENDPOINT_SHARE, -dy * force * ENDPOINT_SHARE);
      }
    }

    // --- 6. label-vs-label repulsion ---
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
        const padOvX = Math.min(ax2, bx2) - Math.max(ga.label.x, gb.label.x) + PADDING;
        if (padOvX <= 0) continue;
        const padOvY = Math.min(ay2, by2) - Math.max(ga.label.y, gb.label.y) + PADDING;
        if (padOvY <= 0) continue;
        const overlap = Math.min(padOvX, padOvY);
        let dx = gb.label.centre.x - ga.label.centre.x;
        let dy = gb.label.centre.y - ga.label.centre.y;
        let dlen = Math.hypot(dx, dy);
        if (dlen < 1e-6) {
          if (padOvX < padOvY) { dx = 1; dy = 0; } else { dx = 0; dy = 1; }
          dlen = 1;
        }
        dx /= dlen; dy /= dlen;
        const force = K_LABEL_LABEL * overlap;
        this._addForce(ga.source, -dx * force, -dy * force);
        this._addForce(ga.target, -dx * force, -dy * force);
        this._addForce(gb.source, dx * force, dy * force);
        this._addForce(gb.target, dx * force, dy * force);
      }
    }

    // --- force transfer: propagate forces through DAG topology ---
    this._applyTransfer(fx, this.txScratch);
    this._applyTransfer(fy, this.tyScratch);

    // --- cap per-node force magnitude ---
    for (let i = 0; i < ids.length; i++) {
      const fmag = Math.hypot(this.txScratch[i], this.tyScratch[i]);
      if (fmag > F_MAX) {
        const s = F_MAX / fmag;
        this.txScratch[i] *= s;
        this.tyScratch[i] *= s;
      }
    }

    // --- integrate ---
    let totalKE = 0;
    for (let i = 0; i < ids.length; i++) {
      if (isPinned[i]) { vx[i] = 0; vy[i] = 0; continue; }
      let vxi = vx[i] * DAMPING + this.txScratch[i] * DT;
      let vyi = vy[i] * DAMPING + this.tyScratch[i] * DT;
      const speed = Math.hypot(vxi, vyi);
      if (speed > V_MAX) { const s = V_MAX / speed; vxi *= s; vyi *= s; }
      vx[i] = vxi; vy[i] = vyi;
      const p = positions.get(ids[i])!;
      p.x += vxi * DT;
      p.y += vyi * DT;
      totalKE += vxi * vxi + vyi * vyi;
    }

    if (totalKE < CONVERGENCE_KE) {
      this.quietStreak++;
      if (this.quietStreak >= CONVERGENCE_HOLD_ITERS) {
        this.converged = true;
        newBestCost = this._snapshotIfBetter(this.iter);
        this._revertToBest();
        this.finalScore = this._scoreCurrentLayout();
        this.iter++;
        return { iter: this.iter, totalKE, converged: true, newBestCost };
      }
    } else {
      this.quietStreak = 0;
    }

    this.iter++;
    return { iter: this.iter, totalKE, converged: false, newBestCost };
  }

  private _scoreCurrentLayout(): LayoutScore {
    const geom = buildEdgeGeometry(this.positions, this.sizes, this.edges);
    return scoreLayout({
      positions: this.positions,
      sizes: this.sizes,
      geometry: geom,
      edges: this.edges,
      desiredEdgeLength: this.desiredEdgeLength,
      minDesiredEdgeLength: this.minDesiredEdgeLength,
    });
  }

  /** Revert positions to the best-cost snapshot captured so far. */
  revertToBest(): void {
    this._revertToBest();
    this.finalScore = this._scoreCurrentLayout();
  }

  private _revertToBest(): void {
    if (this.bestIter < 0) return;
    for (let i = 0; i < this.ids.length; i++) {
      const p = this.positions.get(this.ids[i])!;
      p.x = this.bestX[i];
      p.y = this.bestY[i];
    }
  }

  get currentBestCost(): number {
    return this.bestCost;
  }
}
