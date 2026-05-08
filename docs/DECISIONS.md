# Architectural Decision Records

Significant technical choices made in this project, with rationale.
Add a new entry whenever a non-obvious tradeoff is made. Format: brief title,
context, decision, consequences.

---

## ADR-001: Astro v5 for the static site framework

**Context:** The site was previously built in Hugo. Hugo is fast but requires
Go templates, makes it hard to co-locate interactive UI logic, and has no
first-class TypeScript support. The site needed a content-collection model with
Zod validation and optional Svelte islands for search/filter widgets.

**Decision:** Migrate to Astro v5 with Svelte for islands. Astro matches Hugo's
zero-JS-by-default philosophy, supports file-based routing identical to Hugo's
page bundles, and adds TypeScript-strict content collections out of the box.

**Consequences:** Build pipeline is JS/npm-based instead of Go binary. Build times
are longer but still fast enough. Hugo's `resize.py` asset pipeline is replaced by
`astro:assets` (`<Image />` / `<Picture />`). All existing markdown content migrated
unchanged (frontmatter schema validated by Zod at build time).

---

## ADR-002: Svelte 5 runes (not React, not Svelte 4)

**Context:** Interactive islands (search/filter UIs, the flowchart viewer) need
client-side state. Several framework options were available.

**Decision:** Svelte 5 with runes API. Svelte compiles to plain JS (no runtime
overhead), SSR works natively in Astro, and Svelte 5's runes system (`$state`,
`$derived`, `$effect`) is more explicit and less footgun-prone than Svelte 4's
reactive declarations. React was ruled out — too much bundle weight for simple
filter UIs.

**Consequences:** Svelte ≤4 patterns (`export let`, `$:`, `on:event`) are banned.
All new Svelte code must use runes. `svelte-check` runs as part of `astro check`.

---

## ADR-003: Tailwind v4 via `@tailwindcss/vite` (not `@astrojs/tailwind`)

**Context:** The `@astrojs/tailwind` integration was deprecated when Tailwind v4
moved to a Vite-plugin-first model.

**Decision:** Use `@tailwindcss/vite` registered under `vite.plugins` in
`astro.config.mjs`. CSS entry point is `src/styles/main.css` with `@import "tailwindcss"`.

**Consequences:** No `tailwind.config.js` needed for basic usage (design tokens live
in CSS `@theme` blocks). `@apply` still works but is discouraged inside component
`<style>` blocks — use utility classes in markup instead.

---

## ADR-004: Content co-located in `content/` (Hugo-era layout preserved)

**Context:** The Hugo site stored content in `content/<section>/<slug>/index.md`
with page bundles. Astro supports this same layout via `src/content/<collection>/`.

**Decision:** Keep the original `content/` tree; Astro reads it via `file()` loader
paths configured in `src/content.config.ts`. No mass file moves were performed.

**Consequences:** The public dir is `astro-public/` (not the default `public/`) to
avoid colliding with Hugo's build output during migration. The `contentAssets()`
integration republishes co-located assets (images, videos) alongside their pages.

---

## ADR-005: Playwright in devDependencies (E2E available but not in CI yet)

**Context:** Playwright is installed (`^1.59.1`) and `src/pages/kitchensink.astro`
exists as a visual-regression playground. The old `implement-plan` skill had phase
verifiers that ran Playwright checks.

**Decision:** Playwright is available for local visual testing via the `browser-tester`
agent. A `playwright.config.ts` is not yet committed; tests are run ad-hoc during
feature development rather than in CI.

**Consequences:** Visual regressions are caught by the developer during `ship-feature`
runs (browser-tester agent screenshots key pages) but not automatically on every PR.
Adding a CI step is tracked as future work.

---

## ADR-006: Dagre for flowchart layout (not manual positioning)

**Context:** The story-recommendation flowchart (`src/data/flowchart.ts`) has dozens
of nodes and edges. Manually placing them is fragile; positions drift when nodes are
added.

**Decision:** `@hpcc-js/wasm-graphviz` and `@xyflow/svelte` with dagre auto-layout.
Positions are computed at build time and cached in `src/data/flowchart-positions.json`.
The `flowchartPositionsDev()` integration exposes a dev-only API endpoint for
drag-and-save authoring.

**Consequences:** The positions file is committed so CI builds without dagre
re-computation. Drag-and-save overrides are persisted back through the dev API.

---

## ADR-007: `publicDir: 'astro-public'` (non-default public directory)

**Context:** During the Hugo→Astro migration, `public/` was Hugo's build output
directory. Using it as Astro's static asset dir would have caused confusion.

**Decision:** Astro's `publicDir` is set to `astro-public/` in `astro.config.mjs`.
This is a permanent decision, not a migration artefact — the name makes asset
ownership explicit when grepping the tree.

**Consequences:** All static files (favicons, `CNAME`, PDFs) live in `astro-public/`,
not `public/`. New contributors must be told not to use `public/`.

---

## ADR-008: Reading-list state co-located in ReviewsExplorer (not a shared store)

**Context:** The "Want to Read" bookmark feature needs to share state between the
`ReviewsExplorer` island (which drives the filter) and each `ReviewCard` (which
renders the toggle button). Two approaches were considered: a shared `.svelte.ts`
rune store, or passing state/callbacks as props.

**Decision:** State lives in `ReviewsExplorer` as a `$state<Set<string>>` and is
passed down to each `ReviewCard` as `isBookmarked` + `onToggleBookmark` props.
The URL param `reading-list` stores underscore-separated slugs, consistent with
the existing `include`/`exclude` tag params. localStorage is also written on every
change for persistence across sessions.

**Consequences:** `ReviewCard` is stateless w.r.t. bookmarks — it is purely
presentational. If `ReviewCard` is ever used outside `ReviewsExplorer`, the
`onToggleBookmark` prop defaults to `undefined` and the bookmark button is hidden
entirely. This keeps the component safe for standalone use.
