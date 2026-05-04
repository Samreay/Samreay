# Phase 13 — CI swap

**Goal:** Update `.github/workflows/gh-pages.yml` to build with Astro instead of Hugo, while keeping the GitHub Pages deploy unchanged.

**Estimate:** ¼ day.

## Source file being modified

- `.github/workflows/gh-pages.yml`

## What changes

Replace the Hugo-specific steps (`peaceiris/actions-hugo`, `hugo --gc --minify`) with Node + Astro steps. Keep the upload-artifact and deploy-pages steps intact.

## New workflow

```yaml
name: Deploy Github Pages

on:
  push:
    branches:
      - master
  pull_request:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

defaults:
  run:
    shell: bash

jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Cache Astro build artifacts
        uses: actions/cache@v4
        with:
          path: |
            node_modules/.astro
            .astro
          key: astro-${{ runner.os }}-${{ hashFiles('content/**', 'src/**', 'package-lock.json') }}
          restore-keys: |
            astro-${{ runner.os }}-

      - run: npm ci

      - name: Build
        run: npm run build
        env:
          NODE_ENV: production

      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    if: github.ref == 'refs/heads/master' && github.event_name == 'push'
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-24.04
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

## Notable changes from the existing workflow

- Removed the Hugo setup step.
- `actions/checkout@v3` → `@v4`; `actions/setup-node@v3` → `@v4`.
- Node version bumped from 16 → 22 (LTS, required by Astro 5).
- Cache scope changed from `~/.npm` only to `node_modules/.astro` and `.astro` (Astro's image and content cache directories). The `actions/setup-node@v4` `cache: 'npm'` already handles the npm cache.
- Cache key includes hashes of `content/**` so changes to images and markdown bust the cache appropriately.
- `submodules: true` removed from checkout (no longer needed once `themes/` directory is gone after Phase 14; can stay until then without effect).
- Deploy job now restricted to pushes on `master` (avoid trying to deploy from PRs).

## Notebook handling in CI

Since `convert.py` requires Python and Jupyter, do **not** run it in CI. Instead:

1. Local workflow: author edits a notebook → `make convert` regenerates `index.mdx` files → commits both the notebook and the resulting MDX.
2. CI just consumes the committed MDX. No Python in CI.

This is the same model the current Hugo build uses for notebooks. The `builder/hashes.json` ensures only changed notebooks are reconverted.

## Optional: add a PR preview

GitHub Pages doesn't support PR previews natively. If preview deploys are wanted:

1. Stay on GH Pages but use `actions/deploy-pages` only on push, and use a separate `gh-pages-preview` branch. (Clunky.)
2. Add a one-off Cloudflare Pages build as a PR-only check, leaving production on GH Pages. (Best of both, requires a small `wrangler.toml` and a CFP project.)

This is out of scope for the migration but easy to add later.

## Tasks

1. Update `.github/workflows/gh-pages.yml` per the new YAML above.
2. Commit and push to a feature branch.
3. Open a draft PR — confirm:
   - The build job runs to green.
   - The deploy job is skipped (because PR, not a push to `master`).
   - `dist/` artifact appears in the run.
4. Merge to `master` only as part of the Phase 14 cutover.

## Acceptance criteria

- A PR build runs `npm run build` successfully, producing a `pages-artifact` of `dist/`.
- The build cache restores on the second run, reducing image processing time materially (eyeball it — first build vs second build).
- The deploy job runs only on `master` pushes, not on PRs.
- After merge to `master`, `https://cosmiccoding.com.au` continues to serve content (post-cutover).

## Risks

- **First build of large image set**: cold-cache build will take longer than Hugo's. Acceptable; subsequent builds are fast.
- **Submodule reference**: if any GitHub Action expectations reference the (now-empty) theme submodule, remove it. The current workflow passes `submodules: true` but the theme isn't actually a submodule — it's a vendored directory. Removing the flag has no effect.

## Out of scope

- PR preview deploys (deferred).
- Switching hosts (deferred — `ghpages` decision locked in).
- Build-time security scanning, Lighthouse CI, etc. (deferred).
