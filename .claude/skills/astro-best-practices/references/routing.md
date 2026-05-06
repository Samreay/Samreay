# Routing

Astro uses **file-based routing**. Every supported file in `src/pages/` becomes a route.

| File | URL |
|---|---|
| `src/pages/index.astro` | `/` |
| `src/pages/about.astro` | `/about` |
| `src/pages/reviews/index.astro` | `/reviews` |
| `src/pages/reviews/[slug].astro` | `/reviews/:slug` |
| `src/pages/posts/[...path].astro` | `/posts/*` (rest parameter, any depth) |

Supported page file types: `.astro`, `.md`, `.mdx`, `.html`, plus endpoints (`.ts`, `.js`, `.json.js`, `.xml.js`).

## Static (default) vs on-demand routes

This site is fully static. Don't add an SSR adapter unless you have a concrete need. In static mode:

- Plain pages (`about.astro`) build to a single HTML file.
- Dynamic routes (`[slug].astro`) **must** export `getStaticPaths()` returning every path to build.

```astro
---
import type { GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

export const getStaticPaths = (async () => {
  const reviews = await getCollection('reviews');
  return reviews.map((review) => ({
    params: { slug: review.id },
    props: { review },
  }));
}) satisfies GetStaticPaths;

const { review } = Astro.props;
---
```

`params` populates `Astro.params`. `props` populates `Astro.props`. Always prefer passing the full entry as a prop instead of refetching it inside the page.

For type-safety on params and props inferred from `getStaticPaths`, use:

```ts
import type {
  InferGetStaticParamsType,
  InferGetStaticPropsType,
  GetStaticPaths,
} from 'astro';

type Params = InferGetStaticParamsType<typeof getStaticPaths>;
type Props = InferGetStaticPropsType<typeof getStaticPaths>;
```

## Excluding files from routing

Prefix a file or directory with `_` (e.g. `_components/`, `_draft.astro`) to exclude it from routing. Useful for colocating helpers.

## Pagination

Use `paginate()` in `getStaticPaths` for paginated list pages (e.g. `/blog/1`, `/blog/2`):

```astro
---
// src/pages/blog/[page].astro
import type { GetStaticPathsOptions } from 'astro';
import { getCollection } from 'astro:content';

export async function getStaticPaths({ paginate }: GetStaticPathsOptions) {
  const posts = (await getCollection('blogs')).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );
  return paginate(posts, { pageSize: 10 });
}

const { page } = Astro.props; // { data, currentPage, lastPage, url: { prev, next, current }, ... }
---
```

For a `/blog` index that is page 1, also create `src/pages/blog/index.astro` that renders the same component with `currentPage = 1`, or use a rest parameter route `[...page]` and treat `undefined` as page 1.

## Redirects

Permanent redirects belong in `astro.config.mjs`:

```js
export default defineConfig({
  redirects: {
    '/old-review/[slug]': '/reviews/[slug]',
    '/feed': '/rss.xml',
  },
});
```

Dynamic redirects use `Astro.redirect('/somewhere')` and **must** be called from a page, not a child component (HTML streaming has already started).

## 404 page

Create `src/pages/404.astro`. In static builds Astro outputs `404.html` and most static hosts (Netlify, GitHub Pages, S3) will use it automatically.

## Trailing slashes

Set `trailingSlash` in `astro.config.mjs` and stick to one convention. `'ignore'` (default) is the most forgiving for migrations. If you set `'never'`, also pass `trailingSlash: false` to the `rss()` helper so feed URLs match.

## API endpoints

Any file in `src/pages/` that exports a `GET` (or `POST`, etc.) function and ends with `.js`/`.ts` becomes an endpoint:

```ts
// src/pages/api/search.json.js
import { getCollection } from 'astro:content';
export async function GET() {
  const posts = await getCollection('blogs');
  return new Response(
    JSON.stringify(posts.map((p) => ({ slug: p.id, title: p.data.title }))),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
```

In static mode, `GET` endpoints are evaluated at build time and the response body is written to disk. Use this pattern for `rss.xml.js`, `sitemap.xml.js` (handled by the integration), or static JSON indexes for client-side search.
