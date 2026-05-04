# cosmiccoding.com.au

Source for [cosmiccoding.com.au](https://cosmiccoding.com.au) — Sam Hinton's
personal site. Books, reviews, blog posts, tutorials, an artist corner, and
a CV.

The site is a static build produced by **Astro v5** with **Svelte 5**
islands for the interactive bits (reviews explorer, artists explorer, mobile
menu, code-toggle on tutorials). It deploys to GitHub Pages from `master`
via `.github/workflows/gh-pages.yml`.

It used to be a Hugo site. The migration is documented under
[`plans/`](plans/), and the per-phase implementation skill lives at
[`.cursor/skills/implement-plan/`](.cursor/skills/implement-plan/).

## Quick start

```bash
make install   # installs casks, node deps, python deps via uv
make blog      # `npm run dev` — local Astro dev server with HMR
make prod      # clean build into `dist/`
```

`make verify-all` runs every phase verifier in `.cursor/skills/implement-plan/scripts/phases/`
against `dist/`; that is what gates a PR before deploy.

## Layout

- `src/content/` — Astro content collections (`reviews/`, `blogs/`, `tutorials/`).
- `src/pages/` — routes; dynamic `[...slug].astro` files render collection items.
- `src/components/` — Astro components, with Svelte islands under `components/islands/`.
- `src/data/` — typed YAML-replacement data files (books, artists, podcasts, …).
- `src/lib/` — shared helpers (covers, content sorting, types, the `fancy-card` 3-D effect).
- `src/styles/` — SCSS partials, all imported from `main.scss`.
- `src/assets/` — images and SVGs that go through `astro:assets` for hashing/optimisation.
- `astro-public/` — verbatim static files (favicons, `CNAME`, podcast thumbnails, CV PDF).
- `content/` — markdown sources. Tutorials are generated from notebooks via `builder/convert.py`.
- `plans/` — phase-by-phase migration plan, kept around for context.
- `.cursor/skills/` — operational playbooks (book reviews, find-artists, humanizer, implement-plan).

## Operational playbooks

- Drafting a new review — see `.cursor/skills/book-review/`.
- Refreshing the cover-artist database from r/ProgressionFantasy — see `.cursor/skills/find-artists/`.
- Editing review prose without sounding AI-generated — see `.cursor/skills/humanizer/`.
