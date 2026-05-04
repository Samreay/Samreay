<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import type { BookFlowNode } from '../../../lib/flowchart-layout';

  // No scoped <style>: the markup needs to compose with the global
  // `fancy_card` rules in `src/styles/fancy.scss`. Svelte's hashed scoping
  // would otherwise break `.review-S`, `.card_overlay_S`, `.tag-<name>`, etc.
  let { data }: NodeProps<BookFlowNode> = $props();
</script>

<Handle type="target" position={Position.Top} />

<div class="book-node fancy_card horizontal mx-auto" data-review-card>
  <div class="card_translator">
    <a
      class="card_rotator small_rot card_layer block"
      href={data.link}
      aria-label={data.title}
    >
      <div class="card_layer">
        <article class="review-summary review-{data.tier}">
          <div class="bg2">
            <div class="bg-inner flex flex-row w-full bg-gray-800">
              <figure class="block flex-none bg-cover">
                <img
                  loading="eager"
                  class="block flex-none bg-cover mx-auto md:rounded-l-xl"
                  src={data.cover.src}
                  width={data.cover.width}
                  height={data.cover.height}
                  alt={data.title}
                />
              </figure>
              <div class="flex flex-col justify-between p-4 text-center side-card-content">
                <div class="rating">
                  <p class="small rating-{data.tier}">
                    <span class="leader">{data.title}</span>
                  </p>
                </div>
                <p class="text-lg text-gray-400 px-3">{data.sentence}</p>
                <div>
                  <ul class="flex flex-wrap text-xs font-medium -m-1 justify-center">
                    {#each data.tags as tag (tag)}
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
        </article>
      </div>
      <div class={`card_layer card_effect card_overlay_${data.tier}`}></div>
      <div class="card_layer card_effect card_glare"></div>
    </a>
  </div>
</div>

<Handle type="source" position={Position.Bottom} />
