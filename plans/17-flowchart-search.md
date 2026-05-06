# Phase 17 — Flowchart search & dim

**Goal:** Add a search bar to `/reviews/flowchart/` that scans decision prompts, edge labels, and book metadata. While the search box has content, every node and edge that *doesn't* match drops to ~20% opacity; matches stay at full opacity. Empty box = current behaviour (everything full opacity).

**Estimate:** 2–3 hours.

## Skills to load before starting

- [`svelte-best-practices`](../.cursor/skills/svelte-best-practices/SKILL.md) — `$state` / `$derived`, `$effect`, the Astro↔Svelte boundary.
- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — content-collection access from `getLayoutedElements`.

## What xyflow gives us (spoiler: not enough)

- `@xyflow/svelte` 1.x has no node-search component or store helper. The only "search" in its CHANGELOG refers to handle-proximity lookups during connection drag, not text search.
- React Flow's shadcn-based [`NodeSearch`](https://reactflow.dev/ui/components/node-search) component is React-only and does `select + fitView`, not opacity-fade. Wrong UX even before the framework mismatch.
- xyflow *does* export a [`<Panel>`](https://www.svelteflow.dev/) container (`@xyflow/svelte` re-exports `Panel`) with a `position` prop accepting `top-left | top-center | top-right | …`. That's the correct mounting point for our own search input — it sits in the canvas viewport without competing with the dev toolbar (`top-left`) or MiniMap (`top-right`).

So: build our own, mount it in a `<Panel position="top-center">`, drive matching with Svelte 5 runes, apply the dim with one CSS rule keyed off a class on the canvas.

## Design

### 1. Searchable surface

| Element | Fields included in haystack |
| --- | --- |
| Decision node | `prompt` |
| Book node | `title`, `sentence`, author (`entry.data.auth`), `tags` joined with spaces, `entry.data.search_terms` |
| Edge | `label` |

Mirror the haystack shape used by `src/pages/reviews/index.astro` line 27 (`auth + name + search_terms`, lowercased) so a query that finds a book on `/reviews/` finds it here too. We deliberately do *not* include the full review markdown body — it would balloon the `client:only` payload by hundreds of KB and the `search_terms` frontmatter field already exists for exactly this purpose. If a future review wants its body searchable from the flowchart, the answer is "add tokens to `search_terms`", not "ship the whole MD file".

The haystack is a single lowercased string per element. Substring matching with multi-word AND semantics (split on whitespace; every token must be present), again mirroring `ReviewsExplorer.svelte` lines 133–148. This is the pattern users on the site are already trained on.

### 2. Where the haystacks get built

In `getLayoutedElements` (`src/lib/flowchart-layout.ts`), at the point each node/edge payload is finalised:

- `BookNodePayload` gains a `searchHaystack: string` field. Built from the same `entry` already loaded in the `Promise.all` block around line 983.
- `DecisionNodePayload` gains `searchHaystack: string`. Trivially `prompt.toLowerCase()`.
- `FlowEdge.data` gains `searchHaystack: string`. Trivially `(label ?? '').toLowerCase()`.

All three types live in `flowchart-layout.ts` already; extend them in place. Build-time cost is negligible (one `toLowerCase()` per element on top of work that already runs).

**Alternative considered**: compute haystacks on the client from the existing fields. Rejected — it duplicates the lowercase work on every keystroke for every element, and forces the client to know the field-merging rules that should live next to the rest of the layout helper.

### 3. State + matching (in `Flowchart.svelte`)

```ts
let searchTerm = $state('');

const matchedNodeIds = $derived.by((): Set<string> | null => {
  const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;        // null = "no search active"
  const out = new Set<string>();
  for (const node of nodes) {
    const hay = (node.data as { searchHaystack?: string }).searchHaystack ?? '';
    if (tokens.every((t) => hay.includes(t))) out.add(node.id);
  }
  return out;
});

const matchedEdgeIds = $derived.by((): Set<string> | null => {
  const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const out = new Set<string>();
  for (const edge of edges) {
    const hay = (edge.data as { searchHaystack?: string }).searchHaystack ?? '';
    const labelMatches = tokens.every((t) => hay.includes(t));
    // An edge stays bright if its OWN label matches OR if both endpoints
    // matched — otherwise a search like "cradle" would keep the Cradle
    // node bright while every edge attached to it faded, which looks
    // disconnected. With "both endpoints" we keep the local
    // neighbourhood graph readable around any matched node.
    const bothEndpointsMatch =
      matchedNodeIds!.has(edge.source) && matchedNodeIds!.has(edge.target);
    if (labelMatches || bothEndpointsMatch) out.add(edge.id);
  }
  return out;
});
```

**Multi-word AND** rather than OR because a typical query like `cradle audio` should mean "Cradle and audio", not "Cradle or audio". Same as the reviews page.

`null` rather than empty `Set` for "no active search" lets the rendering layer skip the dim path entirely — empty box = original behaviour, no transition flicker, no per-element class assignment.

### 4. Applying the dim

xyflow nodes and edges accept a `className` prop that ends up on `.svelte-flow__node[data-id="…"]` / `.svelte-flow__edge[data-id="…"]`. We compute that reactively:

```ts
const decoratedNodes = $derived.by(() => {
  if (matchedNodeIds === null) return nodes;
  return nodes.map((n) => ({
    ...n,
    className: matchedNodeIds.has(n.id) ? undefined : 'flowchart-dim',
  }));
});

const decoratedEdges = $derived.by(() => {
  if (matchedEdgeIds === null) return edges;
  return edges.map((e) => ({
    ...e,
    className: matchedEdgeIds!.has(e.id) ? undefined : 'flowchart-dim',
  }));
});
```

Then change `bind:nodes` / `bind:edges` to read `decoratedNodes` / `decoratedEdges` for the `nodes` / `edges` props *only*, while still binding the underlying mutable arrays for drag (dev mode). i.e.:

```svelte
<SvelteFlow nodes={decoratedNodes} edges={decoratedEdges} ...>
```

… and we lose `bind:` two-way drag updates. **Workaround**: only do the decoration when search is active. When `matchedNodeIds === null`, return the original `nodes` / `edges` arrays untouched and use `bind:nodes={nodes}` (cannot conditionally toggle `bind:` though).

**Cleaner alternative**: keep `bind:nodes` / `bind:edges`, and instead of producing a derived array, eagerly mutate `node.className` in place inside an `$effect` that re-runs whenever `searchTerm` changes:

```ts
$effect(() => {
  for (const node of nodes) {
    const matched = matchedNodeIds === null || matchedNodeIds.has(node.id);
    node.className = matched ? undefined : 'flowchart-dim';
  }
  for (const edge of edges) {
    const matched = matchedEdgeIds === null || matchedEdgeIds.has(edge.id);
    edge.className = matched ? undefined : 'flowchart-dim';
  }
});
```

This is the same path xyflow itself uses during a drag — mutating fields on the `$state` proxy through the existing array — so SvelteFlow re-renders the affected nodes/edges without remounting and without losing drag bindings. **Recommended.**

Cost: 216 nodes + 231 edges = 447 assignments per keystroke, all primitive comparisons. Free.

### 5. CSS

Single rule in `src/styles/flowchart.css`:

```css
.flowchart-page .svelte-flow__node.flowchart-dim,
.flowchart-page .svelte-flow__edge.flowchart-dim {
  opacity: 0.2;
  transition: opacity 150ms ease;
}
.flowchart-page .svelte-flow__node,
.flowchart-page .svelte-flow__edge {
  transition: opacity 150ms ease;
}
```

The non-dim selector is there so the *fade-back-up* when matches change (or the search clears) is also smooth, not a snap.

**Edge labels are portalled.** xyflow renders the HTML edge label inside an `EdgeLabelRenderer` that lives outside `.svelte-flow__edge`, so `.svelte-flow__edge.flowchart-dim .svelte-flow__edge-label` won't reach it (this is the same pinch point that made us inline `labelStyle` per-edge in `flowchart-layout.ts`). For the label to fade with its edge:

- Find the matching `.svelte-flow__edge-label` by `data-id` (xyflow sets it) and add the same class. The cleanest way is a tiny `$effect` that runs after `decoratedEdges` settles:
  ```ts
  $effect(() => {
    for (const edge of edges) {
      const labelEl = document.querySelector(
        `.svelte-flow__edge-label[data-id="${edge.id}"]`,
      );
      labelEl?.classList.toggle('flowchart-dim', edge.className === 'flowchart-dim');
    }
  });
  ```
- And a CSS rule:
  ```css
  .flowchart-page .svelte-flow__edge-label.flowchart-dim {
    opacity: 0.2;
    transition: opacity 150ms ease;
  }
  ```

Acceptable to keep this DOM-touching inside an `$effect` because xyflow itself owns the labels and there's no Svelte-native handle for them. Confirm `data-id` is actually set in xyflow Svelte 1.5.2 before relying on it (one-line check in DevTools); fallback is to query by index inside the labels container.

### 6. The search-bar UI

A `<Panel position="top-center">` containing one `<input>` plus a tiny match-count + clear button. Wrapped in `{#if !isDev || …}` is **not** needed — the search bar should be live in production too; the dev toolbar (top-left) and MiniMap (top-right) leave the centre slot free.

Markup sketch:

```svelte
<Panel position="top-center" class="flowchart-search">
  <input
    type="search"
    placeholder="Search prompts, books, tags, edges…"
    bind:value={searchTerm}
    aria-label="Search the flowchart"
  />
  {#if matchedNodeIds !== null}
    <span class="flowchart-search__count">
      {matchedNodeIds.size + matchedEdgeIds!.size} matches
    </span>
  {/if}
  {#if searchTerm}
    <button type="button" onclick={() => (searchTerm = '')} aria-label="Clear search">×</button>
  {/if}
</Panel>
```

Style it to read as part of the dark canvas chrome — same colour vocabulary as `.dev-toolbar` (slate surface, emerald accent on focus, `backdrop-filter: blur(4px)`), but emerald-neutral rather than emerald-green so it doesn't read as "dev-mode tooling".

### 7. Keyboard polish (cheap)

`$effect` on `window`:
- `/` (when not in another input) focuses the search box.
- `Escape` (when search is focused) clears `searchTerm` and blurs.

Lifted from the reviews-explorer keyboard pattern (`src/components/islands/ReviewsExplorer.svelte` lines 211–227), so the muscle memory is consistent across the two pages. Skip if the time budget is tight — this is icing.

### 8. URL persistence (optional)

Mirror `ReviewsExplorer`'s `?q=…` pattern:
- On mount, read `URLSearchParams` and seed `searchTerm`.
- On `$effect`, push `?q=<term>` (or strip the param when empty) via `history.pushState`.

Useful if we ever want to share "what would my flowchart look like for these tags" links. **Skip in v1 unless free** — the page reload-rate on the flowchart is much lower than on `/reviews/` and there's no obvious sharing scenario today.

### 9. No-results state

When `matchedNodeIds.size === 0` *and* `matchedEdgeIds.size === 0`:

- The dim is technically applied to everything — the canvas turns into a wall of 20% blobs, which looks broken.
- Behaviour to ship: **don't** dim when zero matches. Show a "No matches" hint inside the search panel. Reasoning: the user gets a clear "your query found nothing", and the canvas stays usable while they refine it. Implementation: in the `$effect` that toggles `className`, special-case `matchedNodeIds.size === 0` → treat as `null` (no dim).

## Tasks

1. **Extend payload types** (`src/lib/flowchart-layout.ts`)
   - Add `searchHaystack: string` to `BookNodePayload`, `DecisionNodePayload`, and the edge `data` shape.
   - Populate them in the existing build loops (one line each).

2. **Add `<Panel>` import + search UI** (`src/components/islands/Flowchart.svelte`)
   - Import `Panel` from `@xyflow/svelte`.
   - Add `searchTerm`, `matchedNodeIds`, `matchedEdgeIds` (per §3).
   - Add the `$effect` that toggles `className` on each node + edge (per §4).
   - Add the `$effect` that shadows the dim onto edge labels (per §5).
   - Add the `<Panel>` markup inside the existing `<SvelteFlow>` (panels are children of SvelteFlow, alongside `<Background>`/`<Controls>`/`<MiniMap>`).

3. **CSS** (`src/styles/flowchart.css`)
   - Add the `.flowchart-dim` rule (nodes, edges, labels) plus the matching base-state `transition`.
   - Add `.flowchart-search` panel styling — slate surface, emerald focus ring, sized to ~360px wide on desktop, full-width-minus-margins on mobile.

4. **Keyboard polish (optional)** — `/` to focus, `Escape` to clear.

5. **URL persistence (optional)** — `?q=<term>`.

6. **Manual smoke**
   - Type `cradle` → Cradle book + every edge connecting to it stays bright; rest fades. Both label colours and book card visuals fade together.
   - Type `i will survive` (multi-word, edge label match) → that edge + both endpoints stay bright.
   - Type `xxxxxxxxxx` → "No matches" pill, nothing fades.
   - Clear with `×` → instant fade-back-up via the 150ms transition.
   - In dev mode: drag a node *while* a search is active → drag still works (no broken `bind:`), the dragged node retains its bright/dim state.
   - Reload → no flash of dimmed content (search starts empty).

## Out of scope

- Full-text search across review markdown bodies (would inflate the client bundle by hundreds of KB; `search_terms` frontmatter is the existing escape hatch).
- Autocomplete / typeahead (substring match is accurate enough for ~200 elements).
- Auto-`fitView` to matched subgraph (would fight with the user's current pan/zoom; revisit if requested).
- Highlighting *inside* matched book cards (e.g. yellow underline on the matching token) — would require restructuring `BookNode.svelte` and the cards already shimmer enough that further visual shouting is noise.
