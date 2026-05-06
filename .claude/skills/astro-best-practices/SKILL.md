---
name: astro-best-practices
description: Apply Astro v5 best practices when migrating this Hugo site or authoring any new Astro code in the repo. Covers project structure, content collections, routing, components, Tailwind, images, integrations, and Hugo→Astro migration mapping. Use when planning the migration, scaffolding the new Astro project, writing `.astro` components, defining `src/content.config.ts`, configuring `astro.config.mjs`, or porting Hugo partials, shortcodes, layouts, data files, or `resize.py` image processing to Astro.
---

# Astro Best Practices for this Repo

This skill captures the rules and patterns that should be followed when (re)building this site (a Hugo-based blog with reviews, tutorials, blogs, and artists sections) in Astro v5+. It is opinionated for **content-driven static sites** with optional islands of interactivity.

When in doubt, prefer the most boring, server-rendered solution. Astro's whole point is "zero JS by default"; do not undermine that.

## Quick mental model

- An Astro project is a **content site that renders to HTML at build time**, not a SPA.
- Pages live in `src/pages/`. Each `.astro`, `.md`, or `.mdx` file in that tree is a route.
- Reusable HTML lives in `src/components/`. Reusable page shells live in `src/layouts/`.
- Structured content (reviews, blog posts, tutorials, artists) lives in **content collections** defined in `src/content.config.ts`, queried with `getCollection()` / `getEntry()`.
- UI framework components (React, Svelte, Vue, etc.) are **opt-in islands**. Default to plain `.astro` components and only reach for a framework when you need real interactivity.
- Tailwind v4 is the supported path; the legacy `@astrojs/tailwind` integration is deprecated.

## Recommended project structure (for this repo)

```
src/
├── assets/                  # Images & SVGs that should be optimized (replaces resize.py inputs)
├── components/              # Reusable .astro / framework components (was: themes/.../layouts/partials/)
│   ├── Card.astro
│   ├── Navbar.astro
│   └── Footer.astro
├── content/
│   ├── reviews/             # was content/reviews/*/index.md
│   ├── blogs/               # was content/blogs/
│   ├── tutorials/           # was content/tutorials/
│   └── artists/             # was content/artists/ (or data/artists.yml)
├── data/                    # YAML data → loaded via the file() loader (books.yml, podcasts.yml, ...)
├── layouts/                 # Page shells (BaseLayout.astro, ReviewLayout.astro, ...)
├── pages/                   # File-based routing
│   ├── index.astro
│   ├── reviews/
│   │   ├── index.astro      # list page (was layouts/reviews/list.html)
│   │   └── [slug].astro     # detail page (was layouts/reviews/single.html)
│   ├── blogs/[slug].astro
│   ├── tutorials/[slug].astro
│   ├── artists/index.astro
│   └── rss.xml.js
├── styles/                  # global.css with @import "tailwindcss";
└── content.config.ts        # collection definitions + Zod schemas
public/                      # robots.txt, favicon, /resume PDFs, anything served as-is
astro.config.mjs
tsconfig.json                # extends "astro/tsconfigs/strict"
```

`public/` is for files that should ship untouched. `src/assets/` is for files Astro should optimize (images especially).

## Core principles

1. **Server-first, zero JS by default.** Render everything as `.astro` unless interactivity demands otherwise. Never reach for a framework component just to render markup.
2. **Use content collections for any directory of similar files.** Reviews, blogs, tutorials, artists, books, podcasts, and the YAML data files in `data/` should all be collections with Zod schemas. Schemas give you type safety, autocomplete, and build-time validation - much stronger than Hugo's frontmatter.
3. **Use the `<Image />` and `<Picture />` components from `astro:assets`** for all images in `src/`. They handle resizing, format conversion (avif/webp), `srcset`, lazy loading, and CLS-safe dimensions automatically. This replaces the manual `resize.py` pipeline.
4. **Scope CSS by default.** A `<style>` block inside a `.astro` component is automatically scoped. Reach for `is:global` only for truly global rules (typography resets, prose styles).
5. **Use Tailwind v4 via `@tailwindcss/vite`,** not the deprecated `@astrojs/tailwind` integration. Install with `npx astro add tailwind` (Astro ≥5.2).
6. **Hydrate islands sparingly.** Use `client:visible` or `client:idle` for non-critical widgets, `client:load` only for above-the-fold interactivity, and `client:only="<framework>"` only when SSR truly cannot work.
7. **Type everything.** Define a `Props` interface in every component that takes props. Extend `astro/tsconfigs/strict` (or `strictest`).
8. **Prefer `import` over `<link>` for stylesheets** in `src/`. Astro will bundle, hash, and optimize them. `<link>` is for assets in `public/` or external URLs.
9. **Never commit `dist/` or `.astro/`.** Add them to `.gitignore`. The `.astro/` folder is a regenerated cache.
10. **Use `astro check && astro build` as the build command** so TypeScript errors fail the build.

## Bare minimum config for this repo

`astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://cosmiccoding.com.au',
  trailingSlash: 'ignore',
  integrations: [mdx(), sitemap()],
  image: {
    layout: 'constrained',
    responsiveStyles: true,
  },
  markdown: {
    shikiConfig: { theme: 'github-dark' },
  },
  vite: {
    plugins: [/* @tailwindcss/vite added by `astro add tailwind` */],
  },
});
```

`src/styles/global.css`:

```css
@import "tailwindcss";
```

`src/content.config.ts` — see [references/content-collections.md](references/content-collections.md) for the full schema for reviews/blogs/tutorials/artists.

## When migrating from Hugo, map these concepts

| Hugo | Astro |
|---|---|
| `layouts/_default/baseof.html` | `src/layouts/BaseLayout.astro` |
| `layouts/partials/*.html` | `src/components/*.astro` |
| `layouts/<section>/list.html` | `src/pages/<section>/index.astro` |
| `layouts/<section>/single.html` | `src/pages/<section>/[slug].astro` |
| `layouts/shortcodes/*.html` | `.astro` components imported in `.mdx` files |
| `content/<section>/*.md` (Page Bundles) | `src/content/<section>/*.md` (collection entries) |
| `data/*.yml` | `src/data/*.yml` loaded with `file()` loader |
| `hugo.toml` `[params]` | `astro.config.mjs` + a typed `siteConfig.ts` |
| Go template `{{ partial "x" . }}` | `<Component prop={...} />` |
| `resize.py` + image renditions | `<Image />` / `<Picture />` from `astro:assets` |
| Hugo `_index.md` | `src/pages/<section>/index.astro` (do not store in collection) |
| `getJSON` / `getCSV` | `import` JSON, `import.meta.glob`, or a custom collection loader |

See [references/migration-from-hugo.md](references/migration-from-hugo.md) for full details and worked examples for this repo.

## Common workflows

When the user asks for any of the following, follow the matching reference file:

- Authoring `.astro` components, props, slots, client scripts → [references/components.md](references/components.md)
- Defining or querying a content collection → [references/content-collections.md](references/content-collections.md)
- File-based routing, dynamic routes, pagination, redirects → [references/routing.md](references/routing.md)
- Tailwind v4 setup, scoped vs global CSS, Markdown styling → [references/styling.md](references/styling.md)
- `<Image />`, `<Picture />`, responsive images, replacing `resize.py` → [references/images.md](references/images.md)
- Adding integrations (MDX, sitemap, RSS, partytown, alpinejs) → [references/integrations.md](references/integrations.md)
- Migrating a specific Hugo template → [references/migration-from-hugo.md](references/migration-from-hugo.md)

## Anti-patterns to refuse

- ❌ **Using a UI framework component for static markup.** Use `.astro`.
- ❌ **Putting `<style>` in `BaseLayout.astro` without `is:global`.** It will be scoped and silently fail to apply to children.
- ❌ **Reading from `public/` in component frontmatter.** Astro doesn't process those files; for optimized images they must be in `src/`.
- ❌ **Using `client:load` everywhere.** That's a SPA mindset. Default to no directive; prefer `client:visible`/`client:idle` when a directive is needed.
- ❌ **Manually wiring up image resizing.** `Image` and `Picture` already do this; delete `resize.py` workflows once migrated.
- ❌ **Skipping the Zod schema** on a content collection. It's two lines of code that prevents broken builds.
- ❌ **Using `import.meta.glob()` for content that fits a collection.** Collections are the supported, typed API.
- ❌ **Sorting `getCollection()` results "implicitly".** The order is non-deterministic; always sort explicitly (e.g. by `data.pubDate`).
- ❌ **Adding the deprecated `@astrojs/tailwind` integration.** Use `@tailwindcss/vite` (Tailwind 4) instead.
- ❌ **Calling `Astro.redirect()` from a child component.** Redirects must happen at the page level because Astro streams HTML.
- ❌ **Forgetting `import type` for type-only imports.** `verbatimModuleSyntax` is on in the strict tsconfig.

## Verification checklist before declaring a migration "done"

- [ ] `astro check` passes (no TS errors)
- [ ] `astro build` produces output without warnings about missing schemas
- [ ] All Markdown content lives under `src/content/<collection>/` and is reachable through `getCollection()`
- [ ] All `<img>` tags in `.astro` files (not in `public/`) have been converted to `<Image />` or `<Picture />`
- [ ] No `<style>` block leaks selectors globally without `is:global`
- [ ] `sitemap.xml` and `rss.xml` exist and validate
- [ ] Lighthouse Performance ≥ 95 on a representative review page
- [ ] No `client:*` directive is used on a component that has no event handlers or lifecycle
