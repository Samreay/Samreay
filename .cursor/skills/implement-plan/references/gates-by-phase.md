# Per-phase gate inventory

Each row is one `Check`. Severity is one of:

- **must_match** — failure blocks `state/phase-N-passed.json` from being written.
- **should_match** — printed as a warning. Override by downgrading in `scripts/phases/phase_N.py` with a comment.
- **expected_to_differ** — recorded but never raised. Used to make divergences visible without spamming.

The "Hugo input" / "Astro input" columns describe what the check reads. `public/` is Hugo's build, `dist/` is Astro's.

## Universal (every phase)

| Check | Severity | Inputs |
|---|---|---|
| `hugo_builds` | must_match | `hugo --gc --minify` exit code |
| `astro_builds` | must_match (skip phase 1 if not yet initialised) | `npm run build` exit code |
| `astro_check` | must_match (skip phase 1) | `npx astro check` exit code |
| `phase_file_allowlist` | should_match | `git diff --name-only $(prev_gate_rev)..HEAD` against the phase's allowlist |

## Phase 1 — Scaffolding

| Check | Severity | Detail |
|---|---|---|
| `dist_index_exists` | must_match | `dist/index.html` is non-empty |
| `package_json_deps` | must_match | `package.json` declares `astro`, `@astrojs/svelte`, `@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/check`, `@astrojs/tailwind`, `svelte`, `tailwindcss@^3`, `sass`, `sharp`, `remark-math`, `rehype-katex`, `katex`, `js-yaml`, `gray-matter`, `glob` |
| `gitignore_entries` | must_match | `.gitignore` contains `dist/`, `.astro/`, `node_modules/.astro/` |
| `astro_config_exists` | must_match | `astro.config.mjs` parses and exports a config with `output: 'static'`, `trailingSlash: 'always'`, `site: 'https://cosmiccoding.com.au'` |
| `hugo_files_untouched` | should_match | None of `themes/`, `hugo.toml`, `archetypes/`, `data/`, `Makefile`, `builder/`, `resize.py`, `pyproject.toml` are modified |

## Phase 2 — Layout shell

| Check | Severity | Detail |
|---|---|---|
| `head_meta_parity` | must_match | Render `/` from `public/` and `dist/`. Compare `<head>` `<meta>` tags as a `{(name\|property): content}` map. Sets must be equal modulo Astro's content-hash entries |
| `nav_link_parity` | must_match | Extract anchors inside the navbar from both. Lists of `(label, href)` tuples must match exactly |
| `analytics_dev_absent` | must_match | `npm run dev` (run inline, headless) for `/`, assert no GA `<script>` |
| `analytics_prod_present` | must_match | `dist/index.html` contains the GA tracking ID `G-GRX6QE03YR` |
| `mobile_menu_toggles` | must_match | Playwright at viewport 375×667: click `[aria-label="Toggle menu"]`, expect a class toggle on the nav drawer |
| `base_layout_structure` | should_match | Top-level body tree from both: assert presence of the `flex flex-col min-h-screen overflow-hidden` wrapper and the `<footer>` tag |

## Phase 3 — Styles

| Check | Severity | Detail |
|---|---|---|
| `css_bundle_size_band` | should_match | Combined `dist/_astro/*.css` size ∈ [40 KB, 100 KB] |
| `tailwind_safelist_emitted` | must_match | Built CSS contains regex matches for `\.tag-[a-z]`, `\.bg-(π\|S\|A\|B\|C\|D\|F)-[0-9]+`, `\.review-(π\|S\|A\|B\|C\|D\|F)`, `\.rating-(π\|S\|A\|B\|C\|D\|F)` |
| `no_aos_imports` | must_match | No selector containing `aos-` appears in any built CSS |
| `kitchensink_visual` | must_match | Playwright screenshot of `_kitchensink.astro` matches the committed baseline at threshold 0.05 |
| `computed_style_spotcheck` | should_match | For `.tag.tag-sci-fi.active-true`, `.fancy_card`, `.btn-sm.bg-S-700`: computed `background-color`, `color`, `padding` match Hugo's render within ±1 px |

## Phase 4 — Content collections

| Check | Severity | Detail |
|---|---|---|
| `reviews_count_153` | must_match | `getCollection('reviews').length` equals `find content/reviews -mindepth 2 -maxdepth 2 -name index.md \| wc -l` |
| `blogs_count_78` | must_match | Same construction for blogs |
| `tutorials_count_39` | must_match | Same construction for tutorials |
| `schema_validation` | must_match | `astro check` reports zero schema errors |
| `frontmatter_round_trip` | should_match | Pick 5 random entries per collection, parse YAML directly with `python-frontmatter`, compare to Astro's parsed `entry.data`. Differences allowed only on Zod-defaulted fields |
| `data_files_imported` | must_match | `src/data/{books,courses,other,artists,podcasts,status,categories}.ts` exist and `import`-able |

## Phase 5 — Single-page templates

| Check | Severity | Detail |
|---|---|---|
| `url_inventory_reviews` | must_match | `dist/reviews/**/index.html` set equals `public/reviews/**/index.html` set |
| `url_inventory_blogs` | must_match | Same for `/blogs/` |
| `url_inventory_tutorials` | must_match | Same for `/tutorials/` |
| `representative_pages_structure` | must_match | Structural HTML diff for `/reviews/bobiverse/`, `/reviews/100th_run/`, `/blogs/2023_07_writing_update/`, `/tutorials/bayesianlinearregression/`, plus one math-using tutorial |
| `katex_rendered` | must_match | Every page whose source frontmatter has `math: true` contains at least one `<span class="katex">` in `dist/` |
| `links_array_parity` | should_match | For 10 random reviews, the link buttons emitted (visible text + href) match Hugo's |
| `return_link_present` | must_match | Every review detail page has a link with text `Return to review index.` whose href is `/reviews/` (or `/reviews`) |

## Phase 6 — Image pipeline

| Check | Severity | Detail |
|---|---|---|
| `imgs_have_dimensions` | must_match | Every `<img>` in `dist/**/index.html` has both `width` and `height` attributes |
| `dist_assets_emitted` | must_match | `dist/_astro/` contains optimized image renditions |
| `image_size_sanity` | should_match | For 10 random covers, `dist/_astro/*` rendition file size ≤ source × 2 |
| `cover_visual_parity` | should_match | Visual diff of `/reviews/bobiverse/` cover crop vs Hugo |

## Phase 7 — Home page

| Check | Severity | Detail |
|---|---|---|
| `home_visual` | must_match | Pixelmatch screenshot of `/` at 1280×720 and 375×667, threshold 0.05 |
| `book_card_count` | must_match | Astro `/` and Hugo `/` emit the same number of `.book-card` (or equivalent) elements |
| `course_card_count` | must_match | Same for courses |
| `section_anchors` | must_match | `#books`, `#courses` resolve in `dist/index.html` |

## Phase 8 — Reviews explorer Svelte island

| Check | Severity | Detail |
|---|---|---|
| `reviews_index_loads` | must_match | `dist/reviews/index.html` exists |
| `nojs_renders_full_list` | must_match | Disable JS in Playwright, count visible review cards = total review count |
| `tier_filter_clicks` | must_match | Enable JS, click each of `π`, `S`, `A`, `B`, `C`, `D`, `F` filters; assert visible card count = expected from collection |
| `search_filter_typing` | must_match | Type a substring into the search box, assert filtered count > 0 and < total |
| `combined_filter` | should_match | Tier + search together returns the intersection |

## Phase 9 — Artists + tagged list islands

| Check | Severity | Detail |
|---|---|---|
| `artists_index_loads` | must_match | `dist/artists/index.html` exists |
| `tag_pages_built` | must_match | URL inventory of `dist/tags/**/index.html` matches Hugo's tag URLs |
| `mobile_menu_island` | must_match | Hamburger toggles a class and the menu becomes visible / invisible accordingly |
| `artist_filter_island` | must_match | Filter input narrows the artist grid |

## Phase 10 — Markdown details

| Check | Severity | Detail |
|---|---|---|
| `image_class_hack_parity` | must_match | For 5 tutorials with the `convert.py`-emitted `{class="..."}` syntax, structural HTML diff against Hugo |
| `code_highlight_theme` | should_match | A representative code block contains the `base16-snazzy` colour palette tokens (sample on hex) |

## Phase 11 — Carry-overs

| Check | Severity | Detail |
|---|---|---|
| `no_aos_in_html` | must_match | No `data-aos` attribute appears in `dist/**/index.html` |
| `newsletter_form_present` | must_match | Newsletter form selector `form[action*="convertkit"]` (or current provider) renders on review and blog detail pages |
| `newsletter_submit_smoke` | must_match | Playwright fills and submits the form; assert the success state appears after a mocked POST |

## Phase 12 — Aliases as redirects

| Check | Severity | Detail |
|---|---|---|
| `every_alias_in_config` | must_match | Collect every `aliases:` entry from frontmatter; each appears as a key in `astro.config.mjs.redirects` |
| `every_alias_emits_html` | must_match | Each alias path produces an `index.html` in `dist/` |
| `alias_url_parity` | must_match | Set diff of alias paths vs Hugo's aliases (Hugo emits one HTML per alias too) is empty |

## Phase 13 — CI swap

| Check | Severity | Detail |
|---|---|---|
| `workflow_yaml_lint` | must_match | `actionlint` (or `yamllint`) on `.github/workflows/gh-pages.yml` exits 0 |
| `workflow_uses_npm_build` | must_match | The deploy step runs `npm run build` and uploads `dist/` |
| `workflow_dispatch_dry_run` | should_match | Triggering `workflow_dispatch` against a preview branch completes (manual; verify printed link) |

## Phase 14 — Cutover

| Check | Severity | Detail |
|---|---|---|
| `final_sitemap_diff_empty` | must_match | `dist/sitemap-index.xml` URL set equals `public/sitemap.xml` URL set |
| `internal_link_crawl_clean` | must_match | Playwright crawl from `/` reports zero 404s |
| `lighthouse_perf_95` | must_match | Lighthouse ≥ 95 on `/reviews/bobiverse/` |
| `legacy_files_removed` | must_match | After cutover, `themes/`, `hugo.toml`, `archetypes/`, `resources/_gen/` are deleted |
