import { zipSync, strToU8 } from 'fflate';
import { drawSheetGuides, drawSheetItem, loadCover } from './render';
import type { Finish, Book, Layout } from './layout';
import bundledFont from '../../assets/fonts/inter-v20-latin.woff2?url';
import license from '../../assets/fonts/Inter-OFL.txt?raw';

export type SpineFont = { name: string; family: string; file?: File };
export const defaultFont: SpineFont = { name: 'Inter', family: 'Magnet Inter' };
let defaultLoaded: Promise<FontFace> | undefined;
export function prepareDefaultFont() {
  return defaultLoaded ??= new FontFace(defaultFont.family, 'url("' + bundledFont + '")', { weight: '400 900' })
    .load().then(face => { document.fonts.add(face); return face; }).catch(error => { defaultLoaded = undefined; throw error; });
}

async function compressSheet(png: Blob): Promise<Uint8Array> {
  let worker: Worker | undefined;
  try {
    worker = new Worker(new URL('./png.worker.ts', import.meta.url), { type: 'module' });
    const encoder = worker;
    const result = await new Promise<Uint8Array | null>((resolve) => {
      encoder.onmessage = event => resolve(event.data);
      encoder.onerror = encoder.onmessageerror = () => resolve(null);
      encoder.postMessage(png);
    });
    if (result && result.byteLength < png.size) return result;
  } catch {
    // A browser can permit canvas export while blocking workers.
  } finally {
    worker?.terminate(); // Release the WASM heap before rendering another sheet.
  }
  return new Uint8Array(await png.arrayBuffer());
}

// Canvas PNGs typically declare 96 DPI. Write the requested physical density
// directly after IHDR and discard any pre-existing pHYs chunk.
function setDensity(png: Uint8Array, dpi: number) {
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set(strToU8('pHYs'), 4);
  const pixelsPerMetre = Math.round(dpi / 0.0254);
  view.setUint32(8, pixelsPerMetre);
  view.setUint32(12, pixelsPerMetre);
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(17, ~crc);
  const parts = [png.subarray(0, 33), chunk];
  const source = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let i = 33; i < png.length;) {
    const end = i + 12 + source.getUint32(i);
    if (source.getUint32(i + 4) !== 0x70485973) parts.push(png.subarray(i, end));
    i = end;
  }
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

export async function exportSheets(books: Book[], sheet: Layout, font: SpineFont, finish: Finish, progress: (message: string) => void) {
  const files: Record<string, Uint8Array> = {};
  if (font.file) files['fonts/' + font.file.name] = new Uint8Array(await font.file.arrayBuffer());
  else if (font.family === defaultFont.family) {
    await prepareDefaultFont();
    const response = await fetch(bundledFont);
    if (!response.ok) throw new Error('Could not load the bundled spine font.');
    files['fonts/Inter.woff2'] = new Uint8Array(await response.arrayBuffer());
    files['fonts/Inter-OFL.txt'] = strToU8(license);
  }
  const canvas = document.createElement('canvas');
  canvas.width = sheet.widthPx;
  canvas.height = sheet.heightPx;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.scale(canvas.width / sheet.paperW, canvas.height / sheet.paperH);
  const pages = Math.ceil(books.length / sheet.capacity);
  try {
    for (let page = 0; page < pages; page++) {
      progress('Rendering sheet ' + (page + 1) + ' of ' + pages + '…');
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, sheet.paperW, sheet.paperH);
      const items = books.slice(page * sheet.capacity, (page + 1) * sheet.capacity);
      for (const [i, book] of items.entries()) {
        const cover = await loadCover(book);
        try { drawSheetItem(ctx, i, sheet, cover, book.title, font.family, finish); }
        finally { cover.image.close(); }
      }
      drawSheetGuides(ctx, sheet, items.length);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not encode this sheet.')), 'image/png'));
      progress('Compressing sheet ' + (page + 1) + ' of ' + pages + '…');
      files['sheet-' + String(page + 1).padStart(2, '0') + '.png'] = setDensity(await compressSheet(blob), sheet.dpi);
    }
  } finally { canvas.width = canvas.height = 1; }
  const zip = zipSync(files, { level: 0, mtime: new Date(2000, 0, 1) });
  return new Blob([new Uint8Array(zip)], { type: 'application/zip' });
}
