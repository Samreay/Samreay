
<script lang="ts">
  import type { Post, ReviewTier } from '../../lib/types';
  import ReviewCard from '../ReviewCard.svelte';
  import { SvelteSet } from 'svelte/reactivity';

  type Layout = 'wide' | 'cover' | 'tier';
  type Props = {
    posts: Post[];
    totalReviews: number;
  };

  let { posts, totalReviews }: Props = $props();

  const TIER_DESCRIPTIONS: Record<ReviewTier, string> = {
    'π': 'I wrote this. Opinion is biased.',
    S: 'Love to pieces',
    A: 'Amazing, I follow chapter updates',
    B: 'Very nice, I read when new books drop',
    C: 'Good read but lower in TBR',
    D: "Didn't grip me",
    F: 'Dropped these',
  };

  const LINK_TAG_MAP: Record<string, string> = {
    amazon: 'amazon',
    audible: 'audio',
  };

  // Augment posts with derived tags (extra link-derived tags + 'finished').
  const augmentedPosts = $derived.by(() => {
    return posts.map((post) => {
      const extras: string[] = [];
      for (const link of post.links) {
        const t = LINK_TAG_MAP[link.name];
        if (t) extras.push(t);
      }
      const finished =
        !post.tags.includes('in-progress') && !post.tags.includes('finished')
          ? ['finished']
          : [];
      return { ...post, tags: [...post.tags, ...extras, ...finished] };
    });
  });

  const allTags = $derived(
    Array.from(new Set(augmentedPosts.flatMap((p) => p.tags))).sort()
  );

  // Initial layout default depends on screen width — guard for SSR.
  const defaultLayout: Layout =
    typeof globalThis !== 'undefined' &&
    (globalThis as { screen?: { width: number } }).screen?.width !== undefined &&
    (globalThis as { screen: { width: number } }).screen.width > 1280
      ? 'wide'
      : 'cover';

  function slugFromAbslink(abslink: string): string {
    return abslink.replace(/\/$/, '').split('/').pop() ?? abslink;
  }

  // Read URL state synchronously so we don't flash unfiltered cards on mount.
  function readInitialState(): {
    layout: Layout;
    byRank: boolean;
    activations: Record<string, boolean>;
    searchTerm: string;
    readingList: SvelteSet<string>;
    showReadingList: boolean;
  } {
    const out = {
      layout: defaultLayout,
      byRank: true,
      activations: {} as Record<string, boolean>,
      searchTerm: '',
      readingList: new SvelteSet<string>(),
      showReadingList: false,
    };
    if (typeof window === 'undefined') return out;
    const params = new URLSearchParams(window.location.search);
    if (params.has('o')) out.byRank = params.get('o') === '1';
    if (params.has('l')) out.layout = params.get('l') as Layout;
    if (params.has('include')) {
      for (const t of params.get('include')!.split('_').filter(Boolean)) {
        out.activations[t] = true;
      }
    }
    if (params.has('exclude')) {
      for (const t of params.get('exclude')!.split('_').filter(Boolean)) {
        out.activations[t] = false;
      }
    }
    if (params.has('reading-list')) {
      const slugs = params.get('reading-list')!.split('~').filter(Boolean);
      out.readingList = new SvelteSet(slugs);
      if (slugs.length > 0) out.showReadingList = true;
    } else if (typeof localStorage !== 'undefined') {
      // Fall back to localStorage if no URL param
      try {
        const stored = localStorage.getItem('reading-list');
        if (stored) {
          out.readingList = new SvelteSet(JSON.parse(stored) as string[]);
        }
      } catch {
        // ignore parse errors
      }
    }
    return out;
  }
  const initial = readInitialState();

  let layout = $state<Layout>(initial.layout);
  let byRank = $state(initial.byRank);
  let tagActivations = $state<Record<string, boolean>>({ ...initial.activations });
  let searchTerm = $state(initial.searchTerm);
  let readingList = $state<SvelteSet<string>>(initial.readingList);
  let showReadingList = $state(initial.showReadingList);

  // Sync state → URL whenever any of these change.
  $effect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (!byRank) params.set('o', '0');
    if (layout !== defaultLayout) params.set('l', layout);
    const include: string[] = [];
    const exclude: string[] = [];
    for (const [k, v] of Object.entries(tagActivations)) {
      if (v === true) include.push(k);
      else if (v === false) exclude.push(k);
    }
    if (include.length) params.set('include', include.join('_'));
    if (exclude.length) params.set('exclude', exclude.join('_'));
    const rlSlugs = Array.from(readingList);
    if (rlSlugs.length) params.set('reading-list', rlSlugs.join('~'));
    const args = params.toString();
    const newUrl = `${location.origin}${location.pathname}${args ? '?' + args : ''}`;
    history.pushState({ path: newUrl }, '', newUrl);

    // Also persist reading list to localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('reading-list', JSON.stringify(rlSlugs));
      } catch {
        // ignore storage errors
      }
    }
  });

  function toggleBookmark(slug: string) {
    if (readingList.has(slug)) {
      readingList.delete(slug);
    } else {
      readingList.add(slug);
    }
  }

  function clickTag(tag: string) {
    if (tag in tagActivations) {
      if (tagActivations[tag] === true) {
        tagActivations = { ...tagActivations, [tag]: false };
      } else {
        const next = { ...tagActivations };
        delete next[tag];
        tagActivations = next;
      }
    } else {
      tagActivations = { ...tagActivations, [tag]: true };
    }
  }

  function reset() {
    tagActivations = {};
    searchTerm = '';
    layout = defaultLayout;
    byRank = true;
    showReadingList = false;
  }

  function surpriseMe() {
    if (visiblePosts.length === 0) return;
    const post = visiblePosts[Math.floor(Math.random() * visiblePosts.length)];
    window.location.href = post.abslink;
  }

  const visiblePosts = $derived.by(() => {
    const term = searchTerm.toLowerCase();
    const words = term ? term.split(/\s+/).filter(Boolean) : [];
    return augmentedPosts
      .filter((post) => {
        // Reading list filter
        if (showReadingList && !readingList.has(slugFromAbslink(post.abslink))) {
          return false;
        }
        for (const [tag, active] of Object.entries(tagActivations)) {
          if (active === true && !post.tags.includes(tag)) return false;
          if (active === false && post.tags.includes(tag)) return false;
        }
        if (words.length) {
          for (const w of words) {
            if (!post.search_term.includes(w)) return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (layout === 'tier' || byRank) return a.weight - b.weight;
        return a.date < b.date ? 1 : -1;
      });
  });

  const groupedPosts = $derived.by(() => {
    if (layout !== 'tier') return [{ tier: null as ReviewTier | null, posts: visiblePosts }];
    const groups: { tier: ReviewTier; posts: Post[] }[] = [];
    let current: { tier: ReviewTier; posts: Post[] } | null = null;
    for (const post of visiblePosts) {
      if (!current || current.tier !== post.review) {
        current = { tier: post.review, posts: [] };
        groups.push(current);
      }
      current.posts.push(post);
    }
    return groups;
  });

  function gridClasses(l: Layout): string {
    const base =
      l === 'tier' ? 'gap-2 mt-8 ' : 'mt-20 gap-4 sm:gap-12 ';
    const cols =
      l === 'wide'
        ? 'sm:grid-cols-wide-cards grid-cols-wide-cards-mobile'
        : l === 'cover'
          ? 'grid-cols-cover-cards-mobile sm:grid-cols-cover-cards '
          : 'grid-cols-cover-cards-mobile sm:grid-cols-cover-cards-tier tier';
    return base + cols;
  }

  function activeClass(tag: string): string {
    if (Object.keys(tagActivations).length === 0) return 'active-nan';
    if (tagActivations[tag] === true) return 'active-true';
    if (tagActivations[tag] === false) return 'active-false';
    return 'active-undefined';
  }

  // Clipboard shortcuts: c, C, x, X — different summary verbosities.
  function shortSummary(post: Post): string {
    let sb = `* **${post.name}**: ([review](${post.abslink}), `;
    for (const link of post.links) sb += `[${link.name}](${link.link}), `;
    return sb.slice(0, -2) + `): ${post.description}\n`;
  }
  function longSummary(post: Post): string {
    let sb = `### **${post.name}** ｜  by *${post.author}*\n\n**Links:** [review](${post.abslink}), `;
    for (const link of post.links) sb += `[${link.name}](${link.link}), `;
    sb = sb.slice(0, -2) + '\n\n';
    sb += `**Summary:** ${post.description}\n\n`;
    sb += `**Hook:** ${post.sentence}\n\n*********\n`;
    return sb;
  }
  function superShortSummary(post: Post): string {
    let sb = `* **${post.name}**: [review](${post.abslink}), `;
    for (const link of post.links) sb += `[${link.name}](${link.link}), `;
    return sb.slice(0, -2) + '\n';
  }
  function superDuperShortSummary(post: Post): string {
    return `* [**${post.name}**](${post.abslink}) by ${post.author}\n`;
  }

  $effect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: KeyboardEvent) => {
      const fns: Record<string, (post: Post) => string> = {
        c: shortSummary,
        C: longSummary,
        x: superShortSummary,
        X: superDuperShortSummary,
      };
      const fn = fns[e.key];
      if (!fn) return;
      const content = visiblePosts.map(fn).join('');
      navigator.clipboard?.writeText(content).catch(() => {});
    };
    window.addEventListener('keypress', handler);
    return () => window.removeEventListener('keypress', handler);
  });
</script>

<div id="preamble">
  <p>
    {totalReviews} reviews with <em>my</em> rankings based on what I personally enjoy
    reading. You may have opposite tastes. The below inputs should make finding
    something easier. If you have questions, recommendations, or want to know when
    new reviews or releases are out, join the
    <a
      href="https://discord.gg/tfn4HVEaDz"
      class="font-bold"
      style="color: #7289da"
    >discord</a>.
  </p>
</div>

<div id="toggle-input" class="max-w-7xl mx-auto">
  <div class="justify-center flex flex-wrap items-center">
    {#each ['wide', 'cover', 'tier'] as opt, i (opt)}
      {@const isActive = layout === opt}
      {@const rounded = i === 0 ? 'rounded-l-md' : ''}
      <label
        for={`layout_${opt}`}
        class="inline-flex items-center py-2 rounded-md cursor-pointer text-gray-100"
      >
        <input
          id={`layout_${opt}`}
          checked={isActive}
          name="layout"
          type="radio"
          value={opt}
          class="hidden peer"
          onclick={() => (layout = opt as Layout)}
        />
        <span class="px-4 py-2 {rounded} {isActive ? 'bg-main-700' : 'bg-gray-700'}"
          >{opt === 'tier' ? 'Tier List' : opt[0].toUpperCase() + opt.slice(1)}</span
        >
      </label>
    {/each}
    <a
      href="/reviews/flowchart/"
      class="inline-flex items-center py-2 rounded-md cursor-pointer text-gray-100"
    >
      <span class="px-4 py-2 rounded-r-md bg-gray-700">Flowchart</span>
    </a>

    <label
      for="sort-order"
      class="pl-4 inline-flex items-center p-2 rounded-md cursor-pointer text-gray-100"
    >
      <input
        id="sort-order"
        type="checkbox"
        checked={byRank}
        class="hidden peer"
        onclick={(e) => (byRank = (e.currentTarget as HTMLInputElement).checked)}
      />
      <span class="px-4 py-2 rounded-l-md {byRank ? 'bg-main-700' : 'bg-gray-700'}"
        >Rank</span
      >
      <span class="px-4 py-2 rounded-r-md {byRank ? 'bg-gray-700' : 'bg-main-700'}"
        >Recent</span
      >
    </label>
    <input
      oninput={(e) => (searchTerm = (e.currentTarget as HTMLInputElement).value)}
      type="text"
      id="search-input"
      name="search"
      bind:value={searchTerm}
      class="bg-gray-800 rounded-md text-gray-100 m-2"
      placeholder="Search..."
    />
    <button
      type="button"
      class="inline-flex items-center gap-1 m-2 px-4 py-2 rounded-md cursor-pointer text-gray-100
             {showReadingList ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-gray-700 hover:bg-main-700'}"
      onclick={() => (showReadingList = !showReadingList)}
      title={showReadingList ? 'Show all reviews' : 'Show reading list only'}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 26"
        width="16"
        height="16"
        fill={showReadingList ? 'currentColor' : 'none'}
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        class="inline-block"
      >
        <path d="M5 2a2 2 0 0 0-2 2v20l9-4 9 4V4a2 2 0 0 0-2-2H5z" />
      </svg>
      Reading List{readingList.size > 0 ? ` (${readingList.size})` : ''}
    </button>
    <button
      type="button"
      class="inline-flex items-center m-2 px-4 py-2 bg-gray-700 hover:bg-main-700 rounded-md cursor-pointer text-gray-100"
      onclick={reset}>Reset</button
    >
    <button
      type="button"
      class="inline-flex items-center m-2 px-4 py-2 bg-gray-700 hover:bg-main-700 rounded-md cursor-pointer text-gray-100"
      onclick={surpriseMe}>Surprise me</button
    >
  </div>
</div>

<div id="tags" class="tag-list max-w-7xl mx-auto mt-6 mb-6">
  {#each allTags as tag (tag)}
    <button
      type="button"
      class="tag tag-{tag} {activeClass(tag)}"
      onclick={() => clickTag(tag)}
    >
      <span>{tag}</span>
    </button>
  {/each}
</div>

<div id="all-card-wrapper">
  {#each groupedPosts as group, gi (group.tier ?? gi)}
    {#if layout === 'tier' && group.tier}
      <div class="tier-list">
        <h1 class="text-center text-5xl mt-20 pb-8 rating-{group.tier}">
          {group.tier}: {TIER_DESCRIPTIONS[group.tier]}
        </h1>
      </div>
    {/if}
    <div class="container mx-auto justify-center grid {gridClasses(layout)}">
      {#each group.posts as post (post.link)}
        <ReviewCard
          {post}
          {layout}
          isBookmarked={readingList.has(slugFromAbslink(post.abslink))}
          onToggleBookmark={toggleBookmark}
        />
      {/each}
    </div>
  {/each}
</div>
