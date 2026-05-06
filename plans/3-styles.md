# Phase 3 — Styles

**Goal:** Port the existing Tailwind 3 + SCSS stylesheets so Astro pages render with the same look and feel as the current Hugo site.

**Estimate:** ½ day.

## Skills to load before starting

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — Tailwind 3 wiring via `@astrojs/tailwind`, scoped vs global SCSS

## Source files being ported

- `themes/sams-theme/assets/css/main.scss`
- `themes/sams-theme/assets/css/fancy.scss` (461 lines, 3D card hover effects)
- `themes/sams-theme/assets/css/layout.scss` (431 lines)
- `themes/sams-theme/assets/css/styling.scss` (515 lines)
- `themes/sams-theme/assets/css/theme.scss`
- `themes/sams-theme/assets/css/utility-patterns.scss`
- `themes/sams-theme/assets/css/range-slider.scss`
- `themes/sams-theme/assets/css/toggle-switch.scss`
- `themes/sams-theme/assets/css/syntax.scss` (currently disabled in `main.scss`, leave disabled)
- `themes/sams-theme/assets/css/tailwind.config.js` (220 lines)
- `themes/sams-theme/assets/css/postcss.config.js`

## Tasks

1. Move SCSS files to `src/styles/`:
   ```
   themes/sams-theme/assets/css/main.scss     → src/styles/main.scss
   themes/sams-theme/assets/css/fancy.scss    → src/styles/fancy.scss
   themes/sams-theme/assets/css/layout.scss   → src/styles/layout.scss
   themes/sams-theme/assets/css/styling.scss  → src/styles/styling.scss
   themes/sams-theme/assets/css/theme.scss    → src/styles/theme.scss
   themes/sams-theme/assets/css/utility-patterns.scss → src/styles/utility-patterns.scss
   themes/sams-theme/assets/css/range-slider.scss     → src/styles/range-slider.scss
   themes/sams-theme/assets/css/toggle-switch.scss    → src/styles/toggle-switch.scss
   themes/sams-theme/assets/css/syntax.scss   → src/styles/syntax.scss
   ```
   Use `git mv` for clean history. Files are copied (not symlinked) so the Hugo build keeps working in parallel.
2. Update `src/styles/main.scss`:
   - Remove the `@import 'node_modules/aos/dist/aos.css'` line (AOS is dropped in Phase 11).
   - All other imports stay as-is.
3. Copy `tailwind.config.js` to repo root, then update its `content` and remove the SCSS-as-content entry:
   ```js
   content: [
     './src/**/*.{astro,svelte,html,md,mdx,ts,tsx,js,jsx}',
     './content/**/*.{md,mdx}',
   ],
   ```
   Keep `safelist` exactly as-is — the `tag-{review}` and `bg-{π|S|A|B|C|D|F}-{...}` patterns are still needed because review tier classes are dynamic.
   Keep `theme.extend` (custom colours, grid columns, fonts) verbatim.
   Keep `plugins: [require('@tailwindcss/forms')]` and add `@tailwindcss/forms` to deps.
4. Copy `postcss.config.js` to `postcss.config.cjs` at repo root (Astro auto-detects). If only `tailwindcss` and `autoprefixer` are listed, this can stay tiny.
5. Wire it up in `src/layouts/BaseLayout.astro` (already done in Phase 2 — verify the `import '../styles/main.scss'` line resolves).
6. Build a "kitchen-sink" page at `src/pages/_kitchensink.astro` (gitignored or `_`-prefixed so it doesn't ship) that exercises every styled component class so visual regressions can be eyeballed: review-tier banners, tag pills, fancy cards, buttons, grid layouts, navbar.
7. Run `npm run build` and inspect the produced CSS bundle in `dist/_astro/`. Confirm:
   - File size is in the same ballpark as Hugo's output (typically 50–80 KB minified).
   - No `node_modules/aos/` selectors leaked in.
   - All `safelist` patterns appear in the bundle.

## Acceptance criteria

- A page using a `<button class="tag tag-sci-fi active-true">` styled identically across both Hugo and Astro outputs.
- Fancy 3D card hover effect works on the kitchen-sink page (mouse over a `.fancy_card`).
- No console errors about missing CSS imports.
- `npm run build` succeeds and emits a single deduplicated CSS bundle.

## Risks

- **Tailwind safelist drift**: any review tier class we don't know about will be purged. Mitigation: kitchen-sink page enumerates every tier (`π S A B C D F`) explicitly.
- **SCSS `@import` paths**: any relative path inside the moved SCSS files needs auditing. None observed in the current files, but verify after the move.

## Out of scope

- Component-scoped styles for new Astro/Svelte components — those are added inline as `<style lang="scss">` blocks in their respective phases.
- Tailwind v4 upgrade (deferred).
