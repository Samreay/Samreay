<script lang="ts">
  import { drawSheetItem, drawWrap, loadProofCover } from '../../lib/book-magnets/render';
  import type { Book, Layout, Finish, InkEffect } from '../../lib/book-magnets/layout';
  import { defaultFont, prepareDefaultFont, type SpineFont } from '../../lib/book-magnets/export';

  type Props = { items: Book[]; sheet: Layout; finish: Finish; font: SpineFont; fullPage: boolean; spineOnly?: boolean };
  let { items, sheet, finish, font, fullPage, spineOnly = false }: Props = $props();
  let canvas: HTMLCanvasElement;
  let error = $state('');
  let resolved = $state<InkEffect>();
  $effect(() => {
    const books = items, layout = sheet, style = finish, type = font, page = fullPage, strip = spineOnly;
    const target = canvas;
    let cancelled = false;
    error = '';
    async function render() {
      if (type.family === defaultFont.family) await prepareDefaultFont();
      const width = page ? layout.paperW : strip ? layout.height : layout.wrap;
      const height = page ? layout.paperH : strip ? layout.spine : layout.height;
      const scale = Math.min((page ? 1800 : 960) / width, (page ? 1950 : 960) / height);
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
      let observed: InkEffect | undefined;
      for (const [i, book] of books.entries()) {
        if (cancelled) return;
        const cover = await loadProofCover(book);
        observed = cover.effect;
        if (page) drawSheetItem(ctx, i, layout, cover, book.title, type.family, style);
        else drawWrap(ctx, layout, cover, book.title, type.family, style);
      }
      if (cancelled) return;
      resolved = observed;
      target.width = buffer.width;
      target.height = buffer.height;
      target.getContext('2d')!.drawImage(buffer, 0, 0);
    }
    render().catch(e => { if (!cancelled) error = e.message; });
    return () => { cancelled = true; };
  });
</script>

{#if error}<p role="alert">{error}</p>{/if}
<canvas bind:this={canvas} style:aspect-ratio={fullPage ? sheet.paperW / sheet.paperH : spineOnly ? sheet.height / sheet.spine : sheet.wrap / sheet.height} class:page={fullPage} aria-label={fullPage ? 'Print sheet preview' : (spineOnly ? 'Spine for ' : 'Wrap for ') + items[0]?.title}></canvas>

{#if !fullPage && !spineOnly && finish.lettering === 'dynamic' && resolved}
  <small class="effect">Dynamic · {resolved}</small>
{/if}

<style>
  .effect { display:block; color:var(--color-gray-300); font-size:.8rem; margin-top:.3rem; }
  canvas { display: block; width: 100%; height: auto; box-shadow: 0 8px 18px #30231540; outline: 1px solid #ffffff45; }
  .page { width:100%; }
</style>
