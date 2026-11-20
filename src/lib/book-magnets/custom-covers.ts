import { createStore, del, set, values } from 'idb-keyval';
import type { Book } from './layout';

const store = createStore('book-magnets.covers.v1', 'covers');
type StoredCover = {
  id: string; title: string; width: number; height: number; added: number;
  original: Blob | ArrayBuffer; thumbnail: Blob | ArrayBuffer; mimeType: string;
};

export type CustomBook = Book & { original: Blob; sessionOnly: boolean };

export function asBook(cover: StoredCover, sessionOnly = false): CustomBook {
  const original = cover.original instanceof Blob ? cover.original : new Blob([cover.original], { type: cover.mimeType });
  const thumbnail = cover.thumbnail instanceof Blob ? cover.thumbnail : new Blob([cover.thumbnail], { type: 'image/png' });
  return {
    id: cover.id, title: cover.title, author: '', width: cover.width, height: cover.height,
    src: URL.createObjectURL(original), thumb: URL.createObjectURL(thumbnail),
    original, sessionOnly,
  };
}

export function releaseCover(book: CustomBook) {
  URL.revokeObjectURL(book.src);
  URL.revokeObjectURL(book.thumb);
}

export async function listCustomCovers() {
  const stored = await values<StoredCover>(store);
  return stored.sort((a, b) => a.added - b.added);
}

export async function importCover(file: File): Promise<CustomBook> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const header = String.fromCharCode(...bytes);
  const supported = header.startsWith('\xff\xd8\xff') || header.startsWith('\x89PNG\r\n\x1a\n') ||
    (header.startsWith('RIFF') && header.slice(8) === 'WEBP');
  if (!supported) throw new Error('Choose a JPEG, PNG or WebP image.');

  const image = await createImageBitmap(file).catch(() => { throw new Error('Could not read the image.'); });
  const { width, height } = image;
  let thumbnail: Blob;
  try {
    const scale = Math.min(1, 96 / width, 144 / height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    thumbnail = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob =>
      blob ? resolve(blob) : reject(new Error('Could not make a thumbnail.')), 'image/png'));
  } finally { image.close(); }

  const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  const record: StoredCover = {
    id: 'custom:' + key, title: file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim() || 'Untitled',
    added: Date.now(), width, height, original: file, thumbnail, mimeType: file.type,
  };
  try { await set(record.id, record, store); }
  catch (error) {
    // WebKit can reject Blob/File writes before the transaction exposes its error.
    if (error == null || (error instanceof DOMException && ['UnknownError', 'DataCloneError'].includes(error.name))) {
      try {
        await set(record.id, { ...record, original: await file.arrayBuffer(), thumbnail: await thumbnail.arrayBuffer() }, store);
        return asBook(record);
      } catch { /* The cover can still be printed in this tab. */ }
    }
    return asBook({ ...record, id: 'visit:' + key }, true);
  }
  return asBook(record);
}

export async function deleteCustomCover(book: CustomBook) {
  if (!book.sessionOnly) await del(book.id, store);
}
