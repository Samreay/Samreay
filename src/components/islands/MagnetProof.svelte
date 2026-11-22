<script lang="ts">
  import { drawWrap, loadProofCover } from '../../lib/book-magnets/render';
  import type { Book, Layout, Finish, InkEffect } from '../../lib/book-magnets/layout';
  import { defaultFont, prepareDefaultFont, type SpineFont } from '../../lib/book-magnets/export';

  type Props = { book: Book; sheet: Layout; finish: Finish; font: SpineFont; spineOnly?: boolean };
  let { book, sheet, finish, font, spineOnly = false }: Props = $props();
  let canvas: HTMLCanvasElement;
  let error = $state('');
  let resolved = $state<InkEffect>();
  $effect(() => {
    const item = book, layout = sheet, style = finish, type = font, strip = spineOnly;
    const target = canvas;
    let cancelled = false;
    error = '';
    async function render() {
      if (type.family === defaultFont.family) await prepareDefaultFont();
      const width = strip ? layout.height : layout.wrap;
      const height = strip ? layout.spine : layout.height;
      const scale = Math.min(960 / width, 960 / height);
      const buffer = document.createElement('canvas');
      buffer.width = Math.ceil(width * scale);
      buffer.height = Math.ceil(height * scale);
      const ctx = buffer.getContext('2d')!;
      ctx.scale(buffer.width / width, buffer.height / height);
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, width, height);
      if (strip) {
        ctx.translate(0, layout.spine);
        ctx.rotate(-Math.PI / 2);
        ctx.translate(-layout.face, 0);
      }
      const cover = await loadProofCover(item);
      if (cancelled) return;
      drawWrap(ctx, layout, cover, item.title, type.family, style);
      resolved = cover.effect;
      target.width = buffer.width;
      target.height = buffer.height;
      target.getContext('2d')!.drawImage(buffer, 0, 0);
    }
    render().catch(e => { if (!cancelled) error = e.message; });
    return () => { cancelled = true; };
  });
</script>

{#if error}<p role="alert">{error}</p>{/if}
<canvas bind:this={canvas} style:aspect-ratio={spineOnly ? sheet.height / sheet.spine : sheet.wrap / sheet.height} aria-label={(spineOnly ? 'Spine for ' : 'Wrap for ') + book.title}></canvas>

{#if !spineOnly}
  <div class="proof-meta">
    {#if finish.lettering === 'dynamic' && resolved}<small>Dynamic · {resolved}</small>{/if}
    {#if book.reviewId}<a href={'/reviews/' + book.reviewId + '/'}>My Review</a>{/if}
  </div>
{/if}

<style>
  .proof-meta { display:flex; align-items:baseline; color:var(--color-gray-300); font-size:.8rem; margin-top:.3rem; }
  .proof-meta small { font-size:inherit; }
  .proof-meta a { margin-left:auto; color:var(--accent); text-decoration:underline; }
  canvas { display: block; width: 100%; height: auto; box-shadow: 0 8px 18px #30231540; outline: 1px solid #ffffff45; }
</style>
