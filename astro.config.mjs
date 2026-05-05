import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
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
  // We keep Astro's static assets in `astro-public/` rather than the default
  // `public/` because, during the Hugo→Astro migration, `public/` was Hugo's
  // build output and we needed both builds to coexist. The dedicated name
  // also makes asset ownership unambiguous when grepping the tree.
  publicDir: 'astro-public',
  integrations: [
    svelte(),
    mdx(),
    // `/kitchensink/` is a visual-regression playground that must ship to
    // `dist/` so Playwright can target it directly, but it's not a real
    // page and shouldn't be advertised to crawlers.
    sitemap({
      filter: (page) => !page.includes('/kitchensink/'),
    }),
    // Page-bundle assets co-located inside `content/<type>/<slug>/<file>`
    // are republished at `/<type>/<slug>/<file>` so raw `<video src="...">`
    // and `![...](path.png)` references in markdown keep resolving.
    contentAssets(),
  ],
  // Tailwind v4 ships as a Vite plugin instead of an Astro integration.
  // It only does work for stylesheets that contain `@import "tailwindcss"`,
  // which is wired up in `src/styles/main.css`.
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [remarkMath, remarkImageClass],
    rehypePlugins: [rehypeKatex],
    // Hand-ported TextMate JSON for the Snazzy palette Shiki doesn't ship
    // out of the box. The Phase 10 verifier asserts the rendered swatches
    // match this palette.
    shikiConfig: { theme: base16Snazzy },
  },
});
