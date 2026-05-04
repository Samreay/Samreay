import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkImageClass } from './src/lib/remark-image-class.ts';
import base16Snazzy from './src/lib/shiki-themes/base16-snazzy.json' with { type: 'json' };
import { collectRedirects } from './scripts/collect-redirects.mjs';
import { contentAssets } from './scripts/content-assets.mjs';

// Hugo's `aliases:` frontmatter is replicated as Astro's `redirects` map.
// `collectRedirects` walks `content/{reviews,blogs,tutorials}/*/index.{md,mdx}`
// once at config-load time and produces `{ '/old/path/': '/new/path/' }`.
const redirects = await collectRedirects();

export default defineConfig({
  site: 'https://cosmiccoding.com.au',
  output: 'static',
  // 'ignore' keeps the published file layout identical (every page becomes a
  // directory with index.html) but lets the dev server accept both `/foo` and
  // `/foo/` so a forgotten slash doesn't dump the user onto Astro's strict
  // 404. GitHub Pages does the trailing-slash redirect for us in production.
  trailingSlash: 'ignore',
  redirects,
  // Hugo writes to `public/`, which is Astro's default `publicDir`. During the
  // migration we keep both builds side-by-side, so we point Astro at a
  // dedicated `astro-public/` (created on demand). Phase 14 (cutover) deletes
  // Hugo entirely and we'll move things back to `public/` if/when convenient.
  publicDir: 'astro-public',
  integrations: [
    svelte(),
    mdx(),
    tailwind({ applyBaseStyles: false }),
    sitemap(),
    // Hugo's page-bundle model published `content/<type>/<slug>/<file>` at
    // `/<type>/<slug>/<file>`. `contentAssets()` restores that for non-image,
    // non-markdown files (videos, PDFs, PSDs, zips, notebook downloads) so
    // raw `<video src="...">` tags inside the markdown still work.
    contentAssets(),
  ],
  markdown: {
    remarkPlugins: [remarkMath, remarkImageClass],
    rehypePlugins: [rehypeKatex],
    // Shiki doesn't bundle the Chroma `base16-snazzy` theme Hugo used; we
    // ship a hand-ported TextMate JSON adaptation in
    // `src/lib/shiki-themes/base16-snazzy.json` (Snazzy palette via the
    // standard base16 → tmTheme mapping). Phase 10 verifier asserts the
    // rendered swatches use the snazzy palette colours.
    shikiConfig: { theme: base16Snazzy },
  },
});
