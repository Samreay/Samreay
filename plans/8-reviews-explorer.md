# Phase 8 — Reviews explorer Svelte island

**Goal:** Replace the ~470-line `themes/sams-theme/layouts/reviews/list.html` reactive page with a typed Svelte 5 island that has identical functionality and visuals, mounted from a thin Astro page.

**Estimate:** 1–2 days. This is the centerpiece of the migration.

## Skills to load before starting

- [`astro-best-practices`](../.cursor/skills/astro-best-practices/SKILL.md) — thin host page, props serialisation, hydration directive
- [`svelte-best-practices`](../.cursor/skills/svelte-best-practices/SKILL.md) — centerpiece island. Runes, `$state`/`$derived`/`$effect`, URL sync, keyboard handlers, snippets, scoped styles

## Source file being replaced

- `themes/sams-theme/layouts/reviews/list.html` (488 lines)

## What it does today

- Builds a `posts` array at template time from every `content/reviews/*` page.
- Reads URL query params (`o`, `l`, `include`, `exclude`) into reactive state on first paint.
- Provides four layout modes: `wide`, `cover`, `tier`, `flowchart`.
- Tag filter buttons toggle through three states: include / exclude / off.
- Free-text search across `name + author + search_terms`, whitespace-tokenised.
- Sort by `weight` (rank) or by `date` (recent), depending on toggle and current layout.
- `tier` layout groups posts by `review` field with a header per tier.
- `flowchart` layout shows a Figma iframe with no filters.
- URL is kept in sync with state via `pushState` and a synthetic `popstate` re-dispatch.
- Keyboard shortcuts `c`, `C`, `x`, `X` produce a markdown summary of the current visible posts and copy it to clipboard, at four different verbosities.
- `summary_generator.py` (Python script in `builder/`) shares the same data shape — keep that working.

## Tasks

### 1. Create the Astro page

`src/pages/reviews/index.astro`:

```astro
---
import { getCollection } from 'astro:content';
import { getImage } from 'astro:assets';
import BaseLayout from '../../layouts/BaseLayout.astro';
import ReviewsExplorer from '../../components/islands/ReviewsExplorer.svelte';
import { resolveCover } from '../../lib/covers';

const entries = await getCollection('reviews');
const posts = await Promise.all(entries.map(async (entry) => {
  const cover = await resolveCover(entry, 500, 800);
  return {
    name: entry.data.name,
    link: `/reviews/${entry.id}/`,
    abslink: new URL(`/reviews/${entry.id}/`, Astro.site!).toString(),
    author: entry.data.auth,
    review: entry.data.review,
    weight: entry.data.weight,
    date: entry.data.date.toISOString(),
    tags: [...entry.data.tags].sort().map(t => t.toLowerCase()),
    links: Object.entries(entry.data.links).map(([name, link]) => ({ name, link })),
    sentence: entry.data.sentence,
    description: entry.data.description,
    search_term: `${entry.data.auth} ${entry.data.name} ${entry.data.search_terms ?? ''}`.toLowerCase(),
    img: cover.src,
    video: entry.data.video,
  };
}));

const totalReviews = posts.length;
---
<BaseLayout title="Book Reviews" description="...">
  <div class="content content-full">
    <div class="section-header mt-12 pb-2">
      <h1>Book Reviews!</h1>
    </div>
    <ReviewsExplorer client:load posts={posts} totalReviews={totalReviews} />
  </div>
</BaseLayout>
```

`src/lib/covers.ts` exports the `resolveCover` helper that resolves a `CollectionEntry`'s cover via `import.meta.glob` and `getImage`, with placeholder fallback. (Same logic as `<CoverImage>` in Phase 6, factored out so it can be called from page frontmatter.)

### 2. Create the Svelte island

`src/components/islands/ReviewsExplorer.svelte`:

```svelte
<script lang="ts">
  import type { Post } from '../../lib/types';
  import ReviewCard from '../ReviewCard.svelte';
  import LayoutToggle from './LayoutToggle.svelte';
  import TagPills from './TagPills.svelte';

  let { posts, totalReviews }: { posts: Post[]; totalReviews: number } = $props();

  const allTags = $derived([
    ...new Set(posts.flatMap(p => {
      const extras = p.links
        .map(l => ({ amazon: 'amazon', audible: 'audio' } as const)[l.name as 'amazon' | 'audible'])
        .filter((x): x is string => x != null);
      const finished = !p.tags.includes('in-progress') && !p.tags.includes('finished') ? ['finished'] : [];
      return [...p.tags, ...extras, ...finished];
    })),
  ].sort());

  const defaultLayout: 'wide' | 'cover' | 'tier' | 'flowchart' =
    typeof screen !== 'undefined' && screen.width > 1280 ? 'wide' : 'cover';

  let tagActivations = $state<Record<string, boolean>>({});
  let layout = $state<'wide' | 'cover' | 'tier' | 'flowchart'>(defaultLayout);
  let byRank = $state(true);
  let searchTerm = $state('');

  // Hydrate from URL on mount
  $effect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('o')) byRank = params.get('o') === '1';
    if (params.has('l')) layout = params.get('l') as typeof layout;
    if (params.has('include')) params.get('include')!.split('_').forEach(t => tagActivations[t] = true);
    if (params.has('exclude')) params.get('exclude')!.split('_').forEach(t => tagActivations[t] = false);
  });

  // Sync state → URL
  $effect(() => {
    const params = new URLSearchParams();
    if (!byRank) params.set('o', '0');
    if (layout !== defaultLayout) params.set('l', layout);
    const include = Object.entries(tagActivations).filter(([_, v]) => v).map(([k]) => k);
    const exclude = Object.entries(tagActivations).filter(([_, v]) => v === false).map(([k]) => k);
    if (include.length) params.set('include', include.join('_'));
    if (exclude.length) params.set('exclude', exclude.join('_'));
    const args = params.toString();
    const newUrl = `${location.origin}${location.pathname}${args ? '?' + args : ''}`;
    history.pushState({ path: newUrl }, '', newUrl);
  });

  const visiblePosts = $derived(
    posts
      .filter(post => {
        for (const [tag, active] of Object.entries(tagActivations)) {
          if (active && !post.tags.includes(tag)) return false;
          if (active === false && post.tags.includes(tag)) return false;
        }
        if (searchTerm) {
          const words = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
          if (!words.every(w => post.search_term.includes(w))) return false;
        }
        return true;
      })
      .sort((a, b) =>
        layout === 'tier' || byRank
          ? a.weight - b.weight
          : a.date < b.date ? 1 : -1
      )
  );

  const groupedPosts = $derived(layout !== 'tier' ? [{ tier: null, posts: visiblePosts }] : groupByTier(visiblePosts));
  function groupByTier(list: Post[]) { /* ... */ }

  // Clipboard shortcuts
  $effect(() => {
    const handler = (e: KeyboardEvent) => {
      const fns = {
        c: shortSummary, C: longSummary,
        x: superShortSummary, X: superDuperShortSummary,
      } as const;
      const fn = fns[e.key as keyof typeof fns];
      if (!fn) return;
      const content = visiblePosts.map(fn).join('');
      navigator.clipboard.writeText(content);
    };
    window.addEventListener('keypress', handler);
    return () => window.removeEventListener('keypress', handler);
  });

  function reset() {
    tagActivations = {};
    searchTerm = '';
    layout = defaultLayout;
    byRank = true;
  }

  // Summary builders ported verbatim from Hugo template
  function shortSummary(post: Post): string { /* ... */ }
  function longSummary(post: Post): string { /* ... */ }
  function superShortSummary(post: Post): string { /* ... */ }
  function superDuperShortSummary(post: Post): string { /* ... */ }
</script>

<div id="preamble">
  {#if layout === 'flowchart'}
    <p>For questions, head to <a href="https://discord.gg/tfn4HVEaDz" class="font-bold" style="color: #7289da">discord</a>.
       Flowchart will take a few seconds to load. Click and drag to move. Recommend fullscreen via top right button.</p>
  {:else}
    <p>{totalReviews} reviews with <em>my</em> rankings ...</p>
  {/if}
</div>

<div class="max-w-7xl mx-auto">
  <LayoutToggle bind:layout bind:byRank bind:searchTerm onreset={reset} />
</div>

{#if layout !== 'flowchart'}
  <div class="tag-list max-w-7xl mx-auto mt-6 mb-6">
    <TagPills tags={allTags} bind:activations={tagActivations} />
  </div>
{/if}

{#if layout === 'flowchart'}
  <div class="flowchart">
    <iframe src="https://embed.figma.com/board/hScNoWonDzTMTrpzUhNqzR/Story-Finder?node-id=102212-639&embed-host=share&footer=false&theme=dark" allowfullscreen></iframe>
  </div>
{:else}
  {#each groupedPosts as group}
    {#if layout === 'tier' && group.tier}
      <div class="tier-list">
        <h1 class={`text-center text-5xl mt-20 pb-8 rating-${group.tier}`}>
          {group.tier}: {tierDescription(group.tier)}
        </h1>
      </div>
    {/if}
    <div class={`container mx-auto justify-center grid ${gridClasses(layout)}`}>
      {#each group.posts as post (post.link)}
        <ReviewCard {post} {layout} />
      {/each}
    </div>
  {/each}
{/if}
```

### 3. Create supporting Svelte components

- `src/components/ReviewCard.svelte` — the fancy hover card. Accepts `{ post, layout }`. Uses `<picture><source srcset={post.img}><img></picture>` (image URL pre-resolved by the Astro page) — no need for runtime image processing.
- `src/components/islands/LayoutToggle.svelte` — the four radio buttons + sort/recent toggle + search input + reset button. Mostly a port of the existing `layout_template`.
- `src/components/islands/TagPills.svelte` — buttons that cycle activation state on click. Reuses Tailwind's `tag-{tag} active-{true|false|undefined}` classes.

### 4. Type the post payload

`src/lib/types.ts`:

```ts
export interface Post {
  name: string;
  link: string;
  abslink: string;
  author: string;
  review: 'π' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  weight: number;
  date: string;
  tags: string[];
  links: { name: string; link: string }[];
  sentence: string;
  description: string;
  search_term: string;
  img: string;
  video?: string;
}
```

### 5. Tier descriptions and grid class helpers

Port the `descriptions` map and the `data.layout`-dependent grid class string from the original template into a small `gridClasses(layout)` helper inside `ReviewsExplorer.svelte`.

## Acceptance criteria

- `/reviews/` renders an identical-looking grid to the Hugo version (same tags, same cards in the same default order).
- All four layouts (`wide`, `cover`, `tier`, `flowchart`) work and look right.
- Filtering by tag works: include, exclude, and off (cycling) states all reflected visually.
- Search filters in real time across name + author + search_terms.
- The four keyboard shortcuts produce the same markdown summaries as the original (do a byte-for-byte diff of the clipboard output for a known filter set).
- URL state survives reloads and the back button.
- Reset button clears all filters and restores the default layout.
- No console errors. Lighthouse performance is the same or better than Hugo.

## Risks

- **Hydration**: `client:load` ensures full hydration before the user can interact. Acceptable for a small page, but we could downgrade to `client:idle` if performance suffers. The URL-state hydration must happen before user interaction so `client:load` is safest.
- **Image URL stability**: `getImage` URLs are content-hashed. After every build, image URLs change, but they're embedded in the JSON payload to the Svelte island — fine.
- **Initial render flash**: the Svelte component renders the unfiltered list first, then applies URL filters in `$effect`. To avoid flash, do the URL-state read synchronously inside the component initializer (not in an effect). Adjust the example above accordingly.
- **`screen.width` access at build time**: guard with `typeof screen !== 'undefined'`. Server-side render uses a default and the client effect overrides it on mount.

## Out of scope

- Server-rendering the filtered post list (the URL state isn't known until client). We accept the unfiltered render flash; addressed by initializing state synchronously from `window.location.search`.
- Sharing the post payload with `summary_generator.py` (Python). That script can keep reading `content/reviews/*/index.md` directly.
- Changing the Figma flowchart embed URL.
