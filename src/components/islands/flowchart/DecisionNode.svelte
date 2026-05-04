<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import type { DecisionFlowNode } from '../../../lib/flowchart-layout';

  let { data }: NodeProps<DecisionFlowNode> = $props();

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

<Handle type="target" position={Position.Top} />

<div class="decision-node" style={accentStyle}>
  <p class="decision-node__prompt">{data.prompt}</p>
</div>

<Handle type="source" position={Position.Bottom} />
