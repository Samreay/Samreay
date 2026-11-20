<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { defaultSettings, restoreSettings, saveSettings, settingsKey } from '../../lib/book-magnets/preferences';
  import SpineFontPicker from './SpineFontPicker.svelte';
  import MagnetProof from './MagnetProof.svelte';
  import { availableDpi, backgroundControls, layout, papers, fillets, type Book } from '../../lib/book-magnets/layout';
  import { defaultFont, exportSheets, type SpineFont } from '../../lib/book-magnets/export';

  let { books }: { books: Book[] } = $props();
  const defaults = untrack(() => defaultSettings(books));
  let prefs = $state(defaults);
  let ready = $state(false), storageNotice = $state('');
  let search = $state(''), comparing = $state(false);
  const filletStyles = Object.keys(fillets) as (keyof typeof fillets)[];
  let finish = $derived({
    binding: prefs.binding, texture: prefs.texture, transform: prefs.transform, lettering: prefs.lettering,
    saturation: prefs.saturation, darkness: prefs.darkness,
  });

  onMount(() => {
    const restore = () => { prefs = restoreSettings(defaults, books); };
    restore();
    ready = true;
    const sync = (event: StorageEvent) => { if (event.key === settingsKey || event.key === null) restore(); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  });
  $effect(() => {
    if (!ready) return;
    try { saveSettings(prefs, defaults, books); storageNotice = ''; }
    catch { storageNotice = 'Browser storage is unavailable. These settings apply to this visit.'; }
  });
  let font = $state.raw<SpineFont>(defaultFont);
  let fontLoading = $state(false), busy = $state(false);
  let message = $state(''), failure = $state('');
  let pageIndex = $state(0);
  let byId = $derived(new Map(books.map(book => [book.id, book])));
  let filtered = $derived(books.filter(b => (b.title + ' ' + b.author).toLowerCase().includes(search.trim().toLowerCase())));
  let selected = $derived(prefs.ids.flatMap(id => {
    const b = byId.get(id);
    return b ? [{ ...b, title: prefs.titles[id]?.trim() || b.title }] : [];
  }));
  let dims = $derived(prefs.paper === 'Custom' ? [prefs.paperW, prefs.paperH] : papers[prefs.paper]);
  let sheet = $derived(layout(dims[0], dims[1], prefs.height, prefs.ratio, prefs.spine, prefs.dpi));
  let pages = $derived(sheet.error ? 0 : Math.ceil(selected.length / sheet.capacity));
  let page = $derived(Math.min(pageIndex, Math.max(0, pages - 1)));
  let pageBooks = $derived(selected.slice(page * sheet.capacity, (page + 1) * sheet.capacity));
  let lowRes = $derived(selected.filter(b => availableDpi(b, sheet) < prefs.dpi));

  function toggle(id: string) {
    if (prefs.ids.includes(id)) prefs.ids = prefs.ids.filter(item => item !== id);
    else prefs.ids = [...prefs.ids, id];
    message = failure = '';
  }
  async function download() {
    if (busy || fontLoading || sheet.error || !selected.length) return;
    busy = true;
    failure = message = '';
    try {
      const blob = await exportSheets(selected, sheet, font, finish, text => message = text);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'book-magnets.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      message = 'Print sheets downloaded.';
    } catch (error) {
      failure = error instanceof Error ? error.message : 'Could not export the sheets.';
      message = '';
    } finally { busy = false; }
  }
</script>

<div class="workshop">
  <section class="panel catalogue">
    <div class="bar"><h2>Cover library</h2><span>{books.length} books</span></div>
    <input type="search" aria-label="Search covers" placeholder="Search by title or author" bind:value={search} />
    <div class="library">
      {#each filtered as book (book.id)}
        <button class="book" aria-pressed={prefs.ids.includes(book.id)} onclick={() => toggle(book.id)}>
          <img src={book.thumb} alt="" width="32" height="48" loading="lazy" />
          <span class="bookname"><strong>{book.title}</strong><small>{book.author}</small></span>
          <span class="tick" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d={prefs.ids.includes(book.id) ? 'M3 8l3.2 3.2L13 4.8' : 'M8 3v10M3 8h10'} /></svg></span>
        </button>
      {:else}<p class="muted">No matching books.</p>{/each}
    </div>
    <div class="bar foot"><strong>{selected.length} selected</strong><button class="textbtn" disabled={!selected.length} onclick={() => { prefs.ids = []; message = failure = ''; }}>Clear selection</button></div>
  </section>

    <section class="panel settings">
      <h2>Print settings</h2>
      <fieldset><legend>Physical</legend>
        <div class="fields">
          <label>Book height (mm)<input type="number" min="5" step="any" bind:value={prefs.height} /></label>
          <label>Height / width<input type="number" min="0.1" step="any" bind:value={prefs.ratio} /></label>
          <label>Spine (mm)<input type="number" min="1" step="any" bind:value={prefs.spine} /></label>
          <label>Paper<select aria-label="Paper" bind:value={prefs.paper}>{#each Object.keys(papers) as name (name)}<option>{name}</option>{/each}<option>Custom</option></select></label>
          <label>Resolution (DPI)<input type="number" min="72" step="1" bind:value={prefs.dpi} /></label>
          {#if prefs.paper === 'Custom'}
            <label>Paper width (mm)<input type="number" step="any" bind:value={prefs.paperW} /></label>
            <label>Paper height (mm)<input type="number" step="any" bind:value={prefs.paperH} /></label>
          {/if}
        </div>
      </fieldset>
      <fieldset><legend>Visual</legend>
        <div class="fields">
          <SpineFontPicker bind:font bind:loading={fontLoading} disabled={busy} />
          <label>Text transform<select aria-label="Text transform" bind:value={prefs.transform}>
            <option value="title">Title</option><option value="uppercase">Uppercase</option><option value="small-caps">Small caps</option>
          </select></label>
          <label>Spine text effect<select aria-label="Spine text effect" bind:value={prefs.lettering}>
            <option value="flat">Flat</option><option value="gradient">Gradient</option><option value="metallic">Metallic</option><option value="dynamic">Dynamic</option>
          </select></label>
          <label>Texture<select aria-label="Texture" bind:value={prefs.texture}>
            <option value="leather">Leather</option><option value="gradient">Gradient</option><option value="none">None</option>
          </select></label>
          <label>Binding<select aria-label="Binding" bind:value={prefs.binding}><option value="none">None</option>{#each filletStyles as style (style)}<option value={style}>{fillets[style]}</option>{/each}</select></label>
        </div>
        <div class="fields background-controls">
          {#each backgroundControls as control (control.key)}
            <label>{control.label} <span class="percentage" aria-hidden="true">{prefs[control.key]}%</span>
              <input class="custom-range" type="range" min="0" max={control.max} aria-valuetext={prefs[control.key] + '%'}
                style:--fill={100 * prefs[control.key] / control.max + '%'} bind:value={prefs[control.key]} />
            </label>
          {/each}
        </div>
        {#if selected.length && !sheet.error}
          <details bind:open={comparing}>
            <summary>Compare five spine fillets</summary>
            {#if comparing}
              <div class="samples">
                {#each filletStyles as style (style)}
                  <button aria-pressed={prefs.binding === style} onclick={() => prefs.binding = style}>
                    <MagnetProof items={[selected[0]]} {sheet} finish={{ ...finish, binding: style }} {font} fullPage={false} spineOnly />
                    <span>{fillets[style]}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </details>
        {/if}
      </fieldset>
      {#if lowRes.length && !sheet.error}
        <p class="warning" role="status">Below {prefs.dpi} DPI at this size: {lowRes.map(b => b.title + ' (' + Math.floor(availableDpi(b, sheet)) + ' DPI)').join(', ')}.</p>
      {/if}
      <div class="export">
        <button class="download" disabled={!selected.length || !!sheet.error || busy || fontLoading} onclick={download}>{busy ? 'Preparing sheets…' : 'Download print sheets'}</button>
        {#if pages}<span>{pages} {pages === 1 ? 'sheet' : 'sheets'} · {sheet.capacity} wraps per sheet</span>{/if}
      </div>
      <p class="caption">ZIP with PNG sheets{font.file || font.family === defaultFont.family ? ' and the spine font' : ' rendered with ' + font.name}.{#if !font.file && font.family !== defaultFont.family} To include the font file, share installed fonts or open its file in the spine font menu.{/if} Print at 100%. The outer marks are cuts and the inner marks are folds. Wraps have 5 mm gaps and an 8 mm page margin.</p>
      {#if message}<p role="status">{message}</p>{/if}
      {#if storageNotice}<p role="status">{storageNotice}</p>{/if}
      {#if failure}<p class="warning" role="alert">{failure}</p>{/if}
    </section>
    <section class="panel proof">
      <div class="bar"><h2>Print proof</h2>
        <div class="switch">
          <button aria-pressed={!prefs.fullPage} onclick={() => prefs.fullPage = false}>Wraps</button>
          <button aria-pressed={prefs.fullPage} onclick={() => prefs.fullPage = true}>Sheet</button>
        </div>
      </div>
      <div class="mat">
        {#if sheet.error}<p>{sheet.error}</p>
        {:else if !selected.length}<p>Select a cover to see its wrap.</p>
        {:else if prefs.fullPage}<MagnetProof items={pageBooks} {sheet} {finish} {font} fullPage />
        {:else}
          <div class="gallery">
            {#each selected as book (book.id)}
              <figure>
                <MagnetProof items={[book]} {sheet} {finish} {font} fullPage={false} />
                <figcaption>
                  <label>Spine title<input aria-label={'Spine title for ' + byId.get(book.id)?.title} value={prefs.titles[book.id] ?? book.title} oninput={e => prefs.titles[book.id] = e.currentTarget.value} /></label>
                </figcaption>
              </figure>
            {/each}
          </div>
        {/if}
      </div>
      {#if selected.length && !sheet.error}
        {#if prefs.fullPage}
          <div class="bar"><span>Sheet {page + 1} of {pages} · {sheet.widthPx} × {sheet.heightPx} px</span>
            <div><button class="textbtn" disabled={page === 0} onclick={() => pageIndex = page - 1}>Previous</button>
            <button class="textbtn" disabled={page + 1 >= pages} onclick={() => pageIndex = page + 1}>Next</button></div>
          </div>
        {:else}
          <p class="caption">{selected.length} enlarged {selected.length === 1 ? 'wrap' : 'wraps'} · {sheet.wrap.toFixed(2)} × {prefs.height} mm each</p>
        {/if}
      {/if}
    </section>


</div>

<style>
  .workshop { --border:var(--color-gray-700); --muted:var(--color-gray-400); --accent:var(--color-main-400);
    display:grid; grid-template-columns:clamp(16rem,22vw,22rem) minmax(0,1fr); grid-template-areas:"library settings" "library proof";
    grid-template-rows:auto 1fr; min-height:calc(100svh - 13rem); gap:1rem; padding-bottom:1rem; }
  .panel { background:var(--color-gray-800); border:1px solid var(--border); border-radius:10px; min-width:0; }
  .catalogue { grid-area:library; display:flex; flex-direction:column; overflow:hidden; }
  .settings { grid-area:settings; padding:1rem 1.15rem; }
  .proof { grid-area:proof; align-self:start; overflow:hidden; }
  h2 { margin:0; color:var(--color-gray-100); font:600 1.25rem/1.4 Inter,sans-serif; }
  .bar,.export { display:flex; align-items:center; justify-content:space-between; gap:.75rem; flex-wrap:wrap; }
  .bar { padding:1rem 1.15rem; }
  .bar > span,.caption,.muted,.export > span,small { color:var(--muted); font-size:.83rem; }
  .caption { margin:.65rem 0 0; line-height:1.5; }
  input:not([type=range]),select { display:block; width:100%; min-width:0; border:1px solid var(--color-gray-600); border-radius:5px; background-color:var(--color-gray-900); color:var(--color-gray-100); font:inherit; font-size:.92rem; padding:.45rem .55rem; }
  select { padding-right:1.65rem; }
  input[type=search] { width:calc(100% - 2.3rem); margin:0 1.15rem .8rem; }
  .library { flex:1; min-height:12rem; contain:size; overflow:auto; scrollbar-color:var(--color-gray-600) transparent; }
  .library .muted { padding:1rem; }
  .book { display:flex; align-items:center; text-align:left; gap:.8rem; width:100%; padding:.55rem 1.15rem; border-top:1px solid var(--border); }
  button { cursor:pointer; }
  button:hover:not(:disabled) { filter:brightness(1.12); }
  .book:hover,.book[aria-pressed=true] { background:var(--color-gray-700); }
  .book img { width:32px; height:48px; object-fit:cover; border-radius:2px; }
  .bookname { flex:1; min-width:0; }
  .bookname strong,.bookname small { display:block; line-height:1.3; }
  .bookname strong { font-size:.92rem; }
  .tick { flex:none; display:grid; place-items:center; width:22px; height:22px; border:1px solid var(--color-gray-500); border-radius:50%; }
  .tick svg { display:block; width:14px; height:14px; }
  .book[aria-pressed=true] .tick,.switch [aria-pressed=true],.download { background:var(--accent); color:var(--color-gray-950); border-color:var(--accent); }
  .foot { border-top:1px solid var(--border); font-size:.87rem; }
  .textbtn { color:var(--accent); font-size:.83rem; text-decoration:underline; text-underline-offset:3px; padding:.25rem; }
  button:disabled { opacity:.45; cursor:default; }
  .switch { display:flex; border:1px solid var(--color-gray-600); border-radius:6px; overflow:hidden; }
  .switch button { padding:.25rem .75rem; font-size:.84rem; }
  .mat { padding:1.15rem; min-height:10rem; background:var(--color-gray-900); }
  .gallery { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,22.5rem),1fr)); gap:1.5rem; }
  .gallery figure { min-width:0; margin:0; }
  .gallery figcaption { margin-top:.5rem; }
  fieldset { min-width:0; margin-top:1rem; border-top:1px solid var(--border); }
  legend { padding-right:.65rem; font-weight:600; font-size:.94rem; color:var(--color-gray-100); }
  details { margin:.8rem 0; }
  summary { cursor:pointer; color:var(--accent); font-size:.9rem; }
  .samples { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr)); gap:.7rem; margin:.75rem 0; }
  .samples button { padding:.5rem; background:var(--color-gray-900); border:1px solid var(--border); border-radius:5px; text-align:left; }
  .samples button[aria-pressed=true] { border-color:var(--accent); }
  .samples span { display:block; margin-top:.4rem; font-size:.83rem; }
  .fields { display:grid; gap:.8rem; margin:.9rem 0; grid-template-columns:repeat(auto-fit,minmax(min(100%,10.5rem),1fr)); }
  .background-controls { max-width:36rem; }
  .background-controls label { display:grid; grid-template-columns:1fr auto; column-gap:.5rem; align-items:baseline; }
  .percentage { font-variant-numeric:tabular-nums; }
  .custom-range {
    --track:linear-gradient(to right,var(--accent) var(--fill),var(--color-gray-500) var(--fill));
    grid-column:1 / -1; width:100%; min-width:0; height:1.75rem; margin:0;
    appearance:none; background:transparent; cursor:pointer;
  }
  .custom-range::-webkit-slider-runnable-track { height:6px; border-radius:3px; background:var(--track); }
  .custom-range::-moz-range-track { height:6px; border-radius:3px; background:var(--track); }
  .custom-range::-webkit-slider-thumb { appearance:none; margin-top:-5px; width:16px; height:16px; border:0; border-radius:50%; background:var(--accent); }
  .custom-range::-moz-range-thumb { width:16px; height:16px; border:0; border-radius:50%; background:var(--accent); }
  .custom-range:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:4px; }
  .proof > .caption { padding:.3rem 1.15rem .8rem; }
  label { display:block; color:var(--color-gray-300); font-size:.83rem; min-width:0; }
  label input,label select { margin-top:.25rem; }
  .export { justify-content:flex-start; margin-top:1rem; }
  .download { padding:.65rem 1rem; border-radius:6px; font-weight:650; }
  .warning { color:#ffcf97; margin:.75rem 0; }
  @media(max-width:740px) {
    .workshop { grid-template-columns:minmax(0,1fr); grid-template-areas:"settings" "library" "proof"; grid-template-rows:auto auto auto; }
    .library { flex:auto; height:13rem; }
    .fields { grid-template-columns:repeat(2,minmax(0,1fr)); }
  }
  @media(max-width:480px) {
    .background-controls { grid-template-columns:1fr; }
  }
</style>
