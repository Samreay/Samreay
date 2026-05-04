<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import type { DecisionFlowNode } from '../../../lib/flowchart-layout';

  let { data }: NodeProps<DecisionFlowNode> = $props();
</script>

<Handle type="target" position={Position.Top} />

<div class="decision-node">
  <p class="decision-node__prompt">{data.prompt}</p>
</div>

<Handle type="source" position={Position.Bottom} />
