# Visual diff policy

Visual diffs run via Playwright's `expect(page).toHaveScreenshot()` matcher with pixelmatch under the hood. Configuration lives in `scripts/visual/playwright.config.ts`. Routes covered per phase live in `scripts/visual/routes.json`.

## Thresholds

- `threshold: 0.05` — per-pixel colour difference allowance. Anti-aliasing + WebP recompression typically falls within this.
- `maxDiffPixelRatio: 0.02` — overall fraction of pixels allowed to differ. Roughly "2% of the page can change without flagging".
- `animations: 'disabled'` — Playwright pauses CSS animations and transitions, then takes the screenshot.
- `caret: 'hide'` — hide the text caret in inputs.

## Viewports

Each route is shot at two viewports:

- `1280×720` — desktop
- `375×667` — iPhone SE (smallest supported)

The matrix `(routes × viewports × {hugo, astro})` is the test corpus. Baselines are committed for `astro` only; the test compares Astro's screenshot to its baseline. The Hugo screenshot is compared separately by a custom matcher and is the source of truth for **the first time** a baseline is generated.

## Workflow

### Generating baselines

When a route is first added or when an intentional design change lands:

```bash
make implement-plan-update-baselines PHASE=N
```

This:

1. Runs `hugo --gc --minify` and `npm run build`.
2. Spins up two static servers: `python -m http.server 8001 -d public/` and `python -m http.server 8002 -d dist/`.
3. For each route in `routes.json` for phase ≤ N, takes a Hugo screenshot from `:8001` and an Astro screenshot from `:8002`.
4. **Asks the user** (via interactive prompt — review per route) which baseline to keep. Default is "Hugo's screenshot is the baseline; Astro's must match it." This is the right default until phase 14.
5. Writes the chosen baseline to `scripts/visual/baselines/<route>__<viewport>.png`.
6. Commits nothing — the user reviews the diff in `git status` and commits manually.

### Verifying

`verify.py --phase N` runs:

```bash
npx playwright test --project=astro --grep "@phase-N"
```

The spec compares the live Astro screenshot to the committed baseline. Failures land in `scripts/visual/test-results/<route>/{actual,expected,diff}.png`.

## Ignore regions

A route may declare `mask` regions in `routes.json`:

```json
{
  "path": "/reviews/bobiverse/",
  "phase": 5,
  "mask": [".newsletter-form", "footer"]
}
```

`mask` selectors are blanked out in both screenshots before comparison. Use this for:

- The newsletter signup, until phase 11.
- The Discord widget (loads asynchronously, undeterministic).
- The "currently reading" sidebar that pulls live data.

Avoid masking large regions for convenience. Each mask is a place where regressions hide.

## Baseline storage

- Path: `scripts/visual/baselines/<route_slug>__<viewport>.png`
- Naming: `<route_slug>` is the path with slashes replaced by `_`, leading/trailing `_` stripped (`/reviews/bobiverse/` → `reviews_bobiverse`).
- Committed to git. Total expected size: 5–20 MB across the migration. PNGs are well-compressed; do not LFS unless the total exceeds 50 MB.
- Repository expectation: every baseline change in a PR is reviewable as an image diff (GitHub renders PNG diffs side-by-side).

## When a visual diff fails after a Tailwind change

1. Confirm the change was intentional by re-reading the relevant phase's plan.
2. Run `make implement-plan-update-baselines PHASE=N` to regenerate baselines for the affected routes.
3. Inspect the generated PNGs visually before committing. Do not auto-accept.
4. Mention the baseline change in the commit message so it's clear why the baseline moved.

## When a visual diff fails for a "flaky" reason

Most flakiness is web font loading or async image decoding. Mitigations already in `playwright.config.ts`:

- `await page.evaluate(() => document.fonts.ready)` before screenshot.
- `await page.waitForLoadState('networkidle')` before screenshot.
- Animations disabled.

If a route is still flaky, mask the offending region rather than retrying. Retries paper over real bugs.
