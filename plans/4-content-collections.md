# Phase 4 — Content collections

**Goal:** Define typed, validated content collections for `reviews`, `blogs`, `tutorials`, `artists`. This replaces Hugo's implicit frontmatter conventions with build-time Zod validation.

**Estimate:** ½ day.

## Skills to load before starting

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — content collections, Zod schemas, `glob()` loader

## Sources being modelled

- `content/reviews/<slug>/index.md` × 153
- `content/blogs/<slug>/index.md` × 78
- `content/tutorials/<slug>/index.md` × 39 (some converted from `.ipynb` by `builder/convert.py`)
- `content/artists/_index.md` (taxonomy landing) — handled separately
- `data/artists.yml`, `data/books.yml`, `data/courses.yml`, `data/other.yml`, `data/podcasts.yml`, `data/categories.yml`, `data/status.yml`

## Tasks

1. Create `src/content.config.ts`:
   ```ts
   import { defineCollection, z } from 'astro:content';
   import { glob } from 'astro/loaders';

   const REVIEW_TIER = z.enum(['π', 'S', 'A', 'B', 'C', 'D', 'F']);

   const reviews = defineCollection({
     loader: glob({ pattern: '*/index.md', base: './content/reviews' }),
     schema: ({ image }) => z.object({
       title: z.string(),
       name: z.string(),
       description: z.string(),
       sentence: z.string(),
       date: z.coerce.date(),
       auth: z.string(),
       categories: z.array(z.string()).default(['reviews']),
       review: REVIEW_TIER,
       weight: z.number(),
       tags: z.array(z.string()).default([]),
       search_terms: z.string().default(''),
       aliases: z.array(z.string()).default([]),
       links: z.record(z.string(), z.string()).default({}),
       video: z.string().optional(),
       images: z.array(z.string()).optional(),
       short_title: z.string().optional(),
       math: z.boolean().default(false),
     }),
   });

   const blogs = defineCollection({
     loader: glob({ pattern: '*/index.md', base: './content/blogs' }),
     schema: z.object({
       title: z.string(),
       description: z.string().optional(),
       date: z.coerce.date(),
       categories: z.array(z.string()).default(['blog']),
       tags: z.array(z.string()).default([]),
       aliases: z.array(z.string()).default([]),
       images: z.array(z.string()).optional(),
       short_title: z.string().optional(),
       hide_description: z.boolean().default(false),
       math: z.boolean().default(false),
       layout: z.string().optional(),
     }),
   });

   const tutorials = defineCollection({
     loader: glob({ pattern: '*/index.{md,mdx}', base: './content/tutorials' }),
     schema: z.object({
       title: z.string(),
       description: z.string().optional(),
       date: z.coerce.date(),
       categories: z.array(z.string()).default(['tutorial']),
       tags: z.array(z.string()).default([]),
       aliases: z.array(z.string()).default([]),
       images: z.array(z.string()).optional(),
       short_title: z.string().optional(),
       hide_description: z.boolean().default(false),
       hide_toggle: z.boolean().default(false),
       math: z.boolean().default(false),
     }),
   });

   export const collections = { reviews, blogs, tutorials };
   ```
2. Convert each Hugo data file to a typed TS module under `src/data/`:
   - `data/books.yml` → `src/data/books.ts` (typed array of `{ link, cover, animated?, css, desc }`)
   - `data/courses.yml` → `src/data/courses.ts`
   - `data/other.yml` → `src/data/other.ts`
   - `data/artists.yml` → `src/data/artists.ts` (the largest one, used by Phase 9's artists explorer)
   - `data/podcasts.yml`, `data/status.yml`, `data/categories.yml` → mirror as needed
   - Use a quick one-shot Python or Node script:
     ```bash
     for f in data/*.yml; do
       node -e "console.log('export default',JSON.stringify(require('js-yaml').load(require('fs').readFileSync('$f','utf-8')),null,2),' as const;')" \
         > src/data/$(basename "$f" .yml).ts
     done
     ```
     Then hand-edit each to add an `export const NAME = (...).map(...) as const` typed declaration where helpful.
3. Spot-check schema parses succeed:
   ```bash
   npm run astro -- check
   ```
   Expect zero errors. Any frontmatter that doesn't validate is logged with the offending file path — fix the frontmatter (or relax the schema) before continuing.
4. Add a `src/lib/content.ts` helper module exporting common queries:
   ```ts
   import { getCollection } from 'astro:content';

   export const getRecentBlogs = async (n = 6) =>
     (await getCollection('blogs', e => e.data.tags.length >= 0))
       .sort((a, b) => +b.data.date - +a.data.date)
       .slice(0, n);

   export const getRecentReviews = async (n = 5) =>
     (await getCollection('reviews'))
       .sort((a, b) => +b.data.date - +a.data.date)
       .slice(0, n);

   export const getReviewsByWeight = async () =>
     (await getCollection('reviews'))
       .sort((a, b) => a.data.weight - b.data.weight);
   ```

## Acceptance criteria

- `npm run build` parses every markdown file with no schema errors.
- `getCollection('reviews')` returns 153 entries, `blogs` returns 78, `tutorials` returns 39.
- Hovering a `entry.data.review` in VSCode shows the union type `'π' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F'`.
- Hugo build still works in parallel (data files in `data/` untouched, even though the typed copies live under `src/data/`).

## Risks

- **Frontmatter inconsistencies**: 270 markdown files were authored over ~10 years. Expect a handful with missing or odd fields. Mitigation: schemas use `.optional()` / `.default()` liberally for non-critical fields and only enforce the truly load-bearing ones (`title`, `date`, `review`, `weight`, `name`).
- **`links` shape**: it's a Go-template map (`{ amazon: "...", audible: "..." }`). Zod `z.record(z.string(), z.string())` covers this.
- **`weight: 0`**: schema allows it; sort handles it.

## Out of scope

- Building the actual list and detail pages (Phase 5+).
- Image type checking on `images: [...]` arrays — handled in Phase 6.
