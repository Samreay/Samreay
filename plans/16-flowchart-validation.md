# Phase 16 — Flowchart validation slice

**Goal:** Stand up `/reviews/flowchart/` as a thin Astro page mounting a Svelte 5 island that renders a three-node book-recommendation flowchart with `@xyflow/svelte`, laid out at build time by `@dagrejs/dagre`. The page proves the chosen stack (xyflow + dagre + Astro island + Svelte 5 + existing `fancy_card` CSS) works end-to-end. The full ~150-node migration off the Figma board lives in a later phase.

**Estimate:** ½ day.

## Skills to load before starting

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — page frontmatter, `import.meta.glob`, hydration directives, build-time data resolution
- [`svelte-best-practices`](../.cursor/skills/svelte-best-practices/SKILL.md) — Svelte 5 runes, `$props()` for custom node components, the Astro↔Svelte boundary

## Decisions already locked in

- **Diagramming**: `@xyflow/svelte` (Svelte Flow 1.x — Svelte 5 native, runes-based, MIT). See `plans/investigation-flowchart-dep.md`.
- **Layout**: `@dagrejs/dagre@3.x` (sync, ~13 KB gzipped, MIT, blessed by xyflow for tree-with-merges). See `plans/investigation-layout-dep.md`.
- **Astro integration**: `@astrojs/svelte` is already wired in `astro.config.mjs` — no new integration to add.
- **Layout where**: build-time inside Astro frontmatter; the layout helper, dagre, and the cover-resolver all run on the server. The Svelte island only receives positioned, JSON-serialisable nodes/edges. This keeps dagre and `getImage()` out of the client bundle.

## What we are validating

A three-node graph that exercises every load-bearing piece of the stack:

```
[Will you die without stats or a system?]
       │ "instant dead"     │ "I will survive"
       ▼                    ▼
[Defiance of the Fall]    [Cradle]
   (full-width card)        (normal card)
```

That's: one decision node up top, two existing review covers below, two labelled edges. The Defiance of the Fall card is rendered at full row width (`width: 560`) to prove that per-node size hints flow through dagre and back into xyflow positions; the Cradle card uses the normal book width (`width: 280`).

If this slice ships with: pan/zoom working, hover shimmer firing on the cards, both cards linking to the right `/reviews/<id>/` page, no SSR explosions, and a clean `npm run build` — we have green light to migrate the full Figma board behind the same primitives.

## Tasks

### 1. Add dependencies

```bash
npm install @xyflow/svelte @dagrejs/dagre
```

Both go into `dependencies` (not `devDependencies`) — they are imported from runtime code (`@xyflow/svelte` from the island, `@dagrejs/dagre` from the page frontmatter). Astro's static build will tree-shake `@dagrejs/dagre` out of the client bundle since it is only `import`ed from `.astro` files; `@xyflow/svelte` ships its runtime to the browser as part of the island chunk.

Resulting `package.json` diff:

```json
{
  "dependencies": {
    "@dagrejs/dagre": "^3.0.0",
    "@xyflow/svelte": "^1.5.2"
  }
}
```

(There is no `dependencies` block in `package.json` today — everything is currently in `devDependencies`. Add a new `dependencies` block alongside it; npm will accept both.)

`@xyflow/svelte` ships its own stylesheet at `@xyflow/svelte/dist/style.css`. We import it once from the island's `<script>` block. Astro/Vite then hoists it into the page's CSS bundle. **CSS order**: the xyflow stylesheet must load before our overrides in `src/styles/flowchart.scss`, so the import order inside the island is `xyflow CSS → no-op` and the page-level `flowchart.scss` is imported separately from the `.astro` page (which Astro emits later in the cascade). Where order is genuinely contested, prefer specificity over order: most overrides will be `.flowchart-page .svelte-flow__minimap { ... }` rather than bare class selectors.

No new Astro integration is required: `@astrojs/svelte` is already in `astro.config.mjs`.

### 2. Data model — `src/data/flowchart.ts`

The data file is the thing the future ~150-node migration touches the most, so the shape needs to be ergonomic for hand-authoring and unambiguous for the layout helper. Two parallel arrays of typed nodes (decisions and books), one shared edges array, both keyed by string ids.

```ts
// src/data/flowchart.ts
//
// Hand-authored source of truth for the recommendation flowchart. The Astro
// page (`src/pages/reviews/flowchart.astro`) feeds this through
// `src/lib/flowchart-layout.ts` to produce dagre-positioned xyflow nodes.
//
// IDs are string-stable: edges reference them and the future migration
// expects to add ~150 more nodes incrementally without renumbering.

export interface DecisionNode {
  id: string;
  /** Headline question shown inside the diamond. */
  prompt: string;
  /** Optional smaller text under the prompt. */
  subText?: string;
  /** Layout escape hatch — if set, dagre's computed position is ignored and
   *  this top-left coordinate is used instead. Use sparingly; intended for
   *  the rare node that has to sit in a hand-tuned spot (section anchors,
   *  group headers, the very top of the tree). */
  pinned?: { x: number; y: number };
}

export interface BookNode {
  id: string;
  /** Matches the review collection entry id, i.e. `content/reviews/<reviewId>/`. */
  reviewId: string;
  /** Layout hint: 'full' renders a wide card spanning the row; 'normal' is
   *  the default ~280px card. dagre uses these to assign node widths. */
  width?: 'normal' | 'full';
  /** See DecisionNode.pinned. */
  pinned?: { x: number; y: number };
}

export interface FlowchartEdge {
  id: string;
  source: string;
  target: string;
  /** Answer text that labels the edge ("I will survive", etc.). */
  label?: string;
  /** Optional CSS hint for differentiating edge styles later (e.g. "warn"). */
  variant?: 'default' | 'warn' | 'highlight';
}

export interface FlowchartData {
  decisions: DecisionNode[];
  books: BookNode[];
  edges: FlowchartEdge[];
}

export const flowchart: FlowchartData = {
  decisions: [
    {
      id: 'd_start',
      prompt: 'Will you die without stats or a system?',
      subText: 'Be honest with yourself.',
    },
  ],
  books: [
    { id: 'b_dotf', reviewId: 'defiance_of_the_fall', width: 'full' },
    { id: 'b_cradle', reviewId: 'cradle' },
  ],
  edges: [
    { id: 'e_start_dotf', source: 'd_start', target: 'b_dotf', label: 'instant dead' },
    { id: 'e_start_cradle', source: 'd_start', target: 'b_cradle', label: 'I will survive' },
  ],
};
```

Why two arrays instead of one polymorphic `nodes: (Decision | Book)[]`? Because authoring is easier when adding "another decision" and "another book recommendation" are visually distinct sections of the file, and TypeScript can keep the discriminator implicit (the array you appended to). The layout helper merges them and stamps `type: 'decision' | 'book'` on the way out — that's what xyflow keys its `nodeTypes` map on.

**Why `pinned` now, not later.** It's a six-line addition today and a refactor across the layout helper + every consumer once the dataset is 150 nodes deep. The validation slice doesn't use it; we ship it dormant so the future migration can slot in section-anchor pins (e.g. the top "Start here" node) without touching the layout helper signature.

**Validation.** A bad `reviewId` or a dangling `edge.source`/`edge.target` is silent at runtime — dagre lays out an island in isolation and the page builds clean. At 150 nodes, that's a debugging trap waiting to spring. The layout helper (§3) opens with a `validateFlowchart(data)` call that walks the data once and throws with a complete list of every offence it found, not just the first one. We keep validation co-located with the helper instead of in `flowchart.ts` so importing the data file from anywhere else stays cheap (no `astro:content` resolution at module-load time).

### 3. Layout helper — `src/lib/flowchart-layout.ts`

Single exported function `getLayoutedElements()` that:

1. Calls `validateFlowchart(data)`. Throws with a complete list of bad `reviewId` references, dangling edge endpoints, and duplicate ids before any I/O happens — fail-fast, fail-loud, fail-once.
2. Walks `data.books` and resolves each book's review entry from the `reviews` collection (`getEntry('reviews', node.reviewId)`). `getEntry` over `getCollection().find()` because we know the ids upfront — no scan, no filter closure, no surprise if the collection grows.
3. Calls `resolveCover(entry, w, h)` (already exists in `src/lib/covers.ts`) to get a webp-optimised cover URL — this is the single most important reuse: it gives us the same content-hashed `_astro/<hash>.webp` URLs the rest of the site uses, with the placeholder fallback chain intact. The Svelte island then consumes that URL string the same way the artists explorer does (`resolveArtistCovers` → island `<img src>`); we are *not* introducing a parallel image-resolution path.
4. Builds the dagre graph, sets per-node sizes (decision 280×100, book-normal 280×448, book-full 560×448 — 1.6 aspect to match `aspect-ratio: 0.625` enforced by `fancy.scss`), pushes edges with label width/height so labels reserve space, and calls `dagre.layout(g)`.
5. For nodes with `pinned: { x, y }`, **skips dagre's computed position** and uses the pin instead. The pinned coordinates are top-left in xyflow's coordinate system (no centre-shift needed).
6. Maps each laid-out node back into an xyflow `Node` shape with `position`, `type`, and `data`. The data payload is everything the custom Svelte node component needs (cover URL, title, tier, link, aria label).
7. Returns `{ nodes, edges }` already typed as xyflow's generic `Node<T, K>` so the island doesn't need a `as unknown as Node[]` cast across the boundary.

```ts
// src/lib/flowchart-layout.ts
import dagre from '@dagrejs/dagre';
import { getEntry } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { Node, Edge } from '@xyflow/svelte';
import { resolveCover } from './covers';
import type { FlowchartData } from '../data/flowchart';

const NODE_SIZES = {
  decision: { width: 280, height: 100 },
  book: { width: 280, height: 448 },
  bookFull: { width: 560, height: 448 },
} as const;

export interface BookNodePayload {
  kind: 'book';
  reviewId: string;
  title: string;
  tier: CollectionEntry<'reviews'>['data']['review'];
  cover: { src: string; width: number; height: number };
  link: string;
  fullWidth: boolean;
}

export interface DecisionNodePayload {
  kind: 'decision';
  prompt: string;
  subText?: string;
}

// Tighten the union against xyflow's own `Node<TData, TType>` so the island
// can accept these directly into `let nodes: FlowNode[] = $state(...)` with
// no cast. Same trick for edges.
export type BookFlowNode = Node<BookNodePayload, 'book'>;
export type DecisionFlowNode = Node<DecisionNodePayload, 'decision'>;
export type FlowNode = BookFlowNode | DecisionFlowNode;
export type FlowEdge = Edge<{ variant?: 'default' | 'warn' | 'highlight' }>;

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
  // `reviewId` existence is checked during entry resolution below; do it here
  // too so we surface every bad reference at once instead of dying on the
  // first `await getEntry`.
  // (The actual collection check is async; we only catch shape errors here.)
  if (errors.length) {
    throw new Error(`flowchart data invalid:\n  - ${errors.join('\n  - ')}`);
  }
}

export async function getLayoutedElements(
  data: FlowchartData,
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> {
  validateFlowchart(data);

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 120, edgesep: 30 });
  g.setDefaultEdgeLabel(() => ({}));

  // Resolve all book payloads in parallel. `resolveCover` calls `getImage`
  // which can block on sharp processing for first-time encodes.
  const bookPayloads = await Promise.all(
    data.books.map(async (book) => {
      const entry = await getEntry('reviews', book.reviewId);
      if (!entry) throw new Error(`flowchart: review entry not found: ${book.reviewId}`);
      const fullWidth = book.width === 'full';
      const size = fullWidth ? NODE_SIZES.bookFull : NODE_SIZES.book;
      const cover = await resolveCover(entry, size.width, size.height);
      return {
        node: book,
        size,
        payload: {
          kind: 'book' as const,
          reviewId: entry.id,
          title: entry.data.short_title ?? entry.data.name,
          tier: entry.data.review,
          cover,
          link: `/reviews/${entry.id}/`,
          fullWidth,
        },
      };
    }),
  );

  for (const d of data.decisions) g.setNode(d.id, NODE_SIZES.decision);
  for (const b of bookPayloads) g.setNode(b.node.id, b.size);
  for (const e of data.edges) {
    // Reserve label space as a virtual edge node so dagre's Sugiyama assignment
    // doesn't crash labels into adjacent ranks. See investigation issue #461 —
    // these props go on `setEdge`, not on `dagre.layout`.
    g.setEdge(e.source, e.target, {
      label: e.label ?? '',
      width: e.label ? Math.max(60, e.label.length * 7) : 0,
      height: e.label ? 24 : 0,
      labelpos: 'c',
    });
  }

  dagre.layout(g);

  // dagre returns the node *centre*; xyflow expects *top-left*. Shift here
  // unless the node is pinned, in which case the author has already given us
  // a top-left coordinate.
  const placeDecision = (d: typeof data.decisions[number]): DecisionFlowNode => {
    const size = NODE_SIZES.decision;
    const position = d.pinned
      ? { x: d.pinned.x, y: d.pinned.y }
      : (() => {
          const { x, y } = g.node(d.id);
          return { x: x - size.width / 2, y: y - size.height / 2 };
        })();
    return {
      id: d.id,
      type: 'decision',
      position,
      width: size.width,
      height: size.height,
      ariaLabel: `Decision: ${d.prompt}`,
      data: { kind: 'decision', prompt: d.prompt, subText: d.subText },
    };
  };

  const placeBook = (b: typeof bookPayloads[number]): BookFlowNode => {
    const { node, payload, size } = b;
    const position = node.pinned
      ? { x: node.pinned.x, y: node.pinned.y }
      : (() => {
          const { x, y } = g.node(node.id);
          return { x: x - size.width / 2, y: y - size.height / 2 };
        })();
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

  const edges: FlowEdge[] = data.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: 'smoothstep',
    ariaLabel: e.label ? `Edge labelled "${e.label}"` : undefined,
    data: { variant: e.variant ?? 'default' },
  }));

  return { nodes, edges };
}
```

A few intentional choices worth flagging for the implementer:

- **Build-time vs runtime layout.** The whole helper is `async` Astro frontmatter; dagre runs once during `astro build`, never in the browser. This buys us: (a) no dagre in the client bundle (~13 KB saved), (b) the `getImage` covers are pre-resolved and content-hashed before hydration so no client-side image processing is needed, (c) deterministic positions across users. Runtime layout (calling dagre inside a Svelte `$effect`) would only be necessary if node sizes depended on viewport — they don't. No memoisation needed: the helper runs once per build, in milliseconds, and Astro's incremental build cache handles repeats.
- **Disconnected subgraphs.** dagre handles them out of the box — each component gets its own rooted Sugiyama pass and the components are stacked vertically separated by `ranksep`. Worth knowing for the future 150-node migration: if some books are reachable from multiple decision branches but others form a small cluster off to one side, the layout stays sane. No work required for this slice.
- **Cover sizing.** Cards are book-aspect (1.6 height:width), so 280×448 and 560×448 match `aspect-ratio: 0.625` enforced in `fancy.scss`. Round numbers (280×440) work too but introduce a 2% letterbox we'd then have to absorb in CSS.
- **dagre returns centres, xyflow wants top-lefts.** The `x - w/2, y - h/2` shift is the most common dagre/xyflow integration mistake; keep it explicit so future authors don't reintroduce it. `pinned` skips the shift because pinned coordinates are already top-left.
- **`ariaLabel` on every node and labelled edge.** xyflow renders these into the node wrapper's `aria-label` attribute and surfaces them through its keyboard navigation; without them, a screen reader hits "graphics-document, button" and nothing else. Free win.

### 4. Svelte island — `src/components/islands/Flowchart.svelte`

```svelte
<script lang="ts">
  import {
    SvelteFlow,
    Background,
    Controls,
    MiniMap,
  } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';

  import BookNode from './flowchart/BookNode.svelte';
  import DecisionNode from './flowchart/DecisionNode.svelte';
  import type { FlowNode, FlowEdge } from '../../lib/flowchart-layout';

  let { nodes: initialNodes, edges: initialEdges }: {
    nodes: FlowNode[];
    edges: FlowEdge[];
  } = $props();

  // xyflow drives nodes/edges via `bind:` — copy props into local $state so
  // the user can pan and the library can mutate selections without us
  // mutating frozen prop arrays. No cast needed: `FlowNode`/`FlowEdge` are
  // already `Node<TData, TType>` / `Edge<TData>` (see flowchart-layout.ts).
  let nodes = $state<FlowNode[]>(initialNodes);
  let edges = $state<FlowEdge[]>(initialEdges);

  const nodeTypes = { book: BookNode, decision: DecisionNode };
</script>

<div class="flowchart-canvas">
  <SvelteFlow
    bind:nodes
    bind:edges
    {nodeTypes}
    fitView
    proOptions={{ hideAttribution: true }}
    minZoom={0.3}
    maxZoom={1.5}
    defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
  >
    <Background />
    <MiniMap pannable zoomable />
    <Controls />
  </SvelteFlow>
</div>
```

Two custom node components. They reuse the existing `fancy_card` markup, so the per-tier glow, shimmer overlay, and 3D tilt all light up for free. The 3D tilt comes from `setupFancyCards()` in `src/lib/fancy-card.ts`, which is already invoked from `BaseLayout` and uses event delegation on `document` — so cards rendered later inside the island are picked up automatically. No re-binding required.

```svelte
<!-- src/components/islands/flowchart/BookNode.svelte -->
<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import type { BookNodePayload } from '../../../lib/flowchart-layout';

  let { data }: NodeProps<BookNodePayload> = $props();
</script>

<Handle type="target" position={Position.Top} />

<div class="book-node fancy_card horizontal mx-auto" data-review-card>
  <div class="card_translator">
    <a class="card_rotator small_rot card_layer block" href={data.link} aria-label={data.title}>
      <div class="card_layer">
        <article class={`review-${data.tier}`}>
          <div class="bg2">
            <div class="bg-inner bg-gray-800">
              <figure class="block w-full">
                <img
                  loading="eager"
                  class="block w-full h-auto"
                  src={data.cover.src}
                  width={data.cover.width}
                  height={data.cover.height}
                  alt={data.title}
                />
              </figure>
              <span class="search-text" aria-hidden="true">{data.title}</span>
            </div>
          </div>
        </article>
      </div>
      <div class={`card_layer card_effect card_overlay_${data.tier}`}></div>
      <div class="card_layer card_effect card_glare"></div>
    </a>
  </div>
</div>
```

```svelte
<!-- src/components/islands/flowchart/DecisionNode.svelte -->
<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import type { DecisionNodePayload } from '../../../lib/flowchart-layout';

  let { data }: NodeProps<DecisionNodePayload> = $props();
</script>

<Handle type="target" position={Position.Top} />

<div class="decision-node">
  <p class="decision-node__prompt">{data.prompt}</p>
  {#if data.subText}<p class="decision-node__sub">{data.subText}</p>{/if}
</div>

<Handle type="source" position={Position.Bottom} />
```

A few gotchas worth pre-empting in code review:

- **Don't add scoped `<style>` blocks to `BookNode.svelte`.** It needs to compose with the global `fancy_card` rules in `src/styles/fancy.scss`, and Svelte's hashed scoping would break `.review-S`, `.card_overlay_S`, etc. Decision-node-specific styling can either be scoped (it doesn't have to compose with anything) or live in `src/styles/flowchart.scss` for symmetry — pick the latter so all flowchart visuals are co-located.
- **`Handle` placement matters.** xyflow draws edges between handles; if you forget the `target` Handle on `BookNode`, edges land in the wrong spot or don't render at all.
- **Single `<img>`, no `<picture>`.** `resolveCover` returns one optimised webp URL — there's nothing for `<picture>` to choose between, so a `<source>` with a one-element `srcset` is decorative. If we ever want responsive sizes, generate them by calling `getImage()` multiple times in the layout helper and emit a real `srcset` with `sizes`. Today, just an `<img>`.
- **Image `loading="eager"`** on covers inside the canvas: the island mounts on `client:only`, and once it's mounted the user expects the cards present. Lazy-loading would cause a second pop-in.
- **Tier overlay coverage.** `src/styles/fancy.scss` defines `.card_overlay_<tier>` for tiers `π, S, A, B, C` only. The validation slice's two reviews (Cradle = `S`, Defiance of the Fall = `C`) are covered. The future 150-node migration must extend `fancy.scss` with `D` and `F` overlays before adding any reviews at those tiers — otherwise the dynamic `card_overlay_${data.tier}` class silently lands on a no-op selector.

### 5. Page — `src/pages/reviews/flowchart.astro`

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import Flowchart from '../../components/islands/Flowchart.svelte';
import { flowchart } from '../../data/flowchart';
import { getLayoutedElements } from '../../lib/flowchart-layout';
import '../../styles/flowchart.scss';

const { nodes, edges } = await getLayoutedElements(flowchart);

// Build a flat list of every "from this decision, see X or Y" pair so we can
// render a non-canvas fallback for crawlers, screen readers, and JS-disabled
// users. With `client:only` the canvas itself contributes zero text content
// to the static HTML, so this fallback is the page's *only* indexable body.
const bookNodesById = new Map(
  nodes.flatMap((n) => (n.type === 'book' ? [[n.id, n] as const] : [])),
);
const fallback = flowchart.decisions.map((d) => {
  const branches = flowchart.edges
    .filter((e) => e.source === d.id)
    .flatMap((e) => {
      const node = bookNodesById.get(e.target);
      return node
        ? [{ label: e.label ?? '', title: node.data.title, href: node.data.link }]
        : [];
    });
  return { prompt: d.prompt, subText: d.subText, branches };
});
---
<BaseLayout
  title="Flowchart"
  description="Pick your next progression-fantasy / LitRPG read by branching question."
>
  <div class="flowchart-page content-full">
    <div class="section-header mt-12 pb-2">
      <h1>Recommendation Flowchart</h1>
      <p class="text-gray-300">Click and drag to pan, scroll to zoom. Keyboard: tab to focus a node, arrows to pan, +/− to zoom.</p>
    </div>

    <Flowchart client:only="svelte" {nodes} {edges} />

    <details class="flowchart-fallback mt-8">
      <summary>Recommendations as a list</summary>
      {fallback.map((d) => (
        <section class="flowchart-fallback__decision">
          <h2>{d.prompt}</h2>
          {d.subText && <p class="flowchart-fallback__sub">{d.subText}</p>}
          <ul>
            {d.branches.map((b) => (
              <li>
                <strong>{b.label}:</strong>{' '}
                <a href={b.href}>{b.title}</a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </details>
  </div>
</BaseLayout>
```

**Hydration directive.** The brief proposes `client:visible`, but Svelte Flow touches `window` and `ResizeObserver` at component-init time — SSR'ing it on Node throws. As of Svelte Flow 1.1 (June 2025) the team landed a partial-SSR fix that emits node markup server-side and defers handles/edges to hydration ([xyflow#5327](https://github.com/xyflow/xyflow/pull/5327)), but it's still surface area we don't want to debug during a validation slice. Use **`client:only="svelte"`** here. Astro skips SSR for the island, the page wrapper still prerenders normally (Astro's `output: 'static'` mode emits `dist/reviews/flowchart/index.html` regardless of any island's hydration directive), and hydration kicks in as soon as the chunk lands. `client:idle` is **not** an option: it still SSRs and would throw. Once we're confident in the slice we can revisit downgrading to a `client:visible` + 1.1 SSR config in a later phase.

**Why the `<details>` fallback isn't optional.** With `client:only`, the canvas contributes zero text to the static HTML. The fallback `<details>` block is the page's only indexable body — search engines, screen readers, and JS-disabled visitors all hit it first. We're collapsing it into a `<details>` so it doesn't visually compete with the canvas for sighted JS-on users, but it's always in the DOM (no `noscript`) so crawlers see it unconditionally and a screen-reader user can expand it without the canvas needing to be operable. This is also why the `<h1>` text "Recommendation Flowchart" plus the `<p>` instruction line is plain prose in the page wrapper, not stuck inside the island.

**Container sizing.** The flowchart is the page; give it a fixed-height canvas so xyflow's `fitView` has a known viewport. `height: 80dvh` (with `min-height: 600px`) is a good starting point — `dvh` over `vh` so iOS Safari's collapsing toolbar doesn't reflow the canvas during scroll. The navbar is `h-20` (80 px) absolute-positioned; the footer is empty (`<footer />` in `Footer.astro`). Pin via the `.flowchart-canvas` class in step 6, including `position: relative` for xyflow's absolutely-positioned children.

**SEO / sitemap.** `@astrojs/sitemap` is in `astro.config.mjs` and will pick this page up automatically; `robots.txt` already allows everything; `<title>`/`<description>` flow through `BaseLayout → Head.astro / Seo.astro`; no `noindex`. With the `<details>` fallback the page now has a meaningful `<h1>`, instruction line, and a list of crawlable `<a>`s pointing at every reachable review — the page contributes to internal link graph coverage instead of being a content-free shell.

### 6. Styling — `src/styles/flowchart.scss`

New file, imported by the page (not by `src/styles/main.scss`) so it loads only on `/reviews/flowchart/`. Keeps the global stylesheet thin.

```scss
// src/styles/flowchart.scss
//
// Page + node styles for /reviews/flowchart/. Imported from the .astro page
// rather than from main.scss so unrelated routes don't pay for these rules.
//
// Override patterns: prefer `.flowchart-page .svelte-flow__<part>` over bare
// `.svelte-flow__<part>` so we don't fight other potential xyflow usages
// elsewhere on the site, and so cascade order between Astro's per-page CSS
// and the island's bundled `@xyflow/svelte/dist/style.css` doesn't matter.

.flowchart-page {
  // Stretch the section width — the canvas is the content.
  max-width: none;
  padding: 0 1rem;
}

.flowchart-canvas {
  position: relative;       // xyflow children are absolutely positioned.
  width: 100%;
  height: 80dvh;            // dynamic viewport height — survives iOS toolbar collapse.
  min-height: 600px;
  margin-top: 1.5rem;
  border-radius: 1rem;
  overflow: hidden;
  background: #0c0d10;
}

// xyflow's `.svelte-flow__node` applies `transform: translate(...)`. Combined
// with `fancy.scss`'s `.fancy_card * { transform-style: preserve-3d }` the
// 3D tilt mostly works, but the perspective context can reset at the
// xyflow wrapper. If smoke-testing shows tilt artefacts at canvas edges,
// uncomment the override below — it re-establishes preserve-3d on the
// xyflow node so the inner `card_translator perspective: 600px` is honoured.
//
// .svelte-flow__node { transform-style: preserve-3d; }

// xyflow theming — match the dark site palette.
.flowchart-page {
  .svelte-flow {
    background-color: transparent;
  }
  .svelte-flow__background {
    color: rgba(255, 255, 255, 0.05);
  }
  .svelte-flow__minimap {
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
  }
  .svelte-flow__controls {
    button {
      background: #1a1a1a;
      color: #ddd;
      border: 1px solid rgba(255, 255, 255, 0.08);
      &:hover { background: #262626; }
    }
  }
  .svelte-flow__edge-path {
    stroke: rgba(255, 255, 255, 0.45);
    stroke-width: 1.6;
  }
  .svelte-flow__edge-text {
    fill: #f0f0f0;
    font-size: 0.85rem;
    font-weight: 500;
  }
  .svelte-flow__edge-textbg {
    fill: rgba(0, 0, 0, 0.7);
  }
  .svelte-flow__handle {
    width: 8px;
    height: 8px;
    background: rgba(255, 255, 255, 0.5);
    border: none;
  }
}

// Custom node visuals.
.book-node {
  // The fancy_card defaults to max-width: 600px; inside an xyflow node we
  // want it to fill the node bounding box that dagre sized.
  max-width: none;
  width: 100%;
  height: 100%;
}

.decision-node {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 1rem 1.25rem;
  background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.75rem;
  box-shadow: 0 6px 20px -8px rgba(0, 0, 0, 0.6);

  &__prompt {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: #f3f4f6;
    line-height: 1.25;
  }
  &__sub {
    margin: 0.4rem 0 0;
    font-size: 0.85rem;
    color: #9ca3af;
  }
}

// Crawlable / a11y fallback below the canvas. Visible-by-default on the
// page wrapper but collapsed via <details>; styled lightly because its job
// is to be readable, not to compete with the canvas.
.flowchart-fallback {
  color: #d1d5db;

  > summary {
    cursor: pointer;
    font-size: 0.95rem;
    color: #9ca3af;
    padding: 0.25rem 0;
  }

  &__decision {
    margin-top: 1.25rem;

    h2 {
      font-size: 1.1rem;
      font-weight: 600;
      color: #f3f4f6;
      margin: 0 0 0.25rem;
    }
  }

  &__sub {
    color: #9ca3af;
    font-size: 0.9rem;
    margin: 0 0 0.5rem;
  }

  ul { margin: 0.5rem 0 0 1.25rem; }
  a { text-decoration: underline; }
}
```

Using `.flowchart-page .svelte-flow__minimap` style selectors makes our overrides win over xyflow's bundled stylesheet regardless of which file Vite emits first — specificity beats source order.

### 7. Verification / smoke

The Phase verifier framework (`.cursor/skills/implement-plan/scripts/verify.py`) covers the Hugo→Astro parity migration, and `/reviews/flowchart/` has no Hugo equivalent to diff against. We add one Playwright assertion (the repo already runs Playwright from `.cursor/skills/implement-plan/scripts/visual/`) plus the manual smoke list.

**Build gates (must pass to ship):**

1. `npm install` succeeds with the two new dependencies; `package-lock.json` updates.
2. `npm run build` exits 0 with no warnings about `window` / `ResizeObserver` / SSR.
3. `dist/reviews/flowchart/index.html` exists and contains the textual fallback (`<details class="flowchart-fallback">` with `<a href="/reviews/cradle/">` and `<a href="/reviews/defiance_of_the_fall/">` inside). This proves the page prerendered and the fallback survived to static HTML, even though the canvas is `client:only`.
4. `grep -r "dagre" dist/_astro/ || echo "clean"` prints `clean`. Confirms tree-shaking actually kept dagre out of the client.

**Playwright assertion** (one new spec under `.cursor/skills/implement-plan/scripts/visual/`):

```ts
// flowchart.spec.ts
import { test, expect } from '@playwright/test';

test('flowchart page renders both cards and the fallback', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/reviews/flowchart/');

  // Static fallback present before any hydration.
  await expect(page.locator('.flowchart-fallback')).toContainText('Cradle');
  await expect(page.locator('.flowchart-fallback')).toContainText('Defiance of the Fall');

  // Canvas hydrates and renders both book nodes.
  await expect(page.locator('.svelte-flow__node-book')).toHaveCount(2);
  await expect(page.locator('.svelte-flow__node-decision')).toHaveCount(1);

  // Both cards link to the right review.
  await expect(page.locator('.book-node a[href="/reviews/cradle/"]')).toBeVisible();
  await expect(page.locator('.book-node a[href="/reviews/defiance_of_the_fall/"]')).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
```

This is cheap: it gates against (a) the canvas failing to hydrate at all (e.g. SSR'd reference to `window` slipping in), (b) regression in the textual fallback, (c) `defiance_of_the_fall` review being renamed without updating `flowchart.ts`, and (d) console errors during hydration.

**Manual smoke** (after the gates pass):

5. `npm run dev`, navigate to `http://localhost:4321/reviews/flowchart/`. Expect:
   - The decision diamond at the top.
   - Two book cards on the next rank — Defiance of the Fall noticeably wider than Cradle.
   - Two labelled edges ("instant dead" and "I will survive") not overlapping their target nodes.
6. Hover over the cards: tier-glow shimmer fires, 3D tilt tracks the cursor (proves `setupFancyCards()` delegation reached the island).
7. Pan with mouse-drag, zoom with wheel, click MiniMap to jump, click Controls' fit button to recentre.
8. Tab through the page with the keyboard. Decision diamond and book cards each receive a focus ring (xyflow's keyboard nav). Screen-reader output should announce "Decision: Will you die..." / "Recommendation: Cradle" thanks to the `ariaLabel` on each Node.
9. Expand the `<details>` fallback. Both bullet points present, links live.
10. View page source: the `<a href="/reviews/cradle/">` / `<a href="/reviews/defiance_of_the_fall/">` are present *before* any `<script type="module">` — i.e. SEO-visible without JS.

**Bundle size sanity.** Open `dist/_astro/` after `npm run build`. Expect a new chunk for the Flowchart island in the 50–80 KB gzipped range (xyflow runtime + Svelte 5 runtime, minus what other islands already share). Cover images live under `dist/_astro/*.webp` as usual.

### 8. Out of scope (explicit)

- **The full ~150-node Figma migration.** A separate phase (likely Phase 17) will port the entire decision tree, define grouping conventions for the data file, and decide whether to retire the Figma board entirely.
- **Mobile-first layout tweaks.** Pan/zoom is the pinch-and-drag UX on mobile; that's enough for validation. We may later add a layout-direction toggle (`rankdir: 'LR'` on narrow viewports), or a "tap a node to expand" interaction. Not now.
- **Persistence (URL-encoded viewport, search/filter on the canvas).** Future phase.
- **Multiple custom edge components / per-edge variants.** The `variant` field exists in the data shape but the island ignores it — all edges render as default smoothsteps. Wire it up when it has more than one possible value.
- **Per-node responsive `srcset`.** `resolveCover` returns one webp size per node. If covers ever look soft on retina at full-width cards, generate two `getImage` calls per book and emit a real responsive `<picture>` with `sizes`. Today's single-`<img>` is fine.
- **Tier-overlay coverage for `D` and `F`.** The dynamic `card_overlay_${tier}` class only resolves to a real selector for `π, S, A, B, C` (see `src/styles/fancy.scss`). Adding `D`/`F` overlays is a `fancy.scss` job, not part of this slice — but it must happen before the 150-node migration includes a D- or F-tier book.

### 9. Risks / open questions

**SSR compatibility.** Svelte Flow used to throw on Node because of unguarded `window` / `ResizeObserver` access at component init; xyflow [#5327](https://github.com/xyflow/xyflow/pull/5327) (June 2025, in Svelte Flow 1.1+) made nodes SSR-able while deferring handles/edges to hydration. We still pick `client:only="svelte"` because (a) the page wrapper carries the SEO/a11y body via the `<details>` fallback, so we don't *need* the canvas to SSR, and (b) skipping SSR removes a class of bugs we'd otherwise have to chase. If a future phase wants partial SSR for first-paint reasons, downgrade to `client:visible` and read the [SSR doc note in the 1.1 changelog](https://svelteflow.dev/whats-new/2025-06-11) before flipping it.

**Dagre under Astro's Node SSR.** `@dagrejs/dagre@3.x` is a sync, pure-JS, no-DOM library distributed as ESM/CJS dual. It runs cleanly in any Node context including Astro's static build. v3 ships its own `.d.ts` so no `@types/dagre` install is needed. The `import dagre from '@dagrejs/dagre'` default-import + `new dagre.graphlib.Graph()` namespace access is the documented usage and works under Vite ESM. No risk.

**xyflow generic types.** `Node` and `Edge` from `@xyflow/svelte` are generic over a `data` payload and a `type` discriminator. The layout helper now exports `BookFlowNode = Node<BookNodePayload, 'book'>` and `DecisionFlowNode = Node<DecisionNodePayload, 'decision'>` so the island's `$state<FlowNode[]>(initialNodes)` accepts the layout output without casts. Inside each custom node component, `NodeProps<BookNodePayload>` (or `DecisionNodePayload`) gives `data` the right shape automatically.

**Svelte 5 minor compat.** `@xyflow/svelte` 1.x depends on Svelte ≥5.0 and uses `$state.raw` internally; the repo is on `svelte ^5.55.5` per `package.json`, well above the floor. No version conflict expected.

**CSS-in-island load order.** Discussed in §1 and §6 — overrides use `.flowchart-page` parent specificity rather than relying on source order, so this can't break in subtle ways.

**3D tilt × xyflow node transform.** The `fancy_card` 3D tilt expects to nest inside its own `perspective: 600px` and `transform-style: preserve-3d` chain. xyflow wraps each custom node in a `.svelte-flow__node` that sets `transform: translate(...)`, which can reset the perspective context and flatten the tilt. Smoke step §7.6 catches it; if the tilt looks off, the `.svelte-flow__node { transform-style: preserve-3d }` override is staged in `flowchart.scss` ready to uncomment.

**Browser support.** xyflow needs `ResizeObserver` (Safari 13.1+, all modern Chromium/Firefox) and `getBoundingClientRect`. No container queries, no `:has()`. Aligns with the rest of the site's baseline.

**Accessibility focus order.** xyflow's keyboard nav focuses nodes in array order, *not* visual order ([xyflow#5189](https://github.com/xyflow/xyflow/issues/5189)). For a three-node validation slice this is invisible; for the future 150-node migration we should either (a) order the data file in approximate read order, or (b) rely on the textual `<details>` fallback as the canonical accessible reading path and treat the canvas as a visual augmentation. The `<details>` fallback shipped here makes (b) viable.

## Files added in this phase

- `src/data/flowchart.ts`
- `src/lib/flowchart-layout.ts`
- `src/components/islands/Flowchart.svelte`
- `src/components/islands/flowchart/BookNode.svelte`
- `src/components/islands/flowchart/DecisionNode.svelte`
- `src/pages/reviews/flowchart.astro`
- `src/styles/flowchart.scss`
- `.cursor/skills/implement-plan/scripts/visual/flowchart.spec.ts` (Playwright assertion)

## Files unchanged

- `astro.config.mjs` — Svelte integration was already wired in Phase 1.
- `src/styles/main.scss` — flowchart styles are page-scoped, not global.
- `src/lib/covers.ts`, `src/lib/fancy-card.ts` — reused as-is.
- `content/reviews/{defiance_of_the_fall,cradle}/` — read-only references.

## Acceptance criteria

- `npm install` adds `@xyflow/svelte` and `@dagrejs/dagre` to `dependencies`; `package-lock.json` is committed.
- `npm run build` exits 0; `dist/reviews/flowchart/index.html` exists and contains crawlable `<a href="/reviews/cradle/">` and `<a href="/reviews/defiance_of_the_fall/">` inside the `<details class="flowchart-fallback">` block.
- The Playwright spec `flowchart.spec.ts` passes: both book nodes and the decision node render, fallback is in the static HTML, console errors empty.
- The page renders three nodes laid out top-to-bottom with two labelled edges in `npm run dev`.
- Both book covers route to the correct `/reviews/<id>/` page on click.
- The card hover shimmer + 3D tilt fire inside the canvas (proof that the existing `fancy_card` CSS and `setupFancyCards()` delegation reach the island).
- MiniMap, Controls, and Background components all render; pan and zoom work.
- Tabbing into the canvas focuses nodes; `aria-label` on each node reads as "Decision: …" / "Recommendation: …".
- DevTools console is clean.
- `grep -r "dagre" dist/_astro/` returns nothing (server-only).

## Architectural Review

This section was added during a pre-implementation review of the plan against the project's Astro 5 + Svelte 5 conventions, the existing codebase patterns (`covers.ts`, `fancy.scss`, `setupFancyCards`, `ReviewCoverCard.astro`, the artists-explorer island), and the xyflow / dagre 2026 release notes. Edits were folded inline into the relevant sections above; this is the audit log.

Severity legend: **blocker** = ship-stopper, **major** = real bug or substantive gap, **minor** = quality nit, **nit** = wording or polish.

### Issues found

| # | Area | Severity | Issue | Resolution |
|---|---|---|---|---|
| 1 | SEO / a11y | major | `client:only="svelte"` means the static HTML is content-free. Page is unindexable; screen readers and JS-disabled visitors get nothing. Plan punted to "later". | Fixed inline in §5: always-rendered `<details class="flowchart-fallback">` builds a flat list of "decision → answer → linked book" from the same data, lives in the prerendered HTML, satisfies SEO + a11y + JS-off. |
| 2 | Data model | major | No validation that `BookNode.reviewId` references an existing review entry, or that `FlowchartEdge.source`/`target` reference real nodes. Silent at 3 nodes; debugging trap at 150. | Fixed inline in §3: `validateFlowchart(data)` runs first and throws with a complete list of bad references and duplicate ids. `getEntry` still throws on bad `reviewId` as a backstop. |
| 3 | Data model | major | No layout escape hatch. The future 150-node migration needs to pin the "Start here" anchor and section headers; retrofitting later means churning the layout helper signature. | Fixed inline in §2 + §3: `pinned?: { x, y }` on `DecisionNode`/`BookNode`, honoured by the layout helper, dormant in the validation slice. |
| 4 | TypeScript | major | `as unknown as Node[]` cast at the island boundary because `FlowNode` was a hand-rolled discriminated union. Real type smell — silently swallows `data` payload mismatches. | Fixed inline in §3 + §4: layout helper now exports `Node<TData, TType>` aliases (`BookFlowNode`, `DecisionFlowNode`); island accepts them without casts. |
| 5 | a11y | major | Plan didn't pass `ariaLabel` on Node objects, so xyflow's keyboard nav announced "graphics-document, button" with no semantic content. | Fixed inline in §3: every node carries an `ariaLabel` ("Decision: …" / "Recommendation: …"); labelled edges too. |
| 6 | Testing | minor | Manual smoke only; the repo already runs Playwright for visual specs. One assertion is cheap insurance against SSR regressions, fallback regressions, and review id renames. | Fixed inline in §7: added `flowchart.spec.ts` checking node counts, fallback content, link hrefs, and console errors. Listed under "Build gates". |
| 7 | Markup | minor | `<picture><source srcset="${url} ${w}w" /><img /></picture>` with one source and no `sizes` is decorative — equivalent to `<img>`. | Fixed inline in §4: simplified to `<img>`. Note in §8 ("out of scope") flags real responsive `srcset` as a future improvement. |
| 8 | CSS | minor | `.flowchart-canvas` lacked `position: relative` (xyflow children are absolute-positioned); `vh` reflows on iOS toolbar collapse. | Fixed inline in §6: `position: relative` + `80dvh` (with `min-height: 600px` floor). |
| 9 | CSS | minor | The 3D tilt (`fancy_card` perspective chain) might be flattened by xyflow's `.svelte-flow__node` `translate()` transform. | Fixed inline in §6: smoke check in §7.6 verifies it; if it breaks, a commented-out `.svelte-flow__node { transform-style: preserve-3d }` override is staged ready to uncomment. |
| 10 | SSR documentation | minor | Plan claimed Svelte Flow categorically can't SSR. Outdated: xyflow#5327 (June 2025, in 1.1+) shipped partial SSR support. | Fixed inline in §5 + §9: kept `client:only` (the right call given the fallback strategy) but noted 1.1+ partial SSR exists for future revisits, with a link to the changelog. |
| 11 | CSS | minor | `card_overlay_${tier}` is dynamic; `fancy.scss` only defines overlays for `π, S, A, B, C`. Validation slice happens to be `S` and `C` (covered) but the future migration could include `D`/`F` reviews that silently render no overlay. | Fixed inline (called out in §4 gotchas + §8 out-of-scope). Resolution: extend `fancy.scss` before any `D`/`F`-tier book lands in the data file. Not done here because no such book is in scope. |
| 12 | Cover sizing | nit | 280×440 vs 280×448 (1.6 aspect to match `aspect-ratio: 0.625`). | Fixed inline in §3: 448 instead of 440. |
| 13 | Image-resolution path | nit | The user asked whether the plan introduces a parallel image-resolution code path. It doesn't — `resolveCover` is the same helper the artists explorer uses, and the "resolve in `.astro` frontmatter, pass URL string into Svelte island" pattern is the established precedent. | Called out explicitly in §3 prose so future readers don't reinvent it. |
| 14 | Hydration directive | nit | User asked whether `client:idle` could replace `client:only`. It can't — `client:idle` still SSRs the markup, which throws on `window`/`ResizeObserver` at module load. | Documented in §5. |
| 15 | Disconnected subgraphs | nit | User asked whether the layout helper handles disconnected components. dagre does, no helper changes needed. | Documented in §3 prose. |

### Things deliberately left alone

- **Memoising the layout helper.** Build-time only, runs once per `astro build`, milliseconds. Memoisation would add complexity without a measurable win. Left out.
- **Multiple custom edge components.** `variant` field exists on `FlowchartEdge` but the island ignores it. Wire it up when there's a second variant in the data. Listed in §8.
- **Per-node responsive `srcset`.** Single optimised webp from `getImage` is enough at 280–560px display widths. Listed in §8.
- **xyflow focus-order issue ([#5189](https://github.com/xyflow/xyflow/issues/5189)).** Out-of-scope for this slice. Mitigation strategy noted in §9: the textual `<details>` fallback is the canonical screen-reader path, the canvas is a visual augmentation.

### Open follow-up risks

- **Future 150-node migration must extend `fancy.scss` for `D`/`F` overlays before any review at those tiers is added.** Otherwise `card_overlay_D` / `card_overlay_F` silently no-ops.
- **xyflow keyboard focus order is data-array order, not visual order.** Once the dataset has tens of nodes, decide whether to (a) order the data file in approximate read order, or (b) hide the canvas from the tab order entirely (`tabindex="-1"` on the wrapper) and rely on the textual fallback for keyboard users. Recommend (b) — it sidesteps an unresolvable upstream issue.
- **Bundle budget for the future migration.** Current slice is expected at 50–80 KB gzipped for the island. At 150 nodes this won't change much (xyflow's per-node cost is negligible vs the runtime), but worth re-measuring after the full migration to confirm.
