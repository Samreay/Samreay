# Runes — deep reference

Runes are compiler-level keywords prefixed with `$`. They are not imported, not values, and only valid inside `.svelte` and `.svelte.ts` / `.svelte.js` files. The compiler errors if you put them in a regular `.ts` file.

## `$state`

Reactive variable. Reads in templates and other reactive contexts subscribe to changes; writes notify subscribers.

```ts
let count = $state(0);          // primitive
let user = $state({ name: '' }); // deep proxy
let tags = $state<string[]>([]); // deep proxy
```

### Deep reactivity

Plain objects and arrays passed to `$state` become recursive `Proxy` objects. Every read and write is tracked, including `array.push()`, `array[i].field = …`, `Object.assign(obj, …)`, etc.

```ts
let todos = $state([{ done: false, text: 'a' }]);
todos[0].done = true;        // tracked
todos.push({ done: false }); // tracked, the new entry is also proxied
```

Class instances and objects created with `Object.create(...)` are **not** proxied. To make a class reactive, declare runes on its fields:

```ts
class Todo {
  done = $state(false);
  text = $state('');
  reset = () => {
    this.done = false;
    this.text = '';
  };
}
```

The compiler rewrites field declarations into private storage + getter/setter pairs. Two consequences:

1. The fields are no longer enumerable (they will not appear in `Object.keys(todo)`).
2. Methods that use `this` must be defined as arrow-property fields (`reset = () => {...}`) or always called via `todo.reset()` so `this` is bound. Detached calls like `<button onclick={todo.reset}>` lose `this` — write `<button onclick={() => todo.reset()}>` instead.

### Never destructure a state proxy

Destructuring captures values at that moment; the resulting variables are plain (non-reactive):

```ts
let user = $state({ name: 'Sam', age: 20 });
let { name } = user;   // ❌ name is a plain string, frozen
user.name = 'Other';   // does not update `name`
```

Read fields directly: `user.name`. If you must rename, use a `$derived` indirection.

### `$state.raw`

Shallow state — assignment is tracked, mutations are not. Use this for large arrays/objects you swap whole-cloth (CSV rows, parsed JSON), to skip the proxy overhead.

```ts
let person = $state.raw({ name: 'A', age: 1 });
person.age = 2;             // ❌ no update
person = { ...person, age: 2 }; // ✅ reassign the whole object
```

### `$state.snapshot`

Returns a plain (non-proxy) deep clone of reactive state. Use only when passing reactive data to a third-party API that breaks on `Proxy` (e.g. some serializers, `structuredClone`, `console.log` in older devtools).

```ts
externalApi.send($state.snapshot(formData));
```

### Passing state into helpers

Functions receive values, not bindings. Pass a getter when the helper needs to read the live value:

```ts
function makeTotal(getA: () => number, getB: () => number) {
  return $derived(getA() + getB());
}
let a = $state(1);
let b = $state(2);
let total = makeTotal(() => a, () => b);
```

Alternatively, pass the whole reactive object: `function operate(user: { age: number })` — reads of `user.age` inside `operate` are tracked because the proxy is preserved.

### Cross-module state

You can export a state container, but you cannot reassign an exported `let`:

```ts
// store.svelte.ts
export const counter = $state({ value: 0 }); // OK — mutate counter.value
export let bad = $state(0);                  // ❌ reassignment from outside fails
```

Wrap primitives in an object, or expose a class instance.

## `$derived`

Pure computed value. Recomputes when any reactive read inside it changes. No side effects.

```ts
let count = $state(0);
let doubled = $derived(count * 2);
let bigger = $derived(doubled > 10);
```

### `$derived.by`

Use the `.by(() => …)` form for any logic that does not fit a single expression:

```ts
let total = $derived.by(() => {
  let sum = 0;
  for (const n of numbers) sum += n;
  return sum;
});
```

### Overriding (optimistic UI)

A derived value can be reassigned imperatively. The next time any dependency changes, it snaps back to the derived value:

```ts
let likes = $derived(post.likes);

async function like() {
  likes += 1;                  // optimistic
  try {
    await api.like(post.id);
  } catch {
    likes -= 1;                // revert
  }
}
```

This is the right tool for UI optimism. Do **not** simulate it with `$effect`.

### Common mistakes

- ❌ Doing I/O inside `$derived`: `$derived(await fetch(…))`. Async derives need the experimental `await` flag and a `<svelte:boundary>` — usually not worth it. Fetch in `$effect` instead and store the result in `$state`.
- ❌ Mutating other state inside the expression. Effects, not derives.

## `$effect`

Side effects that run **after** the DOM updates. Subscribes to any reactive read inside the function and re-runs when those change.

```ts
let pos = $state({ x: 0, y: 0 });

$effect(() => {
  document.title = `(${pos.x}, ${pos.y})`;
});
```

### Cleanup

Return a function to tear down subscriptions/timers/listeners:

```ts
$effect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
});
```

The cleanup runs before the next re-execution and on component teardown. **Always return cleanup for any subscription.** Memory leaks here are silent.

### `$effect.pre`

Same as `$effect`, but runs **before** the DOM updates. Use when you need to read DOM measurements before they are mutated (auto-scroll, focus management).

```ts
let list: HTMLElement;
$effect.pre(() => {
  if (!list) return;
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
  if (atBottom) queueMicrotask(() => (list.scrollTop = list.scrollHeight));
});
```

### `$effect.root`

Creates a non-tracked scope so you can attach an effect outside of a component's lifecycle (e.g. inside a class constructor in a `.svelte.ts` module). Returns a cleanup function — **you must call it manually**:

```ts
class Watcher {
  #cleanup: () => void;
  constructor() {
    this.#cleanup = $effect.root(() => {
      $effect(() => { /* … */ });
      return () => { /* manual teardown */ };
    });
  }
  destroy() { this.#cleanup(); }
}
```

### `$effect.tracking`

Boolean — `true` if the surrounding code is currently running inside a tracked context. Niche; used for libraries that need to behave differently inside vs outside reactive scopes. Not part of normal app code.

### When NOT to use `$effect`

- ❌ Computing a value from other state. Use `$derived`.
- ❌ Synchronizing two pieces of state (`$effect(() => other = derive(state))`). Use `$derived`.
- ❌ Anything that should run during render. Effects run after render — by then the user has already seen the wrong UI for one frame.

A useful rule: if the effect's body is `x = f(y)`, it should be `let x = $derived(f(y))`.

## `$props`

Reads component inputs. Destructure once at the top of the script.

```svelte
<script lang="ts">
  type Props = {
    label: string;
    count?: number;
    items: string[];
  };
  let { label, count = 0, items }: Props = $props();
</script>
```

### Renaming reserved keywords

```ts
let { class: className, super: trouper, ...rest } = $props();
```

### Rest props

Pass through unknown attributes:

```svelte
<script lang="ts">
  type Props = { variant?: 'primary' | 'ghost' } & Record<string, unknown>;
  let { variant = 'primary', ...rest }: Props = $props();
</script>
<button class={['btn', variant]} {...rest}><slot /></button>
```

### `$props.id()`

Generates a stable unique id per component instance. Use for `for`/`id` pairs in form labels:

```svelte
<script lang="ts">
  const uid = $props.id();
</script>
<label for="{uid}-name">Name</label>
<input id="{uid}-name" />
```

Do not roll your own with `Math.random()` — it differs between SSR and hydration and triggers mismatches.

### Mutating props is forbidden

Props are read-only from the child's perspective. Communicate upward via:

1. A callback prop: `let { onChange }: { onChange: (v: T) => void } = $props();`
2. A `$bindable` declaration (below).

## `$bindable`

Marks a prop as supporting two-way binding via `bind:`.

```svelte
<!-- FancyInput.svelte -->
<script lang="ts">
  let { value = $bindable('') }: { value?: string } = $props();
</script>
<input bind:value />

<!-- parent -->
<FancyInput bind:value={text} />
```

Without `$bindable`, `bind:value={text}` errors at compile time. Use bindables sparingly — they couple parent and child tightly. Prefer `value` + `onChange` for anything more than a thin form-control wrapper.

## `$host`

Only relevant if you compile a Svelte component as a custom element (`customElement: true` in compiler options). Returns the host element so you can dispatch DOM events. Not applicable to islands inside Astro.

## Quick decision matrix

| You want to… | Use |
|---|---|
| Hold a UI value that changes over time | `$state` |
| Compute a value from other state | `$derived` |
| Run code after render (subscribe, log, set DOM attribute) | `$effect` |
| Receive parent input | `$props` |
| Allow parent to two-way-bind a value | `$bindable` |
| Avoid deep proxy overhead for big data | `$state.raw` |
| Hand reactive data to non-reactive code | `$state.snapshot` |
| Stable id for form labels | `$props.id()` |
