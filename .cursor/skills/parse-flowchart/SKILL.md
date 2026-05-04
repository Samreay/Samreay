---
name: parse-flowchart
description: >-
  Translate a giant Figma-exported flowchart JPEG (10k–35k px on a side) into
  the typed `FlowchartData` source-of-truth at `src/data/flowchart.ts`.
  Drives a vision-loop over downscaled overview + overlapping mid-zoom tiles
  + on-demand full-resolution crops to enumerate every decision node, book
  node, and labelled edge starting from the START HERE entry, then emits a
  validated `flowchart.ts` snippet. Use when the user asks to extract,
  parse, transcribe, ingest, or rebuild the recommendation flowchart from
  an image — or to diff a freshly-exported Figma against the existing data.
---

# parse-flowchart — image → flowchart.ts

## When this applies

The user wants every decision diamond, book card, and labelled edge from a
single big flowchart image (Figma export of `Story-Finder*.jpg` or similar)
turned into the `FlowchartData` shape consumed by
`src/lib/flowchart-layout.ts` and rendered by `src/pages/reviews/flowchart.astro`.

Do **not** try to read the source JPEG directly — it is routinely 800+ MP
and tens of MB. Vision input gets silently downscaled to a few-megapixel
preview, which destroys the text inside every node. This skill exists to
slice the image into pieces that *do* fit, while preserving absolute
pixel coordinates so re-zoom is cheap.

## What you have to work with

The data model is in [`src/data/flowchart.ts`](../../../src/data/flowchart.ts).
Quick recap:

- `decisions[]` — diamond/pill nodes with a `prompt` and optional Tailwind-500
  `color`. IDs are `d_*`.
- `books[]` — recommendation cards. Each `reviewId` must match a folder under
  `content/reviews/<reviewId>/index.md`. IDs are `b_*`.
- `edges[]` — `{ source, target, label?, color? }`. IDs are `e_<source>_<target>`.
- Layout is computed by dagre at build time; positions are not in the source
  data unless an entry has a `pinned` override. **Do not invent positions** —
  let dagre place everything except the START anchor.

The PaletteColor union is one of red, orange, amber, yellow, lime, green,
emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose,
gray. Pick the closest to what you see in the image; gray = neutral.

## Workflow

All scripts live in `.cursor/skills/parse-flowchart/scripts/` and are
self-contained `uv run` scripts (inline PEP 723 metadata). Outputs land
under `.cursor/skills/parse-flowchart/work/<image-stem>/` (gitignored).

### 0. Sanity-check the schema first

If `src/data/flowchart.ts` has changed since this skill was last touched,
re-read its `DecisionNode` / `BookNode` / `FlowchartEdge` interfaces and
confirm the keys below still match. `emit.py` only knows about the schema
listed in `references/state-schema.md`.

### 1. Slice the image — `prepare.py`

```bash
uv run .cursor/skills/parse-flowchart/scripts/prepare.py path/to/Story-Finder-big.jpg
```

Default 4×4 grid with 10% overlap, max 2000 px on the long edge per output.
For a ~32k × 25k image this gives 16 readable tiles. Outputs:

- `work/<stem>/overview.png` — clean preview of the whole graph.
- `work/<stem>/overview_grid.png` — same with red `r{R}c{C}` labels per tile.
  **Read this first** to plan tile traversal.
- `work/<stem>/tiles/r{R}_c{C}.png` — mid-zoom tiles, each readable enough
  to make out node text and short edge labels.
- `work/<stem>/index.json` — `src_size`, `overview_size`, and per-tile
  `src_bbox`, `tile_size`, and `scale`. **You must read this before doing
  anything else** — coordinates in this skill are always *original-image
  pixel coordinates*, and `index.json` is how you convert.

If a region's text is too small in the 4×4, re-run with `--grid 8x8` to
get 64 finer tiles. You can mix: keep the 4×4 around for navigation and
zoom in selectively with `crop.py` (next section).

### 2. Plan from the overview

Open `overview_grid.png`. The chart rendered by `flowchart.astro` is a
top-to-bottom DAG, so the START HERE node is near the top centre.
Identify roughly which tile contains it, and which tiles contain leaf
book nodes (always have a cover image — visually distinct from the small
dark decision rectangles). Sketch the plan in the chat: which tiles you'll
read in what order. **Always traverse in graph order, not raster order**:
START → its children → grandchildren. This is what keeps the eventual
edge IDs in the order the reader experiences them.

### 3. Locate the START anchor and pin it

Read the tile containing `START HERE`. Decide its absolute centre in
original-image pixels (`tile_local_x / scale + src_bbox[0]`). The START
node is the *only* node we pin — set `pinned: { x: 0, y: 0 }` on it (so
the rendered graph anchors at the page top), and let dagre position
everything below.

### 4. Enumerate nodes from each tile

For every tile, read it once and write entries into the in-memory state.
Two visually distinct kinds:

- **Book card**: wider rectangle (≈520×400 in source coords) with a cover
  image on the left and `<title> / sentence / tags` on the right. Short
  bottom-row pills are tier/category tags (`in-progress`, `litrpg`, `system-apocalypse`,
  …) — these belong to the review, not to this data. Map the title to a
  `reviewId` from `content/reviews/`. Use the helper:

  ```bash
  ls content/reviews/ | sort
  ```

  to confirm the slug; near-misses (e.g. `defiance_of_the_fall` vs
  `defiance-of-the-fall`) **must match the directory exactly** — `emit.py`
  rejects unknown reviewIds, and slugs use underscores.

  If the title is ambiguous from the mid-zoom tile, zoom in with `crop.py`
  (see section 6) before assigning a reviewId. Never guess.

- **Decision node**: smaller dark rounded rectangle containing only a
  question prompt (e.g. "Theme?", "Sassy Cat Companion?"). Pick a `color`
  from the PaletteColor union if the node has a noticeable accent border
  (otherwise omit — defaults to gray).

For every node you enumerate, give it a stable id (`d_<slug>` /
`b_<reviewId-shortened>`) and record its `src_bbox` in original-image
coords as a sidecar key (the `state.json` accepts arbitrary extra fields;
`emit.py` ignores them but they're invaluable for the next agent that has
to re-zoom).

### 5. Trace edges between adjacent tiles

Edges are coloured pills with white prose labels (e.g. "I will survive",
"Crave blood", "Princess Donut all the way") sitting on top of curved
connectors that travel between two nodes. To trace one:

1. Find the pill's tile.
2. Look at the connector colour on each side of the pill — that determines
   `color`.
3. Follow the connector to its source and target. If it crosses a tile
   seam, open both adjacent tiles and verify the same colour continues.
   Tiles overlap by 10% so the pill itself usually appears whole in at
   least one tile.
4. Record `{ id, source, target, label, color }` in `state.json#edges`.

If a connector is hard to follow, use `crop.py` with `--center` on the
pill plus a generous `--pad` to get a high-res view spanning both ends:

```bash
uv run .cursor/skills/parse-flowchart/scripts/crop.py path/to/Story-Finder-big.jpg \
  --center 18000,12000 --size 4000,3000 --pad 200 \
  --out .cursor/skills/parse-flowchart/work/Story-Finder-big/zoom_e_start_dotf.png
```

### 6. Zoom on demand — `crop.py`

When a tile downscale isn't sharp enough — small text inside a decision
node, an ambiguous book title, an edge label landing on a connector
crossing — crop the original at full resolution. Specify either an explicit
`--bbox x0,y0,x1,y1` or `--center x,y --size W,H`. The output is downscaled
to `--max-dim 2000` by default; pass `--max-dim 0` only when you need
literal source pixels.

The script prints a JSON summary so you can paste the `src_bbox` straight
into your state file.

### 7. Validate and emit — `emit.py`

Once `state.json` looks complete, run:

```bash
uv run .cursor/skills/parse-flowchart/scripts/emit.py \
  --state .cursor/skills/parse-flowchart/work/Story-Finder-big/state.json \
  --out  .cursor/skills/parse-flowchart/work/Story-Finder-big/flowchart.generated.ts
```

`emit.py` will reject the run if any of these fail:

- duplicate ids (decision/book/edge),
- edges referencing unknown nodes,
- unknown PaletteColor or EdgeType,
- a `reviewId` with no matching `content/reviews/<reviewId>/index.md`.

For an in-progress draft (e.g. you've identified a book by cover but
haven't yet picked a slug), pass `--allow-missing-reviews` to demote
those errors to stderr warnings without blocking emission.

### 8. Hand back to `src/data/flowchart.ts`

Diff `work/<stem>/flowchart.generated.ts` against the live
`src/data/flowchart.ts`. Don't blindly overwrite — copy the
`decisions` / `books` / `edges` arrays into the existing module, preserving
its top-of-file comments and any `pinned` overrides that were tuned by
hand. Then run a build to confirm dagre lays it out without errors:

```bash
npm run build
```

The build also re-validates every `reviewId` against the content
collection (Astro's typed `getEntry`).

## State file shape

See [`references/state-schema.md`](references/state-schema.md) for the
exact keys `emit.py` expects. A starter is at
[`scripts/state.example.json`](scripts/state.example.json).

The recommended layout is one `state.json` per source image, kept under
`work/<image-stem>/` next to the prepared overview/tiles so future agents
can re-zoom without re-running anything but `crop.py`.

## Notes and gotchas

- **Decision nodes are not diamonds in the Figma source.** They render as
  rounded rectangles with a coloured border in the SVG. The data model
  still calls them `DecisionNode` because that's the rendered shape in
  the Svelte island.
- **`reviewId` must use underscores.** `content/reviews/` slugs are
  underscore-separated (e.g. `defiance_of_the_fall`, not
  `defiance-of-the-fall`).
- **Don't pin anything except the START anchor.** `flowchart-layout.ts`'s
  dagre pass produces clean graph spacing automatically; pinning more
  nodes fights dagre and produces overlapping cards.
- **Tiles overlap intentionally.** A node sitting on a seam is still
  whole in at least one neighbour tile. Use `index.json#tiles[*].src_bbox`
  to find which one(s).
- **`work/` is gitignored.** Outputs are large (the 16-tile run for the
  current Story-Finder image is ~16 MB). Anything that needs to live in
  the repo (the final `flowchart.ts` snippet, the state.json once the
  pass is finished) gets copied out manually.
