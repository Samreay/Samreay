# Snippets, events, and template directives

Svelte 5 reworks how reusable markup and event handling work. This file covers the three areas where Svelte 4 muscle memory will steer you wrong: snippets (replacing slots), event handlers (replacing `on:`), and template directives (`bind:`, `use:`, `transition:`).

## Snippets

A snippet is a named, parameterised, reusable chunk of markup defined inside a component template.

```svelte
{#snippet figure(image)}
  <figure>
    <img src={image.src} alt={image.alt} />
    <figcaption>{image.caption}</figcaption>
  </figure>
{/snippet}

{@render figure(currentImage)}
```

### Rules

- Define with `{#snippet name(arg1, arg2?)}…{/snippet}`. Default values and destructuring work; rest parameters do not.
- Invoke with `{@render name(arg1, arg2)}`.
- Snippets see their lexical outer scope — they can read script variables and outer `{#each}` items.
- Snippets are only callable inside the scope they are declared in (their containing block and any nested blocks).

### Snippets as props

Snippets are first-class values. Pass them to components like any other prop:

```svelte
<script lang="ts">
  import Table from './Table.svelte';
  const fruits = [
    { name: 'apples', qty: 5, price: 2 },
    { name: 'bananas', qty: 10, price: 1 },
  ];
</script>

{#snippet header()}
  <th>fruit</th><th>qty</th><th>price</th>
{/snippet}

{#snippet row(d)}
  <td>{d.name}</td><td>{d.qty}</td><td>{d.price}</td>
{/snippet}

<Table data={fruits} {header} {row} />
```

### Implicit children

Anything between `<Foo>…</Foo>` not wrapped in a `{#snippet}` becomes the implicit `children` snippet on `Foo`'s `$props()`:

```svelte
<!-- App.svelte -->
<Button>Click me</Button>

<!-- Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>
<button>{@render children()}</button>
```

### Typing snippets

```ts
import type { Snippet } from 'svelte';

type Props = {
  data: Item[];
  children?: Snippet;          // no parameters
  header?: Snippet;            // no parameters, optional
  row: Snippet<[Item]>;        // one parameter typed `Item`
  cell: Snippet<[Item, number]>; // two parameters
};
```

### Snippets vs components

| Use a component when | Use a snippet when |
|---|---|
| Reusable across multiple files | Reusable within one component or as a prop to one component |
| Has its own state/lifecycle | Pure markup with parameters |
| Worth its own `.svelte` file | Would just be repeated JSX |

### Migrating from Svelte 4 slots

| Svelte 4 | Svelte 5 |
|---|---|
| `<slot />` | `{@render children()}` (with `children: Snippet` prop) |
| `<slot name="header" />` | `{@render header()}` (with `header?: Snippet` prop) |
| Scoped slot: `<slot {item} />` | `{@render row(item)}` (with `row: Snippet<[Item]>` prop) |
| Slot fallback: `<slot>fallback</slot>` | `{#if children}{@render children()}{:else}fallback{/if}` |

Compatibility note: `<slot />` still works in Svelte 5 components, which is useful when consuming a component from `.astro` (Astro uses slot semantics on its side). New code should accept `Snippet` props and render them with `{@render …}`.

## Events

### DOM-style attributes only

Svelte 5 uses standard DOM event attribute names with a function value:

```svelte
<button onclick={handle}>+</button>
<input oninput={(e) => (search = e.currentTarget.value)} />
<form onsubmit={(e) => { e.preventDefault(); save(); }}>
<div onpointerdown={start} onpointermove={move} onpointerup={end}>
```

`on:click` is **not** valid Svelte 5. There is no automatic translation.

### No event modifiers

Svelte 4's `on:click|preventDefault|stopPropagation|once|passive` shortcuts are gone. Either:

1. Call the methods inside the handler:
   ```svelte
   <form onsubmit={(e) => { e.preventDefault(); save(); }}>
   ```
2. Wrap with a helper:
   ```ts
   const prevent = (fn: (e: Event) => void) => (e: Event) => { e.preventDefault(); fn(e); };
   ```

For `passive` listeners use a `use:` action (see below) — there is no shortcut.

### Component events

`createEventDispatcher` is deprecated. Pass callback props instead:

```svelte
<!-- Counter.svelte -->
<script lang="ts">
  type Props = { onChange: (n: number) => void };
  let { onChange }: Props = $props();
  let n = $state(0);
  $effect(() => onChange(n));
</script>

<!-- parent -->
<Counter onChange={(n) => console.log(n)} />
```

For events from arbitrary nested elements, the parent attaches the handler at the top level — there is no event bubbling across component boundaries by default.

## Bindings

`bind:` syntax is the same as Svelte 4, but the child must opt in to two-way binding via `$bindable`:

```svelte
<!-- TextField.svelte -->
<script lang="ts">
  let { value = $bindable(''), id }: { value?: string; id: string } = $props();
</script>
<input {id} bind:value />

<!-- parent -->
<TextField id="name" bind:value={name} />
```

DOM bindings (`bind:value`, `bind:checked`, `bind:group`, `bind:files`, `bind:this`) work as before.

## Actions (`use:`)

Actions are still the right tool for imperative DOM behavior that does not warrant its own component (focus traps, click-outside, intersection observation, third-party widgets):

```ts
// $lib/actions/clickOutside.ts
import type { Action } from 'svelte/action';
export const clickOutside: Action<HTMLElement, () => void> = (node, callback) => {
  const handler = (e: MouseEvent) => {
    if (!node.contains(e.target as Node)) callback?.();
  };
  document.addEventListener('click', handler, true);
  return {
    update(cb) { callback = cb; },
    destroy() { document.removeEventListener('click', handler, true); },
  };
};
```

```svelte
<div use:clickOutside={() => (open = false)}>…</div>
```

For most cases inside an island, an inline `$effect` is cleaner than an action — reach for actions when the same imperative behavior is reused across multiple components.

## Transitions and animations

Unchanged from Svelte 4. `transition:fade`, `in:fly`, `out:slide`, `animate:flip` all work. Keep them sparing — they ship code and execute on every mount.

```svelte
{#if open}
  <div transition:fade={{ duration: 150 }}>…</div>
{/if}
```

## Control-flow blocks

The block syntax is unchanged from Svelte 4 except that `{#each}` now requires an explicit empty branch via `{:else}`:

```svelte
{#each items as item (item.id)}
  <Row {item} />
{:else}
  <p>No items.</p>
{/each}

{#if loading}
  Loading…
{:else if error}
  {error.message}
{:else}
  {@render children()}
{/if}

{#await promise}
  Loading…
{:then value}
  {value}
{:catch err}
  {err.message}
{/await}

{#key id}
  <Component />  <!-- destroyed and recreated when id changes -->
{/key}
```

## Error boundaries

Wrap risky islands in `<svelte:boundary>` to contain crashes:

```svelte
<svelte:boundary onerror={(err, reset) => console.error(err)}>
  <FlakyChart data={readings} />
  {#snippet failed(error, reset)}
    <p>Chart failed to render. <button onclick={reset}>Retry</button></p>
  {/snippet}
</svelte:boundary>
```

Useful around third-party widgets or anything reading uncertain data.
