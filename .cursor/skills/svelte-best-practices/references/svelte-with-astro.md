# Svelte ↔ Astro integration

This file covers the boundary rules: how a Svelte island is installed, configured, mounted, hydrated, and how data flows between Astro and Svelte.

## Installation

```bash
npx astro add svelte
```

This:

1. Installs `@astrojs/svelte`, `svelte`, and (if needed) `typescript`.
2. Adds `svelte()` to `astro.config.mjs` integrations.
3. Creates `svelte.config.js` with `vitePreprocess()`.

The current `@astrojs/svelte` defaults to **Svelte 5**. For Svelte 4, pin `@astrojs/svelte@5` — but this repo uses Svelte 5.

`astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

export default defineConfig({
  integrations: [svelte()],
});
```

`svelte.config.js`:

```js
import { vitePreprocess } from '@astrojs/svelte';

export default {
  preprocess: vitePreprocess(),
};
```

`tsconfig.json` should already extend `astro/tsconfigs/strict`. Add the path alias used in the main skill:

```json
{
  "compilerOptions": {
    "paths": {
      "$lib/*": ["src/lib/*"]
    }
  }
}
```

## Mounting an island

```astro
---
// src/pages/reviews/index.astro
import { getCollection } from 'astro:content';
import ReviewFilter from '../../components/svelte/ReviewFilter.svelte';

const reviews = (await getCollection('reviews', ({ data }) => !data.draft))
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

// Strip down to a serializable shape before crossing the boundary
const reviewProps = reviews.map((r) => ({
  id: r.id,
  title: r.data.title,
  author: r.data.author,
  rating: r.data.rating,
  tags: r.data.tags,
  href: `/reviews/${r.id}/`,
}));
---

<ReviewFilter reviews={reviewProps} client:visible />
```

The Astro file does the data fetching at build time. The Svelte island only receives the data it needs.

## Hydration directives — picking the right one

| Directive | Behavior | Pick when |
|---|---|---|
| (none) | Server-render only, no JS shipped | The component should be a static snapshot |
| `client:visible` | Hydrate when scrolled into viewport | Default for any below-the-fold widget |
| `client:idle` | Hydrate during browser idle time | Above-the-fold but non-critical (theme toggle, share button) |
| `client:media="(...)"` | Hydrate when a media query matches | Mobile-only or print-only widgets |
| `client:load` | Hydrate immediately on page load | Above-the-fold and critical to first interaction |
| `client:only="svelte"` | Skip SSR, render only in the browser | Component reads `window` / `document` at the top of its script and cannot SSR |

Always include a fallback when using `client:only`:

```astro
<MyClientOnly client:only="svelte">
  <p slot="fallback">Loading…</p>
</MyClientOnly>
```

The `slot="fallback"` content renders during SSR and stays until hydration finishes.

## What can cross the boundary as props

Props passed to a hydrated island are serialized to JSON during SSR and re-hydrated on the client. Supported types:

- `string`, `number`, `boolean`, `null`, `undefined`
- Plain objects, arrays
- `Date`, `URL`, `RegExp`, `BigInt`, `Infinity`
- `Map`, `Set` (with serializable values)
- `Uint8Array`, `Uint16Array`, `Uint32Array`

Not supported:

- Functions / methods. Pass a string identifier and look up the function inside the island.
- Class instances. Pass the data the class was holding; reconstruct in the island if needed.
- Symbols.
- DOM nodes / `Astro` request objects.
- `getCollection()` entries with `Content` components attached. Strip to the data fields you need.

## Children: Astro slots → Svelte snippets

Astro children passed via `<MySvelte>…</MySvelte>` are bridged to the Svelte component's children:

```astro
<!-- parent.astro -->
<Card client:visible>
  <h2>This markup is rendered by Astro</h2>
  <p>It hydrates inside the Svelte island as static children.</p>
</Card>
```

```svelte
<!-- Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>
<article>{@render children()}</article>
```

Named slots (Astro side) → named snippets / `<slot name="x">` (Svelte side). The Svelte 4 `<slot name="x" />` syntax is still accepted for compatibility, but for new code, declare the named slot as a `Snippet` prop and `{@render header()}` it.

```astro
<Card client:visible>
  <h2 slot="header">Hello</h2>
  <p>body</p>
</Card>
```

```svelte
<!-- compat: works today -->
<aside><slot name="header" /></aside>
<main><slot /></main>

<!-- preferred: typed snippet -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { header, children }: { header?: Snippet; children: Snippet } = $props();
</script>
<aside>{@render header?.()}</aside>
<main>{@render children()}</main>
```

You **cannot** import `.astro` components inside a `.svelte` file. Always render Astro markup in the parent and pass it as children.

## Sharing state across islands on the same page

Each `<MySvelte client:* />` produces an independent island bundle with its own component state. Islands share state via a `.svelte.ts` module they both import:

```ts
// src/lib/stores/reviewFilter.svelte.ts
class ReviewFilterStore {
  search = $state('');
  activeTags = $state<Set<string>>(new Set());

  toggleTag = (tag: string) => {
    const next = new Set(this.activeTags);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    this.activeTags = next;
  };
}

export const reviewFilter = new ReviewFilterStore();
```

```svelte
<!-- TagBar.svelte -->
<script lang="ts">
  import { reviewFilter } from '$lib/stores/reviewFilter.svelte';
  import type { Review } from '$lib/types';
  let { reviews }: { reviews: Review[] } = $props();
  const allTags = [...new Set(reviews.flatMap((r) => r.tags))].sort();
</script>

{#each allTags as tag}
  <button
    class={{ tag: true, active: reviewFilter.activeTags.has(tag) }}
    onclick={() => reviewFilter.toggleTag(tag)}
  >{tag}</button>
{/each}
```

```svelte
<!-- ReviewGrid.svelte -->
<script lang="ts">
  import { reviewFilter } from '$lib/stores/reviewFilter.svelte';
  import type { Review } from '$lib/types';
  let { reviews }: { reviews: Review[] } = $props();
  const filtered = $derived(
    reviews.filter((r) =>
      reviewFilter.activeTags.size === 0
        ? true
        : [...reviewFilter.activeTags].every((t) => r.tags.includes(t))
    )
  );
</script>

{#each filtered as r (r.id)}<article>{r.title}</article>{/each}
```

Both `<TagBar client:visible />` and `<ReviewGrid client:visible />` mounted on the same page now share `reviewFilter`.

### Browser-only modules

`.svelte.ts` modules execute during SSR too. Guard browser APIs:

```ts
class ThemeStore {
  current = $state<'light' | 'dark'>('light');

  init = () => {
    // Called from a $effect inside a component, so it runs only client-side
    if (typeof window === 'undefined') return;
    this.current = (localStorage.getItem('theme') as 'light' | 'dark') ?? 'light';
  };
}
export const theme = new ThemeStore();
```

```svelte
<script lang="ts">
  import { theme } from '$lib/stores/theme.svelte';
  $effect(() => theme.init());
</script>
```

Or check `import.meta.env.SSR` inside the module.

## TypeScript pitfalls

- Set `verbatimModuleSyntax` on (the strict tsconfig does this). Type-only imports must use `import type`.
- For `Snippet`, always import from `'svelte'`, not from the framework type packages.
- The `Astro.Props` type is unrelated to Svelte's props — do not try to share types.

## Debugging mismatches

Symptoms and causes:

| Symptom | Likely cause |
|---|---|
| "Hydration mismatch" warning | Random IDs / dates differ between SSR and client. Use `$props.id()`; pass dates as ISO strings, not `Date` objects, or convert with `new Date(iso)` inside the island. |
| Island renders, but click does nothing | Forgot a `client:*` directive, or the directive is `client:media` with a non-matching query |
| Island works in dev, blank in production | Reading `window` at module top-level. Move into `$effect` or use `client:only="svelte"`. |
| Two islands disagree on shared state | They each created their own `$state` — lift into a `.svelte.ts` module |
| Prop arrives as `undefined` | Passed a function or class instance. Strip to plain data in the parent `.astro`. |

## Choosing between Svelte and a plain `<script>` in `.astro`

| Need | Use |
|---|---|
| Toggle a `body` class on click | `<script>` in `.astro` |
| Read URL params on load and update on `popstate` | `<script>` in `.astro` |
| Anything with reactive state and conditional rendering | Svelte island |
| Form with multiple validated fields | Svelte island |
| List the user can filter/sort/search | Svelte island |
| Theme toggle that other components react to | Svelte island + `.svelte.ts` store |

When in doubt, start with a plain `<script>` in `.astro`. Promote to a Svelte island only when imperative DOM manipulation gets fragile.
