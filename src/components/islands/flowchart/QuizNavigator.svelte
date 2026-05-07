<script lang="ts">
  import { getContext } from 'svelte';
  import { useSvelteFlow } from '@xyflow/svelte';

  let { isMobile }: { isMobile: boolean } = $props();

  const { setCenter, getNode } = useSvelteFlow();

  // Called by the parent to register our flyTo implementation. The parent
  // stores the function reference and calls it whenever quiz navigation needs
  // to pan the camera. We must be inside <SvelteFlow> to call useSvelteFlow().
  const registerFlyTo = getContext<(fn: (nodeId: string) => void) => void>('registerFlyTo');

  registerFlyTo((nodeId: string) => {
    const node = getNode(nodeId);
    if (!node) return;
    const w = node.measured?.width ?? node.width ?? 320;
    const h = node.measured?.height ?? node.height ?? 90;
    const cx = node.position.x + w / 2;
    // Offset the vertical centre upward so the HUD doesn't obscure the node.
    const hudOffset = isMobile ? 80 : 40;
    const cy = node.position.y + h / 2 - hudOffset;
    setCenter(cx, cy, { zoom: isMobile ? 0.7 : 0.85, duration: 1400 });
  });
</script>
