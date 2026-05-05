<script lang="ts">
  /**
   * Custom xyflow edge that renders the same path as the built-in edge
   * components (bezier / smoothstep / step / straight, picked from the
   * source data via `data.pathType`) but positions its text label
   * `LABEL_FRACTION` of the way from source to target instead of at the
   * midpoint xyflow uses by default.
   *
   * Why a custom edge instead of just nudging xyflow's `labelX/labelY`:
   * the built-in edge components compute those internally from the path
   * helper's returned centre and pass them straight to BaseEdge — there
   * is no public knob to bias them. The fraction we want (~25%) also
   * cannot be derived linearly from the endpoints because beziers and
   * smoothsteps curve. We therefore re-walk the actual SVG path with
   * `getPointAtLength`, which is the only DOM-level API that knows the
   * true arc length of an arbitrary `<path d="...">`.
   */
  import {
    BaseEdge,
    getBezierPath,
    getSmoothStepPath,
    getStraightPath,
  } from '@xyflow/svelte';
  import type { EdgeProps } from '@xyflow/svelte';
  import type { EdgeType, PaletteColor } from '../../../data/flowchart';

  /**
   * Position the label at this fraction along the edge path
   * (0 = source-end, 1 = target-end, 0.5 = the xyflow built-in default).
   * Pulled toward the source so the label reads as "the choice the user
   * made leaving this decision" rather than floating in no-man's-land
   * halfway down a long curve.
   */
  const LABEL_FRACTION = 0.25;

  let props: EdgeProps & {
    data?: { color?: PaletteColor; pathType?: EdgeType };
  } = $props();

  const path = $derived.by(() => {
    const args = {
      sourceX: props.sourceX,
      sourceY: props.sourceY,
      sourcePosition: props.sourcePosition,
      targetX: props.targetX,
      targetY: props.targetY,
      targetPosition: props.targetPosition,
    };
    switch (props.data?.pathType) {
      case 'straight':
        return getStraightPath(args)[0];
      case 'smoothstep':
        return getSmoothStepPath(args)[0];
      case 'step':
        return getSmoothStepPath({ ...args, borderRadius: 0 })[0];
      // Treat the data layer's deprecated `'simplebezier'` as a regular
      // bezier — xyflow Svelte 1.x doesn't ship a separate simple-bezier
      // renderer, so the built-in default behaviour was already plain
      // bezier for that value.
      case 'bezier':
      case 'simplebezier':
      default:
        return getBezierPath(args)[0];
    }
  });

  // Reuse a single offscreen <path> per component instance so successive
  // reactive updates don't allocate a fresh element each time. The element
  // never enters the DOM — getTotalLength / getPointAtLength only need a
  // valid SVGPathElement, not one that is rendered.
  const measurer =
    typeof document !== 'undefined'
      ? document.createElementNS('http://www.w3.org/2000/svg', 'path')
      : null;

  const labelPos = $derived.by(() => {
    if (!measurer) {
      // SSR / no-DOM fallback: linear interpolation on the straight line
      // between endpoints. The island uses `client:only` so this branch
      // is only ever hit during type-narrowing, never at runtime.
      return {
        x: props.sourceX + (props.targetX - props.sourceX) * LABEL_FRACTION,
        y: props.sourceY + (props.targetY - props.sourceY) * LABEL_FRACTION,
      };
    }
    measurer.setAttribute('d', path);
    const total = measurer.getTotalLength();
    const point = measurer.getPointAtLength(total * LABEL_FRACTION);
    return { x: point.x, y: point.y };
  });
</script>

<BaseEdge
  id={props.id}
  {path}
  labelX={labelPos.x}
  labelY={labelPos.y}
  label={props.label}
  labelStyle={props.labelStyle}
  markerStart={props.markerStart}
  markerEnd={props.markerEnd}
  interactionWidth={props.interactionWidth}
  style={props.style}
/>
