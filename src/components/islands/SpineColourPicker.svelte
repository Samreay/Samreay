<script lang="ts">
  let { title, label, colour, custom, onchange, onsample }: {
    title: string; label: string; colour: string; custom: boolean;
    onchange: (hex?: string) => void; onsample: () => void;
  } = $props();

  let open = $state(false);
  let draft = $state('');
  let hue = $state(0), saturation = $state(0), brightness = $state(0);
  let root: HTMLDivElement, trigger: HTMLButtonElement;

  function placePopup(panel: HTMLDivElement) {
    const proof = trigger.closest('figure')!;
    panel.showPopover();
    function position() {
      const gap = 8;
      const card = proof.getBoundingClientRect();
      const swatch = trigger.getBoundingClientRect();
      const { width, height } = panel.getBoundingClientRect();
      const rightLimit = document.documentElement.clientWidth - width - gap;
      const right = card.right + gap;
      const left = right <= rightLimit ? right : card.left - width - gap;
      panel.style.left = Math.max(gap, Math.min(left, rightLimit)) + 'px';
      panel.style.top = Math.max(gap, Math.min(swatch.top + (swatch.height - height) / 2, window.innerHeight - height - gap)) + 'px';
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    observer.observe(proof);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return { destroy() {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    } };
  }

  function readHex(hex: string) {
    const [r,g,b] = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255);
    const max = Math.max(r,g,b), delta = max - Math.min(r,g,b);
    if (delta) hue = ((max === r ? (g-b)/delta : max === g ? (b-r)/delta+2 : (r-g)/delta+4)*60+360)%360;
    saturation = max ? delta/max : 0;
    brightness = max;
  }

  function applyPalette() {
    const channel = (offset: number) => {
      const k = (offset + hue/60) % 6;
      const value = brightness * (1 - saturation * Math.max(0, Math.min(k, 4-k, 1)));
      return Math.round(255*value).toString(16).padStart(2,'0');
    };
    draft = '#' + channel(5) + channel(3) + channel(1);
    onchange(draft);
  }

  function pickPoint(e: PointerEvent) {
    const pad = e.currentTarget as HTMLElement;
    if (e.type === 'pointerdown') pad.setPointerCapture(e.pointerId);
    else if (!pad.hasPointerCapture(e.pointerId)) return;
    const rect = pad.getBoundingClientRect();
    saturation = Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
    brightness = 1-Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height));
    applyPalette();
  }

  function editHex(value: string) {
    draft = value;
    if (/^#?[0-9a-f]{6}$/i.test(value)) {
      const hex = '#' + value.replace('#','').toLowerCase();
      readHex(hex);
      onchange(hex);
    }
  }

  function close() { open = false; trigger.focus(); }
</script>

<svelte:window onpointerdown={e => { if (open && !root.contains(e.target as Node)) open = false; }}
  onkeydown={e => { if (open && e.key === 'Escape') close(); }} />
<div class="picker" bind:this={root} onfocusout={e => { if (e.relatedTarget && !root.contains(e.relatedTarget as Node)) open = false; }}>
  <button type="button" class="swatch" bind:this={trigger} aria-expanded={open}
    aria-label={label + ' for ' + title} title={label}
    style:background-color={colour || 'transparent'} disabled={!colour}
    onclick={() => { open = !open; if (open) { draft = colour; readHex(colour); } }}></button>
  {#if open}
    <div class="popup" popover="manual" use:placePopup role="group" aria-label={label}>
      <div class="spectrum" aria-hidden="true" style:--hue={hue}
        onpointerdown={pickPoint} onpointermove={pickPoint}>
        <i style:left={saturation*100+'%'} style:top={(1-brightness)*100+'%'}></i>
      </div>
      <input class="hue custom-range" aria-label="Hue" type="range" min="0" max="360" value={hue}
        oninput={e => { hue = e.currentTarget.valueAsNumber; applyPalette(); }} />
      <label>Hex <input class="hex" value={draft} maxlength="7" spellcheck="false" autocomplete="off"
        aria-invalid={!/^#?[0-9a-f]{6}$/i.test(draft)} oninput={e => editHex(e.currentTarget.value)} /></label>
      <button class="sample" type="button" onclick={() => { close(); onsample(); }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m14 5 5 5M6 18l-3 3 1-5L15 5l4 4L8 20zM16 5l2-2a2 2 0 0 1 3 3l-2 2"/></svg>
        Pick from cover
      </button>
      {#if custom}<button class="reset" type="button" onclick={() => { onchange(); close(); }}>Use cover colour</button>{/if}
    </div>
  {/if}
</div>

<style>
  .picker { position:relative; place-self:center; }
  button { cursor:pointer; }
  .swatch { display:block; width:2.05rem; height:2.05rem; border:2px solid #dadada; border-radius:50%; box-shadow:0 0 0 1px #111; }
  .popup { position:fixed; inset:auto; margin:0; max-height:calc(100dvh - 16px); overflow:auto; width:13rem; max-width:75vw; border-radius:.85rem; padding:.8rem; background:#242827; color:#f2f4f3; border:1px solid #59605e; box-shadow:0 .5rem 1.6rem #0008; display:grid; gap:.65rem; color-scheme:dark; }
  .spectrum { position:relative; height:6.5rem; border-radius:.5rem; overflow:hidden; touch-action:none; cursor:crosshair; background:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(var(--hue) 100% 50%)); }
  .spectrum i { position:absolute; width:.65rem; height:.65rem; transform:translate(-50%,-50%); border:2px solid white; border-radius:50%; box-shadow:0 0 0 1px #111; pointer-events:none; }
  input.hue { appearance:none; width:100%; height:.85rem; margin:0; border-radius:1rem; background:linear-gradient(to right,red,#ff0,lime,cyan,blue,magenta,red); cursor:pointer; }
  .hue::-webkit-slider-thumb { appearance:none; width:.9rem; height:.9rem; border:2px solid #fff; background:#222; border-radius:50%; }
  .hue::-moz-range-thumb { width:.7rem; height:.7rem; border:2px solid #fff; background:#222; border-radius:50%; }
  label,.sample { display:flex; align-items:center; gap:.55rem; }
  .hex,.sample { border-radius:.45rem; border:1px solid #59605e; padding:.4rem .55rem; }
  .hex { width:0; flex:1; background:#151817; color:white; font-family:monospace; }
  .hex[aria-invalid=true] { border-color:#ef9483; }
  .sample { justify-content:center; background:#373d3b; }
  .sample svg { width:1rem; height:1rem; }
  .reset { color:var(--accent); text-decoration:underline; }
</style>
