
<script lang="ts">
  /**
   * Generic tag-filtered card grid for `/blogs/` and `/tutorials/` indexes.
   * Mirrors `themes/sams-theme/layouts/_default/list.html`'s Arrow.js
   * template. Three states per tag:
   *   - undefined → tag not in filter set; card matches by default.
   *   - true      → "include" filter; card must have the tag.
   *   - false     → "exclude" filter; card must NOT have the tag.
   */
  export interface TaggedPost {
    name: string;
    link: string;
    weight: number;
    /** ISO-8601 date string. */
    date: string;
    tags: string[];
    description: string;
    img: string;
    img_larger: string;
  }

  type Props = { posts: TaggedPost[] };
  let { posts }: Props = $props();

  let tagActivations = $state<Record<string, boolean>>({});

  const allTags = $derived(
    Array.from(new Set(posts.flatMap((p) => p.tags))).sort(),
  );

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

  function activeClass(tag: string): string {
    if (Object.keys(tagActivations).length === 0) return 'active-nan';
    if (tagActivations[tag] === true) return 'active-true';
    if (tagActivations[tag] === false) return 'active-false';
    return 'active-undefined';
  }

  const visiblePosts = $derived.by(() => {
    return posts.filter((post) => {
      for (const [tag, active] of Object.entries(tagActivations)) {
        if (active === true && !post.tags.includes(tag)) return false;
        if (active === false && post.tags.includes(tag)) return false;
      }
      return true;
    });
  });
</script>

<div id="tags" class="tag-list max-w-7xl mx-auto mt-6">
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
  <div
    id="card-wrapper"
    class="container mx-auto mt-20 grid gap-12 grid-cols-vertical-cards"
  >
    {#each visiblePosts as post (post.link)}
      <article
        class="flex flex-col h-full rounded-lg bg-gray-800"
        style="max-width: 500px;"
        data-tagged-card
      >
        <a href={post.link}>
          <div class="h-full">
            <header class="mb-4">
              <figure class="relative h-0 pb-9/16 overflow-hidden rounded-t-lg">
                <picture>
                  <source
                    srcset="{post.img} 352w, {post.img_larger} 704w"
                    type="image/webp"
                  />
                  <img
                    width="352"
                    height="198"
                    class="absolute inset-0 w-full h-full object-cover transform hover:scale-105 transition duration-700 ease-out"
                    src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPMn7vLFAAFRgH97g1QygAAAABJRU5ErkJggg=="
                    alt={post.name}
                  />
                </picture>
              </figure>
            </header>
            <div class="px-4 pb-4">
              <div class="mb-3">
                <ul class="flex flex-wrap text-xs font-medium -m-1">
                  {#each post.tags as tag (tag)}
                    <li
                      class="m-1 inline-flex text-center py-1 px-3 rounded-full tag-{tag}"
                    >
                      {tag}
                    </li>
                  {/each}
                </ul>
              </div>
              <h4 class="mb-2">{post.name}</h4>
              <p class="text-lg text-gray-400 flex-grow">{post.description}</p>
            </div>
          </div>
        </a>
      </article>
    {/each}
  </div>
</div>
