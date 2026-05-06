# Phase 6 — Verify & cleanup

**Goal:** Diff the v4 build against the v3 visual baselines captured in Phase 1, fix the residual visual regressions, refresh the README, and prep the PR.

**Estimate:** ~1 hour, mostly waiting on Playwright runs and tweaking individual selectors that drift.

## Tasks

### 1. Build and snapshot the v4 output

```bash
npm run build

cd .cursor/skills/implement-plan/scripts/visual
node snap.mjs --baseline-dir baselines/v4-current
```

`baselines/v4-current/` and `baselines/v3-frozen/` should contain the same set of PNGs. If `routes.json` changed during the upgrade (it shouldn't have), regenerate the v3 set first by checking out the previous tag.

### 2. Diff v4 vs v3

```bash
node compare.spec.ts \
  --baseline baselines/v3-frozen \
  --candidate baselines/v4-current \
  --threshold 0.5
```

(If the existing `compare.spec.ts` doesn't take CLI args, run it as a Playwright test pointed at both directories. The exact invocation lives in `.cursor/skills/implement-plan/scripts/visual/playwright.config.ts`.)

Expected output: a list of pages with their per-pixel diff percentage. The migration's success target is **every page < 0.5 % diff**, with no diff caused by a missing or shifted element. Anti-aliasing-only differences in font rendering happen sometimes when the build pipeline changes (Vite vs PostCSS subtly different minification) and are acceptable up to ~0.2 %.

Pages most likely to diverge:

- `/reviews/?l=tier` — every tier banner exercises both `bg-{tier}-{shade}` (safelist) and `var(--grad-*)` (`@theme` colour token).
- Any blog post — heaviest `@apply` consumer in `layout.css`.
- The kitchensink page — built specifically to expose a wide cross-section of styles.
- The flowchart page — `BookNode.svelte` composes against `fancy_card` (now in `fancy.css`) without a scoped `<style>` block.
- The newsletter form on `/reviews/<any>/` — most affected by the opacity-utility rewrite.

### 3. Triage divergences

For each page over the threshold:

1. Open both PNGs side by side.
2. Identify the offending element.
3. Trace the class to its declaration in `src/styles/*.css` or directly in markup.
4. Reproduce the v3 value if intentional was preserved (use `git show` against the pre-upgrade commit on `master`).
5. Re-run `snap.mjs` for just that route after fixing.

Common patterns and their cures:

- **Borders darker than before** — v4 changed `border-*` default colour from `gray-200` to `currentColor`. We ported `--color-gray-200`, so this only bites if a `border` class lacks a colour. Add `border-gray-300` (or whatever the v3 visual was) to the markup, or extend `main.css` with the v3 compatibility shim documented in [Tailwind's upgrade guide](https://tailwindcss.com/docs/upgrade-guide#default-border-color):
  ```css
  @layer base {
    *, ::after, ::before, ::backdrop, ::file-selector-button {
      border-color: var(--color-gray-200, currentColor);
    }
  }
  ```
- **Buttons mid-click feel different** — v4's Preflight gave buttons `cursor: default`. If we want the v3 pointer cursor:
  ```css
  @layer base {
    button:not(:disabled),
    [role="button"]:not(:disabled) { cursor: pointer; }
  }
  ```
- **Placeholder text colour shifted** — v4 stopped using `gray-400` for `<input>` placeholders, defaulting to `currentColor` at 50 % opacity. We ported `--color-gray-400`, so the fix is one of:
  ```css
  @layer base {
    input::placeholder, textarea::placeholder {
      color: var(--color-gray-400);
    }
  }
  ```
- **Hover state on touch devices** — v4 only fires `hover:` on `(hover: hover)` media. Cosmiccoding doesn't depend on tap-as-hover, so leave the new behaviour.
- **Stacked variant order** — v4 reads stacked variants left-to-right where v3 read them right-to-left. The Phase 1 audit didn't flag any (`first:*:` style stacking is rare here), so this is unlikely to bite. If it does, fix at the markup site.

### 4. Bundle size sanity check

Compare against the Phase 1 v3 baseline:

```bash
ls -la dist/_astro/*.css
du -h dist/_astro/*.css
```

A swing of ±20 % is fine. If the v4 bundle is dramatically larger:

- The `@source inline()` enumerations may be over-generating. Each line should generate ~5–35 utilities — check that the brace expansion is producing the expected count, and prune any patterns that aren't actually used by markup.
- Custom `@utility` rules might be duplicated (e.g. defined both in `main.css` and ported into another `.css` file). Audit:
  ```bash
  rg -n '@utility' src/styles
  ```

### 5. Drop `syntax.scss` if it's still dormant

Phase 4 left it untouched. If `git log --follow src/styles/syntax.scss` shows no edits in the last year and the comment in `main.css` confirms it's disabled:

```bash
git rm src/styles/syntax.scss
```

If you'd prefer to retain it as historical reference, rename to `syntax.scss.disabled` so its dormant status is unambiguous and future devs don't try to import it.

### 6. Update `README.md`

The current `README.md` mentions Tailwind v3 implicitly via "Tailwind, config copied verbatim" in the Phase 0 overview. Adjust:

- Add a one-line note in the local-dev section: *"Tailwind v4 (CSS-first config in `src/styles/main.css`)."*
- Remove any reference to `tailwind.config.cjs`, `postcss.config.cjs`, or `@astrojs/tailwind`.
- Point at `plans/tailwind-v4/0-overview.md` for the upgrade history.

### 7. Update the migration overview to mark Tailwind v4 as no longer deferred

Edit `plans/0-overview.md`:

```diff
 ## Things deferred to future PRs
 
-1. Tailwind v4 upgrade
-2. View Transitions API for soft page navigation
-3. Replacing `resize.py` with a build-time sharp script
-4. Notebook → MDX conversion as a Vite plugin (retire `convert.py`)
-5. AVIF alongside WebP
+1. View Transitions API for soft page navigation
+2. Replacing `resize.py` with a build-time sharp script
+3. Notebook → MDX conversion as a Vite plugin (retire `convert.py`)
+4. AVIF alongside WebP
```

And remove the "Tailwind | v3, config copied verbatim" row from the decisions table — replace with `Tailwind | v4 (CSS-first @theme)`.

The same swap applies to `plans/14-cutover.md` "Post-migration cleanup ideas (out of scope)" — drop `Tailwind v4 upgrade` from that list, since it's now done.

### 8. Astro check

```bash
npx astro check
```

Should be clean. Any new TS errors are unrelated to the Tailwind upgrade and should be fixed in a separate PR.

### 9. Lockfile + dev-server smoke

```bash
rm -rf node_modules
npm install
npm run dev
```

Open `http://localhost:4321` and click through:

- `/`
- `/reviews/`, `/reviews/?l=tier`, `/reviews/?l=flowchart`
- `/reviews/bobiverse/` (or another A-tier review)
- `/blogs/`, `/blogs/<any>/`
- `/tutorials/`, `/tutorials/<any>/`
- `/artists/`
- `/kitchensink/`

Each should load and render. No console errors. No flashes of unstyled content.

### 10. Open the PR

```bash
git push -u origin tailwind/v4-upgrade
gh pr create --title "Tailwind CSS v3 → v4 upgrade" \
  --body "$(cat <<'EOF'
## Summary

- Swap `@astrojs/tailwind` for the `@tailwindcss/vite` plugin.
- Port `tailwind.config.cjs` to a CSS-first `@theme` block in `src/styles/main.css`; replace `safelist` regex with `@source inline()` enumerations.
- Convert all `src/styles/*.scss` files to plain CSS (Tailwind v4 doesn't support Sass).
- Run the official `@tailwindcss/upgrade` codemod to rename utilities and rewrite deprecated opacity utilities.
- Drop `autoprefixer`, `postcss`, `sass`, and `@astrojs/tailwind` from `devDependencies`.

## Test plan

- [ ] `npm run build` is green.
- [ ] `npx astro check` is clean.
- [ ] Visual diff vs the v3-frozen Playwright baselines is < 0.5 % per page.
- [ ] Newsletter form on a review page renders with the expected 5 % background and 70 % text opacity.
- [ ] All seven `.review-{tier}` glow gradients animate as before.
- [ ] Bundle size within ±20 % of v3.
- [ ] Five spot-check URLs load cleanly with no console errors.

See `plans/tailwind-v4/0-overview.md` for the phased migration write-up.
EOF
)"
```

## Acceptance criteria

- Visual diff per page < 0.5 % vs v3 baseline.
- `dist/_astro/*.css` bundle size within ±20 % of v3.
- `package.json` no longer lists `@astrojs/tailwind`, `autoprefixer`, `postcss`, or `sass`.
- `tailwind.config.cjs` and `postcss.config.cjs` no longer exist.
- No `*.scss` files in active use under `src/styles/` (the dormant `syntax.scss` is either removed or renamed).
- `README.md` and `plans/0-overview.md` updated to reflect Tailwind v4 as the current state.
- PR opened with a checklist that covers each criterion above.

## Risks

- **Playwright baseline staleness**: if Phase 1's `baselines/v3-frozen/` was captured against an older revision, false positives appear in the diff. Mitigation: capture the baselines on the same commit hash you branched from, recorded in Phase 1.
- **Cascade-order changes from `@extend` rewrite**: covered in Phase 4 acceptance, but the visual diff in this phase is the real test.
- **CDN cache after deploy**: GitHub Pages CDN serves stale `_astro/*.css` for some users for ~5 min after deploy. Not a code issue, just a heads-up.

## Out of scope

- Adding new pages or content.
- Adopting v4-only features (`field-sizing`, `text-wrap: balance`, `mask-*`, `inset-shadow-*`, etc.) — separate PR.
- Tightening the Playwright tolerance below 0.5 % — that's a separate quality push.
- Removing `data-aos` attributes (none remain post-Phase 11; if any leak in, file a follow-up).
