# Implementation Plan: Replace ELK.js with Graphviz `dot` via `@hpcc-js/wasm-graphviz`

## Codebase Orientation

Single file to rewrite: `src/lib/flowchart-layout.ts` (~1720 lines). Public API unchanged:

```ts
export async function getLayoutedElements(
  data: FlowchartData,
  options?: { refine?: boolean; seed?: number },
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }>
```

Graph: ~60 decision nodes (320×90 pills or 640×180 large) + ~190 book nodes (520×400), ~230 edges. One authored `pinned` node: `d_start` at `{x:0, y:0}`. All node IDs use `[a-z0-9_]` — safe DOT identifiers (always quote defensively).

---

## Step 1 — Install

```bash
npm install @hpcc-js/wasm-graphviz
```

The package embeds the Graphviz WASM binary inline as zstd-compressed base64 inside `dist/index.js` — no separate `.wasm` file, no Vite `assetsInclude` or `wasm-plugin` config needed.

Remove `elkjs` from `package.json` after migration is validated.

---

## Step 2 — WASM Initialisation (module-level lazy singleton)

Replace the ELK singleton (`const elk = new ELK()`) with:

```ts
import { Graphviz } from '@hpcc-js/wasm-graphviz';

let _graphvizPromise: Promise<Graphviz> | null = null;
function getGraphviz(): Promise<Graphviz> {
  if (!_graphvizPromise) _graphvizPromise = Graphviz.load();
  return _graphvizPromise;
}
```

`Graphviz.load()` caches internally too — calling it multiple times is safe. The singleton is loaded once per Node.js process. Amortised cost across the build is negligible.

---

## Step 3 — DOT Serialisation

### Coordinate System Conventions

Graphviz works in points (1 pt = 1/72 inch). Node `width`/`height` are in **inches**:

```
width_inches = width_px / 72    // e.g. 520px → 7.2222 in
height_inches = height_px / 72  // e.g. 400px → 5.5556 in
```

Output `plain` format reports positions in **inches**, with **bottom-left origin**, y-axis increasing upward (opposite of screen/xyflow coords). See Step 5 for the y-flip.

### Pinned Node Strategy (Approach A — no `pos` in DOT)

`dot` with `rankdir=TB` doesn't support pinning interior nodes via `pos`. Instead: use `rank=source` subgraph to ensure `d_start` is at the top layer, then normalise the output so `d_start`'s top-left lands at `{x:0, y:0}`. Post-process authored `pinned` coordinates by stamping them on top of the extracted positions. No chicken-and-egg coordinate calculation needed.

### Spacing Constants (add near `RELAX_OPTS`)

```ts
/** Horizontal spacing between nodes in the same DOT rank, in inches.
 *  ~1.11 in converts from ELK's elk.spacing.nodeNode: 80px. */
const DOT_NODESEP_IN = 1.2;

/** Vertical spacing between DOT ranks, in inches.
 *  ~1.67 in converts from ELK's nodeNodeBetweenLayers: 120px. */
const DOT_RANKSEP_IN = 2.0;
```

### `buildDotString` Implementation

```ts
function buildDotString(
  data: FlowchartData,
  sizes: Map<string, { w: number; h: number }>,
): string {
  const lines: string[] = [];
  lines.push('digraph G {');
  lines.push(
    `  graph [rankdir=TB nodesep=${DOT_NODESEP_IN} ranksep=${DOT_RANKSEP_IN} splines=spline];`,
  );

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

  // Force d_start to the top rank
  lines.push(`  subgraph { rank=source; "${ROOT_ID}"; }`);

  for (const e of data.edges) {
    lines.push(`  "${e.source}" -> "${e.target}";`);
  }

  lines.push('}');
  return lines.join('\n');
}
```

**`fixedsize=true` is essential** — without it Graphviz resizes nodes to fit labels (we add none). Always quote all IDs (defensive against future special characters).

---

## Step 4 — Running the Layout

```ts
async function computeGraphvizLayout(
  data: FlowchartData,
  sizes: Map<string, { w: number; h: number }>,
): Promise<Map<string, { x: number; y: number }>> {
  const gv = await getGraphviz();
  const dotSrc = buildDotString(data, sizes);
  const plain = gv.dot(dotSrc, 'plain');
  return parsePlainOutput(plain, sizes);
}
```

**Use `plain` format** (not `json`) because:
1. Coordinate parsing is a single `parseFloat` per token — no JSON traversal
2. The `graph` line gives bounding box dimensions needed for the y-flip
3. No ambiguity between `-Tjson` vs `-Tjson0`
4. Node names in `plain` are the exact DOT strings — trivial map lookup

---

## Step 5 — Coordinate Extraction (`parsePlainOutput`)

`plain` format:
```
graph <scale> <width_in> <height_in>
node <name> <cx_in> <cy_in> <width_in> <height_in> ...
edge ...
stop
```

Conversion formula (inches → pixel top-left, flipping y-axis):
```
cx_px        = cx_in * 72
cy_flipped   = (totalHeight_in - cy_in) * 72    // flip: bottom-left → top-left
x_topleft    = cx_px - w_px / 2
y_topleft    = cy_flipped - h_px / 2
```

Using 72 as the DPI multiplier is correct and consistent with `buildDotString` (`w_px / 72 → w_in → cx_in * 72 = cx_px`).

```ts
function parsePlainOutput(
  plain: string,
  sizes: Map<string, { w: number; h: number }>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  let totalHeightIn = 0;

  for (const line of plain.split('\n')) {
    if (line.startsWith('graph ')) {
      const parts = line.split(' ');
      // format: graph <scale> <width> <height>
      totalHeightIn = parseFloat(parts[3]);
      break;
    }
  }

  for (const line of plain.split('\n')) {
    if (!line.startsWith('node ')) continue;
    const parts = line.split(' ');
    // format: node <name> <x> <y> <width> <height> <label> ...
    const rawName = parts[1];
    const id = rawName.startsWith('"') ? rawName.slice(1, -1) : rawName;
    const cxIn = parseFloat(parts[2]);
    const cyIn = parseFloat(parts[3]);
    const sz = sizes.get(id);
    if (!sz) continue;
    const cxPx = cxIn * 72;
    const cyFlippedPx = (totalHeightIn - cyIn) * 72;
    positions.set(id, {
      x: cxPx - sz.w / 2,
      y: cyFlippedPx - sz.h / 2,
    });
  }

  return positions;
}
```

---

## Step 6 — Origin Normalisation

```ts
function normaliseOrigin(
  positions: Map<string, { x: number; y: number }>,
): void {
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
```

Call immediately after `parsePlainOutput`.

---

## Step 7 — Pinned Node Post-Processing

After `normaliseOrigin`, re-stamp authored `pinned` coordinates on top of Graphviz output:

```ts
for (const d of data.decisions) {
  if (d.pinned) positions.set(d.id, { x: d.pinned.x, y: d.pinned.y });
}
for (const b of data.books) {
  if (b.pinned) positions.set(b.id, { x: b.pinned.x, y: b.pinned.y });
}
```

Currently only `d_start` is pinned at `{x:0, y:0}`, which `normaliseOrigin` already achieves — this is a no-op for current data but correctly handles future pinned nodes.

---

## Step 8 — Restructured BRANCHES 3+4 block

```ts
// BRANCHES 3+4: Graphviz dot layout
const rawPositions = await computeGraphvizLayout(data, sizes);
normaliseOrigin(rawPositions);

// Re-stamp authored pins
for (const d of data.decisions) {
  if (d.pinned) rawPositions.set(d.id, { x: d.pinned.x, y: d.pinned.y });
}
for (const b of data.books) {
  if (b.pinned) rawPositions.set(b.id, { x: b.pinned.x, y: b.pinned.y });
}

for (const [id, p] of rawPositions) {
  positions.set(id, p);
}

// Partial path: re-stamp known cached positions on top
if (seedPositions) {
  for (const [id, p] of seedPositions) {
    positions.set(id, { x: p.x, y: p.y });
  }
}

// Reset path jitter (before relax)
if (rng) {
  for (const [id, p] of positions) {
    if (effectivePinnedIds.has(id)) continue;
    const [gx, gy] = gaussianPair(rng);
    p.x += gx * RESET_JITTER_SIGMA_PX;
    p.y += gy * RESET_JITTER_SIGMA_PX;
  }
}
```

---

## Step 9 — Reset Path

Graphviz `dot` is deterministic — same DOT input always produces the same output (no seed mechanism). New strategy: run Graphviz for the base layout, then apply Gaussian jitter before `relax()`. The `relax()` best-snapshot revert protects against bad jitter outcomes.

`uniformDiskSample` and `RESET_SCATTER_RADIUS_PX` can be removed (no longer needed). `mulberry32`, `gaussianPair`, `RESET_JITTER_SIGMA_PX` are kept.

Diagnostic log update:
```ts
console.log(
  `flowchart-layout: cache missing; running graphviz layout` +
  (rng ? ` with randomised seed ${seed} (jitter σ=${RESET_JITTER_SIGMA_PX}px)` : '')
);
```

---

## Step 10 — Dead code to remove

| Item | Why |
|------|-----|
| `import ELK from 'elkjs/lib/elk.bundled.js'` | replaced |
| `import type { ElkExtendedEdge, ElkNode }` | unused |
| `const elk = new ELK()` | removed |
| `elkSeedFor()` | no Graphviz equivalent |
| `elkChildren: ElkNode[]` construction | replaced by buildDotString |
| `elkEdges: ElkExtendedEdge[]` construction | replaced |
| `await elk.layout(...)` calls (both passes) | replaced by gv.dot() |
| `originDx/originDy` block | replaced by normaliseOrigin() |
| `uniformDiskSample` | no longer used on reset path |
| `RESET_SCATTER_RADIUS_PX` constant | no longer used |

**Keep**: `relax()`, `scoreLayout`, `validateFlowchart`, `mulberry32`, `gaussianPair`, `RESET_JITTER_SIGMA_PX`, `RELAX_OPTS`, all cache logic, `placeDecision`, `placeBook`, edge construction.

---

## Step 11 — `refine` mode

Branch 2 (`coverage.kind === 'full' && refine`) loads cached positions and runs `relax()` — Graphviz is never called. **No changes needed.**

---

## Step 12 — Astro/Vite Compatibility

**No Vite config changes required.** The WASM binary is inline base64 inside the npm package — no `.wasm` asset handling needed. The package is pure ESM; Astro's default SSR externalisation handles it correctly.

If a build error like `"cannot use import statement in a module"` appears, add to `astro.config.mjs`:

```js
vite: {
  ssr: {
    noExternal: ['@hpcc-js/wasm-graphviz'],
  },
},
```

This forces Vite to bundle the package into the SSR chunk. Only add if an error occurs.

---

## Step 13 — Tuning

After first run: if book cards overlap horizontally, increase `DOT_NODESEP_IN`. If adjacent-rank cards overlap vertically, increase `DOT_RANKSEP_IN`. The `relax()` pass handles fine-grained clearing; DOT spacing knobs control the macro structure.

---

## Step 14 — Verification Checklist

- [ ] `npm run build` completes without errors
- [ ] Positions JSON written with ~250 entries
- [ ] `d_start` at `{x:0, y:0}` in JSON
- [ ] All four branches work (full hit / full+refine / missing / partial)
- [ ] Reset path produces different layouts per seed
- [ ] No ELK import remains
- [ ] `elkjs` removed from `package.json`

---

## Pros/Cons vs d3-dag

| Criterion | Graphviz `dot` | d3-dag |
|---|---|---|
| Bundle size | ~800 KB (WASM inline, never client-bundled) | ~135 KB |
| Algorithm quality | Industry reference; mincross with iterative improvement; 30+ years of production use | Very good; decrossOpt is optimal but slow for 250 nodes; decrossTwoLayer is heuristic |
| Heterogeneous node sizes | `width`/`height`/`fixedsize` per node | `nodeSize` accessor |
| API style | Async (WASM init) + string serialisation + plain text parsing | Sync, pure JS API |
| Pinned interior nodes | `pos="x,y!"` with neato/fdp; not supported by `dot` for interior | Post-process stamp only |
| Maintenance | Graphviz (FOSS since 1991) + `@hpcc-js/wasm-graphviz` v2.33.x (active) | d3-dag 1.x (active but described as "light maintenance" by maintainer) |
| Vite/SSR config | Zero (inline WASM) | Zero |

**Verdict**: Graphviz `dot` is the stronger choice for layout quality on this graph size. The async API fits the existing `async getLayoutedElements` signature. The main overhead vs d3-dag is writing the DOT serialiser and the `plain` output parser — both are ~30 lines of straightforward code.

---

## Complete Change Summary

### `src/lib/flowchart-layout.ts`

1. Replace ELK imports with `import { Graphviz } from '@hpcc-js/wasm-graphviz'`
2. Replace `const elk = new ELK()` with lazy singleton `getGraphviz()`
3. Add constants `DOT_NODESEP_IN`, `DOT_RANKSEP_IN`
4. Add functions: `buildDotString`, `parsePlainOutput`, `computeGraphvizLayout`, `normaliseOrigin`
5. Remove `elkSeedFor`, `elkChildren`, `elkEdges`, both `elk.layout()` calls, `uniformDiskSample`, `RESET_SCATTER_RADIUS_PX`
6. Replace ELK layout block with `computeGraphvizLayout` → `normaliseOrigin` → pin re-stamp → partial-cache stamp → reset jitter
7. Update module-level JSDoc

### `package.json`

- Add `"@hpcc-js/wasm-graphviz": "^2.33.0"` to `dependencies`
- Remove `"elkjs"` after validation

### `astro.config.mjs`

- No changes required (add `ssr.noExternal` only if build error occurs)

### No other files change

`flowchart-positions.ts`, `flowchart-edge-geometry.ts`, `flowchart-score.ts`, `flowchart-positions-dev.mjs`, `flowchart.ts` — all unchanged.
