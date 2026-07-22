# Styling: Tailwind v4 + scoped CSS

## Tailwind v4 setup (the only supported path)

The legacy `@astrojs/tailwind` integration is **deprecated**. Use the official Vite plugin.

```bash
npx astro add tailwind
```

That command installs `@tailwindcss/vite`, wires it into `astro.config.mjs`, and creates `src/styles/global.css` with:

```css
@import "tailwindcss";
```

Then import that file once from a top-level layout so its classes are available across the site:

```astro
---
// src/layouts/BaseLayout.astro
import '../styles/global.css';
---
```

A few migration notes from the old Tailwind 3 setup in this repo:

- Tailwind v4 has no `tailwind.config.js`. Theme tokens live inside `@theme { ... }` directives in your CSS.
- The `@tailwindcss/forms` plugin still works; install it and add `@plugin "@tailwindcss/forms";` to `global.css`.
- The custom SCSS files (`fancy.scss`, `theme.scss`, `range-slider.scss`, etc.) should be ported to either Tailwind utility classes or a single `global.css` (Astro supports `.scss` natively if you keep them, but consider plain CSS plus Tailwind for simplicity).
- Tailwind 4's `responsiveStyles` may conflict with Astro's `image.responsiveStyles: true`. If you opt into Astro responsive images **and** Tailwind 4, set `image.responsiveStyles: false` and write the image CSS yourself.

## Scoped styles in components

A `<style>` inside an `.astro` component is scoped via a generated `data-astro-cid-*` attribute. You can write low-specificity selectors safely:

```astro
<article>
  <h1>{title}</h1>
  <slot />
</article>

<style>
  article { padding: 2rem; }
  h1 { color: var(--accent); margin-block-end: 1rem; }
</style>
```

Scoped styles do **not** cross into child components. To style a child component's root element, accept a `class` prop on the child and forward it.

## Global styles

Reach for global styles only when:

- You are setting CSS variables on `:root` / `body`.
- You are styling Markdown body content (which is rendered through `<Content />` and not part of a scoped component tree).
- You are setting third-party widget styles you cannot isolate.

```astro
<style is:global>
  :root { --accent: #ff5e5b; }
  body { font-family: 'Inter', sans-serif; }
</style>
```

Inside a scoped block you can still target descendants globally:

```astro
<style>
  .prose :global(a) { color: var(--accent); }
</style>
```

## Markdown body styling

Markdown rendered through a content collection's `<Content />` lives inside whatever element you wrap it in. The cleanest approach is the Tailwind Typography plugin:

```css
/* global.css */
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

```astro
<article class="prose dark:prose-invert max-w-none">
  <Content />
</article>
```

This replaces the bespoke prose styling currently in the Hugo theme.

## CSS variables across the SSR/client boundary

Use `define:vars` to inject server values into a `<style>` block:

```astro
---
const { rating } = Astro.props;
const hue = rating >= 8 ? 120 : rating >= 5 ? 60 : 0;
---
<div class="rating-pill" style={`--hue: ${hue}`}>{rating}</div>

<style>
  .rating-pill { background: hsl(var(--hue) 70% 45%); color: white; }
</style>
```

Equivalent: `<style define:vars={{ hue }}>...</style>` then use `var(--hue)`. Keep in mind `define:vars` makes the style block effectively global per-element, so prefer plain inline `style="..."` for one-off variables.

## Importing third-party CSS

```astro
---
import 'highlight.js/styles/github-dark.css';
import 'aos/dist/aos.css';
---
```

Astro bundles, hashes, and tree-shakes these like local CSS. For npm packages whose CSS file is referenced without a file extension, add the package to `vite.ssr.noExternal`.

## What to delete from the old theme

When migrating the styling layer of `themes/sams-theme/`:

- `assets/css/tailwind.config.js`, `postcss.config.js` → gone (Tailwind 4 needs neither).
- `package.json` `devDependencies` → drop `@tailwindcss/forms`, `tailwindcss`, `postcss*`, `autoprefixer`, `cruip-js-toolkit`. Re-add only what's still needed.
- `assets/css/utility-patterns.scss`, `fancy.scss`, etc. → audit each rule; most should be Tailwind classes now. Anything truly bespoke can become small `<style>` blocks colocated with the component that uses them.
- The Hugo postcss build pipeline → gone. Astro+Vite handles it.
