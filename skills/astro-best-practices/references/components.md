# Components, props, slots, scripts

## File anatomy

An `.astro` file has two halves separated by a code fence. The script runs on the server only; the template is HTML with JSX-like expressions.

```astro
---
// Server-only TypeScript. Imports, data fetching, prop destructuring.
import Card from '../components/Card.astro';
import { getCollection } from 'astro:content';

interface Props {
  title: string;
  count?: number;
}

const { title, count = 0 } = Astro.props;
const reviews = (await getCollection('reviews')).slice(0, count);
---

<section>
  <h2>{title}</h2>
  {reviews.map((r) => <Card review={r} />)}
</section>

<style>
  /* Scoped to this component. */
  section { display: grid; gap: 1rem; }
</style>
```

## Props

- Always declare a `Props` interface, even for one-prop components. It powers editor autocomplete and `astro check`.
- Destructure with defaults: `const { greeting = 'Hi', name } = Astro.props;`.
- For components that mirror an HTML element, type them with `HTMLAttributes`:

```astro
---
import type { HTMLAttributes } from 'astro/types';
type Props = HTMLAttributes<'a'> & { external?: boolean };
const { external, href, ...rest } = Astro.props;
---
<a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener' : undefined} {...rest}>
  <slot />
</a>
```

- For polymorphic components (`<Heading as="h2">`), use `Polymorphic` and `HTMLTag` from `astro/types`.
- Props passed to **hydrated** islands are serialized; functions and class instances cannot be passed across the SSR/client boundary.

## Slots

- Default slot: `<slot />` renders any children passed to the component.
- Named slots: `<slot name="header" />` and child uses `slot="header"` attribute.
- Fallback: `<slot>fallback content here</slot>` renders only if no children are passed.
- Use `<Fragment slot="..."></Fragment>` to pass multiple elements into a named slot without a wrapper.
- Slots can be **transferred** by re-emitting them in a wrapper: `<slot name="head" slot="head" />`.

```astro
<!-- src/layouts/BaseLayout.astro -->
<html lang="en">
  <head>
    <title>{title}</title>
    <slot name="head" />
  </head>
  <body>
    <slot />
  </body>
</html>
```

## Scoped styles

A `<style>` block inside a `.astro` file is scoped automatically — Astro adds a `data-astro-cid-*` attribute. Low-specificity selectors like `h1 {}` are safe.

- For global rules: `<style is:global>...</style>`.
- For child-style overrides: `:global(h1)` inside a normal `<style>`.
- To pass server values into CSS: `<style define:vars={{ accent }}>` then use `var(--accent)`.
- To pass `class` through to a child component, accept it as a prop and rename (`class` is reserved):

```astro
---
const { class: className, ...rest } = Astro.props;
---
<div class={className} {...rest}><slot /></div>
```

When using the default scoped strategy, also forward `...rest` so the `data-astro-cid-*` attribute reaches the child element.

## Combining classes

Use `class:list` for conditional classes — it accepts strings, arrays, and objects and uses `clsx` semantics:

```astro
<div class:list={['btn', { 'btn--primary': isPrimary }, extraClasses]} />
```

## Client-side scripts

A bare `<script>` tag inside an `.astro` component is processed and bundled by Astro and ships as an ES module:

```astro
<script>
  document.querySelector('#menu-toggle')?.addEventListener('click', () => {
    document.body.classList.toggle('menu-open');
  });
</script>
```

- Do **not** use `is:inline` unless you specifically need the script copied into the HTML verbatim (e.g. third-party analytics snippets that must run before hydration).
- To pass server data to a client script, use `define:vars`:

```astro
---
const apiUrl = '/api/search';
---
<script define:vars={{ apiUrl }}>
  console.log('Hitting', apiUrl);
</script>
```

Note: `define:vars` makes the script `is:inline`, so it loses bundling. For more than tiny snippets, use a `data-*` attribute on an element and read it from a bundled `<script>` instead.

## Framework components (islands)

Use a UI framework only when you need real interactivity (state, refs, lifecycle, two-way binding). Pick one or two frameworks per project; do not mix three or four.

```astro
---
import SearchBox from '../components/SearchBox.svelte';
---
<SearchBox client:visible />
```

Hydration directives (in priority order, prefer the lowest priority that still works):

| Directive | When |
|---|---|
| (none) | Static render only — best |
| `client:visible` | Below-the-fold widgets (carousels, comments) |
| `client:idle` | Non-critical above-the-fold (theme toggle) |
| `client:media="(...)"` | Mobile-only widgets |
| `client:load` | Above-the-fold and critical |
| `client:only="<framework>"` | Component cannot SSR (uses `window`/browser APIs unconditionally) — last resort |

For `client:only`, provide a `<div slot="fallback">Loading…</div>` so the page is not blank during hydration.

## HTML components

You can import a `.html` file as a component, but it cannot use Astro features (no frontmatter, no expressions). Useful only for pasting in legacy markup verbatim.

## Common pitfalls

- HTML attributes do **not** automatically pass through to a child component. You must accept and forward them.
- Astro components cannot be imported inside framework components. The reverse works.
- `Astro.redirect()` only works at the **page** level (not in a deeply nested component) because of HTML streaming.
- Do not use `client:*` on plain `.astro` components — it is for framework components only and will error.
