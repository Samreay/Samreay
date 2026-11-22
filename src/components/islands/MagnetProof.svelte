<script lang="ts">
  import SpineColourPicker from './SpineColourPicker.svelte';
  import { drawWrap, loadProofCover } from '../../lib/book-magnets/render';
  import type { Book, Layout, Finish, SpineStyle } from '../../lib/book-magnets/layout';
  import { defaultFont, prepareDefaultFont, type SpineFont } from '../../lib/book-magnets/export';

  type Props = { book: Book; sheet: Layout; finish: Finish; font: SpineFont; onstyle?: (style: SpineStyle) => void; spineOnly?: boolean };
  let { book, sheet, finish, font, onstyle, spineOnly = false }: Props = $props();
  let canvas: HTMLCanvasElement;
  let error = $state('');
  let sampledColour = $state('');
  let backgroundColour = $state('');
  let sampling = $state<'colour' | 'background'>();
  const hex = (rgb: ArrayLike<number>) => '#' + Array.from(rgb, c => c.toString(16).padStart(2, '0')).join('');
  let sampleButton: HTMLButtonElement;
  function sampleCover(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(canvas.width-1, Math.floor((e.clientX-rect.left)*canvas.width/rect.width));
    const y = Math.min(canvas.height-1, Math.floor((e.clientY-rect.top)*canvas.height/rect.height));
    if (sampling && e.detail && x >= 0 && y >= 0) {
      const pixel = canvas.getContext('2d')!.getImageData(x,y,1,1).data;
      onstyle?.({ ...book.spineStyle, [sampling]: hex(pixel.subarray(0,3)) });
    }
    sampling = undefined;
  }
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
      backgroundColour = hex(drawWrap(ctx, layout, cover, item, type.family, style));
      const lettering = item.spineStyle?.lettering ?? style.lettering;
      target.dataset.textEffect = lettering === 'dynamic' ? cover.effect : lettering;
      sampledColour = hex(cover.ink);
      target.width = buffer.width;
      target.height = buffer.height;
      target.getContext('2d')!.drawImage(buffer, 0, 0);
    }
    render().catch(e => { if (!cancelled) error = e.message; });
    return () => { cancelled = true; };
  });
</script>

{#if error}<p role="alert">{error}</p>{/if}
<svelte:window onkeydown={e => { if (e.key === 'Escape') sampling = undefined; }}
  onpointerdown={e => { if (sampling && e.target !== sampleButton) sampling = undefined; }} />
<div class="wrap">
  <canvas bind:this={canvas} style:aspect-ratio={spineOnly ? sheet.height / sheet.spine : sheet.wrap / sheet.height} aria-label={(spineOnly ? 'Spine for ' : 'Wrap for ') + book.title}></canvas>
  {#if sampling}
    <button type="button" class="sample-cover" bind:this={sampleButton} style:width={sheet.face/sheet.wrap*100+'%'}
      aria-label="Sample a pixel from the front cover" onclick={sampleCover}></button>
    <small role="status">Tap a colour on the front cover</small>
  {/if}
</div>

{#if !spineOnly}
  {#if onstyle}
    <div class="ink-controls">
      <label><span>Text style</span>
        <select aria-label={'Text style for ' + book.title} value={book.spineStyle?.lettering ?? ''}
          onchange={e => onstyle?.({ ...book.spineStyle, lettering: (e.currentTarget.value || undefined) as SpineStyle['lettering'] })}>
          <option value="">Default ({finish.lettering[0].toUpperCase() + finish.lettering.slice(1)})</option>
          <option value="dynamic">Dynamic</option><option value="flat">Flat</option>
          <option value="gradient">Gradient</option><option value="metallic">Metallic</option>
        </select>
      </label>
      <SpineColourPicker title={book.title} label="Spine text colour" colour={book.spineStyle?.colour ?? sampledColour}
        custom={!!book.spineStyle?.colour} onchange={colour => onstyle?.({ ...book.spineStyle, colour })}
        onsample={() => { sampling = 'colour'; }} />
      <SpineColourPicker title={book.title} label="Background colour" colour={book.spineStyle?.background ?? backgroundColour}
        custom={!!book.spineStyle?.background} onchange={background => onstyle?.({ ...book.spineStyle, background })}
        onsample={() => { sampling = 'background'; }} />
    </div>
  {/if}
{/if}

<style>
  .wrap { position:relative; }
  .sample-cover { position:absolute; inset:0 0 0 auto; cursor:crosshair; outline:2px dashed white; outline-offset:-3px; }
  .wrap small { position:absolute; bottom:.3rem; left:.3rem; max-width:48%; color:white; background:#151817ec; border-radius:.35rem; padding:.25rem .4rem; pointer-events:none; }
  .ink-controls { display:grid; grid-template-columns:minmax(0,1fr) repeat(2,var(--proof-button-size)); gap:.25rem .55rem; align-items:center; padding:.6rem .75rem 0; font-size:.83rem; color:var(--color-gray-300); }
  .ink-controls > label { display:contents; }
  .ink-controls > label > span { grid-column:1 / -1; }
  .ink-controls select { display:block; appearance:none; cursor:pointer; width:100%; padding:.42rem 2rem .42rem .55rem; color:var(--color-gray-100); background-color:var(--color-gray-900); border:1px solid var(--color-gray-600); border-radius:5px;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m3 6 5 5 5-5' fill='none' stroke='%23bbc8c4' stroke-width='1.8'/%3E%3C/svg%3E"); background-size:1rem; background-position:right .6rem center; background-repeat:no-repeat; }
  canvas { display:block; width:100%; height:auto; }
</style>
