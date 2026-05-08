# Want to Read Bookmarks

**Date:** 2026-05-08
**Status:** In Progress

## Goal

Users can bookmark reviews into a persistent "Want to Read" list stored in
localStorage (and shareable via URL) and filter the reviews explorer to only
show their bookmarked items.

## Context

- Affects the reviews section (`src/components/ReviewCard.svelte` and
  `src/components/islands/ReviewsExplorer.svelte`).
- No suitable bookmark SVG exists in `src/assets/svg/` — will add one inline.
- `ReviewCard` renders as a full `<a>` wrapper; the bookmark button must
  prevent the click from navigating (use `stopPropagation` + `preventDefault`).
- Slug is derived from `post.abslink` (e.g. `/reviews/soul_relic/` → `soul_relic`).
- `ReviewsExplorer` already has a URL-sync `$effect`; extend it to persist the
  reading-list slugs under the `reading-list` param.
- Svelte 5 runes only; localStorage guarded by `typeof localStorage !== 'undefined'`.

## Affected files

```
+ src/assets/svg/bookmark.svg
~ src/components/ReviewCard.svelte
~ src/components/islands/ReviewsExplorer.svelte
```

## Tasks

- [ ] 1. Add a `bookmark.svg` icon (`src/assets/svg/bookmark.svg`)
- [ ] 2. Add bookmark button + toggle logic to `ReviewCard.svelte`, accepting an
         `isBookmarked` prop and an `onToggle` callback
- [ ] 3. Wire reading-list state, URL sync, and filtering into
         `ReviewsExplorer.svelte`; pass bookmark state + toggle callback down to
         each `ReviewCard`

## Verification

### Static analysis

```bash
astro check
npm run build
```

Expected: no errors, no warnings.

### Visual review (browser-tester)

- `http://localhost:4321/reviews/` — bookmark icons visible on cards, "Reading
  List" toggle button visible in controls area
- `http://localhost:4321/kitchensink/` — no regressions

### Manual checks

- [ ] Clicking bookmark icon toggles the filled/outline state without navigating
- [ ] "Reading List" button in controls filters cards to bookmarked items only
- [ ] URL updates with `?reading-list=slug1_slug2` when items are bookmarked
- [ ] Pasting that URL restores the reading list and auto-filters the view
- [ ] localStorage persists across page reloads

## Architectural decision (ADR)

**Decision:** Bookmark state lives in `ReviewsExplorer` (not a separate store
file) and is passed down as props to `ReviewCard`. The URL param `reading-list`
stores underscore-separated slugs, consistent with the existing `include`/`exclude`
tag params.

**Why:** Keeps the state co-located with the filter logic. No need for a shared
store since `ReviewCard` is always rendered inside `ReviewsExplorer`.

**Consequences:** If `ReviewCard` is ever used outside `ReviewsExplorer`, the
bookmark props will need defaults or lifting. Recorded in ADR-008.
