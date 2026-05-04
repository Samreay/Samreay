# Phase 14 — Cutover

**Goal:** Flip production to the Astro build, retire Hugo, and clean up legacy files.

**Estimate:** ½ day (most of it is verification).

## Pre-cutover checks

Before merging the cutover PR to `master`, verify the migration branch builds and passes a side-by-side smoke test against the existing Hugo site.

### 1. Local side-by-side comparison

Run both servers concurrently:

```bash
# Terminal 1
hugo server -p 1313

# Terminal 2
npm run dev -- --port 4321
```

Compare these URLs by eye and by HTML diff for major structural elements (titles, OpenGraph tags, image dimensions):

| URL | What to compare |
| --- | --- |
| `/` | Home page sections render in same order; books, reviews teaser, blogs, tutorials |
| `/reviews/` | Default layout, default sort, all 153 cards present |
| `/reviews/?l=tier` | Tier groupings render with header per tier |
| `/reviews/?l=flowchart` | Figma iframe loads |
| `/reviews/?include=sci-fi&exclude=in-progress` | Filter applied correctly |
| `/reviews/bobiverse/` | Cover, links, blurb, math (if any), back link, newsletter form |
| `/reviews/100th_run/` | Different tier, fewer external links |
| `/blogs/` | Tag filter, all 78 cards |
| `/blogs/2023_07_writing_update/` | Embedded images render |
| `/tutorials/` | Tag filter, all 39 cards |
| `/tutorials/bayesianlinearregression/` | Code blocks, math, image classes, dataframe tables |
| `/artists/` | Cover groups, shuffle, alphabetical, size toggles |
| `/blog/2023_08_update/` | Redirects to canonical blogs URL |
| `/reviews/bobiverse` (no slash) | Resolves to canonical URL |

### 2. Functional checks specific to the reviews explorer

- Tag filter cycles through include → exclude → off.
- Search input filters in real time.
- Sort toggle (rank vs recent) reorders cards.
- Layout switcher cycles wide / cover / tier / flowchart, hiding tag filters in flowchart mode.
- URL state persists across reload.
- Browser back button restores prior state.
- Reset button clears everything.
- Keyboard shortcuts:
  - Press `c` → clipboard contains short markdown summaries
  - Press `C` → clipboard contains long markdown summaries
  - Press `x` → clipboard contains super-short markdown
  - Press `X` → clipboard contains super-duper-short markdown
- Compare clipboard output byte-for-byte against the Hugo version on the same filter set.

### 3. Build smoke

```bash
npm run build
```

Confirm:

- Exit code 0.
- `dist/index.html` exists.
- `dist/sitemap-0.xml` exists with all canonical URLs.
- `dist/CNAME` contains `cosmiccoding.com.au`.
- `dist/reviews/bobiverse/index.html` exists.
- `dist/blog/2023_08_update/index.html` exists and is a redirect stub.
- `dist/_astro/*.css` bundle is reasonable (~50–80 KB minified).
- All 526 cover images appear under `dist/_astro/` with new content-hashed names.

### 4. Lighthouse / performance spot check

Run Lighthouse on `/`, `/reviews/`, `/reviews/bobiverse/`. Targets:

- Performance ≥ 90.
- Accessibility ≥ 90.
- Best Practices ≥ 90.
- SEO ≥ 95.

Astro should match or beat Hugo on all of these because of smaller JS payload (no AlpineJS, no AOS, no `arrow.js`).

## Cutover PR

One PR that:

1. Removes Hugo-specific files:
   ```bash
   git rm hugo.toml
   git rm -r archetypes/
   git rm -r resources/
   git rm -r themes/
   git rm builder/hashes.json    # if no longer referenced
   git rm package-lock.json      # regenerate via npm install
   ```
2. Removes any `themes/` references in `Makefile`, `pyproject.toml`, etc.
3. Updates `Makefile` targets:
   ```makefile
   blog:
   	uv run python resize.py && npm run dev

   prod:
   	rm -rf dist && npm run build

   convert:
   	uv run python builder/convert.py

   cv:
   	cd resume && uv run rendercv render "Hinton_CV.yaml" \
   	  && cp rendercv_output/Samuel_Hinton_CV.pdf ../public/static/resume/Samuel_Hinton_CV.pdf
   ```
4. Updates `README.md` with the new local-dev instructions.
5. Removes obsolete dependencies from `package.json`:
   - `alpinejs`, `aos`, `cruip-js-toolkit`, `postcss-cli`, `postcss-import` — no longer needed.
   - `autoprefixer` — keep (consumed via PostCSS by Tailwind).
6. Confirms `data/*.yml` is no longer referenced anywhere. If `src/data/*.ts` is the only source, `git rm -r data/`. If shared with Python tooling (e.g. `summary_generator.py`), keep it.
7. Removes `.pre-commit-config.yaml` hooks for Hugo if any. Keep general hooks (Python formatting, etc.).

## Deploy and watch

Once merged:

1. Watch the Actions run on `master` complete.
2. Hit `https://cosmiccoding.com.au` and click through five random pages.
3. Watch GA Real-time for the first 30 minutes for any traffic anomalies.
4. Check Search Console over the next 7 days for crawl errors on previously-indexed paths.

## Rollback plan

If a critical issue surfaces post-deploy:

1. `git revert` the cutover commit on `master`.
2. The Hugo workflow file is restored, but Hugo binary is no longer installed via the workflow. To genuinely rollback, you'd need to also revert Phase 13's CI swap. Easier path: keep the rollback PR open as a draft on a branch and only merge if needed.
3. Cloudflare/GitHub Pages caches: TTL is short for HTML. CDN may serve old Astro pages briefly after revert; force-refresh by bumping `package.json` version and pushing.

## Acceptance criteria

- All pre-cutover checks pass.
- Cutover PR merges cleanly to `master`.
- `master` deploy succeeds and `https://cosmiccoding.com.au` serves Astro-built content.
- Five random URL spot checks return correct content.
- No console errors in the browser on the home page or reviews page.

## Post-migration cleanup ideas (out of scope)

- Replace `resize.py` with a sharp-based pre-commit hook.
- Migrate `builder/convert.py` to a Vite plugin so notebooks become a build-time dependency rather than a manual `make convert` step.
- Set up Cloudflare Pages preview deploys per PR.
- Tailwind v4 upgrade.
- Adopt View Transitions API for soft navigation between pages.
- Add AVIF alongside WebP for further image weight savings.
