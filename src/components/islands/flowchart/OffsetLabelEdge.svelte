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
    EdgeLabel,
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

  /**
   * Floor (in screen pixels at zoom = 1) on the distance from the source
   * handle to the label centre when no label text is present. When a label
   * exists, the effective floor is also constrained by the label's measured
   * half-width plus SOURCE_CLEARANCE_PX so the left edge of the label never
   * overlaps the source node. Mirrors `LABEL_MIN_DISTANCE_PX` in
   * `src/lib/flowchart-edge-geometry.ts` — keep the two in lockstep.
   */
  const LABEL_MIN_DISTANCE_PX = 200;

  /**
   * World-unit width per character. xyflow EdgeLabel uses 12px font; at the
   * default 0.3 zoom that's ~3.6 screen-px/char, so each character occupies
   * roughly 12 world units. We use a slightly larger value to stay on the
   * safe side for wider glyphs.
   */
  const WORLD_PX_PER_CHAR = 14;

  /** Extra world-unit gap between the label's left edge and the source handle. */
  const SOURCE_CLEARANCE_WU = 20;

  function minDistanceForLabel(label: string | undefined, total: number): number {
    const textFloor = LABEL_MIN_DISTANCE_PX;
    if (!label || typeof label !== 'string') return Math.min(textFloor, total);
    const halfWidthWorld = (label.length * WORLD_PX_PER_CHAR) / 2;
    return Math.min(Math.max(textFloor, halfWidthWorld + SOURCE_CLEARANCE_WU), total);
  }

  let props: EdgeProps & {
    data?: {
      color?: PaletteColor;
      pathType?: EdgeType;
      lineColor?: string;
      /** Set true while a search query is active and this edge does
       *  not match — see `Flowchart.svelte`. We render the dim class
       *  on the path AND on a self-rendered `<EdgeLabel>` so the
       *  portalled label fades in lockstep with the path. */
      dim?: boolean;
      /** 0–1 fraction along the edge where the travelling pulse dot
       *  should be drawn. `undefined` = no active pulse. */
      pulseProgress?: number;
      /** Set true when this edge is part of the user's chosen quiz trail. */
      quizTrail?: boolean;
    };
  } = $props();

  const dimClass = $derived(props.data?.dim ? 'flowchart-dim' : undefined);
  const trailClass = $derived(props.data?.quizTrail ? 'quiz-trail' : undefined);
  const edgeClass = $derived([dimClass, trailClass].filter(Boolean).join(' ') || undefined);
  const trailStyle = $derived(
    props.data?.quizTrail
      ? `${props.style ?? ''} stroke: ${props.data.lineColor ?? '#d97706'}; stroke-width: 5; filter: drop-shadow(0 0 6px ${props.data.lineColor ?? '#d97706'}aa);`
      : props.style,
  );

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

  const pulsePos = $derived.by(() => {
    const progress = props.data?.pulseProgress;
    if (progress == null || !measurer) return null;
    measurer.setAttribute('d', path);
    const total = measurer.getTotalLength();
    const dist = progress * total;
    const pt = measurer.getPointAtLength(dist);
    // Two trailing ghost dots for a comet tail effect.
    const tail1 = measurer.getPointAtLength(Math.max(0, dist - 10));
    const tail2 = measurer.getPointAtLength(Math.max(0, dist - 22));
    const color = props.data?.lineColor ?? '#10b981';
    return { head: pt, tail1, tail2, color };
  });

  const labelPos = $derived.by(() => {
    const labelText = typeof props.label === 'string' ? props.label : undefined;
    if (!measurer) {
      // SSR / no-DOM fallback: linear interpolation on the straight line
      // between endpoints. The island uses `client:only` so this branch
      // is only ever hit during type-narrowing, never at runtime.
      const dx = props.targetX - props.sourceX;
      const dy = props.targetY - props.sourceY;
      const total = Math.hypot(dx, dy);
      const distance = Math.max(
        total * LABEL_FRACTION,
        minDistanceForLabel(labelText, total),
      );
      const t = total > 0 ? distance / total : 0;
      return {
        x: props.sourceX + dx * t,
        y: props.sourceY + dy * t,
      };
    }
    measurer.setAttribute('d', path);
    const total = measurer.getTotalLength();
    const distance = Math.max(
      total * LABEL_FRACTION,
      minDistanceForLabel(labelText, total),
    );
    const point = measurer.getPointAtLength(distance);
    return { x: point.x, y: point.y };
  });
</script>

<!--
  We deliberately do NOT pass `label`/`labelStyle` to BaseEdge: BaseEdge
  would render an <EdgeLabel> internally without any way to forward our
  `flowchart-dim` class onto it (the EdgeLabel is portalled to a separate
  DOM container by xyflow, so a class on the parent edge group cannot
  cascade in). Rendering the EdgeLabel ourselves is the only way to fade
  the label in lockstep with the path.
-->
<BaseEdge
  id={props.id}
  {path}
  markerStart={props.markerStart}
  markerEnd={props.markerEnd}
  interactionWidth={props.interactionWidth}
  style={trailStyle}
  class={edgeClass}
/>

{#if props.label}
  <EdgeLabel
    x={labelPos.x}
    y={labelPos.y}
    style={props.data?.quizTrail
      ? `${props.labelStyle ?? ''} box-shadow: 0 0 10px 2px ${props.data.lineColor ?? '#d97706'}88; border: 2px solid ${props.data.lineColor ?? '#d97706'};`
      : props.labelStyle}
    class={edgeClass}
    selectEdgeOnClick
  >
    {props.label}
  </EdgeLabel>
{/if}

{#if pulsePos}
  <!-- Comet tail: two trailing ghost dots, then the head. All tinted
       to match the edge's stroke colour for a coherent glow. -->
  <circle
    cx={pulsePos.tail2.x} cy={pulsePos.tail2.y} r="2.5"
    fill={pulsePos.color} opacity="0.2"
    pointer-events="none"
  />
  <circle
    cx={pulsePos.tail1.x} cy={pulsePos.tail1.y} r="3.5"
    fill={pulsePos.color} opacity="0.4"
    pointer-events="none"
  />
  <circle
    cx={pulsePos.head.x} cy={pulsePos.head.y} r="5"
    fill={pulsePos.color} opacity="0.75"
    style="filter: drop-shadow(0 0 4px {pulsePos.color}cc) drop-shadow(0 0 10px {pulsePos.color}66)"
    pointer-events="none"
  />
{/if}
