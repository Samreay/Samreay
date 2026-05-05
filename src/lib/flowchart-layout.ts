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
  pickSide,
  rectCentre,
  type EdgeSpec,
  type Vec2,
} from './flowchart-edge-geometry';
import type { LayoutScore } from './flowchart-score';
import {
  RelaxSimulator,
  layoutCost,
  LAYOUT_DESIRED_EDGE_LENGTH,
  LAYOUT_MINIMUM_DESIRED_EDGE_LENGTH,
} from './flowchart-relax';
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

/** Number of different sfdp seeds to try on a cold layout. The best-scoring
 *  result (lowest layoutCost after relax) is kept and saved to disk. */
const LAYOUT_CANDIDATES = 1;

function buildDotString(
  data: FlowchartData,
  sizes: Map<string, { w: number; h: number }>,
  seed: number,
): string {
  const lines: string[] = [];
  lines.push('digraph G {');
  lines.push(`  graph [seed=${seed} overlap=scale splines=spline mode="major" sep="+4"];`);
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
  seed: number,
): Promise<Map<string, { x: number; y: number }>> {
  const gv = await getGraphviz();
  const dotSrc = buildDotString(data, sizes, seed);
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
}): { finalScore: LayoutScore; bestCost: number } {
  const sim = new RelaxSimulator(opts);
  while (!sim.converged) sim.step();
  sim.revertToBest();
  return { finalScore: sim.finalScore!, bestCost: sim.currentBestCost };
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
      // ── BRANCHES 3+4: multi-candidate Graphviz + relax ───────────────
      // Run sfdp with LAYOUT_CANDIDATES different seeds, relax each, and
      // keep the lowest-cost result.
      let bestCandidateCost = Infinity;
      let bestCandidatePositions: Map<string, { x: number; y: number }> | null = null;

      for (let candidateSeed = 0; candidateSeed < LAYOUT_CANDIDATES; candidateSeed++) {
        const rawPositions = await computeGraphvizLayout(data, sizes, candidateSeed);
        normaliseOrigin(rawPositions);

        for (const d of data.decisions) {
          if (d.pinned) rawPositions.set(d.id, { x: d.pinned.x, y: d.pinned.y });
        }
        for (const b of data.books) {
          if (b.pinned) rawPositions.set(b.id, { x: b.pinned.x, y: b.pinned.y });
        }

        if (seedPositions) {
          for (const [id, p] of seedPositions) {
            rawPositions.set(id, { x: p.x, y: p.y });
          }
        }

        const candidatePositions = new Map(rawPositions);

        const { finalScore } = relax({
          positions: candidatePositions,
          sizes,
          edges: edgeSpecs,
          pinnedIds: effectivePinnedIds,
          desiredEdgeLength: LAYOUT_DESIRED_EDGE_LENGTH,
          minDesiredEdgeLength: LAYOUT_MINIMUM_DESIRED_EDGE_LENGTH,
        });
        const cost = layoutCost(finalScore);
        console.log(`flowchart-layout: candidate seed=${candidateSeed} cost=${cost.toFixed(0)}`);

        if (cost < bestCandidateCost) {
          bestCandidateCost = cost;
          bestCandidatePositions = candidatePositions;
        }
      }

      for (const [id, p] of bestCandidatePositions!) {
        positions.set(id, p);
      }
      console.log(`flowchart-layout: best candidate cost=${bestCandidateCost.toFixed(0)}`);
    }

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
