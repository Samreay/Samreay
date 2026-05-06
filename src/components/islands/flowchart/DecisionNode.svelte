<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import { getContext } from 'svelte';
  import type { DecisionFlowNode } from '../../../lib/flowchart-layout';

  let { id, data }: NodeProps<DecisionFlowNode> = $props();

  const getPulsingNodes = getContext<() => Set<string>>('pulsingNodes');
  const isPulsing = $derived(getPulsingNodes?.().has(id) ?? false);

  // `accent.line` is the Tailwind 500 hex resolved server-side. We use
  // it raw for the border and as a translucent overlay on the dark
  // gradient so coloured decisions read as more than a 2px ring.
  // Inline because xyflow doesn't expose a CSS-variable hook on the
  // node wrapper that survives its own scoped styles.
  const accentStyle = $derived(
    `border-color: ${data.accent.line};` +
      ` background:` +
      ` linear-gradient(135deg, ${data.accent.line}22 0%, ${data.accent.line}0a 100%),` +
      ` linear-gradient(135deg, #1f2937 0%, #111827 100%);`,
  );
</script>

<!--
  Four cardinal handles per node so `flowchart-layout.ts` can attach
  each edge to whichever side faces its other endpoint. With
  `ConnectionMode.Loose` on the parent `<SvelteFlow>` the same handle
  can serve as either source OR target end (so we don't have to ship
  eight handles per node), and the page-level CSS makes them invisible:
  `.svelte-flow__handle { opacity: 0; pointer-events: none; }`.
-->
<Handle type="source" position={Position.Top} id="top" />
<Handle type="source" position={Position.Right} id="right" />
<Handle type="source" position={Position.Bottom} id="bottom" />
<Handle type="source" position={Position.Left} id="left" />

<div
  class={['decision-node', data.size === 'large' && 'decision-node--large', isPulsing && 'decision-node--pulse']}
  style={`${accentStyle} --node-flash-color: ${data.accent.line};`}
>
  <p class="decision-node__prompt">{data.prompt}</p>
</div>
