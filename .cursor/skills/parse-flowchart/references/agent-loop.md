# Agent loop tips

Concrete patterns that work well when driving this skill end-to-end.

## Read the overview *with* the grid first

Always read `overview_grid.png` before any tile. The red `rRcC` labels are
your only frame of reference for "where am I in the graph"; without them
you'll end up re-checking the same tile twice and missing edges that span
the seam.

## Convert tile-local pixels with the index

For a point you eyeball at `(tx, ty)` inside `tiles/rR_cC.png`:

```text
tile = index["tiles"][some_i]   # the tile with row=R, col=C
orig_x = tile["src_bbox"][0] + tx / tile["scale"]
orig_y = tile["src_bbox"][1] + ty / tile["scale"]
```

Round to integers when writing back into `state.json`. `crop.py` and
`emit.py` both expect ints.

## One pass per tile, not one pass per node

For each tile, dump *every* node and edge you can see in a single go,
even partially-visible ones near the edges (note them, then confirm
from the neighbouring tile). Re-opening the same tile to add one more
node is wasteful and easy to lose track of.

## Edge ordering

The Svelte page renders edges in `state.json` order. For readability of
the eventual diff against `src/data/flowchart.ts`:

1. Group edges by source.
2. Within a source, list outgoing edges left-to-right as drawn.

This matches the existing file's convention.

## Naming ids deterministically

- `d_start` — the START HERE anchor.
- `d_<slug>` — decision: short slug from the prompt, e.g.
  `d_theme`, `d_weapon_pref`, `d_sassy_cat`. Lowercase, underscores.
- `b_<slug>` — book: shortened reviewId, e.g.
  `b_dotf` for `defiance_of_the_fall`. Use the same shortening conventions
  the existing `flowchart.ts` already uses (look there first).
- `e_<source>_<target>` — edges. If two parallel edges between the same
  pair exist (rare), append a label-derived suffix.

Keep ids stable across re-runs so a future Figma re-export produces a
small diff, not a full rewrite.

## When in doubt, crop, don't guess

If a tile is genuinely too compressed to read a label or match a cover,
**always** zoom with `crop.py`. The cost of one extra crop is negligible
compared to the cost of a wrong `reviewId` (which `emit.py` will catch
anyway, but only after you've finished the loop).

## Incremental emit

`emit.py` is cheap. Run it after each tile or two with
`--allow-missing-reviews` to surface duplicate ids, broken edges, or
typos in colour names early. The validator's error list is much more
useful than re-checking by eye.

## When to pin

Only the START anchor gets `pinned: { x: 0, y: 0 }`. Anything else gets
laid out by dagre. If the resulting build looks wrong, the fix is almost
always to add or remove an edge (or change `defaultEdgeType`), never to
pin more nodes — pinning fights dagre and immediately produces card
overlap on the next Figma re-export.
