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
    const zoom = isMobile ? 0.65 : 0.85;
    // Measure the actual rendered HUD height so the node centres in the
    // visible space above it, not in the full canvas. Convert screen pixels
    // to world units by dividing by zoom.
    const hudScreenPx = (document.querySelector('.quiz-hud') as HTMLElement | null)?.offsetHeight ?? 0;
    const cy = node.position.y + h / 2 + (hudScreenPx / 2) / zoom;
    setCenter(cx, cy, { zoom, duration: 1400 });
  });
</script>
