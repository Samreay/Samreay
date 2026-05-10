<script lang="ts">
  import { getContext } from 'svelte';
  import { useSvelteFlow } from '@xyflow/svelte';
  import { getViewportForBounds } from '@xyflow/system';

  let { isMobile }: { isMobile: boolean } = $props();

  const { setCenter, getNode, setViewport } = useSvelteFlow();

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

  // Fit all specified nodes into view. Single-node case uses setCenter at a
  // comfortable zoom; multiple nodes use fitBounds so all are visible.
  const registerFitMatches = getContext<(fn: (nodeIds: string[]) => void) => void>('registerFitMatches');

  registerFitMatches((nodeIds: string[]) => {
    if (nodeIds.length === 0) return;

    if (nodeIds.length === 1) {
      const node = getNode(nodeIds[0]);
      if (!node) return;
      const w = node.measured?.width ?? node.width ?? 320;
      const h = node.measured?.height ?? node.height ?? 90;
      setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom: isMobile ? 0.65 : 0.85,
        duration: 800,
      });
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of nodeIds) {
      const node = getNode(id);
      if (!node) continue;
      const w = node.measured?.width ?? node.width ?? 320;
      const h = node.measured?.height ?? node.height ?? 90;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + w);
      maxY = Math.max(maxY, node.position.y + h);
    }
    if (!isFinite(minX)) return;

    // Use getViewportForBounds + setViewport directly so the zoom is not
    // clamped by store.minZoom — on mobile the graph is wide enough that
    // fitting all results may require zooming out past the interactive floor.
    const canvasEl = document.querySelector('.flowchart-canvas') as HTMLElement | null;
    const cw = canvasEl?.clientWidth ?? window.innerWidth;
    const ch = canvasEl?.clientHeight ?? window.innerHeight;
    const viewport = getViewportForBounds(
      { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      cw, ch,
      0,       // minZoom — unclamped
      10,      // maxZoom
      0.2,     // padding
    );
    setViewport(viewport, { duration: 800 });
  });
</script>
