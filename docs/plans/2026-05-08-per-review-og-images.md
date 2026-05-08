# Per-review Open Graph images

**Date:** 2026-05-08
**Status:** In Progress

## Goal

Every individual review page emits a correct `og:image` meta tag pointing to the review's cover art (absolute URL), and π-tier reviews get a distinctive `og:description` that notes the reviewer's own authorship.

## Context

- Affects `src/pages/reviews/[...slug].astro` only — all SEO plumbing already exists in `src/components/Seo.astro` and `src/layouts/BaseLayout.astro`
- `BaseLayout` already accepts `image?: string` and `description?: string` props
- `Seo.astro` already converts a relative `image` string to absolute via `new URL(image, siteOrigin).href`
- `resolveCover()` in `src/lib/covers.ts` returns an optimised webp URL (relative `/_astro/…` path)
- π-tier reviews (`review === 'π'`) are the author's own books (e.g. Soul Relic)

## Affected files

```
~ src/pages/reviews/[...slug].astro
```

## Tasks

- [x] 1. In `[...slug].astro`, call `resolveCover(entry, 500, 800)` to obtain the cover image URL (`src/pages/reviews/[...slug].astro`)
- [x] 2. Build `ogDescription`: for π-tier use "A review of my own novel — judge accordingly", otherwise pass `entry.data.description` (`src/pages/reviews/[...slug].astro`)
- [x] 3. Pass `image` and `description` props to `<BaseLayout>` (`src/pages/reviews/[...slug].astro`)

## Verification

### Static analysis

```bash
astro check
npm run build
```

Expected: no errors, no warnings.

### Manual checks

- [ ] View-source on a review page — `<meta property="og:image">` is present and absolute
- [ ] View-source on a π-tier review — `og:description` says "A review of my own novel — judge accordingly"
- [ ] Home page, blog page — OG tags unchanged (no image, default description)

## Architectural decision (ADR)

None.
