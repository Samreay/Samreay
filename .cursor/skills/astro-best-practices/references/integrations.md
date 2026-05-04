# Integrations

Astro integrations are added via `astro add <name>` (preferred — handles deps and config) or manually in `astro.config.mjs`.

## Recommended integrations for this repo

| Integration | Purpose | Install |
|---|---|---|
| `@astrojs/mdx` | Use components in Markdown (replaces Hugo shortcodes) | `npx astro add mdx` |
| `@astrojs/sitemap` | Auto-generate `sitemap-index.xml` | `npx astro add sitemap` |
| `@astrojs/rss` | Generate RSS feed (helper, not a typical integration) | `npm install @astrojs/rss` |
| `@astrojs/partytown` | Move analytics off the main thread | `npx astro add partytown` |
| `@tailwindcss/vite` | Tailwind v4 (added by `astro add tailwind`) | `npx astro add tailwind` |

Avoid unless actually needed:

- `@astrojs/alpinejs` — only if you keep Alpine. Most existing Alpine snippets in this repo are simple enough to rewrite as plain `<script>` or as a small Svelte/Preact island.
- `@astrojs/react`/`vue`/`svelte` — only when you need a real interactive island. Don't add all three.
- `@astrojs/node`/`vercel`/`netlify` adapters — only for SSR. This site is fully static.

## MDX

MDX gives you JSX expressions and component imports inside `.md`-style files. It's the direct replacement for Hugo shortcodes.

```mdx
---
title: A tutorial post
pubDate: 2025-08-01
---
import Highlight from '../../components/Highlight.astro';
import Figure from '../../components/Figure.astro';

# Topic intro

<Highlight>This is the same as Hugo's `highlight` shortcode.</Highlight>

<Figure src={import('../../assets/diagram.png')} caption="System diagram" />
```

MDX inherits your top-level `markdown` config (remark/rehype plugins, syntax highlighting). Override per-MDX by passing options to `mdx()` in `astro.config.mjs`.

## Sitemap

```js
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://cosmiccoding.com.au', // required for sitemap
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/draft'),
      changefreq: 'weekly',
    }),
  ],
});
```

Outputs `sitemap-index.xml` and `sitemap-0.xml` to `dist/`. Reference from `robots.txt`:

```
Sitemap: https://cosmiccoding.com.au/sitemap-index.xml
```

## RSS

`@astrojs/rss` is a helper used inside an `.xml.js` endpoint, not an integration. Create `src/pages/rss.xml.js`:

```js
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = (await getCollection('blogs', ({ data }) => !data.draft))
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  return rss({
    title: 'Samuel Hinton',
    description: "Samuel Hinton's blog, tutorials, and book reviews.",
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blogs/${post.id}/`,
    })),
  });
}
```

Add the autodiscovery link tag in your `BaseLayout.astro` `<head>`:

```astro
<link rel="alternate" type="application/rss+xml" title="Samuel Hinton" href={new URL('rss.xml', Astro.site)} />
```

For multiple feeds (one per section), create more endpoints (`reviews-rss.xml.js`, etc.).

## Partytown for Google Analytics

The current site uses GA4 (`G-GRX6QE03YR`). Move it off the main thread:

```js
import partytown from '@astrojs/partytown';

export default defineConfig({
  integrations: [
    partytown({
      config: { forward: ['dataLayer.push', 'gtag'] },
    }),
  ],
});
```

Then load GA with `type="text/partytown"`:

```astro
<script type="text/partytown" async src={`https://www.googletagmanager.com/gtag/js?id=${id}`} />
<script type="text/partytown" define:vars={{ id }}>
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', id);
</script>
```

## Custom integrations

Inline integrations are useful for one-off build hooks (e.g. copying a `data/` folder into `public/` for client-side fetch):

```js
{
  name: 'copy-data',
  hooks: {
    'astro:build:done': async ({ dir }) => { /* ... */ },
  },
}
```

Don't reach for this for anything a content collection or a Vite plugin can already do.

## Toggling integrations conditionally

Falsy values are ignored, so this works:

```js
integrations: [
  process.env.CI && sitemap(),
  mdx(),
],
```

## Upgrading

Run `npx @astrojs/upgrade` to bump Astro and all official integrations together. Doing them piecewise often produces version mismatches.
