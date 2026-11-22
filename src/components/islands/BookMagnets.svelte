<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { defaultSettings, librarySorts, restoreSettings, saveSettings, settingsKey } from '../../lib/book-magnets/preferences';
  import SpineFontPicker from './SpineFontPicker.svelte';
  import flowchartPreview from '../../assets/magnet-flowchart.webp?url';
  import MagnetProof from './MagnetProof.svelte';
  import { availableDpi, backgroundControls, layout, papers, fillets, type Book } from '../../lib/book-magnets/layout';
  import { defaultFont, exportSheets, type SpineFont } from '../../lib/book-magnets/export';
  import { asBook, deleteCustomCover, importCover, listCustomCovers, releaseCover, type CustomBook } from '../../lib/book-magnets/custom-covers';

  let { books, rankedIds }: { books: Book[]; rankedIds: string[] } = $props();
  const defaults = untrack(() => defaultSettings(rankedIds));
  let prefs = $state(defaults);
  let ready = $state(false), storageNotice = $state('');
  let custom = $state.raw<CustomBook[]>([]);
  let catalogue = $derived([...custom, ...books]);
  let picker: HTMLInputElement;
  let libraryList: HTMLDivElement;
  let importing = $state(false), dragging = $state(false), importNotice = $state(''), libraryNotice = $state('');
  let libraryChanges: BroadcastChannel | undefined;
  let mounted = false, libraryVersion = 0;
  let search = $state(''), comparing = $state(false);
  const filletStyles = Object.keys(fillets) as (keyof typeof fillets)[];
  let finish = $derived({
    binding: prefs.binding, texture: prefs.texture, transform: prefs.transform, lettering: prefs.lettering,
    saturation: prefs.saturation, darkness: prefs.darkness,
  });

  async function refreshLibrary() {
    const version = ++libraryVersion;
    try {
      const records = await listCustomCovers();
      if (!mounted || version !== libraryVersion) return;
      const existing = new Map(custom.map(book => [book.id, book]));
      const saved = records.map(record => {
        const book = existing.get(record.id) ?? asBook(record);
        existing.delete(record.id);
        return book;
      });
      for (const book of existing.values()) if (!book.sessionOnly) releaseCover(book);
      custom = [...saved, ...custom.filter(book => book.sessionOnly)];
      libraryNotice = '';
    } catch {
      if (mounted) libraryNotice = 'Could not open My covers on this device. You can still add covers for this visit.';
    }
  }

  onMount(() => {
    mounted = true;
    const restore = () => {
      const restored = restoreSettings(defaults, catalogue);
      const visits = prefs.ids.filter(id => id.startsWith('visit:'));
      const titles = Object.entries(prefs.titles).filter(([id]) => id.startsWith('visit:'));
      prefs = { ...restored, ids: [...restored.ids, ...visits], titles: { ...restored.titles, ...Object.fromEntries(titles) } };
    };
    void refreshLibrary().then(() => { if (mounted) { restore(); ready = true; } });
    try {
      libraryChanges = new BroadcastChannel('book-magnets.covers');
      libraryChanges.onmessage = () => { void refreshLibrary(); };
    } catch { /* Refreshing the page still restores the library. */ }
    const sync = (event: StorageEvent) => { if (ready && (event.key === settingsKey || event.key === null)) restore(); };
    window.addEventListener('storage', sync);
    return () => {
      mounted = false;
      libraryChanges?.close();
      window.removeEventListener('storage', sync);
      custom.forEach(releaseCover);
    };
  });
  $effect(() => {
    if (!ready) return;
    try { saveSettings(prefs, defaults, untrack(() => catalogue)); storageNotice = ''; }
    catch { storageNotice = 'Browser storage is unavailable. These settings apply to this visit.'; }
  });
  let font = $state.raw<SpineFont>(defaultFont);
  let fontLoading = $state(false), busy = $state(false);
  let message = $state(''), failure = $state('');
  let byId = $derived(new Map(catalogue.map(book => [book.id, book])));
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  let rank = $derived(new Map(rankedIds.map((id, index) => [id, index])));
  const groupName = (book: Book) => rank.has(book.id) ? 'Ranked books' : book.original ? 'My covers' : 'Curated covers';
  const displayTitle = (book: Book) => (book.original && prefs.titles[book.id]?.trim()) || book.title;
  function compareSeries(a: Book, b: Book) {
    return collator.compare(a.series?.name ?? displayTitle(a), b.series?.name ?? displayTitle(b))
      || (a.series?.volume ?? 0) - (b.series?.volume ?? 0)
      || (a.series?.part ?? 0) - (b.series?.part ?? 0)
      || collator.compare(displayTitle(a), displayTitle(b))
      || collator.compare(a.series?.edition ?? '', b.series?.edition ?? '');
  }
  function seriesLabel(book: Book) {
    const series = book.series;
    if (!series) return '';
    const part = series.part ? `, Part ${series.part}` : '';
    const edition = series.edition ? ` · ${series.edition}` : '';
    return `${series.name} ${series.volume}${part}${edition}`;
  }
  const editorLabel = (book: Book) => book.series?.edition ? `${book.title} (${seriesLabel(book)})` : book.title;
  const normalizeSearch = (value: string) => value.toLowerCase().replace(/[’‘]/g, "'");
  let filtered = $derived.by(() => {
    const terms = normalizeSearch(search).trim().split(/\s+/);
    const matches = catalogue.filter(book => {
      const text = normalizeSearch([book.title, seriesLabel(book), book.author, prefs.titles[book.id]].join(' '));
      return terms.every(term => text.includes(term));
    });
    if (prefs.librarySort === 'ranking') {
      return matches.sort((a, b) => (rank.get(a.id) ?? rankedIds.length) - (rank.get(b.id) ?? rankedIds.length));
    }
    if (prefs.librarySort === 'author') {
      return matches.sort((a, b) => Number(!a.author) - Number(!b.author)
        || collator.compare(a.author, b.author) || compareSeries(a, b));
    }
    return matches.sort(compareSeries);
  });
  let selected = $derived.by(() => {
    const chosen = prefs.ids.map(id => byId.get(id)).filter((book): book is Book => !!book);
    const counts = new Map<string, number>();
    for (const { series } of chosen) {
      if (series) counts.set(series.name, (counts.get(series.name) ?? 0) + 1);
    }
    return chosen.map(book => {
      const autoTitle = book.series && counts.get(book.series.name) === 1 ? book.series.name : book.title;
      return { ...book, title: prefs.titles[book.id]?.trim() || autoTitle };
    });
  });
  let dims = $derived(prefs.paper === 'Custom' ? [prefs.paperW, prefs.paperH] : papers[prefs.paper]);
  let sheet = $derived(layout(dims[0], dims[1], prefs.height, prefs.ratio, prefs.spine, prefs.dpi));
  let pages = $derived(sheet.error ? 0 : Math.ceil(selected.length / sheet.capacity));
  let lowRes = $derived(selected.filter(b => availableDpi(b, sheet) < prefs.dpi));

  function toggle(id: string) {
    if (prefs.ids.includes(id)) prefs.ids = prefs.ids.filter(item => item !== id);
    else prefs.ids = [...prefs.ids, id];
    message = failure = '';
  }
  async function addCovers(files: File[]) {
    if (!ready || importing || !files.length) return;
    importing = true;
    importNotice = '';
    const issues: string[] = [];
    let added = 0;
    try {
      for (const file of files) {
        try {
          const book = await importCover(file);
          if (!mounted) { releaseCover(book); return; }
          ++libraryVersion;
          if (custom.some(existing => existing.id === book.id)) releaseCover(book);
          else custom = [...custom, book];
          prefs.ids = [...prefs.ids, book.id];
          search = '';
          added++;
          if (!book.sessionOnly) libraryChanges?.postMessage('updated');
        } catch (error) {
          issues.push(file.name + ' — ' + (error instanceof Error ? error.message : 'Could not import this cover.'));
        }
      }
      if (added) await refreshLibrary();
      importNotice = [added ? 'Added ' + added + (added === 1 ? ' cover.' : ' covers.') : '', ...issues].filter(Boolean).join(' ');
    } finally { importing = false; }
  }

  async function removeCover(book: CustomBook) {
    try { await deleteCustomCover(book); }
    catch { importNotice = 'Could not remove this saved cover. Try again.'; return; }
    if (!mounted) return;
    ++libraryVersion;
    custom = custom.filter(b => b.id !== book.id);
    prefs.ids = prefs.ids.filter(id => id !== book.id);
    delete prefs.titles[book.id];
    releaseCover(book);
    importNotice = 'Removed ' + book.title + '.';
    if (!book.sessionOnly) {
      libraryChanges?.postMessage('updated');
      void refreshLibrary();
    }
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

<div class="workshop" inert={!ready}>
  <section class="panel catalogue">
    <div class="bar"><h2>Cover library</h2><span>{catalogue.length} books</span></div>
    <div class="bar selection"><strong>{selected.length} selected</strong><button class="textbtn" disabled={!selected.length} onclick={() => { prefs.ids = []; message = failure = ''; }}>Clear selection</button></div>
    <button class="import-zone" class:dragging disabled={importing} onclick={() => picker.click()}
      ondragover={e => { e.preventDefault(); dragging = true; }} ondragleave={() => dragging = false}
      ondrop={e => { e.preventDefault(); dragging = false; void addCovers(Array.from(e.dataTransfer?.files ?? [])); }}>
      <strong>{importing ? 'Adding covers…' : 'Add covers'}</strong>
      <small>Choose or drop JPEG, PNG or WebP files</small>
    </button>
    <input class="file-picker" type="file" aria-label="Choose cover files" multiple accept="image/jpeg,image/png,image/webp"
      bind:this={picker} onchange={e => {
        const files = Array.from(e.currentTarget.files ?? []);
        e.currentTarget.value = '';
        void addCovers(files);
      }} />
    {#if libraryNotice || importNotice}<p class="import-note" role="status">{libraryNotice} {importNotice}</p>{/if}
    <input type="search" aria-label="Search covers" placeholder="Search by title, series or author" bind:value={search} />
    <label class="library-sort">Sort by
      <select bind:value={prefs.librarySort} onchange={async () => { await tick(); libraryList.scrollTop = 0; }}>
        {#each Object.entries(librarySorts) as [value, label] (value)}<option {value}>{label}</option>{/each}
      </select>
    </label>
    <div class="library" bind:this={libraryList}>
      {#each filtered as book, i (book.id)}
        {#if prefs.librarySort === 'ranking' && (i === 0 || groupName(book) !== groupName(filtered[i - 1]))}<h3>{groupName(book)}</h3>{/if}
        <div class="book-row">
        <button class="book" data-book-id={book.id} aria-pressed={prefs.ids.includes(book.id)} onclick={() => toggle(book.id)}>
          <img src={book.thumb} alt="" width="32" height="48" loading="lazy"
            onerror={e => {
              const image = e.currentTarget;
              if (image.getAttribute('src') !== book.src) image.src = book.src;
            }} />
          <span class="bookname"><strong>{displayTitle(book)}</strong>
            {#if book.id.startsWith('visit:')}<small>Available for this visit only</small>{:else if book.author}<small>{#if book.series}{seriesLabel(book)} · {/if}{book.author}</small>{/if}
          </span>
          <span class="tick" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d={prefs.ids.includes(book.id) ? 'M3 8l3.2 3.2L13 4.8' : 'M8 3v10M3 8h10'} /></svg></span>
        </button>
        {#if book.original}
          <button class="remove" aria-label={'Remove ' + book.title + ' from My covers'} disabled={busy} onclick={() => removeCover(book as CustomBook)}>Remove</button>
        {/if}
        </div>
      {:else}<p class="muted">No matching books.</p>{/each}
    </div>
  </section>

    <section class="panel settings">
      <h2>
        <button class="settings-toggle" aria-expanded={!prefs.settingsCollapsed} aria-controls="magnet-print-options"
          onclick={() => prefs.settingsCollapsed = !prefs.settingsCollapsed}>
          Print settings
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6 4 4 4-4" /></svg>
        </button>
      </h2>
      <div id="magnet-print-options" hidden={prefs.settingsCollapsed}>
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
          <div class="fields visual-fields">
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
            <div class="binding-field">
              <div class="binding-heading">
                <label for="magnet-binding">Binding</label>
                {#if selected.length && !sheet.error}
                  <button class="compare" aria-label="Compare five spine fillets" aria-expanded={comparing}
                    aria-controls="fillet-samples" onclick={() => comparing = !comparing}>Compare</button>
                {/if}
              </div>
              <select id="magnet-binding" bind:value={prefs.binding}><option value="none">None</option>{#each filletStyles as style (style)}<option value={style}>{fillets[style]}</option>{/each}</select>
            </div>
            <div class="background-sliders">
              {#each backgroundControls as control (control.key)}
                <label class="range-field">{control.label} <span class="percentage" aria-hidden="true">{prefs[control.key]}%</span>
                  <input class="custom-range" type="range" min="0" max={control.max} aria-valuetext={prefs[control.key] + '%'}
                    style:--fill={100 * prefs[control.key] / control.max + '%'} bind:value={prefs[control.key]} />
                </label>
              {/each}
            </div>
          </div>
          {#if selected.length && !sheet.error}
            <div id="fillet-samples" hidden={!comparing}>
              {#if comparing}
                <div class="samples">
                  {#each filletStyles as style (style)}
                    <button aria-pressed={prefs.binding === style} onclick={() => prefs.binding = style}>
                      <MagnetProof book={selected[0]} {sheet} finish={{ ...finish, binding: style }} {font} spineOnly />
                      <span>{fillets[style]}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </fieldset>
      </div>
      {#if lowRes.length && !sheet.error}
        <p class="warning" role="status">Below {prefs.dpi} DPI at this size: {lowRes.map(b => b.title + ' (' + Math.floor(availableDpi(b, sheet)) + ' DPI)').join(', ')}.</p>
      {/if}
      {#if storageNotice}<p role="status">{storageNotice}</p>{/if}
    </section>
    <section class="panel proof">
      <div class="bar"><h2>Print proof</h2>
        <button class="download" disabled={!pages || busy || fontLoading} onclick={download}>{busy ? 'Preparing sheets…' : pages ? 'Download ' + pages + (pages === 1 ? ' sheet' : ' sheets') : 'Download sheets'}</button>
      </div>
      {#if message}<p class="download-status" role="status">{message}</p>{/if}
      {#if failure}<p class="download-status warning" role="alert">{failure}</p>{/if}
      <div class="mat">
        {#if sheet.error}<p>{sheet.error}</p>
        {:else if !selected.length}<p>Select a cover to see its wrap.</p>
        {:else}
          <div class="gallery">
            {#each selected as book (book.id)}
              <figure>
                <MagnetProof {book} {sheet} {finish} {font} />
                <figcaption>
                  <label>Spine title<input aria-label={'Spine title for ' + editorLabel(byId.get(book.id)!)}
                    value={prefs.titles[book.id] ?? book.title} placeholder={book.title}
                    oninput={e => prefs.titles[book.id] = e.currentTarget.value}
                    onblur={e => { if (!e.currentTarget.value.trim()) delete prefs.titles[book.id]; }} /></label>
                </figcaption>
              </figure>
            {/each}
          </div>
        {/if}
      </div>
      {#if selected.length && !sheet.error}
        <p class="caption">{selected.length} enlarged {selected.length === 1 ? 'wrap' : 'wraps'} · {sheet.wrap.toFixed(2)} × {prefs.height} mm each</p>
      {/if}
      <nav class="discovery" aria-label="Book recommendations">
        <a href="/reviews/flowchart/">
          <img src={flowchartPreview} width="160" height="96" alt="" loading="lazy" />
          <span><strong>Find my next read →</strong><small>Explore the book flowchart · Not printed</small></span>
        </a>
      </nav>
    </section>

</div>

<style>
  .workshop { --border:var(--color-gray-700); --muted:var(--color-gray-400); --accent:var(--color-main-400);
    display:grid; grid-template-columns:clamp(16rem,22vw,22rem) minmax(0,1fr); grid-template-areas:"library settings" "library proof";
    grid-template-rows:auto 1fr; min-height:calc(100svh - 13rem); gap:1rem; padding-bottom:1rem; }
  .panel { background:var(--color-gray-800); border:1px solid var(--border); border-radius:10px; min-width:0; }
  .catalogue { grid-area:library; display:flex; flex-direction:column; overflow:hidden; }
  .settings { grid-area:settings; container-type:inline-size; padding:1rem 1.15rem; }
  .settings-toggle { display:flex; align-items:center; justify-content:space-between; width:100%; text-align:left; font:inherit; }
  .settings-toggle[aria-expanded="false"] svg { transform:rotate(-90deg); }
  .proof { grid-area:proof; align-self:start; overflow:hidden; }
  h2 { margin:0; color:var(--color-gray-100); font:600 1.25rem/1.4 Inter,sans-serif; }
  .bar { display:flex; align-items:center; justify-content:space-between; gap:.75rem; flex-wrap:wrap; }
  .bar { padding:1rem 1.15rem; }
  .bar > span,.caption,.muted,small { color:var(--muted); font-size:.83rem; }
  .caption { margin:.65rem 0 0; line-height:1.5; }
  input:not([type=range]),select { display:block; width:100%; min-width:0; border:1px solid var(--color-gray-600); border-radius:5px; background-color:var(--color-gray-900); color:var(--color-gray-100); font:inherit; font-size:.92rem; padding:.45rem .55rem; }
  select { padding-right:1.65rem; }
  input[type=search] { width:calc(100% - 2.3rem); margin:0 1.15rem .8rem; }
  .library-sort { display:flex; align-items:center; gap:.75rem; margin:0 1.15rem .8rem; white-space:nowrap; }
  .library-sort select { flex:1; margin:0; }
  .library { flex:1; min-height:12rem; contain:size; overflow:auto; scrollbar-color:var(--color-gray-600) transparent; }
  .library .muted { padding:1rem; }
  .import-zone { margin:0 1.15rem .8rem; padding:.65rem; border:1px dashed var(--border); border-radius:5px; color:var(--accent); }
  .import-zone small { display:block; margin-top:.15rem; }
  .import-zone:hover,.import-zone.dragging { border-color:var(--accent); background:var(--color-gray-900); }
  input.file-picker { display:none; }
  .import-note,.library h3 { padding:0 1.15rem .6rem; font-size:.85rem; overflow-wrap:anywhere; }
  .library h3 { padding-top:.6rem; font-weight:600; }
  .book-row { display:flex; align-items:stretch; }
  .book-row .book { min-width:0; }
  .remove { padding:.35rem .6rem; border-top:1px solid var(--border); color:var(--muted); font-size:.8rem; }
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
  .book[aria-pressed=true] .tick,.download { background:var(--accent); color:var(--color-gray-950); border-color:var(--accent); }
  .selection { padding-top:0; font-size:.87rem; }
  .textbtn { color:var(--accent); font-size:.83rem; text-decoration:underline; text-underline-offset:3px; padding:.25rem; }
  button:disabled { opacity:.45; cursor:default; }
  .mat { padding:1.15rem; min-height:10rem; background:var(--color-gray-900); }
  .gallery { display:grid; grid-template-columns:repeat(auto-fit,min(100%,360px)); gap:1.5rem; }
  .gallery figure { min-width:0; margin:0; }
  .gallery figcaption { margin-top:.5rem; }
  fieldset { min-width:0; margin-top:1rem; border-top:1px solid var(--border); }
  legend { padding-right:.65rem; font-weight:600; font-size:.94rem; color:var(--color-gray-100); }
  .samples { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr)); gap:.7rem; margin:.75rem 0; }
  .samples button { padding:.5rem; background:var(--color-gray-900); border:1px solid var(--border); border-radius:5px; text-align:left; }
  .samples button[aria-pressed=true] { border-color:var(--accent); }
  .samples span { display:block; margin-top:.4rem; font-size:.83rem; }
  .fields { display:grid; gap:.8rem; margin:.9rem 0; grid-template-columns:repeat(auto-fit,minmax(min(100%,10.5rem),1fr)); }
  .visual-fields { grid-template-columns:repeat(auto-fit,minmax(min(100%,7.5rem),1fr)); align-items:start; }
  .binding-heading { display:flex; align-items:baseline; justify-content:space-between; gap:.25rem; }
  .compare { color:var(--accent); font-size:.78rem; text-decoration:underline; }
  .binding-field select { margin-top:.25rem; }
  .background-sliders { grid-column:1 / -1; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); column-gap:2rem; row-gap:.75rem; }
  .range-field { display:grid; grid-template-columns:1fr auto; column-gap:.5rem; align-items:baseline; }
  .percentage { font-variant-numeric:tabular-nums; }
  .custom-range {
    --track:linear-gradient(to right,var(--accent) var(--fill),var(--color-gray-500) var(--fill));
    grid-column:1 / -1; width:100%; min-width:0; height:2.4rem; margin:.25rem 0 0;
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
  .download-status { padding:0 1.15rem .7rem; }
  .discovery { padding:1rem 1.15rem; border-top:1px solid var(--border); }
  .discovery a { display:inline-flex; gap:1rem; align-items:center; color:var(--accent); }
  .discovery img { width:clamp(6rem,12vw,10rem); height:auto; border-radius:.4rem; }
  .discovery small { display:block; color:var(--muted); }
  .discovery a:hover strong { text-decoration:underline; }
  @media print { .discovery, .download { display:none; } }
  .download { padding:.65rem 1rem; border-radius:6px; font-weight:650; }
  .warning { color:#ffcf97; margin:.75rem 0; }
  @container (max-width:32rem) {
    .background-sliders { grid-template-columns:1fr; }
  }
  @container (min-width:76rem) {
    .visual-fields { grid-template-columns:repeat(5,minmax(0,1fr)) minmax(32rem,3fr); gap:1.25rem; }
    .background-sliders { grid-column:auto; }
  }
  @media(max-width:740px) {
    .workshop { grid-template-columns:minmax(0,1fr); grid-template-areas:"settings" "library" "proof"; grid-template-rows:auto auto auto; }
    .gallery { grid-template-columns:minmax(0,1fr); }
    .library { flex:auto; height:13rem; }
    .fields { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .binding-field { grid-column:1 / -1; }
  }
</style>
