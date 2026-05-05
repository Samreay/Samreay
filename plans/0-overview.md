# Hugo → Astro + Svelte migration: Overview

This directory contains the phased plan to migrate `cosmiccoding.com.au` from Hugo to Astro (with Svelte 5 islands for interactive pages).

## Goals

- Replace Hugo and the bespoke `arrow-1.0.0-alpha10.js` reactive layer with Astro + Svelte islands.
- Preserve every existing URL, every visual detail that matters, and the notebook → markdown pipeline (`builder/convert.py`).
- Keep the deploy target as GitHub Pages.

## Skills to load

The agent driving this migration uses the [`implement-plan`](../.cursor/skills/implement-plan/SKILL.md) skill, which reads the relevant per-phase plan and loads supporting skills as it goes. Two reference skills cover the writing of new code:

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — load on **every** phase. Governs `.astro` files, `src/content.config.ts`, `astro.config.mjs`, and the Hugo→Astro mapping table.
- [`svelte-best-practices`](../.cursor/skills/svelte-best-practices/SKILL.md) — load when a phase explicitly says so (Phases 8 and 9). Governs `.svelte` and `.svelte.ts` files, runes, the Astro↔Svelte boundary, and hydration directives.

Each phase file lists exactly which skills its tasks need.

## Decisions (locked in)

| Area | Choice |
| --- | --- |
| Framework | Astro 5 (static output) |
| Islands | Svelte 5 with runes |
| Tailwind | v4 (CSS-first `@theme`, see `plans/tailwind-v4/`) |
| CSS | Plain CSS with native nesting (Tailwind v4 doesn't support Sass) |
| Math | KaTeX (`remark-math` + `rehype-katex`) |
| Code highlighting | Shiki, `base16-snazzy` theme |
| Image pipeline | `astro:assets` `<Image>`, `fit: 'cover'` (no letterbox) |
| Aliases / redirects | `redirects` map in `astro.config.mjs` |
| Package manager | npm |
| Notebook ingest | Keep `builder/convert.py` (outputs `.mdx`) |
| Hosting | GitHub Pages (unchanged) |
| Custom domain | `cosmiccoding.com.au` (unchanged) |

## Phase index

1. [Scaffolding](./1-scaffolding.md)
2. [Layout shell](./2-layout-shell.md)
3. [Styles](./3-styles.md)
4. [Content collections](./4-content-collections.md)
5. [Single-page templates](./5-single-page-templates.md)
6. [Image pipeline](./6-image-pipeline.md)
7. [Home page](./7-home-page.md)
8. [Reviews explorer Svelte island](./8-reviews-explorer.md)
9. [Artists + tagged list islands](./9-artists-and-tagged-lists.md)
10. [Markdown details](./10-markdown-details.md)
11. [Carry-overs](./11-carry-overs.md)
12. [Aliases as redirects](./12-aliases-redirects.md)
13. [CI swap](./13-ci-swap.md)
14. [Cutover](./14-cutover.md)

## Strategy

- Build Astro alongside Hugo on a `migration/astro` branch. `master` keeps deploying Hugo until cutover.
- Each phase lands as one or more PRs that don't touch the existing Hugo setup, except for the final cutover phase.
- After every phase, the Astro build should succeed via `npm run build`.

## Estimated effort

~5–7 working days total. As 2-hour evening sessions: 3–4 weekends. The reviews explorer (Phase 8) and the image pipeline (Phase 6) are the largest single chunks.

## Target repo layout (post-migration)

```
/
├── astro.config.mjs
├── tsconfig.json
├── package.json
├── tailwind.config.js
├── postcss.config.cjs
├── public/                     # was themes/sams-theme/static
├── content/                    # unchanged location, schema-validated
├── src/
│   ├── content.config.ts
│   ├── data/                   # was data/*.yml + theme/data/nav.yml
│   ├── styles/                 # was themes/sams-theme/assets/css
│   ├── assets/img/             # covers, jeff placeholders
│   ├── layouts/BaseLayout.astro
│   ├── components/
│   │   ├── Navbar.astro, Footer.astro, Head.astro
│   │   ├── ReviewCard.astro, PostCard.astro, BookCard.astro
│   │   ├── CoverImage.astro, NewsletterForm.astro
│   │   ├── sections/           # home page sections
│   │   └── islands/            # Svelte components
│   └── pages/
│       ├── index.astro
│       ├── reviews/index.astro & [...slug].astro
│       ├── blogs/index.astro & [...slug].astro
│       ├── tutorials/index.astro & [...slug].astro
│       ├── artists.astro
│       └── 404.astro
├── builder/                    # unchanged
├── resize.py                   # unchanged
├── pyproject.toml              # unchanged
├── Makefile                    # `blog`, `prod` targets re-pointed
└── .github/workflows/gh-pages.yml   # swapped to Astro
```

## Things deferred to future PRs

1. View Transitions API for soft page navigation
2. Replacing `resize.py` with a build-time sharp script
3. Notebook → MDX conversion as a Vite plugin (retire `convert.py`)
4. AVIF alongside WebP

## Done in follow-up PRs

- **Tailwind v4 upgrade** — `plans/tailwind-v4/` walks the swap from `@astrojs/tailwind` + Tailwind v3 + SCSS to `@tailwindcss/vite` + Tailwind v4 + plain CSS with a CSS-first `@theme` block.
