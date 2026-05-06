# Graph Layout Library Investigation

## Context

We have already chosen `@xyflow/svelte` (Svelte Flow 1.x, Svelte 5) as the rendering layer for the book-recommendation flowchart (see `investigation-flowchart-dep.md`). xyflow expects each `nodes[i]` to carry an explicit `position: { x, y }`, so we need an **external auto-layout library** that consumes our nodes + edges (defined in TypeScript) and returns coordinates we can hand back to Svelte Flow. This document picks that library.

## Requirements (ranked)

1. **DAG-with-merges** — the graph is mostly tree-like but a single book may be the recommendation target of multiple decision branches; cycles are forbidden but reconvergence is allowed. We need a real layered/Sugiyama-style algorithm, not a strict tree algorithm.
2. **Variable node sizes** — must accept per-node `width`/`height` (book cards ~280×180, decision diamonds ~200×80, occasional ~full-width section headers).
3. **Edge labels affect spacing** — decision edges carry text like "I will survive". Whatever library we pick must let us reserve horizontal/vertical space for these labels (or at least not clip them onto neighbouring nodes).
4. **Top-down or left-right reading flow** — single config flag (`rankdir: 'TB' | 'LR'`).
5. **Gap controls** — explicit knobs for inter-node spacing, inter-rank spacing, and edge spacing.
6. **xyflow integration story** — preferably an officially documented Svelte Flow example so the wiring is uncontroversial.
7. **Bundle size** — this is a single-page Astro island that hydrates with `client:visible`; a few tens of KB gzipped is ideal, hundreds of KB is a real cost.
8. **Sync API preferred** — keeps the `getLayoutedElements()` helper trivially callable from `$derived`/event handlers without `await` plumbing.
9. **License** — MIT or MIT-compatible (the rest of the site is MIT). EPL-2.0 is acceptable for a personal site but flagged.
10. **Maintenance** — actively maintained in 2026, not in "light maintenance" mode.

## What does xyflow ship?

**xyflow ships *no* layout algorithm of its own.** This is by design and is documented on the [Svelte Flow Layouting guide](https://svelteflow.dev/learn/layouting/layouting-libraries):

> While we could build some basic layouting into Svelte Flow, we believe that you know your app's requirements best… so this guide is here to help.

What xyflow *does* ship is:

- A `Position` enum and per-node `sourcePosition` / `targetPosition` props you set after laying out (so handles flip from top/bottom to left/right when you toggle `TB`↔`LR`).
- Built-in edge geometry (`bezier`, `smoothstep`, `step`, `straight`) that takes over once node positions are fixed — so the layout library only needs to produce **node x/y**, not full edge paths.
- Officially maintained Svelte Flow example apps for **Dagre** ([svelteflow.dev/examples/layout/dagre](https://svelteflow.dev/examples/layout/dagre)) and **ELK.js** ([svelteflow.dev/examples/layout/elkjs](https://svelteflow.dev/examples/layout/elkjs)).
- A comparison table in their docs covering Dagre, D3-Hierarchy, D3-Force, ELK; "honourable mentions" for `d3-flextree`, `entitree-flex`, and Cola.js.

The xyflow team's own recommendation in that doc is explicit:

> If you need to organize your flows into a tree, we highly recommend **dagre**.
>
> We don't often recommend elkjs because its complexity makes it difficult for us to support folks when they need it.

That sets the prior strongly toward dagre, with elkjs reserved for cases where dagre proves insufficient.

## Candidates

### dagre — `@dagrejs/dagre`

- **Version / License / Last release**: **3.0.0**, published **22 March 2026**. MIT. The package is in the actively-maintained `@dagrejs` org (the unscoped `dagre` package is the abandoned one).
- **Bundle size** (Bundlephobia API, v3.0.0): **38.7 KB minified / 13.3 KB gzipped**, plus its single `@dagrejs/graphlib` dep (already counted in the 13 KB).
- **API summary**:
  ```ts
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 60, edgesep: 20, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));
  g.setNode(id, { width, height });
  g.setEdge(src, tgt, { label, width: labelW, height: labelH, labelpos: 'c' });
  dagre.layout(g);
  const { x, y } = g.node(id); // anchor = centre, shift by -w/2, -h/2 for xyflow
  ```
  Sync, single function call. v3 is now native TypeScript with bundled `.d.ts` (no more `@types/dagre`).
- **Variable node sizes**: yes, per-node `width`/`height` on `setNode`. Sugiyama layering respects them when assigning rank coordinates.
- **Edge labels**: yes. `setEdge(src, tgt, { label, width, height, labelpos, labeloffset })` reserves space for the label as if it were a virtual node on that edge. Caveat: the props must be passed to `setEdge`, **not** to `dagre.layout()` (issue [#461](https://github.com/dagrejs/dagre/issues/461)).
- **Top-down / left-right**: `rankdir: 'TB' | 'BT' | 'LR' | 'RL'`.
- **Gap controls**: `nodesep` (within rank), `ranksep` (between ranks), `edgesep` (between parallel edges), plus per-edge `minlen` and `weight`.
- **Sub-clustering**: supports compound graphs (`g.setParent(child, cluster)`), but [issue #238](https://github.com/dagrejs/dagre/issues/238) flags incorrect sub-flow placement when sub-flow nodes connect outwards — fine for our case (we don't need true sub-flows; "section header" nodes can just be ordinary wide nodes pinned to a rank).
- **Async vs sync**: fully sync. ~150 nodes lays out in single-digit milliseconds.
- **Layout quality for tree-with-merges DAG**: this is the canonical use case. Sugiyama layering naturally produces clean top-down levels with merge-back edges drawn as longer connectors; ranks are honoured even when a node has multiple parents. xyflow's smoothstep edges then absorb any minor ugliness in routing.
- **xyflow integration**: official Svelte Flow example at [svelteflow.dev/examples/layout/dagre](https://svelteflow.dev/examples/layout/dagre) — copy-pasteable into our `Flow.svelte`, ~50 lines.
- **Maintenance**: 1.8M weekly downloads; v3.0.0 (Mar 2026) is a full TS rewrite with modern ESM/CJS dual exports for Webpack 5 / Vite / Rollup; 40 contributors; active issue triage.
- **Pros**:
  - Tiniest realistic option (13 KB gz).
  - Sync, trivial API surface.
  - Native TypeScript in v3, no extra `@types` install.
  - Official xyflow example exists; the only library with first-party Svelte Flow code samples *and* the team's explicit endorsement.
  - Handles variable node sizes and edge-label space reservation out of the box.
- **Cons**:
  - No edge-routing output — relies on the renderer to draw edges. Fine for us (xyflow does that), bad if we wanted true ortho routing with bend-point avoidance.
  - Edge-label `labelpos` config has the documented quirk above.
  - Dynamic re-layout on node-resize re-anchors edges abruptly (issue [#482](https://github.com/dagrejs/dagre/issues/482)) — only relevant if node sizes change post-mount, which ours don't.
- **Verdict**: First choice. Hits every requirement, smallest bundle, simplest code, blessed by xyflow.

### elkjs

- **Version / License / Last release**: **0.11.1**, published **3 March 2026**. **EPL-2.0** (Eclipse Public License v2.0) — note: not MIT, and the maintainers have publicly declined dual-licensing under Apache 2.0 ([issue #158](https://github.com/kieler/elkjs/issues/158)). Acceptable for a personal site, but worth flagging.
- **Bundle size** (Bundlephobia API, v0.11.1): **1,449 KB minified / 433 KB gzipped** for the `elk.bundled.js` entrypoint. There is a worker split (`elk-api.js` + `elk-worker.min.js`) that can shrink the *main* chunk to ~36 KB and push the layout engine into a Web Worker — but the worker file is still ~430 KB gzipped on the wire.
- **API summary**:
  ```ts
  const elk = new ELK();
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
    },
    children: nodes.map(n => ({ id: n.id, width: n.w, height: n.h })),
    edges: edges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target], labels: [{ text: e.label, width, height }] })),
  };
  const out = await elk.layout(graph);
  ```
  Promise-based.
- **Variable node sizes**: yes; full `nodeSize` option group also lets you ask ELK to *measure* nodes itself.
- **Edge labels**: best-in-class. Edge labels are treated as nodes during layered layout, so they reserve their own space. Configurable via `org.eclipse.elk.layered.edgeLabels.*` (side selection, centre placement strategy) — see [edgeLabels reference](https://www.eclipse.org/elk/reference/groups/org-eclipse-elk-layered-edgeLabels.html). Trade-off: long labels can balloon inter-layer spacing; mitigation is `nodeNodeBetweenLayers` tweaks (issue [#308](https://github.com/kieler/elkjs/issues/308)).
- **Top-down / left-right**: `elk.direction: DOWN | RIGHT | UP | LEFT`.
- **Gap controls**: dozens — `spacing.nodeNode`, `layered.spacing.nodeNodeBetweenLayers`, `layered.spacing.edgeNodeBetweenLayers`, `spacing.edgeEdge`, `spacing.componentComponent`, etc.
- **Sub-clustering**: real, working sub-flows (Dagre's weak spot) — `children` arrays nest, ports are first-class.
- **Async vs sync**: async. Worker mode is recommended for >100 nodes to avoid jank.
- **Layout quality for tree-with-merges DAG**: arguably the best in this list. The `layered` algorithm produces orthogonal, port-aware routing with proper edge-label slots and avoids the diagonal mess that dagre can produce when several edges merge into the same downstream node.
- **xyflow integration**: official Svelte Flow example at [svelteflow.dev/examples/layout/elkjs](https://svelteflow.dev/examples/layout/elkjs) (uses `SvelteFlowProvider` + a `Flow.svelte` that awaits `elk.layout(...)`). xyflow team explicitly cautions in their docs that elkjs's complexity makes it harder to support.
- **Maintenance**: 2.0M weekly downloads; 313 dependents; 0.11.1 is a March 2026 perf release. Healthy.
- **Pros**:
  - Most powerful layout: orthogonal edge routing, real edge-label slots, sub-flows, ports.
  - Many algorithms in one package (`layered`, `mrtree`, `force`, `radial`, `stress`, `disco`, `rectpacking`).
- **Cons**:
  - **30× the bundle of dagre** (433 KB vs 13 KB gzipped). For a single Astro island this is the biggest layout chunk on the entire site.
  - EPL-2.0 (weak copyleft) instead of MIT.
  - Async API forces `await`/Promise plumbing inside Svelte effects.
  - Massive option surface (the Eclipse Layout Kernel reference) — easy to misconfigure.
  - xyflow themselves recommend against it for typical flowcharts.
- **Verdict**: Runner-up. Reach for it only if dagre's edge crossings or label collisions become unacceptable in practice — the orthogonal routing is genuinely better for dense merge-heavy DAGs.

### d3-dag

- **Version / License / Last release**: **1.2.1**, published **14 April 2026**. MIT.
- **Bundle size** (Bundlephobia API, v1.2.1): **135 KB minified / 41 KB gzipped**.
- **API summary**: TypeScript-first, immutable builder pattern. Also ships a `dagre`-compatible adapter so it can replace `@dagrejs/dagre` with the same `setNode` / `setEdge` / `layout` calls.
  ```ts
  import { sugiyama, decrossOpt, coordQuad, graphConnect } from 'd3-dag';
  const builder = graphConnect();
  const dag = builder([['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]);
  const layout = sugiyama().nodeSize([w, h]).decross(decrossOpt()).coord(coordQuad());
  layout(dag);
  ```
- **Variable node sizes**: yes — `nodeSize` accessor, or per-node via the immutable builder.
- **Edge labels**: not a first-class concept. Labels are just data on the edge; the layout doesn't reserve space for them (you'd have to inflate node sizes to compensate).
- **Top-down / left-right**: orientation is set by the coord operator + a post-transform; less ergonomic than dagre's `rankdir`.
- **Gap controls**: `nodeSize`, `gap`, plus per-stage configuration (decross / coord operators).
- **Sub-clustering**: no.
- **Async vs sync**: sync. Quality presets `"fast" | "medium" | "slow"` trade runtime for crossing minimisation; `"fast"` claims ~4× dagre v3 speed.
- **Layout quality**: arguably nicer crossing minimisation than dagre at the `medium`/`slow` presets, plus unique `Zherebko` and `Grid` algorithms not available elsewhere in JS. The dagre-compat shim works as a drop-in.
- **xyflow integration**: no official Svelte Flow example. Community React Flow demo at [github.com/idootop/reactflow-auto-layout](https://github.com/idootop/reactflow-auto-layout) uses it; it's straightforwardly portable.
- **Maintenance**: 46.6K weekly downloads, **explicitly in "light maintenance mode" per the maintainer's README** — simple feature requests still accepted, no active expansion. v1.2.1 is fresh (April 2026) but new features are unlikely.
- **Pros**:
  - TypeScript-first; great types out of the box.
  - MIT.
  - Drop-in dagre replacement if we want to A/B test crossing quality.
  - Multiple algorithms in one package, Sugiyama variants are tunable.
- **Cons**:
  - 3× the bundle of dagre with no advantage we actually need.
  - No edge-label reservation.
  - Light maintenance mode — risk for a site we want to leave alone for years.
  - No first-party xyflow example.
- **Verdict**: A respectable second runner-up but nothing here beats dagre on our requirements. Worth remembering as a swap-in if dagre crossings become a problem on a particularly nasty subgraph.

### graphlib + custom layout

- `@dagrejs/graphlib` is the data-structure half of dagre, exposed standalone. ~5 KB gz, MIT, sync.
- Useful only as scaffolding if we wrote our own ranker / coord assigner. We have neither the time nor the upside for that — Sugiyama is a non-trivial algorithm and we'd be reinventing dagre badly.
- **Verdict**: skip.

### cytoscape.js layouts

- Cytoscape ships its own renderer plus layouts (`cose`, `dagre` adapter, `elk` adapter, `klay`, `breadthfirst`, etc.). Bundle is ~400 KB gzipped on its own.
- Layouts are coupled to its renderer — to use them with xyflow we'd have to instantiate a headless cytoscape graph, run layout, then read positions back. Possible but absurd: it adds the entire cytoscape renderer to the bundle for layout output we already get standalone from dagre/elkjs.
- **Verdict**: skip — only relevant if the renderer were also cytoscape.

### klayjs

- **Officially deprecated** by the Kieler team in favour of elkjs. The README states no further bug fixes or builds.
- **Verdict**: skip — use elkjs.

### svelvet built-in layout

- We already evaluated and rejected svelvet itself in `investigation-flowchart-dep.md` (Svelte 4 only, slowing release cadence).
- **Verdict**: not applicable.

### webcola (Cola.js)

- **Version / License / Last release**: 3.4.0 — npm release dates to **May 2019**, although the repo had a push in Jan 2026. ~22 KB gzipped. MIT.
- Constraint-based, force-directed layout. Solves "soft" constraints (alignment, separation, flow direction) by gradient descent rather than producing a clean layered Sugiyama output. Great for organic graphs, awkward for the strict top-down decision-tree feel we want.
- xyflow honourable-mention but no Svelte Flow example.
- **Verdict**: skip — wrong layout style and a 7-year-old npm release is too risky for a green-field 2026 build.

### d3-flextree / entitree-flex (xyflow's "honourable mentions")

- Both are tiny tree-only layouters with first-class variable-node-size support (`d3-flextree`: ~2.6 KB gz, `entitree-flex`: ~3.8 KB gz, both MIT).
- They handle the "different-sized nodes" problem dagre/d3-dag don't natively elegant, but **neither supports DAGs with merges** — they require strict tree topology with one parent per child. Our graph has merge edges, so they're disqualified.
- **Verdict**: skip — would force us to model the graph as a strict tree and lose the merge edges that are central to "this book gets recommended from multiple decision paths".

### New 2026 entrants

A web search for "graph layout library 2026" surfaced a few names; none change the picture:

- **`sun-hierarchy`** — TypeScript Sugiyama implementation, last touched April 2026, ~2K weekly downloads. Niche, unproven, supports orthogonal/Bezier routing. Not worth choosing over dagre.
- **`@graphty/layout`** — TypeScript port of NetworkX layouts (spring, spectral, etc.). Force-style only, no layered algorithm. Wrong shape.
- **`maxGraph`** — full diagramming framework with built-in Sugiyama layout. Same bundle-size + framework-coupling problem as cytoscape.
- **`reagraph`** — WebGL React graph library, layouts are coupled to its renderer. Not relevant.
- **`vizcraft`** — SVG scene builder with circular/grid layouts and pluggable async algorithms (e.g. ELK). Doesn't ship layered DAG layout itself.

Nothing in 2026 displaces dagre as the lightweight default for layered DAGs.

## Recommendation

**Use `@dagrejs/dagre@3.0.0`.** Install (when ready):

```bash
npm install @dagrejs/dagre
```

Why over the runner-up (elkjs):

- **30× smaller** (13 KB gzipped vs 433 KB gzipped). For a single-island flowchart page on a content site, that's a meaningful page-weight difference and it ships sync — no Web Worker plumbing.
- **Officially blessed by xyflow** for tree-with-merges flowcharts; we get a copy-pasteable Svelte Flow example to start from and an MIT licence that matches the rest of the repo (elkjs is EPL-2.0 with no Apache/MIT dual-license path).
- **Variable node sizes and edge-label width/height are first-class** and sufficient for our 100–150-node DAG; xyflow's `smoothstep` edges absorb routing once dagre returns coordinates, so we don't pay for elkjs's orthogonal routing engine that we don't need.

If, after implementation, dagre's edge-crossing minimisation looks visibly bad on the densest merge cluster, the escape hatch is **swap to elkjs's `layered` algorithm with `'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP'`** behind the same `getLayoutedElements()` interface — both libraries take "list of nodes + edges with sizes" and return positions, so the wrapper signature stays identical.
