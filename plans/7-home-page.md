# Phase 7 — Home page

**Goal:** Reproduce the home page (`/`) by porting each section partial to a small static `.astro` component composed by `src/pages/index.astro`.

**Estimate:** ½ day.

## Skills to load before starting

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — page composition, sectioned `.astro` partials

## Source files being ported

- `themes/sams-theme/layouts/index.html` (composition)
- `themes/sams-theme/layouts/partials/sections/about.html`
- `themes/sams-theme/layouts/partials/sections/books.html`
- `themes/sams-theme/layouts/partials/sections/reviews.html`
- `themes/sams-theme/layouts/partials/sections/blogs.html`
- `themes/sams-theme/layouts/partials/sections/tutorials.html`
- `themes/sams-theme/layouts/partials/sections/courses.html`
- `themes/sams-theme/layouts/partials/sections/other.html`
- `themes/sams-theme/layouts/partials/card.html` (used by blog/tutorial teasers)
- `themes/sams-theme/layouts/partials/card_cover.html` (used by review teasers)

## Tasks

1. Create `src/components/sections/About.astro`:
   - Static markup, ports `partials/sections/about.html` 1:1.
   - Uses anchor links to `#books`, `#courses`, etc.
2. Create `src/components/sections/Books.astro`:
   - Imports `books` from `src/data/books.ts`.
   - Renders the 3-column grid with the `<BookCard>` 3D hover effect.
   - Includes the inline Mailerlite signup CTA (or replaces it with `<NewsletterForm variant="compact" />` from Phase 11 — easier).
3. Create `src/components/sections/ReviewsTeaser.astro`:
   ```astro
   ---
   import { getCollection } from 'astro:content';
   import ReviewCoverCard from '../ReviewCoverCard.astro';
   const reviews = (await getCollection('reviews'))
     .sort((a, b) => +b.data.date - +a.data.date)
     .slice(0, 5);
   ---
   <div class="content content-wide">
     <div class="section-header">
       <h1>Book Reviews</h1>
       <p>For those loving progression fantasy and LitRPG, here are my latest reviews.
         <a class="under" href="/reviews">More available here, of course!</a></p>
     </div>
     <div class="max-w-sm mx-auto md:max-w-none">
       <div class="grid gap-12 md:grid-cols-3 lg:grid-cols-4 lg:grid-cols-5 md:gap-x-6 md:gap-y-8 items-start">
         {reviews.map(entry => <ReviewCoverCard entry={entry} />)}
       </div>
     </div>
   </div>
   ```
4. Create `src/components/sections/BlogsTeaser.astro` and `src/components/sections/TutorialsTeaser.astro`:
   - Use `getCollection` filtered by category (`'blog'` / `'tutorial'`), date-sorted descending, take 6 / 3.
   - Each card uses `<PostCard>` (port of `partials/card.html`).
5. Create `src/components/sections/Courses.astro` and `src/components/sections/Other.astro`:
   - Import `courses` from `src/data/courses.ts` and `other` from `src/data/other.ts`.
   - Static rendering, no JS needed.
6. Port the supporting card components:
   - `src/components/ReviewCoverCard.astro` — the rounded square book cover with hover scale.
   - `src/components/PostCard.astro` — the wide horizontal card with image, title, description, tag pills.
   - `src/components/BookCard.astro` — the fancy 3D hover card used in `Books.astro`.
7. Replace `src/pages/index.astro`:
   ```astro
   ---
   import BaseLayout from '../layouts/BaseLayout.astro';
   import About from '../components/sections/About.astro';
   import Books from '../components/sections/Books.astro';
   import ReviewsTeaser from '../components/sections/ReviewsTeaser.astro';
   import BlogsTeaser from '../components/sections/BlogsTeaser.astro';
   import TutorialsTeaser from '../components/sections/TutorialsTeaser.astro';
   import Courses from '../components/sections/Courses.astro';
   import Other from '../components/sections/Other.astro';
   ---
   <BaseLayout>
     <div class="primary-content">
       <About />
       <Books />
       <ReviewsTeaser />
       <BlogsTeaser />
       <TutorialsTeaser />
       <Courses />
       <Other />
     </div>
   </BaseLayout>
   ```

## Acceptance criteria

- Home page builds with no errors.
- Visual diff against the Hugo home page shows no meaningful differences. Header positions and grid breakpoints match.
- The "Books" 3D hover effect works on `<BookCard>`.
- All teaser cards link to working detail pages (built in Phase 5).
- The `_index.md` files under `content/{reviews,blogs,tutorials,artists}/` are not collected by `glob` (their pattern is `*/index.md`, not `_index.md`). Verify the home page doesn't error on missing detail routes for these.

## Risks

- The `flowchart.html` partial is currently commented out in `index.html`. Don't port it on the home page — the Figma flowchart only appears as a layout option inside the reviews explorer (Phase 8).
- `lg:grid-cols-4 lg:grid-cols-5` in the source is a duplicated class (the second wins). Preserve the same behaviour to avoid accidental visual change.

## Out of scope

- The CTA newsletter form details (Phase 11).
- Per-book cover image processing (Phase 6 already covered).
- The reviews explorer itself (Phase 8).
