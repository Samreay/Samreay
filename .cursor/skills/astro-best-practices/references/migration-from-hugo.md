# Migrating this Hugo site to Astro

This is the concrete plan for converting `themes/sams-theme/` + `content/` + `data/` + `hugo.toml` into an Astro project.

## Step 0: Scaffold

```bash
npm create astro@latest -- --template blog
# pick TypeScript: strict
# install dependencies: yes
```

Then drop the new project's `src/`, `astro.config.mjs`, and `tsconfig.json` into a fresh branch alongside the existing repo, or replace the old `themes/`, `archetypes/`, `hugo.toml`, etc. once parity is reached.

## Step 1: Move content unchanged where possible

Astro accepts your existing Markdown almost as-is. Differences to watch for:

- **YAML frontmatter is fine.** Astro supports YAML or TOML; JSON frontmatter must be converted.
- **Hugo's special properties** (`url`, `slug`, `aliases`, `weight`, `draft`, `date`) are not all special in Astro. Define them explicitly in your collection schema if you want to use them.
- **Hugo's `_index.md`** files for section listings should be deleted — list pages become `src/pages/<section>/index.astro` and pull data from collections.
- **Hugo Page Bundles** (`name_of_book/index.md` with sibling images) port directly. Use `glob({ pattern: '**/index.md', base: ... })` so the directory becomes the entry id.
- **Shortcodes** (`{{< highlight >}}`, `{{< ico >}}`) become `<Highlight />` / `<Ico />` Astro components imported from `.mdx`. Plain Markdown cannot import components, so files using shortcodes must be renamed `.mdx`.

## Step 2: Mapping table for this repo

| Hugo file/concept | Astro equivalent |
|---|---|
| `hugo.toml` `baseURL` | `astro.config.mjs` `site` |
| `hugo.toml` `[params]` | A typed `src/config/site.ts` exporting constants, or `import.meta.env.PUBLIC_*` for env-driven values |
| `hugo.toml` `[markup.highlight]` | `markdown.shikiConfig` in `astro.config.mjs` (Astro uses Shiki, not Chroma) |
| `hugo.toml` `[deployment.matchers]` | Host-specific config (`netlify.toml`, `_headers`, etc.). Astro doesn't deploy. |
| `archetypes/` | Delete. Replace with a small node script or a project Cursor skill that scaffolds new entries. |
| `convert.py` (Jupyter → Markdown) | Keep the script; output into `src/content/tutorials/`. |
| `resize.py` | Delete. Use `<Image />` / `<Picture />`. |
| `Makefile` `blog` target | `npm run dev` |
| `Makefile` `prod` target | `npm run build` (which should be `astro check && astro build`) |
| `themes/sams-theme/layouts/_default/baseof.html` | `src/layouts/BaseLayout.astro` |
| `themes/sams-theme/layouts/_default/list.html` | `src/pages/<section>/index.astro` per section, or a `<List />` component used by each |
| `themes/sams-theme/layouts/_default/single.html` | `src/pages/<section>/[slug].astro` per section, or a shared `SingleLayout.astro` |
| `themes/sams-theme/layouts/partials/head.html` | `src/components/Head.astro` |
| `themes/sams-theme/layouts/partials/seo.html` | `src/components/Seo.astro` |
| `themes/sams-theme/layouts/partials/opengraph.html` | merged into `Seo.astro` |
| `themes/sams-theme/layouts/partials/twitter_cards.html` | merged into `Seo.astro` |
| `themes/sams-theme/layouts/partials/navbar.html` | `src/components/Navbar.astro` |
| `themes/sams-theme/layouts/partials/footer.html` | `src/components/Footer.astro` |
| `themes/sams-theme/layouts/partials/card*.html` | `src/components/Card.astro` (with variants via props) |
| `themes/sams-theme/layouts/partials/sections/*.html` | `src/components/sections/*.astro` |
| `themes/sams-theme/layouts/partials/analytics.html` | `src/components/Analytics.astro` (Partytown'd) |
| `themes/sams-theme/layouts/partials/share.html` | `src/components/Share.astro` |
| `themes/sams-theme/layouts/partials/recent.html` | `src/components/Recent.astro` (queries the collection) |
| `themes/sams-theme/layouts/shortcodes/highlight.html` | `src/components/Highlight.astro` (used in `.mdx`) |
| `themes/sams-theme/layouts/shortcodes/ico.html` | `src/components/Ico.astro` |
| `themes/sams-theme/layouts/reviews/list.html` | `src/pages/reviews/index.astro` |
| `themes/sams-theme/layouts/reviews/single.html` | `src/pages/reviews/[slug].astro` + `src/layouts/ReviewLayout.astro` |
| `themes/sams-theme/layouts/artists/list.html` | `src/pages/artists/index.astro` |
| `themes/sams-theme/layouts/index.html` | `src/pages/index.astro` |
| `themes/sams-theme/layouts/404.html` | `src/pages/404.astro` |
| `themes/sams-theme/layouts/partials/sections/flowchart.html` | `src/components/sections/Flowchart.astro` |
| `themes/sams-theme/assets/css/*.scss` | One `src/styles/global.css` with `@import "tailwindcss"` + small scoped `<style>` blocks. Audit each SCSS rule. |
| `themes/sams-theme/assets/js/main.js` | Either `<script>` blocks colocated with the relevant component, or `src/scripts/main.ts` imported from `BaseLayout.astro`. |
| `themes/sams-theme/static/*` | `public/*` |
| `data/books.yml`, `data/podcasts.yml`, … | `src/data/*.yml` loaded with `file()` loader (see content-collections.md) |
| `content/reviews/<book>/index.md` | `src/content/reviews/<book>/index.md` (collection entry) |
| `content/blogs/*.md` | `src/content/blogs/*.md` |
| `content/tutorials/*.md` | `src/content/tutorials/*.md` |
| `content/artists/_index.md` | Delete (becomes `src/pages/artists/index.astro`) |
| Hugo `{{ .Site.BaseURL }}` | `Astro.site` (a `URL` instance) |
| Hugo `{{ .Permalink }}` | `new URL(Astro.url.pathname, Astro.site).toString()` |
| Hugo `{{ partial "x" . }}` | `<X />` Astro component import |
| Hugo `{{ range }}` | `{items.map((item) => <Card item={item} />)}` |
| Hugo `{{ with .Param "x" }}` | `{x && <Block />}` |
| Hugo `getJSON` / `getCSV` | Build-time `import` for static files, `fetch()` for remote, or a custom collection loader |
| Hugo `resources.Get` / image processing | `import` from `src/assets/` + `<Image />` |
| Hugo `safeHTML` / unsafe Goldmark | `<div set:html={trustedHtml} />` (sanitize first!) |

## Step 3: Worked example — porting `reviews/list.html`

Hugo:

```go-html-template
{{ range (where .Site.RegularPages "Section" "reviews") }}
  <a href="{{ .Permalink }}">
    <h3>{{ .Title }}</h3>
    <p>{{ .Params.author }}</p>
  </a>
{{ end }}
```

Astro (`src/pages/reviews/index.astro`):

```astro
---
import { getCollection } from 'astro:content';
import { Image } from 'astro:assets';
import BaseLayout from '../../layouts/BaseLayout.astro';

const reviews = (await getCollection('reviews', ({ data }) => !data.draft))
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
---
<BaseLayout title="Reviews">
  <ul class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
    {reviews.map((r) => (
      <li>
        <a href={`/reviews/${r.id}/`} class="block group">
          <Image src={r.data.cover} alt={`${r.data.title} cover`} class="rounded" />
          <h3 class="mt-2 text-lg font-semibold group-hover:underline">{r.data.title}</h3>
          <p class="text-sm opacity-70">{r.data.author}</p>
        </a>
      </li>
    ))}
  </ul>
</BaseLayout>
```

## Step 4: Worked example — porting `reviews/single.html`

Hugo single template (simplified):

```go-html-template
{{ define "main" }}
  <article>
    <h1>{{ .Title }}</h1>
    {{ .Content }}
  </article>
{{ end }}
```

Astro (`src/pages/reviews/[slug].astro`):

```astro
---
import type { GetStaticPaths } from 'astro';
import { getCollection, render } from 'astro:content';
import { Image } from 'astro:assets';
import BaseLayout from '../../layouts/BaseLayout.astro';

export const getStaticPaths = (async () => {
  const reviews = await getCollection('reviews');
  return reviews.map((review) => ({ params: { slug: review.id }, props: { review } }));
}) satisfies GetStaticPaths;

const { review } = Astro.props;
const { Content, headings } = await render(review);
---
<BaseLayout title={review.data.title} description={`${review.data.title} by ${review.data.author}`}>
  <article class="prose mx-auto">
    <Image src={review.data.cover} alt="" class="not-prose w-full" />
    <h1>{review.data.title}</h1>
    <p>by <strong>{review.data.author}</strong> — {review.data.rating}/10</p>
    <Content />
  </article>
</BaseLayout>
```

## Step 5: Migration checklist

1. Scaffold a clean Astro project alongside the Hugo one.
2. Configure `astro.config.mjs` (`site`, integrations, image config).
3. Write `src/content.config.ts` with schemas for every collection.
4. Move `content/<section>/...` → `src/content/<section>/...`. Resolve any frontmatter the schema rejects.
5. Move `data/*.yml` → `src/data/*.yml` and add `file()` collections.
6. Build `BaseLayout.astro`, `Head.astro`, `Seo.astro`, `Navbar.astro`, `Footer.astro`.
7. Build `src/pages/index.astro` plus list + dynamic detail pages for each section.
8. Port shortcodes to `.astro` components and rename consuming files to `.mdx`.
9. Replace all references to `static/...` resized images with `src/assets/...` imports + `<Image />`.
10. Add `rss.xml.js`, sitemap, robots.
11. Wire Partytown'd analytics.
12. Update `Makefile` / scripts (`npm run dev`, `npm run build`).
13. Compare a handful of pages side-by-side with the live Hugo site for visual parity.
14. Delete `themes/`, `hugo.toml`, `archetypes/`, `resize.py`, all Hugo make targets.
15. Update `CNAME` / deploy config if needed.

## Things Hugo did that Astro intentionally doesn't

- **Implicit "kind" templates** (`page`, `section`, `home`, `taxonomy`). In Astro you write each page or `getStaticPaths` route explicitly. This is more code but far less magic.
- **Built-in taxonomies.** Tags pages must be built manually with `[tag].astro` + `getStaticPaths`.
- **Configurable URL `prettyURLs` / `uglyURLs`.** Use `trailingSlash` and explicit file naming.
- **`disableKinds`.** Just don't create the page.

The migration is mostly mechanical. The hard parts are auditing the SCSS and rewriting the more elaborate Hugo partials (`recent.html`, anything that calls `where` / `intersect` / `sort`) — these become straightforward TypeScript inside an `.astro` frontmatter.
