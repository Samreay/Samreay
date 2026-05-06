
<script lang="ts">
  import type { Post } from '../lib/types';

  type Props = {
    post: Post;
    layout: 'wide' | 'cover' | 'tier';
  };

  let { post, layout }: Props = $props();

  const tierStyle = $derived(
    layout === 'tier' ? 'padding: 0px; border-radius: 0px;' : ''
  );
  const tierInnerStyle = $derived(
    layout === 'tier' ? 'border-radius: 0px;' : ''
  );
  const wideRoundedClass = $derived(layout === 'wide' ? 'md:rounded-l-xl' : '');
</script>

<div class="fancy_card horizontal mx-auto" data-review-card>
  <div class="card_translator">
    <a
      class="card_rotator small_rot card_layer block"
      href={post.link}
      style={tierStyle}
    >
      <div class="card_layer">
        <article class="review-summary review-{post.review}">
          <div class="bg2" style={tierStyle}>
            <div
              class="bg-inner flex flex-col md:flex-row w-full bg-gray-800"
              style={tierInnerStyle}
            >
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
                  <picture>
                    <source srcset="{post.img} 500w" type="image/webp" />
                    <img
                      loading="lazy"
                      class="block flex-none bg-cover mx-auto {wideRoundedClass}"
                      src="data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs="
                      width="250"
                      height="400"
                      alt={post.name}
                    />
                  </picture>
                {/if}
              </figure>
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
            </div>
          </div>
        </article>
      </div>
      <div class="card_layer card_effect card_overlay_{post.review}"></div>
      <div class="card_layer card_effect card_glare"></div>
    </a>
  </div>
</div>
