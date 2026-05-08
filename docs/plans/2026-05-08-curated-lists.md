# "Best of" Curated List Pages

**Date:** 2026-05-08
**Status:** In Progress

## Goal

Add three static curated list pages (`/reviews/lists/best-cultivation`, `/reviews/lists/best-female-lead`, `/reviews/lists/best-hard-magic`) plus an index page (`/reviews/lists/`) that present ranked, tag-filtered review collections using the existing `ReviewCoverCard.astro` component, with a Soul Relic authorship disclosure.

## Context

- Affects `src/pages/reviews/` (file-based routing, new `lists/` sub-directory).
- Uses the `reviews` content collection (already defined in `src/content.config.ts`).
- Reuses `ReviewCoverCard.astro` (accepts a `CollectionEntry<'reviews'>`) and `BaseLayout.astro`.
- Tier ordering: S > A > B > C > D > F > π (custom sort, not alphabetical).
- Within each tier, secondary sort is `weight` descending.
- Soul Relic (`soul_relic`, `review: 'π'`) appears on all three lists — disclose authorship near its card.
- No Svelte island needed — purely static `.astro` pages.
- No changes to `src/content.config.ts` or `astro.config.mjs`.

## Affected files

```
+ src/pages/reviews/lists/index.astro
+ src/pages/reviews/lists/best-cultivation.astro
+ src/pages/reviews/lists/best-female-lead.astro
+ src/pages/reviews/lists/best-hard-magic.astro
```

## Tasks

- [x] 1. Create `src/pages/reviews/lists/index.astro` — index listing all three lists with descriptions and links.
- [x] 2. Create `src/pages/reviews/lists/best-cultivation.astro` — filtered + sorted cultivation reviews with Soul Relic disclosure.
- [x] 3. Create `src/pages/reviews/lists/best-female-lead.astro` — filtered + sorted female-lead reviews with Soul Relic disclosure.
- [x] 4. Create `src/pages/reviews/lists/best-hard-magic.astro` — filtered + sorted hard-magic reviews with Soul Relic disclosure.

## Verification

### Static analysis

```bash
astro check
npm run build
```

Expected: no errors, no warnings.

### Visual review (browser-tester)

Pages to check:
- `http://localhost:4321/reviews/lists/` — index shows three list cards with descriptions
- `http://localhost:4321/reviews/lists/best-cultivation/` — cultivation reviews grid, Soul Relic disclosure visible
- `http://localhost:4321/reviews/lists/best-female-lead/` — female-lead reviews grid, Soul Relic disclosure visible
- `http://localhost:4321/reviews/lists/best-hard-magic/` — hard-magic reviews grid, Soul Relic disclosure visible
- `http://localhost:4321/kitchensink/` — no regressions in existing components

### Manual checks

- [ ] Reviews are sorted S > A > B > C > D > F > π within each list
- [ ] Within same tier, higher weight appears first
- [ ] Soul Relic disclosure only shows when soul_relic is in the list
- [ ] All cover cards link to their respective review pages

## Architectural decision (ADR)

None. Pure static pages using existing infrastructure.
