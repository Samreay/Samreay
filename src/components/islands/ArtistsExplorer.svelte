
<script lang="ts">
  import { iconFor } from '../../data/icons';
  import type { ResolvedArtistCover } from '../../lib/covers';

  type ArtistLink = { name: string; link: string; title: string };
  export type Artist = {
    name: string;
    id: string;
    notes?: string;
    links: ArtistLink[];
    covers: ResolvedArtistCover[];
  };

  type Props = { artists: Artist[] };
  let { artists }: Props = $props();

  // Per-artist toggles; defaults match the Hugo Arrow.js controls.
  let alphabetical = $state(false);
  let showFour = $state(true);
  let smaller = $state(true);

  // Seed the shuffle once on mount so subsequent re-renders (caused by
  // toggling other controls) keep the same order — visual continuity matters
  // for the artist grid more than per-toggle randomness.
  let shuffleSeed = $state(0);
  $effect(() => {
    if (typeof window !== 'undefined') {
      shuffleSeed = Math.floor(Math.random() * 1_000_000);
    }
  });

  // Fisher-Yates with a deterministic LCG keyed by `shuffleSeed`. The seed
  // is regenerated on mount, so each visit gets a fresh random order, but
  // toggling controls during a single visit doesn't reshuffle.
  function shuffle<T>(items: T[], seed: number): T[] {
    const out = [...items];
    let s = seed || 1;
    for (let i = out.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) % 0xffffffff;
      const j = Math.abs(s) % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const orderedArtists = $derived.by(() => {
    if (alphabetical) {
      return [...artists].sort((a, b) => a.name.localeCompare(b.name));
    }
    return shuffle(artists, shuffleSeed);
  });

  function visibleCovers(artist: Artist): ResolvedArtistCover[] {
    const ordered = alphabetical ? artist.covers : shuffle(artist.covers, shuffleSeed + artist.name.length);
    return showFour ? ordered.slice(0, 4) : ordered;
  }

  const sizeClass = $derived(smaller ? '' : '-large');
</script>

<div class="mt-4 justify-center flex flex-wrap items-center">
  <label
    for="layout-alphabetical"
    class="inline-flex items-center p-2 rounded-md cursor-pointer text-gray-100"
  >
    <input
      id="layout-alphabetical"
      type="checkbox"
      checked={alphabetical}
      class="hidden peer"
      onclick={(e) => (alphabetical = (e.currentTarget as HTMLInputElement).checked)}
    />
    <span class="px-4 py-2 rounded-l-md bg-gray-700 peer-checked:bg-main-700">Alphabetical</span>
    <span class="px-4 py-2 rounded-r-md bg-main-700 peer-checked:bg-gray-700">Shuffled</span>
  </label>

  <label
    for="layout-show-four"
    class="inline-flex items-center p-2 rounded-md cursor-pointer text-gray-100"
  >
    <input
      id="layout-show-four"
      type="checkbox"
      checked={showFour}
      class="hidden peer"
      onclick={(e) => (showFour = (e.currentTarget as HTMLInputElement).checked)}
    />
    <span class="px-4 py-2 rounded-l-md bg-gray-700 peer-checked:bg-main-700">Max 4 covers</span>
    <span class="px-4 py-2 rounded-r-md bg-main-700 peer-checked:bg-gray-700">More!</span>
  </label>

  <label
    for="layout-smaller"
    class="inline-flex items-center p-2 rounded-md cursor-pointer text-gray-100"
  >
    <input
      id="layout-smaller"
      type="checkbox"
      checked={smaller}
      class="hidden peer"
      onclick={(e) => (smaller = (e.currentTarget as HTMLInputElement).checked)}
    />
    <span class="px-4 py-2 rounded-l-md bg-gray-700 peer-checked:bg-main-700">Smaller</span>
    <span class="px-4 py-2 rounded-r-md bg-main-700 peer-checked:bg-gray-700">BIGGER!</span>
  </label>
</div>

<div id="artist-content">
  {#each orderedArtists as artist (artist.id)}
    <div data-artist={artist.id}>
      <a href={`#${artist.id}`}>
        <h2 class="text-center mt-12 mb-2" id={artist.id}>{artist.name}</h2>
      </a>
      {#if artist.notes}
        <p class="text-center italic text-grey-400">{artist.notes}</p>
      {/if}
      <div class="flex-wrap flex items-center justify-center max-w-7xl mx-auto mt-2 mb-4">
        {#each artist.links as link (link.name)}
          <a
            href={link.link}
            class="text-center inline-flex text-main-200 px-8"
          >
            <h4>
              {@html iconFor(link.name)}
              {link.title}
            </h4>
          </a>
        {/each}
      </div>
      <div
        class="container mx-auto mt-4 items-center justify-center grid gap-4 grid-cols-cover-cards-mobile{sizeClass} sm:grid-cols-cover-cards md:grid-cols-cover-cards{sizeClass}"
      >
        {#each visibleCovers(artist) as cover (cover.id)}
          <div class="fancy_card horizontal mx-auto cursor-default" data-artist-cover={cover.id}>
            <div class="card_translator cursor-default">
              <div class="card_rotator small_rot card_layer block cursor-default">
                <div class="card_layer">
                  <article class="">
                    <div class="bg2">
                      <div class="bg-inner flex flex-col md:flex-row w-full bg-gray-800">
                        <figure class="block flex-none bg-cover w-full">
                          <picture>
                            <source srcset={`${cover.src} 500w`} type="image/webp" />
                            <img
                              class="block flex-none bg-cover mx-auto"
                              src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPMn7vLFAAFRgH97g1QygAAAABJRU5ErkJggg=="
                              loading="lazy"
                              decoding="async"
                              fetchpriority="low"
                              width={cover.width}
                              height={cover.height}
                              alt={`${artist.name} cover`}
                            />
                          </picture>
                        </figure>
                      </div>
                    </div>
                  </article>
                </div>
                <div class="card_layer card_effect card_overlay_C"></div>
                <div class="card_layer card_effect card_glare"></div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>
