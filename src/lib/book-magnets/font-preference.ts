// Keep only the selected face in localStorage. Imported font binaries can
// exceed its quota, so keep those bytes in a separate, origin-local cache.
const key = 'book-magnets.font.v1';
const cacheName = 'book-magnets.imported-fonts.v1';
type Preference = { id: string; name: string };

export function readFontPreference(): Preference | undefined {
  const raw = localStorage.getItem(key);
  if (!raw) return;
  const p = JSON.parse(raw);
  if (typeof p?.id === 'string' && (p.id === 'bundled' || /^(file|device|local)-/.test(p.id)) && typeof p.name === 'string') return p;
}

const fontUrl = (id: string) => new URL('/reviews/book-magnets/fonts/' + encodeURIComponent(id), location.origin).href;

export async function readImportedFont(saved: Preference) {
  const response = await (await caches.open(cacheName)).match(fontUrl(saved.id));
  if (!response) throw new Error('Open the font file again to restore it.');
  return new File([await response.blob()], saved.name);
}

export async function saveFontPreference(option: (Preference & { file?: File }) | undefined, stillSelected: () => boolean) {
  if (option?.file) {
    const cache = await caches.open(cacheName);
    await cache.put(fontUrl(option.id), new Response(option.file));
    if (!stillSelected()) return;
  }
  // Read the previous reference only after any pending binary write completes.
  let previous: Preference | undefined;
  try { previous = readFontPreference(); } catch { /* Replace malformed storage. */ }
  if (!option) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify({ id: option.id, name: option.name }));
  if (previous?.id.startsWith('file-') && previous.id !== option?.id) {
    await (await caches.open(cacheName)).delete(fontUrl(previous.id));
  }
}
