# Plan: "Surprise me" button in ReviewsExplorer

**Date:** 2026-05-08
**Status:** Done

## Goal

Add a "Surprise me" button to the reviews explorer that picks a random review from the currently filtered set (respecting all active tag filters and search terms) and navigates to it.

## Affected files

- `src/components/islands/ReviewsExplorer.svelte` — add `surpriseMe()` function and button

## Tasks

1. [x] Add `surpriseMe()` function that picks a random post from `visiblePosts` and sets `window.location.href = post.abslink`
2. [x] Add "Surprise me" button in the controls bar alongside the Reset button, using the same style

## Verification

```bash
astro check && npm run build
```

Browser: visit `/reviews/`, apply some tag filters, click "Surprise me" — should navigate to a random matching review.

## ADR

None — trivial UI addition with no architectural tradeoffs.
