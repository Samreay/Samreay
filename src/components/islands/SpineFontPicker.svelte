<script lang="ts">
  import { onMount } from 'svelte';
  import { readFontPreference, readImportedFont, saveFontPreference } from '../../lib/book-magnets/font-preference';
  import { defaultFont, type SpineFont } from '../../lib/book-magnets/export';

  type DeviceFace = { fullName: string; postscriptName: string; family: string; style: string; blob(): Promise<Blob> };
  type LocalFontWindow = Window & { queryLocalFonts?: () => Promise<DeviceFace[]> };
  type Option = { id: string; name: string; device?: DeviceFace; file?: File };
  type Props = { font: SpineFont; loading: boolean; disabled: boolean };
  let { font = $bindable(), loading = $bindable(), disabled }: Props = $props();
  const bundled: Option = { id: 'bundled', name: 'Inter (bundled)' };
  const preferredNames = ['Gill Sans', 'Palatino', 'Palatino Linotype', 'Hoefler Text', 'Georgia', 'Baskerville'];
  let options = $state.raw<Option[]>([]);
  let imports = $state.raw<Option[]>([]);
  let preferred = $derived.by(() => {
    for (const name of preferredNames) {
      const face = options.find(o => o.name === name || (o.device?.family === name && /^(regular|roman|normal)$/i.test(o.device.style)));
      if (face) return face;
    }
    return bundled;
  });
  let choice = $state('auto'), applied = 'auto';
  let initialising = $state(true);
  let canList = $state(false), listed = $state(false), note = $state('');
  let chooser: HTMLInputElement;
  let version = 0, currentFace: FontFace | undefined;

  async function listDeviceFonts() {
    const faces = await (window as LocalFontWindow).queryLocalFonts!();
    if (!faces.length) throw new Error('No installed fonts were shared.');
    options = faces.map(device => ({ id: 'device-' + device.postscriptName, name: device.fullName, device }))
      .sort((a, b) => a.name.localeCompare(b.name));
    listed = true;
  }

  onMount(() => {
    const api = window as LocalFontWindow;
    canList = !!api.queryLocalFonts;
    async function initialise() {
      if (canList) {
        try {
          const permission = await navigator.permissions.query({ name: 'local-fonts' as PermissionName });
          if (permission.state === 'granted') { await listDeviceFonts(); return; }
        } catch { /* A user gesture can still request the list below. */ }
      }
      // Browsers with a restricted font catalogue can still resolve common
      // system faces by name. Only offer names which successfully load here.
      const common = ['Arial', 'Avenir', 'Baskerville', 'Book Antiqua', 'Cambria', 'Candara', 'Charter',
        'Cochin', 'Courier New', 'DejaVu Sans', 'DejaVu Serif', 'Didot', 'Futura', 'Garamond', 'Georgia',
        'Gill Sans', 'Helvetica', 'Hoefler Text', 'Liberation Sans', 'Liberation Serif', 'Menlo',
        'Optima', 'Palatino', 'Palatino Linotype', 'Roboto', 'Segoe UI', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
      const available = await Promise.all(common.map(async name => {
        try {
          await new FontFace('Magnet font probe', 'local(' + JSON.stringify(name) + ')').load();
          return { id: 'local-' + name, name };
        } catch { return undefined; }
      }));
      if (!listed) options = available.filter(face => face !== undefined);
    }
    async function restore() {
      loading = true;
      let saved;
      try { saved = readFontPreference(); } catch { /* Use the automatic choice. */ }
      try {
        await initialise();
        let option = preferred;
        if (saved?.id.startsWith('file-')) {
          option = { ...saved, file: await readImportedFont(saved) };
          imports = [option];
        } else if (saved) {
          option = [bundled, ...options].find(o => o.id === saved.id || o.name === saved.name)
            ?? { id: 'local-' + saved.name, name: saved.name };
        }
        if (!await applyOption(option, false)) throw new Error('Font unavailable');
        if (option.id.startsWith('local-') && !options.includes(option)) options = [...options, option];
      } catch {
        await applyOption(preferred, false);
        if (saved) note = 'Could not restore the saved font. Select it again to use it.';
      } finally { initialising = false; loading = false; }
    }
    void restore();
  });

  async function applyOption(option: Option, persist = true) {
    const request = ++version;
    choice = option.id === preferred.id ? 'auto' : option.id;
    note = '';
    loading = true;
    try {
      let next: FontFace | undefined;
      let file = option.file;
      if (option.device) {
        try {
          const bytes = await option.device.blob();
          const header = await bytes.slice(0, 4).text();
          const extension = header === 'OTTO' ? 'otf' : header === 'ttcf' ? 'ttc' : 'ttf';
          file = new File([bytes], option.device.postscriptName.replace(/[^\w.-]/g, '_') + '.' + extension);
        } catch { /* Restricted font files can still be rendered by local name. */ }
      }
      if (option.id !== bundled.id) {
        const source = file ? await file.arrayBuffer() : 'local(' + JSON.stringify(option.name) + ')';
        next = await new FontFace('MagnetChoice' + request, source, { weight: '600' }).load();
      }
      if (request !== version) return;
      if (next) document.fonts.add(next);
      font = next ? { name: option.name, family: next.family, file } : defaultFont;
      if (currentFace) document.fonts.delete(currentFace);
      currentFace = next;
      applied = choice;
      if (persist) {
        try { await saveFontPreference(choice === 'auto' ? undefined : option, () => version === request); }
        catch { if (version === request) note = 'This font is active, but browser storage could not save the selection.'; }
      }
      return true;
    } catch {
      if (request === version) { choice = applied; note = 'Could not load that face. The current spine font is ' + font.name + '.'; }
    } finally { if (request === version) loading = false; }
  }

  async function select(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const id = select.value;
    if (id === 'import' || id === 'list') {
      select.value = choice;
      if (id === 'import') { chooser.click(); return; }
      note = '';
      try {
        const previous = options.find(option => option.id === choice);
        await listDeviceFonts();
        if (choice === 'auto') await applyOption(preferred);
        else if (previous && !previous.device) {
          const match = options.find(option => option.name === previous.name);
          if (match) await applyOption(match);
          else options = [...options, previous];
        }
      } catch { note = 'Installed font access is unavailable. Select a listed face or open a font file.'; }
      return;
    }
    const option = id === 'auto' ? preferred : [bundled, ...options, ...imports].find(o => o.id === id);
    if (option) await applyOption(option);
  }

  function importFont(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    const option = { id: 'file-' + crypto.randomUUID(), name: file.name, file };
    imports = [...imports, option];
    input.value = '';
    void applyOption(option);
  }
</script>

<label>Spine font
  <select aria-label="Spine font" value={choice} onchange={select} disabled={disabled || initialising}>
    <option value="auto">Default · {preferred.name}</option>
    {#if preferred !== bundled}<option value={bundled.id}>{bundled.name}</option>{/if}
    {#if options.length}
      <optgroup label="On this computer">
        {#each options.filter(o => o.id !== preferred.id) as option (option.id)}<option value={option.id}>{option.name}</option>{/each}
      </optgroup>
    {/if}
    {#each imports as option (option.id)}<option value={option.id}>{option.name}</option>{/each}
    {#if canList && !listed}<option value="list">Show all installed fonts…</option>{/if}
    <option value="import">Open a font file…</option>
  </select>
</label>
<input hidden type="file" bind:this={chooser} aria-label="Open font file" accept=".ttf,.otf,.ttc,.woff,.woff2" onchange={e => importFont(e.currentTarget)} />
{#if note}<small role="status">{note}</small>{/if}

<style>
  label { display:block; min-width:0; font-size:.83rem; color:var(--color-gray-300); }
  select { display:block; width:100%; min-width:0; margin-top:.25rem; padding:.45rem 1.65rem .45rem .55rem; color:var(--color-gray-100); background-color:var(--color-gray-900); border:1px solid var(--color-gray-600); border-radius:5px; font-size:.92rem; }
  small { color:var(--color-gray-300); }
</style>
