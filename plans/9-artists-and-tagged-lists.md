# Phase 9 — Artists + tagged list islands

**Goal:** Port the two remaining interactive pages (`/artists/`, `/tutorials/`, `/blogs/`) and the small UI islands referenced from earlier phases (mobile menu, show-code toggle).

**Estimate:** ½–1 day.

## Skills to load before starting

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — host pages and the `client:*` directive choices
- [`svelte-best-practices`](../.cursor/skills/svelte-best-practices/SKILL.md) — MobileMenu, ArtistsExplorer, list filters; shared store via `.svelte.ts`

## Source files being ported

- `themes/sams-theme/layouts/artists/list.html` (~190 lines)
- `themes/sams-theme/layouts/_default/list.html` (~145 lines, used for `/blogs/` and `/tutorials/` indexes)
- `themes/sams-theme/layouts/partials/show-code.html` (tutorial code-toggle)
- AlpineJS hamburger logic from `themes/sams-theme/layouts/partials/navbar.html`

## Tasks

### 1. Artists explorer

- `src/pages/artists.astro`:
  ```astro
  ---
  import BaseLayout from '../layouts/BaseLayout.astro';
  import ArtistsExplorer from '../components/islands/ArtistsExplorer.svelte';
  import { artists } from '../data/artists';
  import { resolveArtistCovers } from '../lib/covers';

  const enriched = await Promise.all(artists
    .filter(a => !a.hidden && a.covers?.length)
    .map(async a => ({
      name: a.name,
      id: slugify(a.name),
      notes: a.notes,
      links: Object.entries(a.links ?? {}).map(([n, l]) => ({ name: n, link: l, title: titleCase(n) })),
      covers: await resolveArtistCovers(a.covers, 500, 800),
    })));

  const totalCovers = enriched.reduce((acc, a) => acc + a.covers.length, 0);
  ---
  <BaseLayout title="Artist Corner">
    <div class="content content-full">
      <div class="section-header">
        <h1>Artist Corner</h1>
        <p>Because shouting out the geniuses ...</p>
        <p class="mt-4">... We're at {enriched.length} artists, {totalCovers} covers on display, and counting!</p>
      </div>
      <ArtistsExplorer client:load artists={enriched} />
    </div>
  </BaseLayout>
  ```
- `src/components/islands/ArtistsExplorer.svelte`:
  - State: `alphabetical: boolean`, `showFour: boolean`, `smaller: boolean`.
  - `$derived` the displayed list (shuffle vs alphabetical).
  - For each artist, render a heading + link list + 4 or all covers.
  - SVG icon overrides preserved (use the existing `partials/_ico.html` SVGs by importing them as string consts in `src/data/icons.ts` or as standalone Svelte components).
- `src/lib/covers.ts` exports `resolveArtistCovers(coverIds: string[], w, h)` that uses `import.meta.glob('/src/assets/img/covers/*.{jpg,png,webp}', { eager: true })` keyed by basename and calls `getImage()` for each.
- Drop the manual `update_cards()` `DOMContentLoaded` re-dispatch hack — was only needed for the AOS scroll animation, which we're dropping (Phase 11).

### 2. Generic tagged list (blogs and tutorials index)

- `src/pages/blogs/index.astro`:
  ```astro
  ---
  import { getCollection } from 'astro:content';
  import BaseLayout from '../../layouts/BaseLayout.astro';
  import TaggedList from '../../components/islands/TaggedList.svelte';
  import { resolveCover } from '../../lib/covers';

  const entries = (await getCollection('blogs'))
    .sort((a, b) => a.data.weight !== undefined && b.data.weight !== undefined
      ? a.data.weight - b.data.weight
      : +b.data.date - +a.data.date);

  const posts = await Promise.all(entries.map(async (entry) => ({
    name: entry.data.short_title ?? entry.data.title,
    link: `/blogs/${entry.id}/`,
    weight: entry.data.weight ?? 0,
    date: entry.data.date.toISOString(),
    tags: [...entry.data.tags].sort().map(t => t.toLowerCase()),
    description: entry.data.description ?? '',
    img: (await resolveCover(entry, 352, 198)).src,
    img_larger: (await resolveCover(entry, 704, 396)).src,
  })));
  ---
  <BaseLayout title="Blog Posts">
    <div class="content content-full">
      <div class="section-header mt-12 pb-2">
        <h1>Blog Posts</h1>
      </div>
      <TaggedList client:load {posts} />
    </div>
  </BaseLayout>
  ```
- `src/pages/tutorials/index.astro` — identical structure.
- `src/components/islands/TaggedList.svelte`:
  - State: `tagActivations: Record<string, boolean>` only (no layout switcher).
  - Renders a tag pill row + a vertical-card grid identical to the existing `_default/list.html` markup.
  - Reuses the same `tag-{tag} active-...` class convention.

### 3. Show-code toggle for tutorials

- `src/components/islands/ShowCodeToggle.svelte`:
  ```svelte
  <script lang="ts">
    let showCode = $state(true);
    $effect(() => {
      const container = document.getElementById('post-container');
      if (!container) return;
      container.classList.toggle('hide-code', !showCode);
    });
  </script>
  <ul class="grid gap-6 w-full md:grid-cols-2" style="list-style: none; padding-left: 0">
    <li>
      <input type="radio" id="show-code" bind:group={showCode} value={true} class="hidden peer" />
      <label for="show-code" class="...">
        <div class="block w-full">
          <div class="w-full text-center text-lg font-semibold">Show me everything!</div>
          <div class="w-full text-center text-sm">Oh yeah, coding time.</div>
        </div>
      </label>
    </li>
    <li>
      <input type="radio" id="hide-code" bind:group={showCode} value={false} class="hidden peer" />
      <label for="hide-code" class="...">...</label>
    </li>
  </ul>
  ```
- Used by `src/pages/tutorials/[...slug].astro` from Phase 5: `<ShowCodeToggle client:idle />`.

### 4. Mobile menu

- `src/components/islands/MobileMenu.svelte`:
  - Replaces the AlpineJS `x-data="{ expanded: false }"` block.
  - Trap clicks outside, escape key, smooth max-height transition.
- Used by `src/components/Navbar.astro` from Phase 2: `<MobileMenu client:idle items={nav} />`.

### 5. Drop AlpineJS

- Remove `alpinejs` from `package.json` dependencies.
- Search `src/` for any `x-data` / `x-show` attributes — there should be none after this phase.

## Acceptance criteria

- `/artists/` renders all artists with their cover sets, with shuffle/alphabetical/size toggles working.
- `/blogs/` and `/tutorials/` render their card grids with tag filters working.
- Tutorial pages with `hide_toggle: false` show the show-code radio toggle, which toggles a CSS class that shows/hides code blocks.
- Mobile menu works on small viewports without AlpineJS.
- No `Alpine` global referenced in built JS.

## Risks

- **Artist link icons**: the original uses inlined SVGs from `partials/_ico.html`. Bundle them as a single icons module to avoid bloat. There are ~12 icons referenced.
- **Shuffle determinism**: shuffle runs in the browser on each render. If sequence stability across renders matters for visual continuity, seed it once on mount.

## Out of scope

- Routing-level transitions when toggling show/hide code (deferred — `View Transitions API` is a future enhancement).
- The newsletter form on tutorial pages (currently absent in Hugo, intentionally).
