# Phase 1 — Scaffolding

**Goal:** Initialise Astro at the repo root so `npm run build` produces a "hello world" `dist/` while the existing Hugo setup is left untouched.

**Estimate:** ½ day.

## Skills to load before starting

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — scaffolding `astro.config.mjs`, integrations, project layout

## Tasks

1. Initialise Astro at the repo root.
   - `npm create astro@latest -- --template minimal --no-git --skip-houston --typescript strict .`
   - When prompted, accept TypeScript strict mode.
2. Install dependencies:
   ```bash
   npm install \
     @astrojs/svelte @astrojs/mdx @astrojs/sitemap @astrojs/check @astrojs/tailwind \
     svelte tailwindcss@^3 sass sharp \
     remark-math rehype-katex katex \
     js-yaml gray-matter glob
   ```
3. Add `astro.config.mjs`:
   ```js
   import { defineConfig } from 'astro/config';
   import svelte from '@astrojs/svelte';
   import mdx from '@astrojs/mdx';
   import tailwind from '@astrojs/tailwind';
   import sitemap from '@astrojs/sitemap';
   import remarkMath from 'remark-math';
   import rehypeKatex from 'rehype-katex';

   export default defineConfig({
     site: 'https://cosmiccoding.com.au',
     output: 'static',
     trailingSlash: 'always',
     integrations: [
       svelte(),
       mdx(),
       tailwind({ applyBaseStyles: false }),
       sitemap(),
     ],
     markdown: {
       remarkPlugins: [remarkMath],
       rehypePlugins: [rehypeKatex],
       shikiConfig: { theme: 'base16-snazzy' },
     },
     // redirects: filled in during Phase 12
   });
   ```
4. Verify `src/pages/index.astro` renders. Run `npm run dev` on a non-default port (e.g. `4321`) and confirm Hugo's dev server can still run on its usual port simultaneously.
5. Run `npm run build` and confirm `dist/` is produced.
6. `.gitignore` additions: `dist/`, `.astro/`, `node_modules/.astro/`.

## Files added in this phase

- `astro.config.mjs`
- `tsconfig.json` (Astro template)
- `package.json` (replaces existing minimal one)
- `src/pages/index.astro` (placeholder)
- `src/env.d.ts` (Astro template)

## Files unchanged

- `themes/`, `hugo.toml`, `archetypes/`, `content/`, `resources/`, `data/`, `Makefile`, `builder/`, `resize.py`, `pyproject.toml` — all untouched.

## Acceptance criteria

- `hugo server -D` still runs and serves the site as before.
- `npm run dev` serves a placeholder Astro page at `http://localhost:4321`.
- `npm run build` exits 0 and produces `dist/index.html`.
- Astro and Hugo can run simultaneously without port conflicts.

## Notes

- Keep package version pinning on majors only (`tailwindcss@^3`); avoid pinning to exact versions until the migration is complete.
- Don't move any content yet — `content/` stays where Hugo expects it. Astro will be configured to read from this exact location in Phase 4.
