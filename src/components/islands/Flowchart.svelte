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
  import { setContext, onDestroy, tick } from 'svelte';

  import BookNode from './flowchart/BookNode.svelte';
  import DecisionNode from './flowchart/DecisionNode.svelte';
  import QuizNavigator from './flowchart/QuizNavigator.svelte';
  import OffsetLabelEdge from './flowchart/OffsetLabelEdge.svelte';
  import type { FlowNode, FlowEdge, BookNodePayload, DecisionNodePayload } from '../../lib/flowchart-layout';
  import { RelaxSimulator } from '../../lib/flowchart-relax';
  import type { EdgeSpec } from '../../lib/flowchart-relax';

  let {
    nodes: initialNodes,
    edges: initialEdges,
  }: {
    nodes: FlowNode[];
    edges: FlowEdge[];
  } = $props();

  // ── Pulse wave animation ─────────────────────────────────────────────
  // Emits glowing dots from d_start that travel along edges at a fixed
  // world-space velocity, split at each node, and traverse the full
  // graph. One wave every 12 seconds.
  //
  // Velocity is in world-px per ms. Duration per edge is derived from
  // the straight-line source→target distance so longer edges take
  // proportionally longer to traverse, giving a constant apparent speed.
  // Uses the same in-place edge.data mutation pattern as `data.dim` so
  // OffsetLabelEdge reads it reactively without needing a full nodes
  // array replacement.

  // px/ms at zoom=1. At the default 0.3 zoom the dot appears to move at
  // PULSE_VELOCITY * 0.3 screen-px/ms = ~60 screen-px/s — slow, subtle.
  const PULSE_VELOCITY = 0.20; // world-px / ms

  // Static topology — built once from the prop arrays at mount time,
  // never mutated. Plain Maps (not $state) because the rAF loop reads
  // them every frame and reactivity would be wasted overhead.
  const _outEdgeIds = new Map<string, string[]>(); // nodeId → edgeIds leaving it
  const _edgeById = new Map<string, FlowEdge>();   // edgeId → edge object
  const _edgeTarget = new Map<string, string>();   // edgeId → target nodeId
  const _edgeDuration = new Map<string, number>(); // edgeId → ms to traverse

  // Node centre positions for Euclidean distance calculation.
  const _nodePos = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const node of initialNodes) {
    _nodePos.set(node.id, {
      x: node.position.x,
      y: node.position.y,
      w: node.width ?? 320,
      h: node.height ?? 90,
    });
  }

  for (const edge of initialEdges) {
    _edgeById.set(edge.id, edge);
    _edgeTarget.set(edge.id, edge.target);
    const list = _outEdgeIds.get(edge.source);
    if (list) list.push(edge.id);
    else _outEdgeIds.set(edge.source, [edge.id]);

    // Duration = Euclidean centre-to-centre distance / velocity.
    const s = _nodePos.get(edge.source);
    const t = _nodePos.get(edge.target);
    const dist = s && t
      ? Math.hypot((t.x + t.w / 2) - (s.x + s.w / 2), (t.y + t.h / 2) - (s.y + s.h / 2))
      : 500;
    _edgeDuration.set(edge.id, Math.max(300, dist / PULSE_VELOCITY));
  }

  interface PulseInstance {
    edgeId: string;
    startTime: number;
    duration: number;
  }

  // Active pulses — mutated per-frame, NOT $state.
  const _activePulses = new Map<string, PulseInstance>();

  // Node flash set IS $state so DecisionNode/BookNode re-render on change.
  let pulsingNodeIds = $state(new Set<string>());

  // Provide as a getter so nodes always read the current $state value via
  // a stable function reference (avoids stale captures in getContext).
  setContext<() => Set<string>>('pulsingNodes', () => pulsingNodeIds);

  let _pulseRafId: number | null = null;

  function _spawnPulsesFrom(nodeId: string, now: number): void {
    for (const edgeId of _outEdgeIds.get(nodeId) ?? []) {
      if (!_activePulses.has(edgeId)) {
        const duration = _edgeDuration.get(edgeId) ?? 1500;
        _activePulses.set(edgeId, { edgeId, startTime: now, duration });
      }
    }
  }

  function _pulseFrame(now: number): void {
    const completed: string[] = [];

    for (const [edgeId, pulse] of _activePulses) {
      const progress = Math.min(1, (now - pulse.startTime) / pulse.duration);
      const edge = _edgeById.get(edgeId);
      if (edge?.data) edge.data.pulseProgress = progress;
      if (progress >= 1) completed.push(edgeId);
    }

    for (const edgeId of completed) {
      const edge = _edgeById.get(edgeId);
      if (edge?.data) edge.data.pulseProgress = undefined;
      _activePulses.delete(edgeId);

      const targetId = _edgeTarget.get(edgeId);
      if (!targetId) continue;

      // Flash the node the pulse just reached.
      pulsingNodeIds = new Set([...pulsingNodeIds, targetId]);
      setTimeout(() => {
        pulsingNodeIds = new Set([...pulsingNodeIds].filter((id) => id !== targetId));
      }, 700);

      // Propagate outward from the target node.
      _spawnPulsesFrom(targetId, now);
    }

    if (_activePulses.size > 0) {
      _pulseRafId = requestAnimationFrame(_pulseFrame);
    } else {
      _pulseRafId = null;
    }
  }

  function _launchWave(): void {
    const now = performance.now();
    _spawnPulsesFrom('d_start', now);
    if (_pulseRafId === null) {
      _pulseRafId = requestAnimationFrame(_pulseFrame);
    }
  }

  // Fire immediately on mount, then repeat every 12 seconds.
  if (typeof window !== 'undefined') {
    setTimeout(_launchWave, 800); // slight delay so the page has settled
    const _pulseIntervalId = setInterval(_launchWave, 8000);
    onDestroy(() => {
      clearInterval(_pulseIntervalId);
      if (_pulseRafId !== null) cancelAnimationFrame(_pulseRafId);
    });
  }

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

  // Overlay of positions captured from onnodedragstop events. xyflow mutates
  // node.position in place during drag without going through Svelte's proxy,
  // so we capture the true post-drag position here and read it back in
  // postPositions rather than relying on the stale `nodes` $state.
  const _draggedPositions = new Map<string, { x: number; y: number }>();

  const nodeTypes = { book: BookNode, decision: DecisionNode };
  // Single custom edge type for every edge in the graph — its only job
  // is to position the label closer to the source than xyflow's
  // built-in midpoint default. See OffsetLabelEdge.svelte.
  const edgeTypes = { offsetLabel: OffsetLabelEdge };

  // ── Quiz Mode ────────────────────────────────────────────────────────
  // A guided single-step walk through the graph. The user picks one answer
  // at a time; the camera pans to each node; chosen edges glow. Ends when
  // a book node is reached.

  // flyTo is provided by QuizNavigator (a child of <SvelteFlow> that can
  // call useSvelteFlow()). We register the implementation via context so
  // the parent never calls xyflow hooks at the top level.
  let _flyToImpl: ((nodeId: string) => void) | null = null;
  setContext<(fn: (nodeId: string) => void) => void>('registerFlyTo', (fn) => {
    _flyToImpl = fn;
  });

  // Known node id set — used to sanitise the ?path= URL parameter.
  const _knownNodeIds = new Set(initialNodes.map((n) => n.id));

  let quizMode = $state(false);
  // Ordered list of node ids visited so far, starting from 'd_start'.
  let quizPath = $state<string[]>([]);
  let quizPanDisabled = $state(false);

  const quizCurrentNodeId = $derived(quizPath.at(-1) ?? 'd_start');

  const quizCurrentNode = $derived(
    nodes.find((n) => n.id === quizCurrentNodeId) ?? null,
  );

  const quizCurrentIsBook = $derived(
    quizCurrentNode?.type === 'book',
  );

  // The outgoing edges from the current decision node — shown as HUD buttons.
  const quizChoices = $derived.by(() => {
    if (!quizMode || quizCurrentIsBook) return [];
    return edges.filter((e) => e.source === quizCurrentNodeId);
  });

  // The book data for the result overlay.
  const quizBookData = $derived.by((): BookNodePayload | null => {
    if (!quizCurrentIsBook || !quizCurrentNode) return null;
    return quizCurrentNode.data as BookNodePayload;
  });

  function _flyToNode(nodeId: string): void {
    _flyToImpl?.(nodeId);
  }

  function _clearQuizTrail(): void {
    for (const edge of edges) {
      if (edge.data?.quizTrail) edge.data.quizTrail = false;
    }
  }

  function _restoreTrailFromPath(path: string[]): void {
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];
      const edge = edges.find((e) => e.source === from && e.target === to);
      if (edge?.data) edge.data.quizTrail = true;
    }
  }

  function _updateUrl(path: string[]): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (path.length > 0) {
      url.searchParams.set('path', path.join(','));
    } else {
      url.searchParams.delete('path');
    }
    history.replaceState(null, '', url.toString());
  }

  function enterQuiz(): void {
    quizMode = true;
    quizPanDisabled = true;
    // Pause the ambient pulse wave.
    if (_pulseRafId !== null) {
      cancelAnimationFrame(_pulseRafId);
      _pulseRafId = null;
    }
    _activePulses.clear();
    // Clear any stale pulse progress from edges.
    for (const edge of edges) {
      if (edge.data) edge.data.pulseProgress = undefined;
    }
    quizPath = ['d_start'];
    _updateUrl(quizPath);
    // Wait one tick for Svelte to process the state change, then fly.
    tick().then(() => _flyToNode('d_start'));
  }

  function exitQuiz(): void {
    quizMode = false;
    quizPanDisabled = false;
    _clearQuizTrail();
    quizPath = [];
    _updateUrl([]);
    // Restart the pulse wave.
    if (typeof window !== 'undefined') {
      setTimeout(_launchWave, 400);
    }
  }

  function chooseAnswer(edgeId: string): void {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;
    if (edge.data) edge.data.quizTrail = true;
    quizPath = [...quizPath, edge.target];
    _updateUrl(quizPath);
    tick().then(() => _flyToNode(edge.target));
  }

  function restartQuiz(): void {
    _clearQuizTrail();
    quizPath = ['d_start'];
    _updateUrl(quizPath);
    tick().then(() => _flyToNode('d_start'));
  }

  // Provide enterQuiz via context so QuizStartNode can call it.
  setContext<() => void>('enterQuiz', enterQuiz);

  // Restore quiz state from ?path= URL on mount.
  if (typeof window !== 'undefined') {
    const urlPath = new URL(window.location.href).searchParams.get('path');
    if (urlPath) {
      const ids = urlPath.split(',').filter((id) => _knownNodeIds.has(id));
      if (ids.length > 0) {
        // Defer until after xyflow mounts so setCenter is available.
        setTimeout(() => {
          quizMode = true;
          quizPanDisabled = true;
          quizPath = ids;
          _restoreTrailFromPath(ids);
          tick().then(() => _flyToNode(ids.at(-1)!));
        }, 900);
      }
    }
  }

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
  const isMobile = $derived(canvasWidth > 0 && canvasWidth < 768);

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
  // SvelteFlow mutates node.position in place during drag, which bypasses
  // Svelte's reactivity proxy. Track drag-dirtiness via an explicit counter
  // incremented from onnodedragstop, and combine it with the derived check
  // so the Save button enables correctly after both drags and sim runs.
  let _dragDirtyCount = $state(0);

  const dirtyCount = $derived.by(() => {
    if (!isDev) return 0;
    if (_dragDirtyCount > 0) return _dragDirtyCount;
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
    // Merge dragged positions (captured in onnodedragstop) over the nodes
    // $state — xyflow mutates position in place during drag without going
    // through Svelte's proxy, so `nodes` may be stale for dragged nodes.
    const positions: Record<string, { x: number; y: number }> = {};
    for (const node of nodes) {
      const dragged = _draggedPositions.get(node.id);
      positions[node.id] = dragged ?? { x: node.position.x, y: node.position.y };
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
        const dragged = _draggedPositions.get(node.id);
        next.set(node.id, dragged ?? { x: node.position.x, y: node.position.y });
      }
      savedPositions = next;
      _draggedPositions.clear();
      _dragDirtyCount = 0;
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
    nodes = nodes.map((node) => {
      const saved = savedPositions.get(node.id);
      if (!saved) return node;
      if (node.position.x === saved.x && node.position.y === saved.y) return node;
      return { ...node, position: { x: saved.x, y: saved.y } };
    });
    _draggedPositions.clear();
    _dragDirtyCount = 0;
  }

  // ── Simulate ─────────────────────────────────────────────────────────
  // Runs the physics relaxation in-browser, one step per rAF frame.
  // The simulator mutates a private `positions` Map; each frame we
  // write those positions back to the `nodes` array so xyflow re-renders.
  // "Pause" stops the rAF loop while leaving positions in place (safe to
  // Save or drag at that point). "Stop" reverts to the pre-sim snapshot.

  type SimState = 'idle' | 'running' | 'paused';
  let simState = $state<SimState>('idle');
  let simIter = $state(0);
  let simCost = $state(0);

  // Private sim bookkeeping — not reactive, mutated per-frame.
  let _sim: RelaxSimulator | null = null;
  let _simRafId: number | null = null;
  // Snapshot taken when simulation starts so "Stop" can fully revert.
  let _simStartPositions: Map<string, { x: number; y: number }> | null = null;

  function _buildSimulator(): RelaxSimulator {
    const positions = new Map<string, { x: number; y: number }>();
    const sizes = new Map<string, { w: number; h: number }>();
    for (const node of nodes) {
      positions.set(node.id, { x: node.position.x, y: node.position.y });
      sizes.set(node.id, { w: node.width ?? 320, h: node.height ?? 90 });
    }
    const edgeSpecs: EdgeSpec[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      pathType: e.data?.pathType ?? 'bezier',
      label: typeof e.label === 'string' ? e.label : undefined,
    }));
    // Pin d_start plus any node that has a `pinned` coord — we can
    // detect pinned nodes by checking if their position matches the
    // initialNodes prop (they never move regardless of sim).
    const pinnedIds = new Set<string>(['d_start']);
    return new RelaxSimulator({ positions, sizes, edges: edgeSpecs, pinnedIds });
  }

  function _applySimPositions(): void {
    if (!_sim) return;
    // Must replace the array with nodes = nodes.map(...) rather than
    // mutating in place. xyflow's adoptUserNodes does reference-equality
    // on userNode === internals.userNode and skips re-spreading when
    // references match. Svelte 5's $state proxy returns the SAME wrapper
    // for a given slot, so even slot-replacement doesn't break equality.
    // A fresh array forces xyflow to rewrap every entry, and returning
    // the same node object for unchanged positions lets it correctly
    // skip those (same object reference → no DOM update needed).
    let changed = false;
    const next = nodes.map((node) => {
      const p = _sim!.positions.get(node.id);
      if (!p) return node;
      if (node.position.x === p.x && node.position.y === p.y) return node;
      changed = true;
      return { ...node, position: { x: p.x, y: p.y } };
    });
    if (changed) nodes = next;
  }

  function _simFrame(): void {
    if (!_sim || simState !== 'running') return;
    // Run several steps per frame so the animation is snappy even on
    // large graphs (one physics step takes ~5ms for 250 nodes).
    const STEPS_PER_FRAME = 5;
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      const result = _sim.step();
      simIter = result.iter;
      if (result.newBestCost !== undefined) simCost = result.newBestCost;
      if (result.converged) {
        simState = 'paused';
        _applySimPositions();
        return;
      }
    }
    _applySimPositions();
    _simRafId = requestAnimationFrame(_simFrame);
  }

  function startSim(): void {
    if (!isDev) return;
    if (simState === 'idle') {
      _simStartPositions = new Map(
        nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }]),
      );
      _sim = _buildSimulator();
      simIter = 0;
      simCost = _sim.currentBestCost;
    } else if (simState === 'paused' && _sim) {
      // Sync any dragged node positions into the simulator before resuming.
      for (const node of nodes) {
        const p = _sim.positions.get(node.id);
        if (p) { p.x = node.position.x; p.y = node.position.y; }
      }
    }
    simState = 'running';
    _simRafId = requestAnimationFrame(_simFrame);
  }

  function pauseSim(): void {
    if (simState !== 'running') return;
    simState = 'paused';
    if (_simRafId !== null) {
      cancelAnimationFrame(_simRafId);
      _simRafId = null;
    }
  }

  function stopSim(): void {
    if (_simRafId !== null) {
      cancelAnimationFrame(_simRafId);
      _simRafId = null;
    }
    if (_simStartPositions) {
      const snap = _simStartPositions;
      nodes = nodes.map((node) => {
        const p = snap.get(node.id);
        if (!p) return node;
        if (node.position.x === p.x && node.position.y === p.y) return node;
        return { ...node, position: { x: p.x, y: p.y } };
      });
    }
    _sim = null;
    _simStartPositions = null;
    simState = 'idle';
    simIter = 0;
    simCost = 0;
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
      initialViewport={{ x: canvasWidth / 2, y: canvasHeight / 2, zoom: 0.3 }}
      proOptions={{ hideAttribution: true }}
      minZoom={isMobile ? 0.12 : 0.05}
      maxZoom={2}
      defaultEdgeOptions={{ animated: false }}
      nodesConnectable={false}
      nodesDraggable={isDev && !quizPanDisabled}
      onnodedragstop={({ node }) => { if (isDev) { _draggedPositions.set(node.id, { x: node.position.x, y: node.position.y }); _dragDirtyCount++; } }}
      edgesReconnectable={false}
      elementsSelectable={isDev && !quizPanDisabled}
      panOnDrag={!quizPanDisabled}
      zoomOnScroll={!quizPanDisabled}
      zoomOnPinch={!quizPanDisabled}
      zoomOnDoubleClick={!quizPanDisabled}
      panOnScroll={false}
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
      <QuizNavigator isMobile={isMobile} />

      {#if !quizMode}
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
      {/if}
    </SvelteFlow>
  {/if}

  <!-- ── Quiz Mode HUD ── -->
  {#if quizMode && !quizCurrentIsBook}
    <div class="quiz-hud" role="region" aria-label="Quiz choices">
      <button
        type="button"
        class="quiz-hud__exit"
        onclick={exitQuiz}
        aria-label="Exit quiz mode"
      >
        ✕ Exit
      </button>
      <p class="quiz-hud__question">
        {(quizCurrentNode?.data as DecisionNodePayload | null)?.prompt ?? ''}
      </p>
      <div class="quiz-hud__choices">
        {#each quizChoices as edge (edge.id)}
          <button
            type="button"
            class="quiz-hud__choice"
            style="--choice-color: {edge.data?.lineColor ?? '#059669'};"
            onclick={() => chooseAnswer(edge.id)}
            aria-label={String(edge.label ?? edge.id)}
          >
            {edge.label ?? '→'}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Quiz Result Overlay ── -->
  {#if quizMode && quizCurrentIsBook && quizBookData}
    <div class="quiz-result" role="dialog" aria-label="Book recommendation result" aria-modal="true">
      <div class="quiz-result__card">
        <p class="quiz-result__label">Your next read is...</p>
        <div class="quiz-result__book">
          <img
            class="quiz-result__cover"
            src={quizBookData.cover.src}
            width={quizBookData.cover.width}
            height={quizBookData.cover.height}
            alt={quizBookData.title}
          />
          <div class="quiz-result__info">
            <h2 class="quiz-result__title">{quizBookData.title}</h2>
            <p class="quiz-result__sentence">{quizBookData.sentence}</p>
            <ul class="quiz-result__tags">
              {#each quizBookData.tags as tag (tag)}
                <li class="quiz-result__tag tag-{tag}">{tag}</li>
              {/each}
            </ul>
          </div>
        </div>
        <div class="quiz-result__actions">
          <a
            href={quizBookData.link}
            class="quiz-result__btn quiz-result__btn--primary"
          >
            View Review →
          </a>
          <button
            type="button"
            class="quiz-result__btn quiz-result__btn--secondary"
            onclick={restartQuiz}
          >
            Start Over
          </button>
          <button
            type="button"
            class="quiz-result__btn quiz-result__btn--ghost"
            onclick={exitQuiz}
          >
            Explore Map
          </button>
        </div>
        <div class="quiz-result__share">
          <button
            type="button"
            class="quiz-result__share-btn"
            onclick={() => {
              navigator.clipboard?.writeText(window.location.href);
            }}
            aria-label="Copy shareable link"
          >
            🔗 Copy link
          </button>
        </div>
      </div>
    </div>
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
      <span class="dev-toolbar__sep" aria-hidden="true"></span>
      {#if simState === 'idle'}
        <button
          type="button"
          class="dev-toolbar__btn dev-toolbar__btn--sim"
          onclick={startSim}
          aria-label="Start live physics simulation"
        >
          Simulate
        </button>
      {:else if simState === 'running'}
        <button
          type="button"
          class="dev-toolbar__btn dev-toolbar__btn--sim"
          onclick={pauseSim}
          aria-label="Pause physics simulation"
        >
          Pause
        </button>
        <span class="dev-toolbar__pill" data-tone="saving" aria-live="polite">
          iter {simIter}
        </span>
      {:else}
        <button
          type="button"
          class="dev-toolbar__btn dev-toolbar__btn--sim"
          onclick={startSim}
          aria-label="Resume physics simulation"
        >
          Resume
        </button>
        <button
          type="button"
          class="dev-toolbar__btn dev-toolbar__btn--ghost"
          onclick={stopSim}
          aria-label="Stop simulation and revert positions"
        >
          Stop sim
        </button>
        <span class="dev-toolbar__pill" data-tone="dirty" aria-live="polite">
          cost {simCost.toFixed(0)}
        </span>
      {/if}
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
  .dev-toolbar__sep {
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.2);
    align-self: center;
  }

  .dev-toolbar__btn--sim {
    background: #6366f1;
    color: #eef2ff;
    border-color: #6366f1;
  }
  .dev-toolbar__btn--sim:hover:not(:disabled) {
    background: #818cf8;
    border-color: #818cf8;
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
