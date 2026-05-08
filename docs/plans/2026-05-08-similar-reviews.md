# Similar Reviews ("You might also like")

**Date:** 2026-05-08
**Status:** In Progress

## Goal

At the bottom of each individual review page, show 3–4 similar review cards
computed at build time by tag overlap so readers discover related books.

## Context

- Affects `src/pages/reviews/[...slug].astro` (individual review pages).
- Similarity = number of shared tags between the current review and all others;
  ties broken by `weight` (lower = better) then `date` (newer first).
- Current review is excluded from results.
- `ReviewCoverCard.astro` is the correct component — it's a static Astro
  component that accepts a `CollectionEntry<'reviews'>` and renders a cover
  with the 3D tilt hover effect and tier gradient ring. No Svelte island needed.
- `src/lib/content.ts` is the right place for the similarity utility, keeping
  all review-data logic centralised.

## Affected files

```
~ src/lib/content.ts                          — add getSimilarReviews()
~ src/pages/reviews/[...slug].astro           — call getSimilarReviews(), render section
```

## Tasks

- [x] 1. Add `getSimilarReviews(entry, allReviews, n)` to `src/lib/content.ts`
- [x] 2. Import it in `[...slug].astro`, call it, render "You might also like" section
- [x] 3. Style the grid to match existing review index layout

## Verification

### Static analysis

```bash
astro check
npm run build
```

Expected: no errors, no warnings.

### Visual review (browser-tester)

Pages to check:
- `http://localhost:4321/reviews/dungeon_crawler_carl/` — should show 3–4 similar cards below the review content
- `http://localhost:4321/reviews/soul_relic/` (or any π review) — π badge should appear naturally if it comes up in similar cards

### Manual checks

- [ ] Verify current review does not appear in its own similar list
- [ ] Verify cards link correctly to their respective review pages

## Architectural decision (ADR)

None.
