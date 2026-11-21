// Run with BASE_URL pointing to the built site; set BROWSER=webkit to check Safari's engine.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { unzipSync } from 'fflate';
import sharp from 'sharp';

const browser = await (process.env.BROWSER === 'webkit' ? webkit : chromium).launch();
const url = new URL('/reviews/book-magnets/', process.env.BASE_URL ?? 'http://localhost:4321').href;
const ready = page => page.locator('.workshop:not([inert])').waitFor();
const context = await browser.newContext();
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
try {
  let page = await context.newPage();
  await page.goto(url);
  await ready(page);
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await page.getByLabel('Resolution (DPI)').fill('120');

  const large = await sharp(randomBytes(1500 * 1300 * 3), { raw: { width: 1500, height: 1300, channels: 3 } }).png().toBuffer();
  assert(large.length > 5 * 1024 ** 2);
  const blue = await sharp({ create: { width: 125, height: 200, channels: 3, background: '#224488' } }).webp({ lossless: true }).toBuffer();
  const input = () => page.getByLabel('Choose cover files');
  await input().setInputFiles([
    { name: 'My_first_book.png', mimeType: 'image/png', buffer: large },
    { name: 'Broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid') },
  ]);
  await page.getByText(/Broken.png — Choose a JPEG/).waitFor();
  await page.getByLabel('Spine title for My first book').fill('Edited title');

  await page.locator('.import-zone').evaluate((button, bytes) => {
    const drop = new DataTransfer();
    drop.items.add(new File([new Uint8Array(bytes)], 'Blue Book.webp', { type: 'image/webp' }));
    button.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: drop }));
  }, [...blue]);
  await page.getByLabel('Spine title for Blue Book').waitFor();
  const selected = () => page.locator('.book[aria-pressed=true] strong').allTextContents();
  assert.deepEqual(await selected(), ['Edited title', 'Blue Book']);

  // Close the tab entirely so the next render cannot reuse in-memory originals or object URLs.
  await page.close();
  page = await context.newPage();
  await page.goto(url);
  await ready(page);
  assert.deepEqual(await selected(), ['Edited title', 'Blue Book']);
  assert.equal(await page.getByLabel('Spine title for My first book').inputValue(), 'Edited title');
  assert.equal(await page.getByLabel('Resolution (DPI)').inputValue(), '120');
  assert.equal(await page.locator('.gallery canvas').count(), 2);
  const image = page.locator('.book').filter({ hasText: 'Edited title' }).locator('img');
  await image.scrollIntoViewIfNeeded();
  assert(await image.evaluate(async img => { await img.decode(); return img.naturalWidth <= 96; }));

  const pending = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Download print sheets' }).click();
  const sheet = unzipSync(await readFile(await (await pending).path()))['sheet-01.png'];
  // The second wrap's front panel is solid blue in the saved original.
  const rgb = await sharp(sheet).extract({ left: Math.round(112 * 120 / 25.4), top: Math.round(26 * 120 / 25.4), width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  assert.deepEqual([...rgb], [34, 68, 136]);
  // A temporary storage outage during startup must not erase saved IDs or titles.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('test-block-library') !== 'once') return;
    sessionStorage.removeItem('test-block-library');
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, ...args) {
      if (name === 'book-magnets.covers.v1') throw new DOMException('Unavailable', 'SecurityError');
      return open.call(this, name, ...args);
    };
  });
  await page.evaluate(() => sessionStorage.setItem('test-block-library', 'once'));
  await page.reload();
  await page.getByText(/Could not open My covers/).waitFor();
  await page.reload();
  await ready(page);
  assert.deepEqual(await selected(), ['Edited title', 'Blue Book']);
  await page.locator('.book').filter({ hasText: 'Edited title' }).click();
  await page.reload();
  await ready(page);
  assert.deepEqual(await selected(), ['Blue Book']);

  // A failed write should leave this file printable for the visit and preserve saved covers.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'covers') throw new DOMException('Full', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await input().setInputFiles({ name: 'Temporary.webp', mimeType: 'image/webp', buffer: blue });
  await page.getByText('Available for this visit only').waitFor();
  await page.getByLabel('Spine title for Temporary').waitFor();
  await page.reload();
  await ready(page);
  assert.deepEqual(await selected(), ['Blue Book']);
  assert.equal(await page.getByRole('button', { name: /Temporary/ }).count(), 0);

  const other = await context.newPage();
  await other.goto(url);
  await ready(other);
  await page.getByRole('button', { name: 'Remove Blue Book from My covers' }).click();
  await page.getByText('Removed Blue Book.').waitFor();
  await other.getByRole('button', { name: 'Remove Blue Book from My covers' }).waitFor({ state: 'detached' });
  await page.reload();
  await ready(page);
  assert.deepEqual(await selected(), []);
  assert.equal(await page.getByRole('button', { name: /Blue Book/ }).count(), 0);
  assert.equal(await page.locator('.book strong').filter({ hasText: 'Edited title' }).count(), 1);
  assert.deepEqual(errors, []);
  console.log('Passed large-file import, drop, thumbnail, title, reload, re-open, export, quota fallback and deletion checks.');
} finally { await browser.close(); }
