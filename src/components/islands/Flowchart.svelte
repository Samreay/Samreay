<script lang="ts">
  import {
    SvelteFlow,
    Background,
    Controls,
    MiniMap,
    Panel,
    ConnectionMode,
  } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';

  import BookNode from './flowchart/BookNode.svelte';
  import DecisionNode from './flowchart/DecisionNode.svelte';
  import OffsetLabelEdge from './flowchart/OffsetLabelEdge.svelte';
  import type { FlowNode, FlowEdge } from '../../lib/flowchart-layout';

  let {
    nodes: initialNodes,
    edges: initialEdges,
  }: {
    nodes: FlowNode[];
    edges: FlowEdge[];
  } = $props();

  // `import.meta.env.DEV` is replaced with a literal `true` / `false`
  // at build time by Vite. Keeping it as a `const` (not a prop, not
  // `$state`) is what lets Vite's static analysis tree-shake the
  // entire dev-only branch out of the production bundle — anything
  // inside `if (isDev) { ... }` or `{#if isDev}…{/if}` becomes
  // unreachable when the constant is `false` and gets dropped.
  const isDev = import.meta.env.DEV;

  // SvelteFlow drives nodes/edges via `bind:` — copy props into local
  // `$state` so the user can pan and the library can mutate selections
  // without us mutating frozen prop arrays.
  let nodes = $state<FlowNode[]>(initialNodes);
  let edges = $state<FlowEdge[]>(initialEdges);

  const nodeTypes = { book: BookNode, decision: DecisionNode };
  // Single custom edge type for every edge in the graph — its only job
  // is to position the label closer to the source than xyflow's
  // built-in midpoint default. See OffsetLabelEdge.svelte.
  const edgeTypes = { offsetLabel: OffsetLabelEdge };

  // ── Search ──────────────────────────────────────────────────────────
  // The user types into the Panel; we lowercase + tokenise once and
  // each node/edge keeps a pre-lowercased `searchHaystack` field built
  // server-side in `flowchart-layout.ts`. Substring + multi-word AND,
  // mirroring the semantics of `ReviewsExplorer.svelte` so the muscle
  // memory between `/reviews/` and the flowchart is identical.
  let searchTerm = $state('');
  let searchInputEl = $state<HTMLInputElement | null>(null);

  /**
   * `null` is the sentinel for "no active query" — we treat it
   * differently from an empty `Set`, because zero matches with an
   * active query should still leave the canvas un-dimmed (otherwise
   * the user is staring at a wall of 20%-opacity blobs while
   * refining the query, which looks broken).
   */
  const matchedNodeIds = $derived.by((): Set<string> | null => {
    const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;
    const out = new Set<string>();
    for (const node of nodes) {
      const hay =
        (node.data as { searchHaystack?: string }).searchHaystack ?? '';
      if (tokens.every((t) => hay.includes(t))) out.add(node.id);
    }
    return out;
  });

  const matchedEdgeIds = $derived.by((): Set<string> | null => {
    const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;
    const matchedNodes = matchedNodeIds!;
    const out = new Set<string>();
    for (const edge of edges) {
      const hay =
        (edge.data as { searchHaystack?: string } | undefined)?.searchHaystack ??
        '';
      const labelMatches = tokens.every((t) => hay.includes(t));
      // An edge stays bright if its OWN label matches OR if both
      // endpoints matched — otherwise a search like "cradle" would
      // keep the Cradle node bright with every connecting edge faded,
      // which reads as "node floating in disconnected space".
      const bothEndpointsMatch =
        matchedNodes.has(edge.source) && matchedNodes.has(edge.target);
      if (labelMatches || bothEndpointsMatch) out.add(edge.id);
    }
    return out;
  });

  /**
   * Whether ANY node or edge matched — drives the dim gate. We keep
   * dim active for matches against decisions and edge labels too so
   * the user can visually navigate the graph from a phrase they
   * remember from a decision question, not just a book title.
   * Zero-result queries leave the canvas un-dimmed (visual cliff
   * otherwise) and surface a "No matches" pill instead.
   */
  const totalMatches = $derived(
    (matchedNodeIds?.size ?? 0) + (matchedEdgeIds?.size ?? 0),
  );

  /**
   * Book-only count for the result pill. Decisions and edge labels
   * can match (and we keep them lit for navigation), but the user
   * is looking for *books* — a tally that includes "and 4 decision
   * pills also mention this word" is noise. Counts only nodes whose
   * `type === 'book'` so the pill reads as "books found".
   */
  const matchedBookCount = $derived.by(() => {
    if (matchedNodeIds === null) return 0;
    let n = 0;
    for (const node of nodes) {
      if (node.type === 'book' && matchedNodeIds.has(node.id)) n++;
    }
    return n;
  });

  /**
   * Toggle the `flowchart-dim` class on each node and the
   * `data.dim` flag on each edge so the matching CSS rule fades
   * non-matching elements to 20% opacity.
   *
   * Nodes vs edges use different update paths because xyflow stores
   * them differently:
   *
   *   - Nodes: REPLACE the entire `nodes` array. xyflow's
   *     `adoptUserNodes` (see
   *     `node_modules/@xyflow/system/dist/esm/index.js`) does a
   *     reference-equality check `userNode === internals.userNode`
   *     and skips re-spreading user fields onto the cached internal
   *     node when references match. Two complications make slot-
   *     mutation insufficient:
   *       1. Mutating `node.class = …` in place keeps the same
   *          reference, so checkEquality passes and the new class
   *          never reaches the DOM.
   *       2. Even REPLACING `nodes[i] = {...}` doesn't help on its
   *          own — Svelte 5's recursive $state proxy returns the
   *          SAME wrapper proxy for a given array slot regardless of
   *          how many times we replace the underlying object, so
   *          xyflow still sees identical references.
   *     The reliable path is to assign a fresh array via
   *     `nodes = nodes.map(...)`. That changes the array identity,
   *     re-triggers the `nodesInitialized` $derived inside xyflow,
   *     and inside that pass each individual node's userProxy is
   *     wrapped fresh — so checkEquality fails for the entries we
   *     spread and the new `class` is captured. Unchanged entries
   *     are returned by-reference from `.map`, so xyflow correctly
   *     skips re-spreading them.
   *
   *   - Edges: MUTATE `edge.data.dim` in place. Our custom
   *     `OffsetLabelEdge` reads it through Svelte 5's recursive
   *     $state proxy, which DOES intercept deep mutations because
   *     the consumer reads through the same proxy on every render.
   *     The dim class flows to both the path and the (portalled)
   *     label without going through xyflow's internal-node cache.
   *
   * The `if (changed)` guard on the node assignment is what stops
   * the effect from looping forever — on a stable search state no
   * node needs reassignment, no write happens, no rerun.
   *
   * Position is preserved across the spread because we forward the
   * existing `node.position` object reference, so any concurrent
   * dev-mode drag remains valid.
   */
  $effect(() => {
    const dimActive = matchedNodeIds !== null && totalMatches > 0;
    let changed = false;
    const nextNodes = nodes.map((node) => {
      const matched = !dimActive || matchedNodeIds!.has(node.id);
      const next = matched ? undefined : 'flowchart-dim';
      if (node.class === next) return node;
      changed = true;
      return { ...node, class: next };
    });
    if (changed) nodes = nextNodes;
    for (const edge of edges) {
      if (!edge.data) continue; // every edge has data set in flowchart-layout.ts
      const matched = !dimActive || matchedEdgeIds!.has(edge.id);
      const next = !matched;
      if (edge.data.dim !== next) edge.data.dim = next;
    }
  });

  /**
   * Keyboard polish, lifted from `ReviewsExplorer.svelte`'s clipboard
   * shortcut pattern: `/` focuses the search box (unless already in an
   * input/textarea), `Escape` clears the term and blurs. Cheap to add
   * and matches the muscle memory the reviews page already trains.
   */
  $effect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (e.key === '/' && !inField) {
        e.preventDefault();
        searchInputEl?.focus();
      } else if (e.key === 'Escape' && target === searchInputEl) {
        searchTerm = '';
        searchInputEl?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Initial viewport: zoom 1, world origin (0, 0) — where `d_start` is
  // pinned in `flowchart.ts` — placed at the visual centre of the
  // canvas. xyflow's `Viewport.x/y` are *translation* offsets in screen
  // pixels (a node at world (wx, wy) renders at screen (wx*zoom + x,
  // wy*zoom + y)), so to centre world (0, 0) we set x/y to half the
  // canvas dimensions. We have to measure the container before
  // SvelteFlow mounts because `initialViewport` is read once at startup
  // and never re-read; binding to the parent div's `clientWidth` /
  // `clientHeight` and gating the SvelteFlow render on a non-zero size
  // gives us the right values on first paint without a flash of the
  // wrong translation.
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);

  // ── Dev-only authoring state ─────────────────────────────────────────
  // Everything below this line that touches `savedPositions`,
  // `saveStatus`, the toolbar markup, etc. is gated by `isDev`. In
  // production `isDev` is the literal `false`, so the branches are
  // dead code and Vite drops them.

  // Snapshot of the positions currently on disk. Updated after a
  // successful Save so dirty-tracking can reset to "no unsaved changes"
  // without having to re-fetch the JSON file. Reading `initialNodes`
  // here is intentional — we want exactly the positions that were
  // passed in at mount; the island is `client:only` and the prop never
  // changes after that.
  // svelte-ignore state_referenced_locally
  let savedPositions = $state<Map<string, { x: number; y: number }>>(
    isDev
      ? new Map(
          initialNodes.map((n) => [
            n.id,
            { x: n.position.x, y: n.position.y },
          ]),
        )
      : new Map(),
  );

  type SaveStatus =
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved' }
    | { kind: 'error'; message: string };
  let saveStatus = $state<SaveStatus>({ kind: 'idle' });

  // Number of nodes whose live position differs from the on-disk
  // snapshot. Reactive via `$derived` so dragging a node updates the
  // pill in real time.
  const dirtyCount = $derived.by(() => {
    if (!isDev) return 0;
    let n = 0;
    for (const node of nodes) {
      const saved = savedPositions.get(node.id);
      if (!saved) {
        n++;
        continue;
      }
      if (saved.x !== node.position.x || saved.y !== node.position.y) n++;
    }
    return n;
  });

  // What the status pill renders. `saving` and `error` outrank dirty
  // count (in-flight states), then "N unsaved" if anything's dirty,
  // then "Saved" as the resting state.
  type PillTone = 'clean' | 'dirty' | 'saving' | 'error';
  const pill = $derived.by((): { text: string; tone: PillTone } => {
    if (saveStatus.kind === 'saving') return { text: 'Saving...', tone: 'saving' };
    if (saveStatus.kind === 'error') {
      return { text: `Save failed: ${saveStatus.message}`, tone: 'error' };
    }
    if (dirtyCount > 0) {
      return { text: `${dirtyCount} unsaved`, tone: 'dirty' };
    }
    return { text: 'Saved', tone: 'clean' };
  });

  async function postPositions(refine: boolean): Promise<boolean> {
    if (!isDev) return false;
    saveStatus = { kind: 'saving' };
    const positions: Record<string, { x: number; y: number }> = {};
    for (const node of nodes) {
      positions[node.id] = { x: node.position.x, y: node.position.y };
    }
    try {
      const res = await fetch('/api/flowchart-positions.json', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ positions, refine }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ''}`);
      }
      // Snapshot the freshly-saved positions so dirtyCount falls to 0.
      // (For `refine: true` the relax pass may have nudged them again
      // server-side, but the user will see the cleaned-up positions
      // after the page reload that follows; meanwhile the local map
      // matches what we just sent, which is the right resting state
      // for the toolbar.)
      const next = new Map<string, { x: number; y: number }>();
      for (const node of nodes) {
        next.set(node.id, { x: node.position.x, y: node.position.y });
      }
      savedPositions = next;
      saveStatus = { kind: 'saved' };
      setTimeout(() => {
        if (saveStatus.kind === 'saved') saveStatus = { kind: 'idle' };
      }, 2000);
      return true;
    } catch (err) {
      saveStatus = { kind: 'error', message: (err as Error).message };
      return false;
    }
  }

  const save = (): Promise<boolean> => postPositions(false);

  async function saveAndRefine(): Promise<void> {
    const ok = await postPositions(true);
    // The relax pass mutates positions on disk — reload so we re-read
    // the cleaned-up cache and the user sees the new layout.
    if (ok) window.location.reload();
  }

  // Reset: nuke the on-disk cache server-side and re-run the full ELK
  // + sporeOverlap + Verlet pipeline from scratch. Destructive — wipes
  // every hand-tuned position, including any unsaved drags — so we
  // gate it behind a `window.confirm` instead of a silent click. After
  // the server finishes the relayout we reload so the page picks up
  // the freshly-computed positions; the on-mount snapshot below
  // becomes the new clean baseline.
  async function reset(): Promise<void> {
    if (!isDev) return;
    const dirtyNote =
      dirtyCount > 0
        ? ` This will also wipe ${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'}.`
        : '';
    const confirmed = window.confirm(
      `Reset every node position to a fresh ELK + relax layout?` +
        `${dirtyNote} This can't be undone.`,
    );
    if (!confirmed) return;
    saveStatus = { kind: 'saving' };
    try {
      const res = await fetch('/api/flowchart-positions.json', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ''}`);
      }
      window.location.reload();
    } catch (err) {
      saveStatus = { kind: 'error', message: (err as Error).message };
    }
  }

  function discard(): void {
    if (!isDev) return;
    // In-place mutation through the $state proxy — same path xyflow
    // itself uses during a drag. Replacing the array would also work
    // but would force SvelteFlow to remount every node.
    for (const node of nodes) {
      const saved = savedPositions.get(node.id);
      if (saved) {
        node.position.x = saved.x;
        node.position.y = saved.y;
      }
    }
  }
</script>

<div
  class="flowchart-canvas"
  bind:clientWidth={canvasWidth}
  bind:clientHeight={canvasHeight}
>
  {#if canvasWidth > 0 && canvasHeight > 0}
    <SvelteFlow
      bind:nodes
      bind:edges
      {nodeTypes}
      {edgeTypes}
      colorMode="dark"
      initialViewport={{ x: canvasWidth / 2, y: canvasHeight / 2, zoom: 0.7 }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.05}
      maxZoom={2}
      defaultEdgeOptions={{ animated: false }}
      nodesConnectable={false}
      nodesDraggable={isDev}
      edgesReconnectable={false}
      elementsSelectable={isDev}
      connectionMode={ConnectionMode.Loose}
    >
      <Background />
      <MiniMap pannable zoomable />
      <Controls />
      <!--
        Search lives inside the SvelteFlow viewport via xyflow's
        `<Panel>`. Top-centre slot is free: dev toolbar owns
        top-left, MiniMap owns top-right. Panel is built into both
        production and dev — it's a user-facing feature, not
        authoring chrome.

        Styling mirrors the search row on `/reviews/` (see
        `ReviewsExplorer.svelte`): `bg-gray-800` input, `bg-gray-700
        hover:bg-main-700` accessory button, `text-gray-100` text.
        The match-count pill borrows the same vocabulary so the
        whole row reads as one element of the existing site
        language, not a foreign canvas overlay.
      -->
      <Panel position="top-center" class="flowchart-search">
        <input
          bind:this={searchInputEl}
          bind:value={searchTerm}
          type="search"
          class="bg-gray-800 rounded-md text-gray-100 m-2 px-3 py-2"
          placeholder="Search... (press /)"
          aria-label="Search the flowchart"
          autocomplete="off"
          spellcheck="false"
        />
        {#if searchTerm}
          {#if totalMatches > 0}
            <span
              class="inline-flex items-center m-2 px-3 py-2 bg-gray-700 rounded-md text-gray-100"
              aria-live="polite"
            >
              {matchedBookCount} book{matchedBookCount === 1 ? '' : 's'}
            </span>
          {:else}
            <span
              class="inline-flex items-center m-2 px-3 py-2 bg-red-900 rounded-md text-red-100"
              aria-live="polite"
            >
              No matches
            </span>
          {/if}
          <button
            type="button"
            class="inline-flex items-center m-2 px-3 py-2 bg-gray-700 hover:bg-main-700 rounded-md cursor-pointer text-gray-100"
            onclick={() => {
              searchTerm = '';
              searchInputEl?.focus();
            }}
            aria-label="Clear search"
          >
            Clear
          </button>
        {/if}
      </Panel>
    </SvelteFlow>
  {/if}

  {#if isDev}
    <!--
      Dev-mode authoring toolbar. Top-left corner so it doesn't fight
      xyflow's MiniMap (top-right) or Controls (bottom-left).
    -->
    <div class="dev-toolbar" role="toolbar" aria-label="Flowchart authoring toolbar">
      <span class="dev-toolbar__pill" data-tone={pill.tone} aria-live="polite">
        {pill.text}
      </span>
      <button
        type="button"
        class="dev-toolbar__btn"
        onclick={save}
        disabled={dirtyCount === 0 || saveStatus.kind === 'saving'}
        aria-label="Save current node positions to disk"
      >
        Save
      </button>
      <button
        type="button"
        class="dev-toolbar__btn"
        onclick={saveAndRefine}
        disabled={dirtyCount === 0 || saveStatus.kind === 'saving'}
        aria-label="Save positions and run physics refinement"
      >
        Save & Refine
      </button>
      <button
        type="button"
        class="dev-toolbar__btn dev-toolbar__btn--danger"
        onclick={reset}
        disabled={saveStatus.kind === 'saving'}
        aria-label="Wipe the positions cache and re-run the full layout pipeline from scratch"
      >
        Reset
      </button>
      <button
        type="button"
        class="dev-toolbar__btn dev-toolbar__btn--ghost"
        onclick={discard}
        disabled={dirtyCount === 0 || saveStatus.kind === 'saving'}
        aria-label="Discard unsaved drags and revert to last saved positions"
      >
        Discard
      </button>
    </div>
  {/if}
</div>

<style>
  .flowchart-canvas {
    position: relative;
  }

  .dev-toolbar {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid #10b981;
    border-radius: 6px;
    color: #e5e7eb;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
      'Courier New', monospace;
    font-size: 11px;
    line-height: 1;
    backdrop-filter: blur(4px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  }

  .dev-toolbar__pill {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 999px;
    font-weight: 600;
    color: #0f172a;
    white-space: nowrap;
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dev-toolbar__pill[data-tone='clean']  { background: #34d399; }
  .dev-toolbar__pill[data-tone='dirty']  { background: #fbbf24; }
  .dev-toolbar__pill[data-tone='saving'] { background: #60a5fa; }
  .dev-toolbar__pill[data-tone='error']  { background: #f87171; color: #1f2937; }

  .dev-toolbar__btn {
    appearance: none;
    background: #10b981;
    color: #0f172a;
    border: 1px solid #10b981;
    border-radius: 4px;
    padding: 4px 8px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.1s ease, opacity 0.1s ease;
  }
  .dev-toolbar__btn:hover:not(:disabled) {
    background: #34d399;
  }
  .dev-toolbar__btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .dev-toolbar__btn--ghost {
    background: transparent;
    color: #fca5a5;
    border-color: #b91c1c;
  }
  .dev-toolbar__btn--ghost:hover:not(:disabled) {
    background: rgba(185, 28, 28, 0.25);
    color: #fecaca;
  }
  /* Solid-red destructive variant — louder than the ghost "Discard"
     because Reset wipes the on-disk cache, not just unsaved drags. */
  .dev-toolbar__btn--danger {
    background: #b91c1c;
    color: #fef2f2;
    border-color: #b91c1c;
  }
  .dev-toolbar__btn--danger:hover:not(:disabled) {
    background: #dc2626;
    border-color: #dc2626;
  }
</style>
