# Flowchart Library Investigation

## Context

We are building a polished, visually rich book-recommendation flowchart for the Samreay book review site (Astro 5 + Svelte 5 islands). Each node is a custom HTML/CSS card (book cover image, title, tagline, accent colour, hover state) and decision diamonds branch via labelled arrows to follow-up cards. The graph is data-defined (~150 nodes), uses an external auto-layout (likely dagre or elkjs), and must feel like part of the existing site rather than a generic boxes-and-lines diagram. Mermaid is explicitly out of scope because it cannot render rich card content.

## Requirements (ranked)

1. **Custom HTML/CSS node content** — must allow arbitrary Svelte components / HTML inside each node (covers, gradients, hover states, multiple text fields). Must NOT be canvas-only with shape+text.
2. **Svelte 5 / Astro 5 compatibility** — ideally a native Svelte 5 component (runes-aware), or framework-agnostic with a clean Svelte adapter; works as an Astro island with `client:visible`.
3. **Customisable arrows / edges** — labelled edges, per-edge colour, CSS-stylable, optional curved/orthogonal routing.
4. **Pan / zoom / minimap** — interactive viewport for ~150 nodes.
5. **Layout integration** — accepts x/y from external layout (dagre, elkjs) so the data shape is "nodes + edges" and the library doesn't fight the layout.
6. **License** — MIT or similarly permissive.
7. **Bundle size & performance** with ~150 nodes.
8. **Maintenance** — actively maintained in 2026, decent GitHub activity, stable releases.
9. **Theming** — easy to integrate with the site's existing SCSS / dark theme.

## Candidates

### xyflow / `@xyflow/svelte` (Svelte Flow)

- **Version / Date / Stars / License**: 1.5.2 (published 2026‑03‑27). Monorepo `xyflow/xyflow` is the canonical home of React Flow + Svelte Flow with strong star count on the React side and growing Svelte adoption (~110K weekly downloads of `@xyflow/svelte`). **MIT.**
- **Svelte support**: First-class. Svelte Flow 1.0 (May 2025) was rewritten from the ground up for **Svelte 5** and dropped Svelte 4 entirely. Internals use `$state.raw`; custom node/edge components use `$props()`; reactive hooks expose `.current` rather than stores; nodes/edges are bound via `bind:nodes` / `bind:edges`. Drops cleanly into Astro as an island (`client:visible`).
- **Custom nodes**: Each node `type` maps to an arbitrary Svelte component receiving the node's `data` via `$props()`. You write a normal `.svelte` file with `<img>`, gradients, hover states, scoped styles — exactly the use case. `<Handle>` components anchor connection points.
- **Edges**: Built-in straight / bezier / step / smoothstep, plus a `BaseEdge` primitive for custom edges. Labels, per-edge colour, marker arrows, animated dashes, and full CSS class hooks.
- **Pan/zoom/minimap**: Built-in `<Background>`, `<Controls>`, and `<MiniMap>` components. Smooth pan + wheel zoom out of the box.
- **Layout integration**: Officially documented examples for both **dagre** and **elkjs** on the Svelte Flow site — you compute positions externally and pass them into `nodes`. Perfect fit for our "data + auto-layout" approach.
- **Bundle**: NPM unpacked size ~312 KB; gzipped runtime payload is comparable to React Flow's, well within budget for a single page island that hydrates with `client:visible`.
- **Pros**: Native Svelte 5 runes; MIT; production-grade pedigree (same team as React Flow, the de-facto standard); custom Svelte components as nodes is the *primary* API; first-class dagre/elkjs examples; minimap + controls included; accessible (keyboard nav landed in 1.0); excellent docs and an active 2026 release cadence.
- **Cons**: A little extra ceremony to wire `bind:nodes` correctly inside an Astro island; default styling is opinionated and needs CSS overrides to match a dark SCSS theme (but it's all class-hookable).
- **Verdict**: Hits every requirement, no caveats that affect this project. The clear winner.

### Svelvet

- **Version / Date / Stars / License**: 11.0.0; ~2.8K stars; last commit Feb 2025. **MIT.**
- **Svelte support**: Native Svelte — but the project migrated to **Svelte 4** in 9.0.0 and there is no public confirmation of Svelte 5 / runes support. Using it from a Svelte 5 codebase risks compiler warnings or compatibility quirks, and the slowing release cadence (no 2026 releases at the time of writing) is a red flag for a long-lived site.
- **Custom nodes**: Supports custom node components via slots, including a `flowchart` mode generated from formatted strings.
- **Edges**: Configurable colours/labels/anchors.
- **Pan/zoom/minimap**: Yes, all included.
- **Layout integration**: Manual positioning; less idiomatic external-layout story than xyflow.
- **Bundle**: Comparable to xyflow.
- **Pros**: Pure Svelte; permissive license; covers the same conceptual territory as React/Svelte Flow.
- **Cons**: Stuck on Svelte 4 with no public Svelte 5 commitment; maintenance has visibly slowed in 2025–2026; smaller ecosystem and fewer dagre/elkjs examples than xyflow.
- **Verdict**: Plausible runner-up, but only if xyflow were unavailable. The Svelte 5 risk is decisive.

### D3 + custom rendering

- **Version / License**: D3 v7.x; **ISC** (MIT-compatible).
- **Svelte support**: Framework-agnostic; integrates fine via `onMount` / `$effect`.
- **Custom nodes**: Total freedom — you can mount HTML divs at SVG-computed positions or render directly into SVG.
- **Edges**: Anything you can draw: paths, markers, labels, force-directed edges.
- **Pan/zoom/minimap**: `d3-zoom` gives pan/zoom; minimap is a DIY second viewport.
- **Layout**: Pair with dagre or `d3-hierarchy` / `d3-force`.
- **Bundle**: Tree-shakable; small per-module.
- **Pros**: Ultimate control; tiny if you only import what you use; battle-tested.
- **Cons**: Significant amount of glue code (interaction state, edge routing, hit-testing, accessibility, minimap). Would re-implement most of what xyflow ships for free.
- **Verdict**: Overkill. Reach for D3 only if xyflow can't express something, which it can.

### mxgraph / drawio

- **License**: **Apache 2.0** (permissive).
- **Maintenance**: `mxgraph` (the underlying JS library) is essentially frozen at v4.2.2 (Oct 2020). drawio itself is actively maintained but as an *editor application* embedded via iframe, not a Svelte-friendly diagramming primitive.
- **Custom nodes**: Stencil-based; not a clean fit for arbitrary Svelte components.
- **Verdict**: Wrong tool — heavyweight editor, frozen library, awkward Svelte integration.

### GoJS

- **License**: **Commercial** ($3,995 individual; team and group tiers higher). Academic licences exist but require negotiation.
- **Custom nodes / edges**: Excellent feature set, very mature.
- **Verdict**: Cost is disqualifying for a personal site, regardless of technical merit.

### Cytoscape.js

- **Version / License**: 3.33.1 (Aug 2025); 10.9K stars; **MIT**; active 2026 commits; new opt-in WebGL renderer landed in 2025.
- **Svelte support**: None native. Mount inside `onMount` / `$effect`, pass a container ref.
- **Custom HTML nodes**: Possible via extensions — `cytoscape-html` (v0.5.3, Jan 2026, MIT) renders arbitrary HTML as node bodies; `cytoscape-node-html-label` provides templated HTML labels. Both work, but they're third-party glue, and integrating Svelte components into them requires manually mounting/unmounting Svelte instances.
- **Edges**: Rich styling, labels, bezier/haystack/segments routing.
- **Pan/zoom/minimap**: Pan/zoom built-in; minimap via `cytoscape-navigator` extension.
- **Layout integration**: Many built-in layouts; can also accept preset positions from dagre/elkjs.
- **Pros**: Strong performance for large graphs (esp. with WebGL mode); mature; MIT.
- **Cons**: Graph-theory framing rather than diagramming; HTML nodes require an extension; no Svelte adapter; Svelte 5 component lifecycle inside an HTML node is your problem to manage.
- **Verdict**: Capable but the integration tax is high vs. xyflow's "drop in a `.svelte` file as a node type" story.

### Sigma.js

- **License**: **MIT.**
- **Strengths**: WebGL, designed for very large graphs (thousands of nodes).
- **Custom nodes**: Custom appearance via WebGL `NodeProgram` shaders or canvas overrides; HTML overlays are possible via custom layers, but you compute positions and absolutely-position DOM yourself.
- **Verdict**: Best when nodes are dots/glyphs at scale, not HTML cards. Wrong shape for this project.

### Reaflow

- **License**: Apache 2.0.
- **Stack**: React only.
- **Verdict**: Not Svelte; main repo last meaningful release mid‑2025. Skip.

### Sankey-style libs

- **Verdict**: Wrong shape (flow magnitude, not branching choices). Skip.

### vis-network

- **License**: Apache 2.0 / MIT (dual). Active (v10.0.2, Sep 2025; commits into 2026); ~3.5K stars.
- **Custom HTML nodes**: Only via SVG `<foreignObject>` images, with documented browser caveats. Node `font.multi: html` supports trivial inline tags only.
- **Verdict**: Workable for plain network diagrams, but "rich Svelte cards as nodes" is fighting the library.

### Other 2026 candidates briefly considered

- **JointJS** — strong commercial diagramming kit; MPL/commercial split makes it less attractive than xyflow for a personal site.
- **React Flow Pro / React Flow itself** — same library family as xyflow Svelte; a Svelte 5 site has no reason to pull React in.
- **diagram-js / bpmn-io** — domain-specific (BPMN/DMN), heavy and opinionated.

## Recommendation

Use **`@xyflow/svelte`** (Svelte Flow). It is the only candidate that simultaneously: (a) is a true Svelte 5 component built on runes, (b) makes "render an arbitrary Svelte component as a node" the *primary* API rather than an extension, (c) ships dagre/elkjs layout examples, minimap and controls out of the box, (d) is MIT-licensed, and (e) has an active 2026 release cadence backed by the React Flow team. Drop it inside a single Astro island with `client:visible`, define one Svelte component per node `type` (book card, decision diamond), feed it positions from dagre/elkjs, and theme via CSS overrides on its documented class hooks.

Runner-up: **Svelvet**, only if xyflow were somehow unavailable — but its lack of confirmed Svelte 5 support and slowing 2025–2026 cadence make it a poor bet for a long-lived site.
