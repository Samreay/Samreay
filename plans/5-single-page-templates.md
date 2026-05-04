# Phase 5 — Single-page templates

**Goal:** Recreate the per-post pages for reviews, blogs, and tutorials so individual content URLs render correctly in Astro.

**Estimate:** 1 day.

## Skills to load before starting

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — dynamic routes, `getStaticPaths`, `render()`, `<Content />`

## Source files being ported

- `themes/sams-theme/layouts/reviews/single.html`
- `themes/sams-theme/layouts/_default/single.html` (used for blogs and tutorials)
- `themes/sams-theme/layouts/partials/show-code.html` (tutorial-only toggle)
- `themes/sams-theme/layouts/partials/newsletter-blog.html`

## Tasks

1. Create `src/pages/reviews/[...slug].astro`:
   ```astro
   ---
   import { getCollection, render } from 'astro:content';
   import BaseLayout from '../../layouts/BaseLayout.astro';
   import CoverImage from '../../components/CoverImage.astro';   // Phase 6
   import NewsletterForm from '../../components/NewsletterForm.astro'; // Phase 11

   export async function getStaticPaths() {
     const entries = await getCollection('reviews');
     return entries.map(entry => ({ params: { slug: entry.id }, props: { entry } }));
   }

   const { entry } = Astro.props;
   const { Content } = await render(entry);
   const r = entry.data.review;
   const ratingText = {
     'π': 'My stuff. I hope you like it.',
     S: 'Special place in my heart.',
     A: 'Amazing, definitely read.',
     B: 'Great read, highly recommend.',
     C: 'Good read, tiny quibbles.',
     D: 'Fun with flaws.',
     F: 'Significant issues, did not finish.',
   }[r];
   ---
   <BaseLayout title={entry.data.name} description={entry.data.description}>
     <div class="content content blog-post relative">
       <div class="section-header blog">
         <h1 class={`title rating rating-${r}`}>{entry.data.name}</h1>
       </div>
       <div class="max-w-4xl mx-auto mt-12 mb-20">
         <article class={`w-full review-summary bg-gray-800 rounded-xl review-${r}`}>
           <div class="bg2 rounded-xl">
             <div class="bg-inner flex flex-col md:flex-row bg-gray-800 rounded-xl overflow-hidden">
               <CoverImage entry={entry} width={500} height={800} class="rounded-l-xl block flex-none" />
               <div class="flex flex-col justify-between p-4 sm:p-8 text-center md:text-left">
                 <div class="rating">
                   <p class={`larger rating-${r}`}>{ratingText}</p>
                 </div>
                 <p class="text-lg text-gray-400">{entry.data.description}</p>
                 <div class="text-base">
                   {Object.entries(entry.data.links).map(([name, link]) => (
                     <a class={`no-under btn-sm text-white bg-${r}-700 hover:bg-${r}-600 mt-2 mr-4`} href={link}>
                       <span>{name.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                       <svg class="w-3 h-3 fill-current flex-shrink-0 ml-2" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
                         <path d="M6 5H0v2h6v4l6-5-6-5z" />
                       </svg>
                     </a>
                   ))}
                 </div>
               </div>
             </div>
           </div>
         </article>
       </div>
       <div class="max-w-xl2 mx-auto"><Content /></div>
       <div class="mt-20"><p class="text-center"><a href="/reviews">Return to review index.</a></p></div>
       <div class="mt-20"><NewsletterForm /></div>
     </div>
   </BaseLayout>
   ```
2. Create `src/pages/blogs/[...slug].astro` mirroring the simpler `_default/single.html`:
   - Title, date, optional description (skip if `hide_description`), `<Content />`, newsletter footer.
3. Create `src/pages/tutorials/[...slug].astro` similarly, but:
   - Include `<ShowCodeToggle client:idle />` (Svelte island in Phase 9) when `!entry.data.hide_toggle`.
   - The container `<div id="post-container">` keeps the `hide-code` class toggle target.
   - Skip newsletter footer (matches existing behaviour where tutorials don't have one).
4. KaTeX is wired globally in `BaseLayout.astro` (Phase 2) so `math: true` posts work without per-page configuration.
5. Drop the old MathJax `<script>` injection — KaTeX renders at build time.
6. Verify a sample of 5 representative pages render correctly in `npm run dev`:
   - `/reviews/bobiverse/` — standard review with cover, links, blurb
   - `/reviews/100th_run/` — different tier, no audible link
   - `/blogs/2023_07_writing_update/` — blog with embedded images
   - `/tutorials/bayesianlinearregression/` — tutorial with code blocks (ipynb-derived)
   - `/tutorials/<one-with-math>/` — verify KaTeX rendering

## Acceptance criteria

- All 153 review URLs build successfully.
- All 78 blog URLs build successfully.
- All 39 tutorial URLs build successfully.
- A `/reviews/bobiverse/` rendered by Astro is visually equivalent to the Hugo version (compare side-by-side).
- The "Return to review index" link works (target page lands in Phase 8).
- Math expressions render correctly via KaTeX with no flash-of-unrendered-content.

## Out of scope

- Cover image processing details (Phase 6 — this phase uses a stub `<CoverImage>`).
- Newsletter form internals (Phase 11 — uses a stub `<NewsletterForm />`).
- Tutorial show-code Svelte island (Phase 9 — uses an inline script for now).
- Image-class hack from `convert.py` (Phase 10).
- Aliases / redirects (Phase 12).
