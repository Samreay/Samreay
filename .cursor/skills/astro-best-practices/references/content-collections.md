# Content collections

Content collections are the canonical way to manage groups of structurally similar content (blog posts, reviews, tutorials, artists, books, etc.). They give you:

- A typed `data` object on every entry (autocomplete in the editor).
- Build-time Zod validation: schema mismatches fail the build, not silently render wrong.
- A unified API: `getCollection(name)`, `getEntry(name, id)`, `render(entry)`.

Use them for **any directory of similar files**. Don't use `import.meta.glob` for content that fits a collection.

## File layout for this repo

```
src/
├── content/
│   ├── reviews/
│   │   └── name_of_the_wind/
│   │       ├── index.md           # entry id: "name_of_the_wind"
│   │       └── cover.jpg          # colocated assets
│   ├── blogs/
│   │   └── 2024-09-some-post.md
│   └── tutorials/
│       └── jupyter-magic.md
└── data/
    ├── books.yml
    ├── podcasts.yml
    ├── courses.yml
    └── artists.yml
```

## Defining collections

`src/content.config.ts` is the single source of truth.

```ts
import { defineCollection, reference, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

const reviews = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/reviews' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      author: z.string(),
      series: z.string().optional(),
      rating: z.number().min(0).max(10),
      cover: image(), // optimized via astro:assets
      tags: z.array(z.string()).default([]),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      draft: z.boolean().default(false),
    }),
});

const blogs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blogs' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().max(200),
      pubDate: z.coerce.date(),
      heroImage: image().optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    }),
});

const tutorials = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/tutorials' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    tags: z.array(z.string()).default([]),
  }),
});

const artists = defineCollection({
  loader: file('src/data/artists.yml'),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    url: z.string().url().optional(),
    samples: z.array(z.string()).default([]),
  }),
});

const books = defineCollection({
  loader: file('src/data/books.yml'),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    author: z.string(),
    review: reference('reviews').optional(),
  }),
});

export const collections = { reviews, blogs, tutorials, artists, books };
```

Key rules:

- Always pass a `schema`. It is technically optional but you should treat it as required.
- `image()` (available when the schema is a function) gives you optimized images directly in the data object.
- Use `z.coerce.date()` so frontmatter dates work whether they are quoted strings or YAML date literals.
- Use `reference('otherCollection')` to link entries (e.g. a book → its review). The reference is validated at build time.
- For YAML/JSON data files, use `file()`. Each top-level array item or keyed object becomes an entry; each must have an `id`.

## Querying

```astro
---
import { getCollection, getEntry, render } from 'astro:content';

const allReviews = (await getCollection('reviews', ({ data }) => !data.draft))
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

const featured = await getEntry('reviews', 'name_of_the_wind');
---
```

- `getCollection(name)` returns an array. **Always sort it explicitly** — order is non-deterministic across platforms.
- The optional second argument filters entries. Use it to drop drafts in production.
- `getEntry(name, id)` returns one entry or `undefined`. Handle missing entries with a 404.

## Rendering Markdown body

```astro
---
import { getEntry, render } from 'astro:content';

const review = await getEntry('reviews', Astro.params.slug!);
if (!review) return Astro.redirect('/404');

const { Content, headings } = await render(review);
---

<article>
  <h1>{review.data.title}</h1>
  <Content />
</article>

<aside>
  <ul>
    {headings.map((h) => <li><a href={`#${h.slug}`}>{h.text}</a></li>)}
  </ul>
</aside>
```

`render()` returns:

- `Content`: a component you render to inject the Markdown HTML.
- `headings`: array of `{ depth, slug, text }` for building a TOC.
- `remarkPluginFrontmatter`: any extra frontmatter computed by remark plugins (e.g. reading time).

## Generating routes from a collection

Use `getStaticPaths` in a dynamic route file:

```astro
---
// src/pages/reviews/[slug].astro
import type { GetStaticPaths } from 'astro';
import { getCollection, render } from 'astro:content';
import ReviewLayout from '../../layouts/ReviewLayout.astro';

export const getStaticPaths = (async () => {
  const reviews = await getCollection('reviews', ({ data }) => !data.draft);
  return reviews.map((review) => ({
    params: { slug: review.id },
    props: { review },
  }));
}) satisfies GetStaticPaths;

const { review } = Astro.props;
const { Content } = await render(review);
---
<ReviewLayout review={review}>
  <Content />
</ReviewLayout>
```

The `id` of an entry from a `glob()` loader matches the file path relative to the `base`, with the extension stripped. Override per-entry by setting a `slug:` in the frontmatter.

## References between collections

A `reference('reviews')` field stores the target id; resolve it at render time:

```astro
---
import { getEntry } from 'astro:content';
const book = await getEntry('books', 'the-way-of-kings');
const review = book.data.review ? await getEntry(book.data.review) : null;
---
{review && <a href={`/reviews/${review.id}/`}>Read review</a>}
```

`getEntry(reference)` accepts the reference object directly.

## Drafts

Add `draft: z.boolean().default(false)` to the schema. Filter in queries:

```ts
const isDev = import.meta.env.DEV;
const reviews = await getCollection('reviews', ({ data }) => isDev || !data.draft);
```

This way drafts are visible in `astro dev` but never built for production.

## When NOT to use a collection

- One-off pages (`/about`, `/contact`) → just write `src/pages/about.astro` directly.
- Static assets that don't have structured frontmatter → put them in `public/`.
- Truly dynamic, request-time data → use a live collection (with a custom loader) or a regular API endpoint.
