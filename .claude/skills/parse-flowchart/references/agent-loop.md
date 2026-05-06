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

## Verification ritual

After every batch of new nodes (every 2–3 tiles is a good cadence), run
`verify.py` and read its `coverage.png`. The overlay is your checklist:

- **Decision blue / book green** outlines on every captured node.
- A **dark card or pill in the source with no outline** = a missed node.
  Open the relevant tile and add it.
- An **outline floating in white space** = a node whose `src_bbox` is
  wrong (very common when manually entering coordinates instead of
  copying from `crop.py`'s JSON output). Re-crop to fix.

Common error → fix table:

| Error                               | Likely cause                                                                  |
|-------------------------------------|-------------------------------------------------------------------------------|
| `unreachable from START`            | Edge directions are wrong, or the new subtree's parent is not yet captured.   |
| `decision has no outgoing edges`    | Edges added but with this id as `target`; swap source/target.                 |
| `book has outgoing edges` (warn)    | Almost always a swapped source/target on the edge.                            |
| `cycle detected via edge X → Y`     | Either `source`/`target` are swapped on edge X→Y, or you have a real loop in
                                          the source — check the connector arrow direction in the original.            |
| `duplicate node id`                 | Two tiles saw the same node and you transcribed it twice; merge entries.      |
| `tiles with zero captured nodes`    | Could be empty whitespace OR missed coverage. Cross-reference `coverage.png`. |
| `nodes have no src_bbox`            | The state was filled in from memory; backfill via `crop.py` and re-verify.    |

`verify.py --strict` promotes every warning to an error; useful when you
think the pass is finished and want the audit to be ruthless before
emitting.
