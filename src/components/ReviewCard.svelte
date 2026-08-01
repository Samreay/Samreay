
<script lang="ts">
  import type { Post } from '../lib/types';

  type Props = {
    post: Post;
    layout: 'wide' | 'cover' | 'tier';
    isBookmarked?: boolean;
    onToggleBookmark?: (slug: string) => void;
  };

  let { post, layout, isBookmarked = false, onToggleBookmark }: Props = $props();

  // Svelte intentionally skips writing `src`/`srcset` during hydration so it
  // doesn't re-download images the SSR HTML already loaded. But the reviews
  // page is statically built in Rank order while the island can hydrate in
  // Recent order (?o=0), so each reused DOM node keeps the SSR cover (wrong
  // book) even though its title/alt correctly update. A reactive `src={post.img}`
  // can't fix that — it's the very attribute hydration ignores. So once mounted
  // (no longer hydrating) we set the correct cover on the real DOM node. In the
  // matched-order case the attribute already equals post.img, so this is a no-op.
  let imgEl: HTMLImageElement | undefined = $state();
  $effect(() => {
    if (imgEl && imgEl.getAttribute('src') !== post.img) {
      imgEl.setAttribute('src', post.img);
    }
  });

  const wideRoundedClass = $derived(layout === 'wide' ? 'md:rounded-l-xl' : '');

  // Tint the tier caption with the cover's own colour: sample the bottom
  // quarter of the image on a tiny canvas, average the hues of its dark
  // pixels, then rebuild the colour at fixed saturation/lightness so every
  // caption keeps uniform brightness. Empty string = neutral CSS fallback
  // (videos, all-bright/grayscale bottoms, tainted canvas).
  let captionColor = $state('');

  function captionColorFor(img: HTMLImageElement): string {
    try {
      const w = 32;
      const h = 16;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return '';
      const quarter = img.naturalHeight / 4;
      ctx.drawImage(img, 0, img.naturalHeight - quarter, img.naturalWidth, quarter, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let x = 0;
      let y = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if ((max + min) / 2 > 0.5) continue; // skip pixels above 50% lightness
        const chroma = max - min;
        if (chroma < 0.05) continue; // near-gray pixels carry no real hue
        let hue: number;
        if (max === r) hue = ((g - b) / chroma + 6) % 6;
        else if (max === g) hue = (b - r) / chroma + 2;
        else hue = (r - g) / chroma + 4;
        // Chroma-weighted circular mean, so hue 359° + 1° averages to 0°
        // rather than 180°, and strongly-coloured pixels dominate.
        const rad = (hue * 60 * Math.PI) / 180;
        x += Math.cos(rad) * chroma;
        y += Math.sin(rad) * chroma;
      }
      if (x === 0 && y === 0) return '';
      const mean = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
      return `hsl(${mean} 35% 10%)`;
    } catch {
      return '';
    }
  }

  $effect(() => {
    if (layout !== 'tier' || !imgEl) return;
    void post.img; // re-run when the cover target changes (hydration swap)
    const img = imgEl;
    const run = () => (captionColor = captionColorFor(img));
    if (img.complete && img.naturalWidth > 0) run();
    // Keep listening (not once): the effect above may swap `src` after an
    // order-mismatched hydration, and the new cover's load must recompute.
    img.addEventListener('load', run);
    return () => img.removeEventListener('load', run);
  });

  const bookmarkActiveColor = $derived(
    post.review === 'S' ? 'text-S-400' :
    post.review === 'A' ? 'text-A-400' :
    post.review === 'B' ? 'text-B-300' :
    post.review === 'C' ? 'text-C-400' :
    post.review === 'D' ? 'text-D-400' :
    post.review === 'F' ? 'text-F-400' :
    'text-purple-400'
  );
  const bookmarkHoverClass = $derived(
    post.review === 'S' ? 'hover:text-S-400' :
    post.review === 'A' ? 'hover:text-A-400' :
    post.review === 'B' ? 'hover:text-B-300' :
    post.review === 'C' ? 'hover:text-C-400' :
    post.review === 'D' ? 'hover:text-D-400' :
    post.review === 'F' ? 'hover:text-F-400' :
    'hover:text-purple-400'
  );

  function slugFromAbslink(abslink: string): string {
    // e.g. "/reviews/soul_relic/" → "soul_relic"
    return abslink.replace(/\/$/, '').split('/').pop() ?? abslink;
  }

  function toggleBookmark(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleBookmark) {
      onToggleBookmark(slugFromAbslink(post.abslink));
    }
  }
</script>

<div class="fancy_card horizontal mx-auto relative" data-review-card>
  <div class="card_translator relative">
    <a
      class="card_rotator small_rot card_layer block"
      href={post.link}
    >
      <div class="card_layer">
        <article class="review-summary review-{post.review}">
          <div class="bg2">
            <div class="bg-inner flex flex-col md:flex-row w-full bg-gray-800">
            {#if onToggleBookmark}
                <button
                    type="button"
                    aria-label={isBookmarked ? 'Remove from reading list' : 'Add to reading list'}
                    title={isBookmarked ? 'Remove from reading list' : 'Add to reading list'}
                    class="bookmark-btn absolute top-2 right-2 z-50 p-1 rounded-full transition-all
                        {isBookmarked
                            ? `${bookmarkActiveColor} opacity-100`
                            : `text-gray-400 opacity-20 ${bookmarkHoverClass} hover:opacity-100`}"
                    onclick={toggleBookmark}
                >
                    <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 26"
                    width="20"
                    height="20"
                    fill={isBookmarked ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    >
                    <path d="M5 2a2 2 0 0 0-2 2v20l9-4 9 4V4a2 2 0 0 0-2-2H5z" />
                    </svg>
                </button>
                {/if}
              <figure
                class="block flex-none bg-cover {layout === 'wide' ? '' : 'w-full'}"
              >
                {#if post.video}
                  <video
                    class="block h-full w-full flex-none bg-cover mx-auto sm:ml-0 {wideRoundedClass}"
                    preload="auto"
                    playsinline
                    plays-inline
                    autoplay
                    loop
                    muted
                  >
                    <source src={post.video} type="video/mp4" />
                  </video>
                {:else}
                  <!-- Bind the real cover to `src` directly. The reviews page
                       is statically built in Rank order, but the island can
                       hydrate in Recent order (?o=0). A constant placeholder
                       src + `<source srcset>` left covers stuck in SSR order on
                       a mismatched hydration, since mutating a parsed picture's
                       source doesn't reload the img. A reactive `src` does. -->
                  <img
                    bind:this={imgEl}
                    loading="lazy"
                    class="block flex-none bg-cover mx-auto {wideRoundedClass}"
                    src={post.img}
                    width="250"
                    height="400"
                    alt={post.name}
                  />
                {/if}
              </figure>
              {#if layout === 'tier'}
                <!-- Caption strip below the cover (styled by .tier-grid in
                     fancy.css). Inner span carries the 2-line clamp so the
                     outer flex box can vertically center 1-line titles. -->
                <p class="tier-title" style:background-color={captionColor}>
                  <span>{post.name}</span>
                </p>
              {/if}
              <!-- Only the wide layout shows the text panel; cover/tier
                   previously hid it with CSS but rendered it for every card,
                   which is real HTML weight across ~160 reviews. -->
              {#if layout === 'wide'}
                <div class="flex flex-col justify-between p-4 text-center side-card-content">
                  <div class="rating">
                    <p class="small rating-{post.review}">
                      <span class="leader">{post.name}</span>
                    </p>
                  </div>
                  <p class="text-lg text-gray-400 px-3">{post.sentence}</p>
                  <div>
                    <div class="mb-3">
                      <ul class="flex flex-wrap text-xs font-medium -m-1 justify-center">
                        {#each post.tags as tag (tag)}
                          <li
                            class="m-1 inline-flex text-center py-1 px-3 rounded-full tag-{tag}"
                          >
                            {tag}
                          </li>
                        {/each}
                      </ul>
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </article>
      </div>
      <div class="card_layer card_effect card_overlay_{post.review}"></div>
      <div class="card_layer card_effect card_glare"></div>
    </a>
  </div>
</div>

<style>
  /* The parent .fancy_card rule applies transform-style: preserve-3d to ALL
     descendants, which causes 3D-rotated overlay layers inside card_rotator
     to occlude the bookmark button during hover.  Opting the button out of
     the 3D rendering context keeps it always on top. */
  .bookmark-btn {
    transform-style: flat;
  }
</style>
