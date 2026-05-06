# Implementation Plan: Replace ELK.js with d3-dag in `flowchart-layout.ts`

## Verified API Facts (d3-dag v1.2.x)

- **Graph construction**: Use `graphConnect()` — FlowchartData has a separate `edges[]` array, not `parentIds` on each node.
- **NodeSize**: `nodeSize` accepts `(node: GraphNode<NodeDatum, LinkDatum>) => readonly [number, number]`. User data is at `node.data`.
- **Coordinate convention**: After `layout(dag)`, `node.x` and `node.y` are **centre** coordinates. To get xyflow top-left: `x_tl = node.x - width/2`, `y_tl = node.y - height/2`.
- **`gap()`**: Sets extra spacing between nodes beyond their nodeSize footprint. Default `[1, 1]`. Use `[80, 120]` to match current ELK spacing.
- **Layout call**: `layout(dag)` mutates dag nodes in place; returns `{ width, height }` of total bounding box.
- **Direction**: Sugiyama is inherently top-down (earlier layers have lower y values).
- **Performance**: `decrossTwoLayer` ~49ms for medium graphs; `decrossOpt` is NP-hard and unsuitable for 250 nodes.
- **Cycles**: `graphConnect` throws if the input contains a cycle — `validateFlowchart()` already guards this.

---

## Step 1 — Install

```bash
npm install d3-dag
```

Remove `elkjs` from `package.json` after migration is confirmed.

---

## Step 2 — Remove ELK imports and singleton

Delete:
```ts
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
// ...
const elk = new ELK();
```

Add:
```ts
import {
  graphConnect,
  sugiyama,
  layeringSimplex,
  decrossTwoLayer,
  coordQuad,
  type GraphNode,
} from 'd3-dag';
```

---

## Step 3 — Replace the ELK layout block (BRANCHES 3+4)

The entire block from `elkChildren` construction through `layout.children` iteration is replaced. The replacement is **synchronous** (d3-dag's `layout()` is sync, unlike ELK's async `elk.layout()`).

```ts
// ── BRANCHES 3+4: d3-dag Sugiyama layout ─────────────────────────
const connect = graphConnect<string>()
  .sourceId((e: { source: string; target: string }) => e.source)
  .targetId((e: { source: string; target: string }) => e.target);

// .single(true) allows isolated nodes (safety valve — data is fully connected)
const dagGraph = connect.single(true)(data.edges);

// nodeSize callback: node.data is the string ID (set by graphConnect)
const nodeSizeFn = (node: GraphNode<string, unknown>): readonly [number, number] => {
  const sz = sizes.get(node.data);
  if (!sz) return [NODE_SIZES.decision.width, NODE_SIZES.decision.height];
  return [sz.w, sz.h];
};

// Sugiyama:
//   layeringSimplex  = NETWORK_SIMPLEX layer assignment (same as ELK default)
//   decrossTwoLayer  = heuristic crossing minimisation; ~49ms for this graph
//   coordQuad        = balanced quadratic-program x-placement
//   gap([80, 120])   = matches ELK's nodeNode:80 + nodeNodeBetweenLayers:120
const layout = sugiyama()
  .nodeSize(nodeSizeFn)
  .gap([80, 120])
  .layering(layeringSimplex())
  .decross(decrossTwoLayer())
  .coord(coordQuad());

// Synchronous — no await needed
layout(dagGraph);

// Extract positions: node.x/y are centres; convert to top-left.
// Translate so ROOT_ID lands at (0, 0).
let rootCx = 0;
let rootCy = 0;
for (const node of dagGraph.nodes()) {
  if (node.data === ROOT_ID) {
    const sz = sizes.get(ROOT_ID)!;
    rootCx = node.x - sz.w / 2;
    rootCy = node.y - sz.h / 2;
    break;
  }
}
for (const node of dagGraph.nodes()) {
  const sz = sizes.get(node.data)!;
  positions.set(node.data, {
    x: node.x - sz.w / 2 - rootCx,
    y: node.y - sz.h / 2 - rootCy,
  });
}

// Partial path: re-stamp cached positions on top (same as old ELK logic)
if (seedPositions) {
  for (const [id, p] of seedPositions) {
    positions.set(id, { x: p.x, y: p.y });
  }
}
```

---

## Step 4 — Partial-cache path

d3-dag has no `elk.position` seed mechanism. The two-step "seed → layout → re-stamp" collapses to "layout → re-stamp":

1. Run `layout(dagGraph)` on all nodes
2. Re-stamp cached positions on top (existing logic, unchanged)
3. `relax()` honours `effectivePinnedIds` so cached-node positions don't move

**Update diagnostic log** from `seeding ELK with known positions` to `running d3-dag for new nodes, re-stamping ${coverage.known.size} cached positions post-layout`.

---

## Step 5 — Reset path (`seed` option)

Current ELK scatter (`elkSeedFor` + `elk.position`) is removed. New strategy: run d3-dag to get a good macro shape, then scatter positions post-layout:

```ts
// After d3-dag layout and position extraction:
if (rng) {
  for (const id of allCurrentIds) {
    if (effectivePinnedIds.has(id)) continue;
    const p = positions.get(id);
    if (!p) continue;
    const scatter = uniformDiskSample(rng, RESET_SCATTER_RADIUS_PX);
    p.x += scatter.x;
    p.y += scatter.y;
  }
}
```

The existing pre-relax Gaussian jitter block remains **unchanged** — still applied after scatter.

Delete `elkSeedFor` function. Keep `uniformDiskSample`, `mulberry32`, `gaussianPair`, `RESET_SCATTER_RADIUS_PX`, `RESET_JITTER_SIGMA_PX`.

---

## Step 6 — Dead code to remove

| Item | Why dead |
|------|----------|
| `import ELK from 'elkjs/lib/elk.bundled.js'` | replaced |
| `import type { ElkExtendedEdge, ElkNode }` | unused |
| `const elk = new ELK()` | removed |
| `elkSeedFor()` helper function | d3-dag has no seed mechanism |
| `elkChildren: ElkNode[]` construction | replaced by graphConnect |
| `elkEdges: ElkExtendedEdge[]` construction | replaced by graphConnect |
| `await elk.layout({...})` call (both passes) | replaced by sync layout() |
| `originDx/originDy` block via `layout.children` | replaced by rootCx/rootCy extraction |

**Keep everything else**: `relax()`, `scoreLayout`, `validateFlowchart`, `placeDecision`, `placeBook`, `mulberry32`, `gaussianPair`, `uniformDiskSample`, `RELAX_OPTS`, cache logic.

---

## Step 7 — `refine` mode

Branch 2 (`coverage.kind === 'full' && refine`) loads cached positions and runs `relax()` — d3-dag is never called. **No changes needed.**

---

## Step 8 — Spacing calibration

Initial values match current ELK knobs:
- `gap([80, 120])` ← `elk.spacing.nodeNode: 80` + `elk.layered.spacing.nodeNodeBetweenLayers: 120`

If layout looks compressed or spread, adjust the single `gap([xGap, yGap])` call.

---

## Step 9 — TypeScript notes

- `layout(dag)` is synchronous — the outer `getLayoutedElements` stays `async` for `resolveCover`/`getEntry` calls, but the layout step no longer blocks on a Promise.
- `connect.single(true)` prevents "isolated node" errors from future data authoring mistakes.
- `graphConnect` throws `"cycle detected: a -> b -> a"` on cycles — more informative than ELK's behaviour.

---

## Step 10 — Module-level JSDoc update

Update the file's top comment to describe d3-dag Sugiyama instead of ELK stress. Key points to mention:
- `layeringSimplex` (network simplex layer assignment)
- `decrossTwoLayer` (heuristic crossing minimisation, ~49ms for ~250 nodes)
- `coordQuad` (balanced quadratic-program x-placement)
- Returns centre coordinates, converted to top-left

---

## Step 11 — Verification checklist

- [ ] `npm run build` completes without TypeScript errors
- [ ] Positions JSON written with ~250 entries
- [ ] `d_start` at or near `{x:0, y:0}` in JSON
- [ ] All four branches work (full hit / full+refine / missing / partial)
- [ ] Reset path (`seed` option) produces different layouts per seed
- [ ] No ELK import remains
- [ ] `elkjs` removed from `package.json`

---

## Changed lines summary

| Section | Action |
|---------|--------|
| Lines 1–34 (module JSDoc) | Update description |
| Lines 35–36 (ELK imports) | Replace with d3-dag imports |
| Line 1103 (`const elk`) | Delete |
| Lines 1343–1359 (`elkSeedFor`) | Delete |
| Lines 1361–1482 (ELK layout block) | Replace with d3-dag block from Step 3 |
| Lines 1485–1512 (pre-relax jitter) | Update comment only; logic unchanged |
| Diagnostic log strings | Update ELK references |

## Critical files

- `src/lib/flowchart-layout.ts`
- `package.json`
- `src/data/flowchart-positions.json` (deleted to force fresh layout)
