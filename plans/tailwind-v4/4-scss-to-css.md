# Phase 4 — SCSS → CSS

**Goal:** Convert every active `.scss` file under `src/styles/` to plain `.css`, drop SCSS-only features that v4 doesn't (and can't) compile, and lean on Tailwind's bundled Lightning CSS for native nesting. Once this phase lands, `sass` is no longer used at runtime.

**Estimate:** ~3 hours. The largest single chunk of the upgrade.

## Why we have to

Tailwind v4 explicitly does not support Sass / Less / Stylus, including stylesheets that get processed *before* Tailwind. The v4 [compatibility doc](https://tailwindcss.com/docs/compatibility#sass-less-and-stylus) is unambiguous. Even though Vite would still happily compile our SCSS via the `sass` package, the result is that none of the `@apply` calls inside SCSS resolve — Tailwind never sees them.

Native CSS nesting plus CSS custom properties cover everything our SCSS uses except `@extend`, and that's a small enough surface to rewrite by hand.

## Source files being changed (all under `src/styles/`)

| File | Lines | SCSS-only features used |
| --- | --- | --- |
| `main.scss`            | ~15  | `//` comments. Trivial port. |
| `theme.scss`           | 97   | Nesting, `//` comments. |
| `utility-patterns.scss`| 79   | `@screen md`, `@apply`, nesting. |
| `range-slider.scss`    | ~50  | `$range-thumb-size` SCSS variable, `#{$var}` interpolation, `calc()` with `$`. |
| `toggle-switch.scss`   | 34   | `@apply`, nesting. |
| `styling.scss`         | 516  | `@apply`, nesting, **`@extend .glow;` × 7** for review tiers. |
| `layout.scss`          | 445  | `@apply`, nesting, **`@screen md`**, **`--tw-bg-opacity` leak**. |
| `fancy.scss`           | 475  | Nesting, `//` comments, no `@apply`. |
| `syntax.scss`          | n/a  | Currently disabled (`// @import './syntax.scss';` in `main.scss`). Leave as-is. |

## Tasks

### 1. Rename + light port (the easy ones)

These three files only need the extension change and `//` → `/* */` for SCSS-style comments:

```bash
git mv src/styles/main.scss     src/styles/main.css
git mv src/styles/theme.scss    src/styles/theme.css
git mv src/styles/fancy.scss    src/styles/fancy.css
```

Then in each:

- `//` comment → `/* */`
- The `main.scss` → `main.css` rename also flips the import suffixes inside the file:
  ```diff
  - @import './utility-patterns.scss';
  + @import './utility-patterns.css';
  ```
  …repeat for the other six imports.
- `theme.css` and `fancy.css` use only nesting + custom properties + `@keyframes`. Both compile under native CSS nesting verbatim once you do the comment swap.

Build: `npm run build` should stay green after this step.

### 2. Port `range-slider.scss` (SCSS variables)

Source lines:

```scss
$range-thumb-size: 36px;

input[type=range] {
  margin-top: calc(($range-thumb-size - 6px) / 2);
  --thumb-size: #{$range-thumb-size};
  …
}
```

Convert to:

```css
:root {
  --range-thumb-size: 36px;
}

input[type=range] {
  margin-top: calc((var(--range-thumb-size) - 6px) / 2);
  --thumb-size: var(--range-thumb-size);
  …
}
```

If the variable is only used inside this file, the `:root` declaration can move into the `input[type=range]` selector instead. CSS custom properties cascade either way.

```bash
git mv src/styles/range-slider.scss src/styles/range-slider.css
```

### 3. Port `utility-patterns.scss` (drops `@screen`)

The `@screen md { … }` block at lines 18–26 is SCSS-only. v4's idiomatic replacement is a media query referencing the `--breakpoint-md` theme variable:

```diff
- @screen md {
-     h1 {
-         @apply text-5xl;
-     }
-     h2 {
-         @apply text-4xl;
-     }
- }
+ @media (width >= theme(--breakpoint-md)) {
+     h1 {
+         @apply text-5xl;
+     }
+     h2 {
+         @apply text-4xl;
+     }
+ }
```

Note we use `theme(--breakpoint-md)` (the v4 form) and not `theme(screens.md)` (the v3 form). Both are deprecated in v4 in favour of using a literal `@media (width >= 48rem)`, but referencing the theme variable keeps a single source of truth.

`@apply` calls in this file all reference standard utilities (`text-4xl`, `font-extrabold`, `rounded-sm`, etc.) and resolve fine after Phase 3's `@theme` lands. Phase 5 audits the renames (`rounded-sm` → `rounded-xs`) — no need to fix those here, codemod gets them.

```bash
git mv src/styles/utility-patterns.scss src/styles/utility-patterns.css
```

### 4. Port `toggle-switch.scss`

Plain nesting + `@apply`. After the comment / extension swap, no manual edits are needed:

```bash
git mv src/styles/toggle-switch.scss src/styles/toggle-switch.css
```

### 5. Port `layout.scss`

Two real edits buried inside ~445 lines of `@apply` + nesting:

**Edit A** — the `@screen` analogue (line 154):

```diff
- @media (max-width: 640px) {
-   .tag-list {
-     button {
-       @apply m-1 py-2 px-4 text-sm;
-     }
-   }
- }
+ @media (max-width: 640px) {
+   .tag-list {
+     button {
+       @apply m-1 py-2 px-4 text-sm;
+     }
+   }
+ }
```

(Already a literal media query, no change. Listed only to confirm we don't have to touch it.)

**Edit B** — the `--tw-bg-opacity` leak (line 102):

```diff
  .newsletter-inner {
    @apply p-8 bg-gray-900;
    border-radius: var(--radius);
-   --tw-bg-opacity: 0.9;
+   /* v3 used the internal --tw-bg-opacity to fade .bg-gray-900. v4
+      stopped emitting that variable; replicate via the slash modifier. */
  }
```

…and update the `@apply`:

```diff
-  @apply p-8 bg-gray-900;
+  @apply p-8 bg-gray-900/90;
```

Then rename:

```bash
git mv src/styles/layout.scss src/styles/layout.css
```

### 6. Port `styling.scss` (handle `@extend`)

The seven `@extend .glow;` at lines 445, 454, 463, 472, 480, 488, 496 are the only real challenge. They each say "give this `.review-{tier}` class everything `.glow` has, then add tier-specific properties on a nested `.bg2`."

`@extend` doesn't exist in CSS. Two reasonable strategies:

**Option A — multi-class selector lists (recommended):**

Rewrite the `.glow` block to also match every `.review-{tier}`:

```diff
- .glow {
-   position: relative;
-
-   .bg2 {
-     width: 100%;
-     height: 100%;
-     padding: 3px;
-     .bg-inner {
-       width: 100%;
-       height: 100%;
-       border-radius: 0.75rem;
-     }
-   }
- }
-
- @media (min-width: 1024px) {
-   .glow .bg2 {
-       padding: 4px;
-   }
- }
+ .glow,
+ .review-π,
+ .review-S,
+ .review-A,
+ .review-B,
+ .review-C,
+ .review-D,
+ .review-F {
+   position: relative;
+
+   .bg2 {
+     width: 100%;
+     height: 100%;
+     padding: 3px;
+     .bg-inner {
+       width: 100%;
+       height: 100%;
+       border-radius: 0.75rem;
+     }
+   }
+ }
+
+ @media (min-width: 1024px) {
+   .glow .bg2,
+   .review-π .bg2, .review-S .bg2, .review-A .bg2, .review-B .bg2,
+   .review-C .bg2, .review-D .bg2, .review-F .bg2 {
+       padding: 4px;
+   }
+ }
```

Then in each `.review-{tier}` block, drop the `@extend .glow;` line and keep only the tier-specific gradient / animation:

```diff
  .review-π {
-   @extend .glow;
-
    .bg2 {
      background: var(--grad-m);
      animation: slide 5s linear infinite;
    }
  }
```

Apply the same edit to `.review-S`, `.review-A`, `.review-B`, `.review-C`, `.review-D`, `.review-F`.

**Option B — utility class on the markup side:**

Add `class="glow review-π"` everywhere a tier element renders, and drop the `@extend` entirely. This is simpler in CSS but requires touching every `.review-{tier}` consumer (`ReviewCoverCard.astro`, `BookNode.svelte`, the kitchensink). Use this only if Option A turns out to behave differently in browsers (extremely unlikely).

```bash
git mv src/styles/styling.scss src/styles/styling.css
```

### 7. Reconfirm `main.css` imports point to `.css`

After all six `git mv`s, `src/styles/main.css` should look like:

```css
@import url('https://fonts.googleapis.com/css2?family=Architects+Daughter&family=Inter:wght@400;500;600;700;800;900&display=fallback');

@import "tailwindcss";

@plugin "@tailwindcss/forms";

@theme { /* … from Phase 3 … */ }

@utility … /* … from Phase 3 … */
@source inline("…")  /* … from Phase 3 … */

@import './utility-patterns.css';
@import './range-slider.css';
@import './toggle-switch.css';
@import './theme.css';
@import './styling.css';
@import './layout.css';
@import './fancy.css';
```

### 8. Update `BaseLayout.astro` import path

Phase 2's `astro.config.mjs` doesn't reference `main.scss` directly — that import lives in `src/layouts/BaseLayout.astro` (per Phase 3 of the original migration plan):

```bash
rg -n "import.*styles/main" src/layouts
```

Update the matched line:

```diff
- import '../styles/main.scss';
+ import '../styles/main.css';
```

### 9. Drop `sass` from devDependencies

```bash
npm uninstall sass
```

After this, no `*.scss` should remain in `src/`:

```bash
fd -e scss src   # expected: empty (or only the disabled syntax.scss if you choose to keep it)
```

If `syntax.scss` is the only survivor, leave it — it's already commented out of `main.scss`. Optionally rename to `syntax.css.disabled` or `_syntax.scss.legacy` to make its dormant status obvious.

### 10. Build + smoke-test

```bash
npm run build
```

Expected behaviour:

- Build succeeds.
- `dist/_astro/*.css` is one bundled stylesheet (Tailwind's import bundler concatenates everything).
- All seven `.review-{tier}` selectors emit their gradient + animation rules in the CSS bundle:
  ```bash
  rg -c 'review-π|review-S|review-A|review-B|review-C|review-D|review-F' dist/_astro/*.css
  ```

### 11. Commit

```bash
git add src/styles/ src/layouts/BaseLayout.astro package.json package-lock.json
git commit -m "tailwind v4: port SCSS files to plain CSS, drop sass dep"
```

## Acceptance criteria

- No `.scss` files under `src/styles/` (with the documented exception of the dormant `syntax.scss`).
- `package.json` no longer lists `sass`.
- `npm run build` succeeds.
- `BaseLayout.astro` imports `main.css`, not `main.scss`.
- The seven `.review-{tier}` classes still render their tier-specific glow gradients (verify by eye in `npm run dev` on `/reviews/<S-tier-review>/`).
- The newsletter card on a review page still has 90 % opacity background (Edit B in step 5 worked).
- The sticky-sharebar (`@apply` heavy) on a blog post still renders fixed in the bottom-right.

## Risks

- **`@extend` rewrite shifts cascade order.** SCSS `@extend` produces a *single* selector list at the location of the original `.glow` rule. Our multi-class rewrite does the same, so cascade order is preserved. The only thing that could change is specificity, but we're using class selectors throughout — no ID or attribute selectors involved — so specificity is identical.
- **Native CSS nesting requires `&` in some places SCSS doesn't.** SCSS lets you write `&.active-true { … }` and also implicitly nests `.foo { color: red; .bar { … } }`. Native CSS nesting works the same in modern browsers (Chrome 120+, Safari 17.2+, Firefox 117+), all comfortably below v4's stated browser floor. If a build error appears for a specific selector, the fix is usually adding `&` (e.g. `&.active-true` instead of `.foo.active-true`).
- **`@apply` inside nested rules**: v4 supports `@apply` inside nested CSS rules. The build will fail loudly if it doesn't, in which case the fix is to refactor to a flat selector. So far there are no known problem nests.
- **Lightning CSS rounding**: v4's Lightning CSS occasionally rounds `1.625rem` to `1.6rem` etc. for minification. This is fine but can show up as a visual diff of 1–2 px. The Phase 6 visual diff tolerance accounts for this.

## Out of scope

- Replacing `@apply`-heavy SCSS rules with utility-class composition on the markup side. The migration's job is *parity*; design clean-up is a separate PR.
- Touching the disabled `syntax.scss`. It's a Hugo-era artifact that nobody imports. Phase 6 considers deleting it outright.
