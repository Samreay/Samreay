# Landscape OG Images via Playwright Screenshots

**Date:** 2026-05-10
**Status:** Approved — Ready to Build

## Goal

Replace portrait cover images as `og:image` with 1200×630 landscape screenshots of the `ReviewCard` component in wide layout, making social sharing previews look polished and informative across all major platforms.

---

## Research Summary

### The Problem

Current `og:image` is the book cover at 500×800 (portrait). Per [opengraph-research.md](../../plans/opengraph-research.md), every major platform (Facebook, Twitter/X, LinkedIn, Discord, Slack, WhatsApp, iMessage, Reddit) expects **1200×630 landscape** images. Portrait images get aggressively cropped or shown as tiny thumbnails.

### Approaches Evaluated

| Approach | Fidelity | Speed | Complexity | Verdict |
|----------|----------|-------|-----------|---------|
| **Satori + Sharp** | Limited CSS subset (no grid, no 3D, no calc) | ~10ms/image | Must rewrite card as JSX objects with inline styles | ❌ Cannot replicate tier gradients, 3D overlays, Tailwind classes |
| **astro-og-canvas** | Template-only (title + bg + logo) | Fast | Minimal | ❌ Far too rigid for our card design |
| **astro-opengraph-images** | Same as Satori (wrapper) | Fast | Lower boilerplate | ❌ Same CSS limitations |
| **Playwright screenshot** | 100% — real Chromium | ~1-3s/image | Moderate (script + dedicated route) | ✅ Exact card rendering, already installed |
| **Puppeteer** | Same as Playwright | Same | Same | ❌ Redundant — Playwright already in project |

### Decision: Playwright Screenshot at Build Time

**Why Playwright wins for this site:**
1. **Full CSS fidelity** — the ReviewCard uses tier-colored gradient overlays, 3D transforms (`transform-style: preserve-3d`), fancy card glare effects, and Tailwind v4 classes. Satori cannot render any of this.
2. **Already installed** — `playwright: ^1.59.1` is in devDependencies.
3. **Reuse existing component** — no need to maintain a separate OG card design. The ReviewCard in `wide` layout already looks great at landscape proportions.
4. **~150 reviews × ~2s = ~5 min** added to build. Acceptable with caching.
5. **Content hashing** enables incremental generation — only regenerate when content changes.

### Committed vs Generated-at-Build

**Decision: Generate locally, commit to `astro-public/og/`** (confirmed by user).

Rationale:
- ~150 images × ~30KB each ≈ 4.5MB — acceptable repo size
- Images only change when a review's content/tier/cover changes (rare)
- Avoids needing Playwright/Chromium in CI entirely
- A `scripts/generate-og.ts` script runs locally; developer commits results

---

## Scaling Strategy

### The Challenge

The `ReviewCard` in `wide` layout renders at `max-width: 600px` (set by `.fancy_card.horizontal`) with a natural height of ~300px. The OG target is 1200×630. We need to fill the canvas.

### The Solution: Full-Width Card at 1200×630

The OG route renders the card markup directly at 1200×630 using the same CSS classes
as the ReviewCard (`.review-summary`, `.bg2`, `.bg-inner`, tier colours) but with
larger font sizes appropriate for the full viewport width. No CSS scaling needed —
the card fills the canvas natively.

This approach:
- Keeps the ReviewCard component **completely unmodified** — no new props, no conditional logic
- Uses the exact same CSS classes/styling the user sees on the site
- Font sizes are overridden in the OG page's own `<style>` block (3rem title, 1.8rem sentence, 1.2rem tags)
- Link keys (amazon, audible, royal_road) are rendered as additional coloured tags

### Why Not Modify ReviewCard Props?

Adding width/height props to `ReviewCard.svelte` would:
- Complicate the component API for a use case that only exists at screenshot time
- Require responsive logic changes (the component already adapts via CSS breakpoints)
- Risk regressions in the main reviews page

CSS scaling from the page level is simpler, zero-risk to existing pages, and achieves pixel-identical output.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ scripts/generate-og.ts                                  │
│                                                         │
│  1. Start Astro dev server (port 4322)                  │
│  2. Read review frontmatter for list of slugs           │
│  3. For each review:                                    │
│     a. Check content hash — skip if unchanged           │
│     b. Navigate to /og/<slug>/                          │
│     c. Screenshot viewport at 1200×630                  │
│     d. Optimize with Sharp → WebP (quality 80)          │
│     e. Save to astro-public/og/<slug>.webp              │
│  4. Write manifest (slug→hash) for incremental builds   │
│  5. Kill dev server                                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ src/pages/og/[...slug].astro                            │
│                                                         │
│  - Minimal HTML page (no BaseLayout/nav/footer)         │
│  - Viewport: 1200×630, overflow hidden                  │
│  - Card fills full viewport with large font overrides   │
│  - Tags include link keys (amazon, audio, royal_road)   │
│  - Dark background (gray-900)                           │
│  - No hydration, no interactivity                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ src/pages/reviews/[...slug].astro (modified)            │
│                                                         │
│  - ogImage changes from cover.src to /og/<slug>.webp    │
│  - Falls back to cover if OG image doesn't exist        │
└─────────────────────────────────────────────────────────┘
```

---

## Affected Files

```
+ src/pages/og/[...slug].astro          — dedicated OG card route (scaled card + footer)
+ scripts/generate-og.ts                — Playwright screenshot orchestrator
+ astro-public/og/*.webp                — generated images (committed)
+ astro-public/og/manifest.json         — content hashes for incremental gen
~ src/pages/reviews/[...slug].astro     — point ogImage at /og/<slug>.webp
~ src/components/Seo.astro              — add og:image:width/height tags
~ astro.config.mjs                      — exclude /og/* from sitemap
```

---

## Tasks

### Phase 1: OG Card Route

- [ ] 1. Create `src/pages/og/[...slug].astro` that:
  - Uses `getStaticPaths()` from the reviews collection
  - Renders a minimal HTML page (no BaseLayout, no nav/footer)
  - Imports `src/styles/main.css` for full Tailwind + review styles
  - Body: dark bg (gray-900), 1200×630 fixed, overflow hidden
  - Card container: renders the review info using the same markup/classes as ReviewCard's wide layout (cover image left, name + description + tags right) inside the `.fancy_card.horizontal` / `.review-summary` structure
  - Container wrapper: `transform: scale(2); transform-origin: top left; width: 600px` — this fills 1200×600 of the viewport
  - Footer bar: 30px tall, full width, dark slightly lighter bg, centered text "Review from cosmiccoding.com.au" in gray-400, small font
  - No bookmark button, no 3D rotation (set `--rx` and `--ry` to 0), no glare overlay
  - Static: no `client:*` directives
  
- [ ] 2. Add `/og/*` exclusion to sitemap filter in `astro.config.mjs`

### Phase 2: Screenshot Script

- [ ] 3. Create `scripts/generate-og.ts`:
  - Starts Astro dev server on port 4322 (`npx astro dev --port 4322`)
  - Waits for server ready (poll `http://localhost:4322` until 200)
  - Reads `content/reviews/` directory to get list of review slugs
  - Computes content hash per review (hash of frontmatter: name, review tier, description, cover filename)
  - Reads existing `astro-public/og/manifest.json` for previous hashes
  - Launches single Playwright Chromium browser instance
  - For each review where hash differs or image missing:
    - Creates page with viewport 1200×630
    - Navigates to `http://localhost:4322/og/<slug>/`
    - Waits for `networkidle` (ensures cover images load)
    - Takes full-page screenshot (PNG buffer)
    - Pipes through Sharp: ensure exact 1200×630, convert to WebP quality 80
    - Writes to `astro-public/og/<slug>.webp`
  - Writes updated manifest.json
  - Closes browser and kills dev server
  - Reports: N generated, M skipped (unchanged), total time

- [ ] 4. Add `og` target to Makefile:
  ```makefile
  og:
  	npx tsx scripts/generate-og.ts
  ```

### Phase 3: Wire Up OG Images

- [ ] 5. Modify `src/pages/reviews/[...slug].astro`:
  - Change `ogImage` from `cover.src` to `/og/${entry.id}.webp`
  - Keep cover resolution for the page's own `<CoverImage>` (unchanged)

- [ ] 6. Enhance `src/components/Seo.astro`:
  - Add `og:image:width` (1200) and `og:image:height` (630) meta tags when image is present
  - These help Facebook et al. reserve correct space before fetching

### Phase 4: Generate Initial Set

- [ ] 7. Run `make og` to generate all ~150 review OG images
- [ ] 8. Verify file sizes are reasonable (target: 20-50KB each, ≤8MB total)
- [ ] 9. Commit generated images to `astro-public/og/`

---

## Verification

### Static analysis
```bash
astro check
npm run build
```

### Visual review (browser-tester)
- [ ] Visit `/og/soul_relic/` in dev — renders a clean 1200×630 card, no overflow, footer visible
- [ ] Visit `/og/noobtown/` — different tier color renders correctly
- [ ] View-source on `/reviews/soul_relic/` build output — `og:image` is absolute URL to `/og/soul_relic.webp`
- [ ] Verify `og:image:width` = 1200 and `og:image:height` = 630 in meta tags
- [ ] Spot-check 5 generated WebP files open correctly and look sharp

### Performance
- [ ] Full generation run completes in < 10 minutes
- [ ] Incremental run (no changes) completes in < 30 seconds
- [ ] Total committed image size < 10MB

---

## Architectural Decision (ADR)

**ADR-009: Playwright screenshots for OG images (committed to repo)**

**Context:** Review pages need 1200×630 landscape OG images for social sharing. The ReviewCard component uses complex CSS (tier-colored gradient overlays, 3D transforms, card glare effects, Tailwind v4) that cannot be replicated by Satori or template-based OG generators.

**Decision:** Use Playwright to screenshot a dedicated `/og/[slug]` route at build time. The route renders the ReviewCard at its natural 600px width with `transform: scale(2)` to fill 1200px, plus a 30px branded footer. Generated WebP images are committed to `astro-public/og/` rather than generated in CI.

**Consequences:**
- Repository grows by ~5-8MB (150 images × 30-50KB each). Acceptable for a personal site.
- Developers must run `make og` after adding/modifying reviews before committing.
- Full CSS fidelity — any future card redesign automatically flows to OG images on next generation.
- No CI dependency on Chromium. If repo size ever becomes a concern, can move generation to CI.
- The `/og/[slug]` routes exist in dev and build but are excluded from the sitemap and not linked from anywhere.
- The ReviewCard component is not modified — scaling is purely in the OG page's CSS.
