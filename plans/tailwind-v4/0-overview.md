# Tailwind v3 → v4 upgrade: Overview

This directory contains the phased plan to upgrade `cosmiccoding.com.au` from Tailwind CSS v3.2 to v4.x. The Hugo→Astro migration finished at `plans/14-cutover.md` / `plans/15-best-practice-cleanup.md`; Tailwind v4 was explicitly listed there as deferred (see `plans/0-overview.md` → "Things deferred to future PRs"). This is the follow-up.

## Why now

- Astro 5 has first-class support for the `@tailwindcss/vite` plugin via `astro add tailwind`. The legacy `@astrojs/tailwind` integration we wired in Phase 3 is now the unsupported path.
- v4's engine is materially faster than v3, and the CSS-first config with native CSS variables for every theme token replaces the JS `resolveConfig()` dance the docs no longer recommend.
- v4 ships a `@tailwindcss/upgrade` codemod that handles most utility renames (`shadow` → `shadow-sm`, `ring` → `ring-3`, opacity utilities → slash modifiers, `bg-gradient-to-*` → `bg-linear-to-*`, etc.) automatically, so the cost of waiting another year only grows.

## Browser-support sanity check

v4 targets Safari 16.4+, Chrome 111+, Firefox 128+. `cosmiccoding.com.au`'s GA shows essentially zero traffic from older browsers (this is a personal blog with a tech-leaning audience). No special compatibility shim required.

## What v4 changes that matters for *this* repo

The migration tool catches roughly 70 % of the diff. The remaining 30 % are repo-specific and load-bearing:

| Concern | Where it lives | Why it's our problem |
| --- | --- | --- |
| **Config is JS, theme is rich** | `tailwind.config.cjs` (220 lines) | 7 review-tier colour palettes (`π`, `S`, `A`, `B`, `C`, `D`, `F`), custom `screens` (`xs`/`3xl`/`4xl`/`6xl`/`7xl`), custom `gridTemplateColumns` (`cover-cards*`, `wide-cards*`, `vertical-cards`), `font-inter` / `font-architects-daughter`, custom font-size scale that overrides v3 defaults. All of this needs to land as CSS `@theme` tokens (or stay in the JS file behind `@config`). |
| **Safelist with regex + variants** | `tailwind.config.cjs` `safelist` | v4 dropped the `safelist` config option entirely. We rely on it for tier-coloured `bg-{π…F}-{500…900}` classes built dynamically from review frontmatter. Has to move to `@source inline()` enumerations. |
| **SCSS everywhere** | `src/styles/*.scss` (8 active files, ~1 500 lines) | v4 explicitly does not support Sass / Less / Stylus. Every active `.scss` file has to become `.css`. Several use SCSS-only features (`@extend .glow;` × 7, `$range-thumb-size` variable, `#{$var}` interpolation, `@screen md`) that have no v4 equivalent. |
| **`@apply` inside Sass `<style>` blocks** | None (verified) | Best practice in v4 is to avoid `<style>` blocks in components; if used they need `@reference`. We're clean here — `BookNode.svelte` is the only Svelte file that mentions a `<style>` block, and only in a comment explaining why it deliberately *doesn't* have one. |
| **Internal `--tw-bg-opacity` hack** | `src/styles/layout.scss:102` (`.newsletter-inner`) | v4 stopped emitting `--tw-bg-opacity`. Fix is the slash opacity modifier (`bg-gray-900/90`) or an explicit `rgb(... / .9)`. |
| **Deprecated opacity utilities in markup** | `src/components/NewsletterForm.astro` (`text-opacity-70`, `bg-opacity-5`) | Codemod will rewrite these. |
| **Renamed utilities in markup + SCSS** | `flex-shrink-0` (3 components), `rounded-sm` (form base styles), `bg-gradient-to-br` (kitchensink) | Codemod handles all of these; we just verify after it runs. |
| **`@astrojs/tailwind` integration** | `astro.config.mjs:35` (`tailwind({ applyBaseStyles: false })`), `package.json` deps | Has to be uninstalled and replaced with `@tailwindcss/vite`. |
| **PostCSS pipeline** | `postcss.config.cjs` (autoprefixer-only) | v4 handles vendor prefixing internally; the file becomes obsolete. |

## Decisions (locked in)

| Area | Choice | Why |
| --- | --- | --- |
| Tailwind version | v4 latest (`tailwindcss@^4.x`) | Astro 5 + Vite supports the new plugin natively. |
| Build plugin | `@tailwindcss/vite` (Vite plugin) | Recommended path for Astro 5 ≥ 5.2 (`astro add tailwind`). Better DX and faster than the PostCSS plugin for our build. |
| Config form | CSS-first `@theme` in `src/styles/main.css` | All custom tokens (colours, screens, fonts, grid templates) move to `@theme`. The JS config file goes away. |
| Plugins | `@tailwindcss/forms` loaded via `@plugin "@tailwindcss/forms"` in CSS | Same plugin, new loading mechanism. No code change in usage. |
| Safelist | `@source inline("…")` enumerations in CSS | Replaces the regex-pattern + variants safelist. Tier × shade × variant matrix is small and finite. |
| SCSS → CSS | All `src/styles/*.scss` ported to `*.css`, file-by-file | Native CSS nesting (Lightning CSS via Tailwind) replaces SCSS nesting; `@extend` is rewritten as composition; SCSS variables become CSS custom properties. |
| `@astrojs/tailwind` | Removed | Replaced by the Vite plugin. |
| Autoprefixer / PostCSS config | Removed | Tailwind v4 prefixes for us. |
| Visual regression | `dist/` snapshot via existing Playwright baselines under `.cursor/skills/implement-plan/scripts/visual/baselines/` | We have an entire visual regression rig from the Astro migration. Reuse it. |
| Branch strategy | Single `tailwind/v4-upgrade` branch, one PR per phase or one combined PR (your call) | Hugo no longer builds — there's no parallel-track requirement like the Astro migration had. |

## File index

1. [Prep & audit](./1-prep-and-audit.md) — run the upgrade codemod on a throwaway branch, freeze visual baselines, inventory the diff.
2. [Build pipeline](./2-build-pipeline.md) — swap `@astrojs/tailwind` → `@tailwindcss/vite`, drop `autoprefixer` + `postcss.config.cjs`, refresh `package.json`.
3. [Theme & config](./3-theme-and-config.md) — port `tailwind.config.cjs` to a CSS-first `@theme` block; safelist via `@source inline()`; `@tailwindcss/forms` via `@plugin`.
4. [SCSS → CSS](./4-scss-to-css.md) — convert every `src/styles/*.scss` to `.css`; remove `@extend`, `$variables`, `#{}` interpolation, `@screen`; preserve nesting (now native).
5. [Utility renames](./5-utility-renames.md) — verify the codemod's automated changes; manual fixes for the `--tw-bg-opacity` leak and any utilities the codemod missed.
6. [Verify & cleanup](./6-verify-and-cleanup.md) — Playwright baselines, build size, README + state-file updates, docs touch-ups.

## Estimate

~1 working day, of which the SCSS-to-CSS sweep (Phase 4) is the largest single chunk (~3 hours of careful porting and visual diffing). The codemod compresses Phases 2 and 5 considerably.

## How this differs from the Hugo→Astro phased migration

The numbered `plans/N-*.md` files (Phases 0–16) are wired into the `implement-plan` skill, which keys off `plans/<N>-*.md` and `state/phase-N-*.json`. We deliberately put the Tailwind v4 plan in a subdirectory so the implement-plan verifier doesn't try to gate it. There is no `verify.py` for these phases — the gate is "Astro builds, `astro check` is clean, the Playwright baseline diff passes, and the kitchensink page looks right".

If you want a stricter gate, the easiest extension is a single `scripts/phases/tailwind_v4.py` invoked manually after each phase that re-runs the existing visual-diff harness against `master`'s baselines.

## Things explicitly out of scope

- View Transitions API (still deferred from Phase 0).
- Replacing the Mailerlite-injected scripts.
- Replacing `font-inter` / `font-architects-daughter` with `font-display`-style v4-idiomatic names. The current names match the markup (`@apply font-inter` in `body`); renaming would need a markup sweep that buys us nothing.
- Adopting v4's new `text-shadow-*` / `mask-*` / `inset-shadow-*` utilities. Land the upgrade first; design improvements are a separate PR.
- Swapping `tailwindcss/forms` for hand-written form base styles. Plugin still ships, still works in v4 via `@plugin`.
