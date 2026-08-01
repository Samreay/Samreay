# Tier list layout rework — left-aligned tier rows

**Date:** 2026-08-01
**Status:** Done

## Goal

The "Tier List" layout on `/reviews/` renders each tier as a de-facto tier-list
row — a colored tier label column on the left and a dense, left-aligned run of
book covers filling the rest of the row — without changing the Wide or Cover
layouts, or any other page.

## Context

- Affects only the reviews explorer island (`src/components/islands/ReviewsExplorer.svelte`)
  and, if needed, tier-specific styling in `src/styles/`.
- Current tier layout: a full-width centered `<h1>` per tier
  (`"{tier}: {description}"`, gradient text via `.tier-list .rating-{tier}`)
  followed by a **centered** grid (`grid-cols-cover-cards-tier`, 250px tracks,
  `justify-center`). This is what the first screenshot shows.
- Target look (second screenshot, TierMaker-style): each tier is a horizontal
  row. Left column is a solid colored block containing the tier letter; the
  covers sit immediately to its right, left-aligned and densely packed
  (small/no gap). Rows stack with a subtle separator, all on the site's dark
  background.
- Existing assets to reuse:
  - Tier color palettes already exist: `bg-{S,A,B,C,D,F}-{500..900}` utilities
    and hand-written `.bg-π-*` rules in `src/styles/main.css`.
  - Cards need no structural change — tier-specific styling (small radius,
    no glow padding) lives in a container-scoped `.tier-grid` block in
    `src/styles/fancy.css`, so `ReviewCard.svelte` itself only distinguishes
    the wide layout (text panel, rounded-left cover).
- Constraints / non-goals:
  - Wide and Cover layouts must render pixel-identical to today.
  - Grouping/sorting logic (`groupedPosts`, weight sort in tier mode) is
    already correct — markup/CSS only, no state changes.
  - Tier descriptions ("Love to pieces", …) should remain visible, not be
    dropped — but subordinate to the tier letter (small text under the letter
    in the label column; `sr-only` on mobile where it doesn't fit).
  - Keep the dark theme; ignore the white background in the reference image.

## Affected files

```
~ src/components/islands/ReviewsExplorer.svelte
~ src/styles/main.css          (only if a new utility/track size is needed)
~ src/styles/styling.css       (tier-row styles if not expressible in Tailwind)
```

## Tasks

- [x] 1. Restructure the tier branch of the card wrapper
      (`src/components/islands/ReviewsExplorer.svelte`): each tier renders as
      a `<section class="tier-row">` — fixed-width colored label column
      (letter + description, sticky with `top-4 bottom-4` so it stays visible
      while entering and scrolling through tall tiers; large offsets like
      `40vh` push short rows' labels to the cell bottom) plus an auto-fill
      grid of `ReviewCard`s with `gap-1`. Card markup shared between layouts
      via a `{#snippet cards()}`. The tier wrapper is full-width (no
      `max-w-*`) so zooming out shows the whole board at once. Sticky only
      works because the row and the `BaseLayout` wrapper use overflow
      *clipping* (`overflow-clip` / `overflow-x-clip`), not
      `overflow-hidden`, which would make them the sticky scroll container.
- [x] 2. Tier label colors via an explicit `TIER_LABEL_CLASSES` map: π uses
      `bg-violet-800` (its own palette is identical to C's orange, and the
      site's purple-800 override is too close to S's indigo), B uses
      `bg-B-600` (B-700 slate was invisible on the dark row), others use
      their `-700` shade for contrast with the white text.
- [x] 3. Row chrome: `bg-gray-800/50` rows, `rounded-md overflow-clip`,
      `gap-1` between rows.
- [x] 4. Mobile: label shrinks to `w-16` (letter only, description `sr-only`),
      covers go 3-up via `grid-cols-3`.
- [x] 5. Density: `grid-cols-cover-cards-tier` reduced 250px → 150px
      (`auto-fill` so trailing tracks don't stretch); tier covers scale to
      their track via a new `.tier-grid` block in `src/styles/fancy.css`
      (the card text panel is render-gated to the wide layout in
      `ReviewCard.svelte`, so no CSS hiding is needed). The same block
      shrinks the card's `--radius`, zeroes the `.review-{tier} .bg2` glow
      padding, and clears the `.bg-inner` gray background so covers sit
      flush with no gray squares behind their rounded corners (selectors
      carry an extra class hop so they win on specificity, not import
      order). It also zeroes the card's auto inline margins, which
      otherwise stop grid items stretching and let rows collapse until
      lazy-loaded covers arrive.
- [x] 6. Confirmed empty-group behavior: searching "wight" left only the S
      row; empty tiers disappear entirely.

## Verification

### Static analysis

```bash
astro check
npm run build
```

Expected: no errors, no warnings.

### Visual review (Playwright MCP against `make blog` dev server)

Pages to check at `http://localhost:4321`:
- `/reviews/?l=tier` — tier rows left-aligned, colored label column, dense
  packing; compare against the reference screenshot.
- `/reviews/?l=tier` with tag filters and search applied — rows collapse
  correctly, no orphaned labels.
- `/reviews/` (default Wide) and `/reviews/?l=cover` — **zero visual change**.
- Mobile viewport (~375px) on `/reviews/?l=tier`.

### Manual checks

- [x] Switching layouts via the toggle preserves filters and URL state
      (verified: `?l=tier&include=companion` → toggle → `?l=cover&include=companion`).
- [x] Card hover effects (3D tilt, glare, bookmark button) still work inside
      the new row container (hover is delegated from `document` in
      `src/lib/fancy-card.ts`; overlay radius now matches the card clip).
- [x] Reading-list bookmark toggle still works in tier layout (28×28 hit
      target verified on a 150px tier card).

## Architectural decision (ADR)

None expected — presentation-only change confined to one island and tier-scoped
CSS.
