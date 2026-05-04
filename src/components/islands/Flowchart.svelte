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

  let {
    nodes: initialNodes,
    edges: initialEdges,
  }: {
    nodes: FlowNode[];
    edges: FlowEdge[];
  } = $props();

  // SvelteFlow drives nodes/edges via `bind:` — copy props into local
  // `$state` so the user can pan and the library can mutate selections
  // without us mutating frozen prop arrays.
  let nodes = $state<FlowNode[]>(initialNodes);
  let edges = $state<FlowEdge[]>(initialEdges);

  const nodeTypes = { book: BookNode, decision: DecisionNode };
</script>

<div class="flowchart-canvas">
  <SvelteFlow
    bind:nodes
    bind:edges
    {nodeTypes}
    colorMode="dark"
    fitView
    proOptions={{ hideAttribution: true }}
    minZoom={0.3}
    maxZoom={1.5}
    defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
    nodesConnectable={false}
    nodesDraggable={false}
    edgesReconnectable={false}
    elementsSelectable={false}
  >
    <Background />
    <MiniMap pannable zoomable />
    <Controls />
  </SvelteFlow>
</div>
