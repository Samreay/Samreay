# Phase 5 — Utility renames

**Goal:** Run the official `@tailwindcss/upgrade` codemod against the now-CSS-first repo to handle the bulk of utility renames in markup and CSS, then sweep for the handful of cases the codemod misses.

**Estimate:** ~45 minutes.

## Files most likely to change

- Every `*.{astro,svelte}` under `src/components/` and `src/pages/` that uses one of the renamed/deprecated utilities (the Phase 1 audit short-listed them).
- `src/styles/utility-patterns.css` — uses `rounded-sm` for form base styles.
- `src/styles/layout.css` — `pb-9/16` (custom; already handled in Phase 3 as `@utility pb-9\/16`), various other `@apply` calls.
- `src/styles/styling.css` — no problematic utilities; verify post-codemod.
- `src/pages/kitchensink.astro` — has the only `bg-gradient-to-br` in the repo.

## Tasks

### 1. Re-run the codemod for real

The Phase 1 dry-run was on a throwaway branch. Now we're back on `tailwind/v4-upgrade` with the build pipeline (Phase 2) and theme port (Phase 3) in place, the codemod has the right context to make sane choices.

```bash
git status   # confirm clean working tree
npx @tailwindcss/upgrade
```

The codemod knows about v3-vs-v4 differences and rewrites:

| v3 | v4 | Where it bites this repo |
| --- | --- | --- |
| `shadow-sm` | `shadow-xs` | none in src; codemod is a no-op here |
| `shadow` | `shadow-sm` | none |
| `rounded-sm` | `rounded-xs` | `src/styles/utility-patterns.css:31, 57` (form base) |
| `rounded` (with no scale) | `rounded-sm` | watch for any in markup |
| `outline-none` | `outline-hidden` | none expected |
| `ring` | `ring-3` | none expected |
| `bg-gradient-to-*` | `bg-linear-to-*` | `src/pages/kitchensink.astro:130` |
| `flex-shrink-0` | `shrink-0` | `src/components/Navbar.astro:9`, `src/pages/reviews/[...slug].astro:57`, `src/components/sections/Courses.astro:56` |
| `bg-opacity-N` | `bg-COLOR/N` | `src/components/NewsletterForm.astro:109` (`bg-opacity-5`) |
| `text-opacity-N` | `text-COLOR/N` | `src/components/NewsletterForm.astro:60–61` (`text-opacity-70`) |
| `border-opacity-N` | `border-COLOR/N` | none |
| `divide-opacity-N` | `divide-COLOR/N` | none |
| `ring-opacity-N` | `ring-COLOR/N` | none |
| `placeholder-opacity-N` | `placeholder-COLOR/N` | none |
| `flex-grow-*` | `grow-*` | none expected |
| `overflow-ellipsis` | `text-ellipsis` | none |

Inspect the resulting `git diff`:

```bash
git diff --stat
git diff -- 'src/**/*.astro' 'src/**/*.svelte'   # markup
git diff -- 'src/**/*.css'                        # styles
```

### 2. Manual sweep for what the codemod missed

Re-run the audit greps from Phase 1 and confirm each bucket is empty:

```bash
# Renamed utilities (should all be empty now)
rg -n '\b(flex-shrink-|flex-grow-|overflow-ellipsis|outline-none|bg-gradient-to-)' \
   --glob '*.{astro,svelte,css}' src

# Deprecated opacity utilities (should be empty)
rg -n '(bg-opacity-|text-opacity-|border-opacity-|divide-opacity-|ring-opacity-|placeholder-opacity-)' \
   --glob '*.{astro,svelte,css}' src

# Internal Tailwind variables (should be empty)
rg -n -- '--tw-' --glob '*.{astro,svelte,css}' src
```

If any of these still match, hand-edit. Common stragglers:

- **`ring` with no width**: codemod converts `ring` → `ring-3` only when it sees a literal `ring` token. If the codebase had `ring-blue-500` (no width), it stays as `ring-blue-500` and adopts v4's new `ring-1` default — visually different. Audit any `ring-{color}-{shade}` and add an explicit `ring-3` (or whatever the v3 width was) where the visual changes.
- **`outline-none` inside SCSS comments or string literals**: codemod skips strings, but `theme.scss` line 11 (`outline: 2px solid …`) is a real CSS `outline` declaration, not a class — leave it alone.
- **Custom utilities like `tag-π`, `card_overlay_S`**: not Tailwind utilities at all (defined in our own SCSS / CSS), out of scope. Leave them alone.

### 3. Spot-check the opacity rewrite on the newsletter form

The codemod's automatic rewrite of `bg-opacity-5` is best understood by looking at the surrounding class list:

```html
<input class="w-full appearance-none bg-main-600 mb-4 border border-main-600 bg-opacity-5 …" />
```

becomes

```html
<input class="w-full appearance-none bg-main-600/5 mb-4 border border-main-600 …" />
```

The visual effect is identical (5 % opacity on the `bg-main-600`). Confirm the form on `/reviews/<any>/` and at the bottom of `/` still has the same near-transparent green-ish background tint.

Also check `text-main-50 text-lg text-opacity-70` and `text-main-100 text-lg text-opacity-70`:

```html
'text-main-50 text-lg text-opacity-70 mb-2'
'text-main-100 text-lg text-opacity-70 mb-2'
```

→

```html
'text-main-50/70 text-lg mb-2'
'text-main-100/70 text-lg mb-2'
```

Same visual outcome.

### 4. Verify `pb-9/16` survives

The `@utility pb-9\/16 { padding-bottom: 56.25%; }` from Phase 3 expects the class `pb-9/16` to keep showing up in markup. The only known consumer is `src/styles/layout.css:262`:

```css
.youtube {
  @apply pb-9/16 mx-auto w-full relative my-12;
  …
}
```

`@apply pb-9/16` should resolve via our `@utility` rule. If the build complains *"Cannot apply unknown utility class `pb-9/16`"*, rename the utility (forward slash in identifiers is uncommon and may not survive bundling cleanly). Fallback approach:

```diff
- @utility pb-9\/16 { padding-bottom: 56.25%; }
+ @utility pb-aspect-16-9 { padding-bottom: 56.25%; }
```

…then hand-edit `layout.css` to use the new name. Same for `pb-3/4`, `pb-1/1` if used. Audit:

```bash
rg -n '\bpb-(9/16|3/4|1/1)\b' src
```

Currently only `pb-9/16` appears. If `pb-3/4` and `pb-1/1` have zero usage, drop their `@utility` declarations from `main.css` to keep the bundle lean.

### 5. Check ring defaults in components

Skim every `.svelte` and `.astro` for naked `ring` or `ring-{color}` without a width:

```bash
rg -n '\bring(-[a-z]+-[0-9]+)?\b' --glob '*.{astro,svelte}' src
```

Expected: zero hits. Any hit needs a paired `ring-{n}` width or it'll drop to v4's default 1 px and look noticeably thinner. (Phase 1's audit didn't flag any, so this is belt-and-braces.)

### 6. Build and visual smoke-test

```bash
npm run build
```

Eyeball:

- Newsletter form on `/reviews/bobiverse/` (5 % bg, 70 % text opacity).
- Form fields anywhere (`form-input`, `form-checkbox`) — they should still have small rounded corners (`rounded-xs`).
- Reviews tag pills (`/reviews/?l=tier`) — `rounded-sm` was renamed to `rounded-xs`; verify the tag-pill curve isn't visibly larger.
- Buttons (`@apply rounded-sm` in `utility-patterns.css`) — same curve as before.

These should all be visually indistinguishable from the v3-frozen baseline. Phase 6 catches anything we miss.

### 7. Commit

```bash
git add -A
git commit -m "tailwind v4: codemod sweep — rename utilities, slash-modifier opacities"
```

## Acceptance criteria

- All Phase 1 audit greps return empty (no `flex-shrink-`, no `bg-opacity-`, no `--tw-`, no `bg-gradient-to-`, no naked `outline-none` class).
- `npm run build` is green.
- Newsletter form still shows the faint background tint.
- Tag pills, buttons, and form inputs render with rounded corners that match the v3 baseline (within 1 px).
- No console warnings about unknown `@apply` targets.

## Risks

- **`rounded-sm` → `rounded-xs` is a real visual change.** v3's `rounded-sm` was 0.125rem; v4's `rounded-xs` is 0.125rem too, so the codemod is preserving original intent. v4's `rounded-sm` is now 0.25rem, the v3 `rounded` value. If anything visibly *grows* its corners, the codemod flipped a class the wrong way — review the diff for that specific element.
- **Slash-modifier opacities round differently in some browsers.** v3's `bg-opacity-5` produced `--tw-bg-opacity: 0.05`. v4's `bg-main-600/5` uses `color-mix(in oklab, var(--color-main-600) 5%, transparent)`. The two are perceptually identical for any practical opacity but can differ at the byte level on a screenshot diff. Phase 6's visual-diff tolerance is the right place to absorb that.

## Out of scope

- Hand-rewriting forms to drop `@tailwindcss/forms`. Plugin still ships, still works.
- Adopting v4's new `@theme inline` block to make our `--color-*` variables emit at root scope. They already do via standard `@theme`; the `inline` modifier is for advanced use cases we don't need.
- Removing the `@source inline()` safelist patterns. Those don't change in this phase.
