# Phase 15 — Best-practice & post-Hugo cleanup

**Goal:** Now that Phase 14 has retired Hugo, sweep the repo for stale Hugo-era references, swap the legacy Mailchimp form for Mailerlite, and harden a handful of small Astro best-practice items that were "leave for later" during the migration.

**Estimate:** ½ day, all verification.

## What this phase does **not** do

- No new pages, components, or content. Anything that needs new behaviour is its own phase.
- No design changes. Visual baselines from Phase 14 must continue to pass.

## Scope

### 1. Newsletter: Mailchimp → Mailerlite

The Hugo theme shipped with two newsletter implementations side by side: a Mailchimp form on review/blog detail pages (`<NewsletterForm>`) and a hand-rolled Mailerlite form embedded inside `Books.astro` on the home page. They are now consolidated into a single `<NewsletterForm>` component that renders the Mailerlite form in two visual variants:

- `default` — full-width card centred on the page (review and blog detail pages).
- `compact` — fits inside a sibling grid cell (home-page Books section, third column).

The component injects the Mailerlite `webforms.min.js` loader and the form-id "takel" tracking pixel, and defines the `ml_webform_success_35716688()` callback that toggles `[data-status="success"]` and hides `.ml-form-formContent` on submit.

### 2. Delete `data/artists.yml`

The file was a Hugo-era YAML mirror of the artist list. `src/data/artists.ts` has been the Astro source of truth since Phase 4, and the `find-artists` skill writes to the TS file. The YAML is dead weight; delete it (and the now-empty `data/` directory).

### 3. Stale comments and code referring to Hugo

Sweep `src/`, `astro.config.mjs`, and the Astro-side scripts. Anything that says "Hugo still reads…", "Phase N may swap…", "the leftover AlpineJS…" should now describe the current state truthfully or be removed.

Concretely:

- `src/styles/main.scss` — drop the AOS leftover comment.
- `src/components/Footer.astro` — drop the AlpineJS/AOS leftover comment.
- `src/data/{books,artists,categories,courses,other,podcasts,status}.ts` — header comments still claim "Hugo still reads the source YAML; this typed copy powers Astro pages." Update them to call the file the canonical source.
- `src/components/sections/Books.astro` — header comment is updated as part of the Mailerlite swap.
- Anything else flagged by `rg -i "hugo|alpine|aos"` under `src/`, ignoring the legitimate astro-public assets and the asset filenames that happen to contain those substrings.

### 4. `pyproject.toml` cleanup

The Python deps still include a few Hugo-era artifacts:

- `jupyter-contrib-nbextensions` — only used by the old Hugo notebook conversion pipeline; no longer needed.
- `notebook==6.4.12` — pinned for the same reason.

Drop both. Keep `jupyter`, `nbconvert`, `python-frontmatter`, `pyyaml`, `rich`, `rendercv`, `polars`, `requests` — they're all in active use (`builder/convert.py`, `find-artists` skill, CV pipeline).

Re-lock with `uv lock` so `uv.lock` matches.

### 5. Exclude `/kitchensink/` from the production sitemap

The visual-regression kitchen-sink page (`src/pages/kitchensink.astro`) is intentionally shipped to `dist/` so Playwright can compare every safelisted CSS class in one render. Phase 14 caught it leaking into `dist/sitemap-0.xml`; we want it accessible to Playwright but not advertised to crawlers.

Configure `@astrojs/sitemap` in `astro.config.mjs` with a `filter` that excludes any URL containing `/kitchensink/`. Phase 14's sitemap-diff filter can then be relaxed (the workaround that filtered `/kitchensink/` out at compare time is no longer needed, but leave it in place defensively).

### 6. README

`README.md` is empty. Write a short post-Astro README that:

- States this is `cosmiccoding.com.au`, an Astro v5 + Svelte 5 static site.
- Lists the local-dev commands (`make blog`, `make prod`, `npm run build`, `make verify-all`).
- Points at `plans/0-overview.md` for the migration history and `.cursor/skills/` for the operational playbooks.

## Acceptance criteria (Phase 15 verifier)

The verifier (`scripts/phases/phase_15.py`) must pass all of:

1. **Universal gates** — Astro build is green and `astro check` is clean. Hugo gates remain skipped (Phase 14 retired the build).
2. **Mailerlite form is the only newsletter form**:
   - `src/components/NewsletterForm.astro` posts to `assets.mailerlite.com/jsonp/2036924/forms/176526142171252164/subscribe`.
   - `src/components/sections/Books.astro` imports `NewsletterForm` (no inline form markup).
   - No `mailchimp`, `mc-embedded`, or `list-manage.com` references survive in `src/`.
3. **`data/artists.yml` is gone** and `data/` no longer exists.
4. **No Hugo / AlpineJS / AOS / cruip references remain** in `src/`, `astro.config.mjs`, `scripts/`, `package.json`, or `Makefile`. (Cover image filenames and `astro-public/` assets that happen to contain those substrings are exempt.)
5. **`src/data/*.ts` headers** no longer claim "Hugo still reads the source YAML." They describe each file as the canonical source for that data.
6. **`pyproject.toml`** does not list `jupyter-contrib-nbextensions` or `notebook==6.4.12`. `uv.lock` is in sync (`uv lock --check` exits zero).
7. **`/kitchensink/` is absent from `dist/sitemap-0.xml`**, but `dist/kitchensink/index.html` still exists for Playwright.
8. **`README.md`** is non-empty and mentions Astro and at least one of `npm run build` / `make blog` / `make prod`.
9. **Newsletter form is rendered as Mailerlite on a real built page** — pick a sample review page and a sample blog page in `dist/`, assert each contains the Mailerlite form action and the `ml_webform_success_35716688` callback name.
