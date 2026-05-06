---
name: svelte-best-practices
description: Apply Svelte 5 best practices when authoring Svelte islands inside this Astro repo. Covers runes ($state, $derived, $effect, $props, $bindable), component anatomy, snippets vs slots, event handlers, scoped styles, sharing state across islands via .svelte.ts modules, the Astro↔Svelte boundary (props serialization, no .astro imports), hydration directives, and TypeScript. Use when writing or reviewing .svelte / .svelte.ts files, designing an interactive widget for a page, deciding between a plain .astro component and a Svelte island, or porting an existing Hugo-era interactive script (search/filter UIs, toggles, modals) to a Svelte component.
---

# Svelte 5 Best Practices for this Repo

This skill captures the rules and idioms to follow when writing Svelte components in this Astro project. Pair it with [astro-best-practices](../astro-best-practices/SKILL.md) — that skill governs what lives in `.astro` files; this one governs everything inside `.svelte` and `.svelte.ts` files.

The non-negotiable rule: **only reach for Svelte when there is real interactivity.** Static markup, layouts, and content rendering belong in `.astro`. Svelte is an island, not a habit.

## Quick mental model

- **Svelte 5 is rune-first.** Use `$state`, `$derived`, `$effect`, `$props`, `$bindable`. Do not write `let count = 0` for reactive values, do not write `$:` reactive declarations, do not write `export let foo` for props. Those are Svelte ≤4 patterns.
- **`.svelte` files** are components. **`.svelte.ts` (or `.svelte.js`) files** are reactive modules — plain modules where runes are also legal. Use them to share state and helpers across islands.
- **An island is a sandbox.** Two `<Counter client:load />` instances on the same page do **not** share state by default. Shared state lives in a `.svelte.ts` module that both import.
- **Astro hydrates Svelte components, not the other way around.** A Svelte component cannot import a `.astro` file. The boundary is one-way: data flows in via props/slotted children rendered by Astro, events flow out via callbacks.
- **Props are serialized across the SSR→hydrate boundary.** Functions, class instances, Maps with non-serializable values, and DOM nodes cannot cross. Plain objects, arrays, primitives, `Date`, `URL`, `Map`, `Set`, `RegExp`, `BigInt`, typed arrays — all fine.

## When to use a Svelte island

Use a Svelte component for any of:

- Real local state that drives UI (search input, filter chips, sort toggle, modal open/closed).
- Subscriptions to browser APIs (`localStorage`, `IntersectionObserver`, `matchMedia`, keyboard shortcuts, URL `popstate`).
- Two-way bound form inputs more complex than a single `<input>`.
- Dynamic lists where the source data changes after page load (live filtering of reviews, paginated client-side data).
- Reusable behavior shared across multiple pages where a global script in `BaseLayout.astro` would get unwieldy.

Do **not** use a Svelte component for:

- Rendering markdown content or static cards. That is `.astro` territory.
- Anything that could be done with a 5-line `<script>` block in an Astro component.
- Data fetching at build time. Use `getCollection()` in the parent `.astro` file and pass the result as a prop.

## Project layout

```
src/
├── components/
│   ├── astro/                 # plain .astro components (default home)
│   │   ├── Card.astro
│   │   └── Navbar.astro
│   └── svelte/                # interactive islands only
│       ├── ReviewFilter.svelte
│       ├── ThemeToggle.svelte
│       └── SearchBox.svelte
├── lib/
│   ├── stores/                # shared reactive modules
│   │   ├── theme.svelte.ts
│   │   └── reviewFilter.svelte.ts
│   └── helpers.ts             # plain TS helpers (no runes)
└── pages/
    └── reviews/index.astro    # imports + mounts the islands
```

Naming conventions:
- Component files: `PascalCase.svelte`.
- Reactive modules: `camelCase.svelte.ts` (the `.svelte` segment is required for the compiler to allow runes).
- Plain helpers: `camelCase.ts` — no runes allowed here.

## Component anatomy

```svelte
<!-- src/components/svelte/ReviewFilter.svelte -->
<script lang="ts">
  import type { Review } from '$lib/types';

  type Props = {
    reviews: Review[];
    initialTag?: string;
  };

  let { reviews, initialTag = '' }: Props = $props();

  let search = $state('');
  let activeTag = $state(initialTag);

  const filtered = $derived(
    reviews.filter((r) => {
      if (activeTag && !r.tags.includes(activeTag)) return false;
      if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
  );
</script>

<input bind:value={search} placeholder="Search reviews…" />

{#each filtered as review (review.id)}
  <article>{review.title}</article>
{:else}
  <p>No reviews match.</p>
{/each}

<style>
  input { width: 100%; padding: 0.5rem; }
</style>
```

Required habits:
- Always `<script lang="ts">`. The repo uses TypeScript end-to-end.
- Always declare a `Props` type and destructure with defaults: `let { foo = 'x', bar }: Props = $props();`.
- Always key `{#each}` blocks with a stable `id`. Without a key, Svelte uses index-based reconciliation, which loses focus/selection state during reorders.
- Always use the **`{:else}` branch** of `{#each}` to render the empty state — do not write a separate `{#if list.length === 0}` block.

## The five runes you will actually use

| Rune | Purpose | Cardinal rule |
|---|---|---|
| `$state(value)` | Reactive variable. Arrays/plain objects become deep proxies. | Never destructure a state proxy — you lose reactivity. Read `obj.field` directly. |
| `$derived(expr)` | Pure computed value from other reactive sources. | No side effects. Use `$derived.by(() => { ... })` for multi-line logic. |
| `$effect(() => { ... })` | DOM/browser-API side effects after render. | Return a cleanup function for any subscription. Never use to copy state into other state. |
| `$props()` | Component inputs. | Destructure once at the top of the script. Never mutate; emit changes via `$bindable` or callback props. |
| `$bindable()` | Mark a prop as supporting two-way binding. | Use sparingly; default to one-way data flow + callback. |

Two important corollaries:

1. **`$effect` is not for state synchronization.** If you find yourself writing `$effect(() => { derived = compute(state) })`, it should be `let derived = $derived(compute(state))`.
2. **Pass reactive state through getters, not values.** Passing `count` to a helper captures the value at call time. Pass `() => count` if the helper needs to read it later.

```ts
// Wrong — captures snapshot
function makeLogger(value: number) {
  return () => console.log(value);
}

// Right — reads live value
function makeLogger(get: () => number) {
  return () => console.log(get());
}
```

## Events

Svelte 5 uses **DOM-style event attributes**, not `on:event`:

```svelte
<button onclick={() => count++}>+</button>
<input oninput={(e) => (search = e.currentTarget.value)} />
<form onsubmit={(e) => { e.preventDefault(); submit(); }}>
```

- ❌ `on:click={…}` — Svelte 4 syntax. Will not work.
- ❌ `on:click|preventDefault={…}` — modifiers are gone. Call `event.preventDefault()` inside the handler.
- For component-to-parent communication, **pass a callback prop**, do not dispatch events:

```svelte
<!-- parent -->
<Counter onChange={(n) => (count = n)} />

<!-- Counter.svelte -->
<script lang="ts">
  let { onChange }: { onChange: (n: number) => void } = $props();
  let n = $state(0);
  $effect(() => onChange(n));
</script>
```

`createEventDispatcher` exists for back-compat but should not be used in new code.

## Snippets, not slots

Svelte 5 replaces named/scoped slots with **snippets**. Quick rules:

- A `{#snippet name(args)}…{/snippet}` block defines a reusable chunk of markup.
- `{@render name(args)}` invokes it.
- Children passed via `<Foo>…</Foo>` arrive as the implicit `children` snippet on `$props()`. Render them with `{@render children()}`.
- Named slots become named snippet props — declare them in `Props` typed as `Snippet` (or `Snippet<[ArgType]>`).

```svelte
<!-- Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { header, children }: { header?: Snippet; children: Snippet } = $props();
</script>

<article>
  {#if header}<h2>{@render header()}</h2>{/if}
  <div>{@render children()}</div>
</article>
```

`<slot />` still works in Svelte 5 for compatibility, but new code should use snippets.

## Classes and conditional styling

Svelte 5 accepts an object literal for `class`, with `clsx` semantics:

```svelte
<div class={{ btn: true, 'btn--primary': isPrimary, 'btn--lg': size === 'lg' }} />
<div class={['card', extra, isFeatured && 'card--featured']} />
```

For Tailwind utility lists, prefer plain template strings unless you have a real conditional toggle.

## Scoped styles

A `<style>` block in a `.svelte` file is **scoped to the component** by default — same model as `.astro`. Rules of thumb:

- Use low-specificity selectors (`button {}`, `.row {}`).
- Use `:global(...)` to escape the scope deliberately: `:global(.markdown a) { … }`.
- Use `<style lang="postcss">` if you need PostCSS features. Tailwind utilities should be applied via `class` attribute, not via `@apply` inside the component.

## Sharing state across islands

Two `<Counter client:load />` instances on the same page each have their own `$state`. To share, lift state into a `.svelte.ts` module:

```ts
// src/lib/stores/theme.svelte.ts
class ThemeStore {
  current = $state<'light' | 'dark'>('light');

  toggle = () => {
    this.current = this.current === 'light' ? 'dark' : 'light';
  };
}

export const theme = new ThemeStore();
```

```svelte
<!-- ThemeToggle.svelte -->
<script lang="ts">
  import { theme } from '$lib/stores/theme.svelte';
</script>
<button onclick={theme.toggle}>{theme.current}</button>
```

Imported instances are shared per-page (per-island bundle), not per-island. Note that the **server** also evaluates the module during SSR — keep server-unsafe code (e.g. `localStorage` access) inside a `$effect` so it only runs on the client.

`writable`/`readable` from `svelte/store` still work in Svelte 5 but new code should use rune-based modules.

## The Astro↔Svelte boundary

The non-negotiable rules:

1. **Pick a hydration directive deliberately.** Default to `client:visible` for below-the-fold widgets, `client:idle` for above-the-fold non-critical, `client:load` only for above-the-fold critical, `client:only="svelte"` only when SSR genuinely cannot work (e.g. component reads `window` at module top level).
2. **Props are serialized.** Pass plain data. To pass a function, pass a string identifier and look it up inside the island instead.
3. **`Astro.props` is not Svelte's `$props()`.** They are unrelated APIs that happen to share a name.
4. **Astro's `<slot>` and Svelte's children are bridged for you** — `<MySvelte>content</MySvelte>` in an `.astro` file becomes the `children` snippet of the Svelte component. Named slots map to named snippets (with a `<slot name="x">` in the Svelte file as the compatibility layer; new code should accept a `Snippet` prop).
5. **Cannot import `.astro` from `.svelte`.** If you need Astro-rendered markup inside an island, render it inside `<MySvelte>…</MySvelte>` in the parent `.astro` file and consume it as `children`.

## TypeScript

- `<script lang="ts">` always.
- Type props with a `Props` type alias (or `interface`); do not rely on inference.
- Type snippets with `Snippet` from `'svelte'`. For parameterised snippets: `Snippet<[ParamType]>`.
- Path alias `$lib` → `src/lib/` (configure in `tsconfig.json`).
- Run `svelte-check` (via `astro check`, which delegates) in CI; treat warnings as errors.

## Anti-patterns to refuse

- ❌ `let count = 0` for reactive state in a component. Use `$state(0)`.
- ❌ `$: doubled = count * 2`. Use `$derived(count * 2)`.
- ❌ `export let foo` to declare a prop. Use `$props()`.
- ❌ `on:click={…}`. Use `onclick={…}`.
- ❌ `createEventDispatcher`. Pass a callback prop instead.
- ❌ Destructuring a `$state` proxy: `let { count } = state`. You silently lose reactivity.
- ❌ `$effect(() => { other = derive(state); })` — that's a `$derived`, not an effect.
- ❌ Forgetting the cleanup return in an `$effect` that subscribes to anything.
- ❌ Passing a function as a prop to a hydrated Svelte island from `.astro`. It will not survive serialization.
- ❌ Importing a `.astro` file from a `.svelte` file. Will not compile.
- ❌ Using `client:load` everywhere. That's an SPA mindset — the page should still be useful with JS disabled.
- ❌ `class:foo={isFoo}` directive (Svelte 4). Use `class={{ foo: isFoo }}`.
- ❌ Top-level `localStorage` / `window` access in a `.svelte.ts` store. Wrap it in an `$effect` or a getter that runs only on demand.

## Verification checklist before declaring an island "done"

- [ ] `astro check` passes (delegates to `svelte-check`).
- [ ] No `on:event` handlers in the file.
- [ ] No `export let` prop declarations.
- [ ] No `$:` reactive statements.
- [ ] Every `$effect` that subscribes to something returns a cleanup function.
- [ ] Every `{#each}` over a mutable list has a key.
- [ ] All props are typed; the `Props` type appears once in the script.
- [ ] The component uses the lowest-priority `client:*` directive that still works (or none, if it doesn't need hydration at all).
- [ ] Props passed from `.astro` are JSON-serializable.
- [ ] Shared state lives in a `.svelte.ts` module, not duplicated across islands.
- [ ] Component renders sensibly in SSR (open the page, view source, the static HTML should be present unless `client:only` is used intentionally).
