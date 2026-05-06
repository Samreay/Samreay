# Phase 1 — Prep & audit

**Goal:** Capture a frozen visual + HTML baseline of the current Tailwind v3 build, run `@tailwindcss/upgrade` against a throwaway clone of the branch, and review the proposed diff before committing to the upgrade direction.

**Estimate:** 1 hour (mostly waiting on Playwright + reviewing the codemod diff).

## Tasks

### 1. Branch off

```bash
git checkout -b tailwind/v4-upgrade
git status   # confirm working tree is clean (no half-finished flowchart edits, etc.)
```

The current `git status` reports modified files in `src/components/islands/Flowchart.svelte`, `src/data/flowchart.ts`, `src/lib/flowchart-layout.ts`, and `src/styles/range-slider.scss`. **Stash or commit those first** — they're unrelated to the Tailwind upgrade and we don't want them landing in a `tailwind/v4-upgrade` PR.

### 2. Freeze a "v3 known-good" Playwright baseline

The Astro migration left a working Playwright visual-regression rig in `.cursor/skills/implement-plan/scripts/visual/`. Reuse it as the v3-vs-v4 oracle:

```bash
cd .cursor/skills/implement-plan/scripts/visual

# Make sure deps are installed for the rig
npm install
npx playwright install chromium

# Build the v3 site we're freezing
( cd ../../../../.. && npm run build )

# Snapshot every page in routes.json into baselines/v3-frozen/
node snap.mjs --baseline-dir baselines/v3-frozen
```

If `routes.json` is stale (any new pages since Phase 14), refresh it:

```bash
node -e "
  import('fast-glob').then(async ({ default: fg }) => {
    const files = await fg('../../../../../dist/**/index.html');
    const routes = files.map(f => f.replace(/^.*\\/dist/, '').replace(/index\\.html$/, ''));
    require('fs').writeFileSync('routes.json', JSON.stringify(routes, null, 2));
  });
" 2>/dev/null || true
```

(Or manually inspect `dist/` and add any missing routes.)

We will diff against `baselines/v3-frozen/` at the end of every subsequent phase.

### 3. Capture a CSS-bundle size baseline

```bash
ls -la dist/_astro/*.css
du -h dist/_astro/*.css
```

Record the byte counts in this file so we have a v3 reference number to compare to v4's output. Expected ballpark: 50–80 KB minified (per the original Phase 3 plan).

### 4. Inventory the v3 surface

A grep pass that documents every utility that *might* break, so the upgrade tool's diff is reviewable rather than overwhelming:

```bash
# Renamed utilities
rg --multiline -n '\b(shadow|shadow-sm|rounded|rounded-sm|blur|blur-sm|drop-shadow|drop-shadow-sm|backdrop-blur|backdrop-blur-sm|outline-none|ring|flex-shrink-|flex-grow-|overflow-ellipsis)\b' \
   --glob '*.{astro,svelte,scss,html,md,mdx}' \
   src content > /tmp/tw-v3-renames.txt

# Removed-deprecated opacity utilities
rg -n '(bg-opacity-|text-opacity-|border-opacity-|divide-opacity-|ring-opacity-|placeholder-opacity-)' \
   --glob '*.{astro,svelte,scss}' \
   src > /tmp/tw-v3-deprecated.txt

# Old gradient direction utility
rg -n 'bg-gradient-to-' --glob '*.{astro,svelte,scss}' src > /tmp/tw-v3-gradient.txt

# Internal Tailwind variables we depend on
rg -n -- '--tw-' --glob '*.{astro,svelte,scss,css}' src > /tmp/tw-v3-internals.txt
```

Append the line counts of each file to this plan as the "expected blast radius". Right now the audit produces:

| Bucket | Approximate hits | Where |
| --- | --- | --- |
| Renamed utilities | ~10 | mostly `src/styles/utility-patterns.scss` (form base styles), 3 components using `flex-shrink-0`, kitchensink's `bg-gradient-to-br` |
| Deprecated opacity utilities | 3 | `src/components/NewsletterForm.astro` |
| Internal `--tw-*` references | 1 | `src/styles/layout.scss:102` (`--tw-bg-opacity: 0.9` on `.newsletter-inner`) |

Re-run the audit after every phase and confirm each bucket trends to zero.

### 5. Dry-run the upgrade codemod on a *throwaway* branch

```bash
git checkout -b tailwind/v4-codemod-dryrun

# Codemod requires Node 20+
node --version  # confirm

npx @tailwindcss/upgrade
```

`@tailwindcss/upgrade` will:

- Update `tailwindcss` in `package.json` to v4.
- Switch `@astrojs/tailwind` → `@tailwindcss/vite` in `astro.config.mjs` (it knows about Astro).
- Migrate `tailwind.config.cjs` to a CSS `@theme` block in your main stylesheet (it usually targets the file that has `@tailwind base` directives — `src/styles/main.scss` for us).
- Rewrite renamed utilities in `*.{astro,svelte,html,js,ts,md,mdx,scss,css}`.
- Replace deprecated opacity utilities with slash modifiers.
- Replace `bg-gradient-to-*` with `bg-linear-to-*`.
- Likely choke on the SCSS files because v4 fundamentally doesn't support Sass — it may rewrite `@tailwind` directives but leave `.scss` extensions intact. We'll handle SCSS-to-CSS in [Phase 4](./4-scss-to-css.md).

After it runs:

```bash
git diff --stat
git diff -- '*.astro' '*.svelte' > /tmp/codemod-markup.diff
git diff -- '*.scss' '*.css' > /tmp/codemod-styles.diff
git diff -- 'astro.config.mjs' 'package.json' 'tailwind.config.cjs' 'postcss.config.cjs' > /tmp/codemod-config.diff
```

**Do not push these changes.** Read each diff and assess: is the codemod's output something you'd be happy to merge as-is, or does it need manual cleanup?

Things to double-check in the codemod's output:

- Did it preserve the non-ASCII colour key `π` in the migrated `@theme` block? v4 is fine with it, but the codemod has been known to mangle exotic characters.
- Did it convert `screens.xs: '450px'` and the other custom screens?
- Did it port the `gridTemplateColumns` extensions? The codemod may not, since v4 doesn't ship a `--grid-template-columns-*` namespace by default — those need to land as `@utility` rules.
- Did it migrate `safelist` at all? Almost certainly not. The plan in [Phase 3](./3-theme-and-config.md) covers this manually.
- Did it touch `@apply` lines inside SCSS? Probably yes — but those changes only matter once the file is `.css`, which is Phase 4.

When the dry-run review is done:

```bash
git checkout tailwind/v4-upgrade
git branch -D tailwind/v4-codemod-dryrun
```

We re-run the codemod for real in [Phase 5](./5-utility-renames.md) once the build pipeline (Phase 2) and theme port (Phase 3) are in place. Running it now would conflict with the manual config port we're about to do.

## Acceptance criteria

- `tailwind/v4-upgrade` branch exists, working tree clean.
- `baselines/v3-frozen/` populated with one PNG per route in `routes.json`.
- v3 CSS bundle byte counts recorded (in this file or a sibling `notes.md`).
- `git diff` for the codemod dry-run reviewed and notes captured for any non-trivial changes that don't fit cleanly into Phases 2–5.
- No commits on `tailwind/v4-upgrade` yet — Phase 2 starts that.

## Risks

- **Stale `routes.json`**: visual diff misses pages added since Phase 16. Mitigation in step 2.
- **Codemod surprises**: the only known surprise so far is its tendency not to migrate `safelist` and custom grid-templates. Phases 3 and 5 catch both.

## Out of scope

- Actually applying any of the codemod's output. This phase is read-only.
