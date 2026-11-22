// Run against npm run preview. Set BASE_URL to test another server.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { glob } from 'glob';
import matter from 'gray-matter';
import { unzipSync } from 'fflate';
import sharp from 'sharp';

const base = process.env.BASE_URL ?? 'http://localhost:4321';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('/reviews/book-magnets/', base).href);
  await page.locator('astro-island:not([ssr]) .workshop:not([inert])').waitFor();
  const thumbnails = await page.locator('.book img').evaluateAll(async images => {
    for (const image of images) image.loading = 'eager';
    return Promise.all(images.map(async image => {
      await image.decode();
      return image.currentSrc;
    }));
  });
  // Force the thumbnail failure from the library report and decode every print original.
  const fallbackPage = await browser.newPage();
  const thumbnailUrls = new Set(thumbnails);
  await fallbackPage.route(url => thumbnailUrls.has(url.href), route => route.abort());
  await fallbackPage.goto(page.url());
  await fallbackPage.locator('.workshop:not([inert])').waitFor();
  const libraryImages = fallbackPage.locator('.book img');
  assert.equal(await libraryImages.count(), thumbnails.length);
  await libraryImages.evaluateAll(images => { for (const image of images) image.loading = 'eager'; });
  await fallbackPage.waitForFunction(() => [...document.querySelectorAll('.book img')].every(image => image.naturalWidth > 0));
  const originals = await libraryImages.evaluateAll(images => images.map(image => image.currentSrc));
  assert(originals.every(url => !thumbnailUrls.has(url)), 'every failed thumbnail should show its print original');
  await fallbackPage.close();
  const download = page.getByRole('button', { name: /^Download (?:\d+ )?sheets?$/ });
  const capture = async () => {
    const pending = page.waitForEvent('download', { timeout: 120_000 });
    await download.click();
    return unzipSync(await readFile(await (await pending).path()));
  };
  const volumes = ['Soul Relic', 'Scion of Storms', 'Sanctuary', 'Shieldsmith', 'Siegebreaker', 'Sovereign'];
  const covers = await glob('content/reviews/*/cover.{jpg,jpeg,png,webp}');
  const rankings = await Promise.all(covers.map(async path => {
    const id = path.split('/')[2];
    const { data } = matter(await readFile(`content/reviews/${id}/index.md`, 'utf8'));
    return { id, weight: data.weight };
  }));
  rankings.sort((a, b) => a.weight - b.weight || a.id.localeCompare(b.id));
  const selectedIds = await page.locator('.book[aria-pressed=true]').evaluateAll(buttons => buttons.map(b => b.dataset.bookId));
  assert.deepEqual(selectedIds.sort(), rankings.slice(0, 8).map(b => b.id).sort());
  assert.equal(await page.locator('.gallery canvas').count(), 8);
  const wrapWidth = () => page.locator('.gallery figure').first().evaluate(el => el.getBoundingClientRect().width);
  const desktopWidth = await wrapWidth();
  assert.equal(desktopWidth, 324);
  const settingsToggle = page.getByRole('button', { name: 'Print settings', exact: true });
  await settingsToggle.press('Enter');
  assert.equal(await settingsToggle.getAttribute('aria-expanded'), 'false');
  assert(await page.getByLabel('Book height (mm)').isHidden());
  assert(await download.isVisible());
  await page.reload();
  await page.locator('.workshop:not([inert])').waitFor();
  assert.equal(await settingsToggle.getAttribute('aria-expanded'), 'false');
  await settingsToggle.press('Space');
  assert(await page.getByLabel('Book height (mm)').isVisible());
  const physical = page.getByRole('group', { name: 'Physical', exact: true });
  const visual = page.getByRole('group', { name: 'Visual', exact: true });
  assert.equal(await physical.getByRole('spinbutton').count(), 4);
  assert.equal(await visual.getByRole('combobox').count(), 5);
  const rangeImage = await visual.getByRole('slider', { name: 'Background saturation' }).screenshot();
  const track = await sharp(rangeImage).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const trackPixel = (x, y) => {
    const offset = (Math.floor(track.info.height * y) * track.info.width + Math.floor(track.info.width * x)) * track.info.channels;
    return [...track.data.subarray(offset, offset + 3)];
  };
  assert.notDeepEqual(trackPixel(0.25, 0.5), trackPixel(0.75, 0.5), 'the filled and remaining track must be visible');
  assert.notDeepEqual(trackPixel(0.75, 0.5), trackPixel(0.75, 0.1), 'the remaining track must stand out from the panel');
  const bookHeight = physical.getByLabel('Book height (mm)');
  const spineWidth = physical.getByLabel('Spine (mm)');
  assert.equal(await bookHeight.inputValue(), '40');
  assert.equal(await spineWidth.inputValue(), '7');
  const texture = visual.getByLabel('Texture');
  const transform = visual.getByLabel('Text transform');
  assert.equal(await transform.inputValue(), 'uppercase');
  assert.equal(await texture.inputValue(), 'leather');
  const lettering = page.getByLabel('Spine text effect');
  assert.equal(await lettering.inputValue(), 'dynamic');
  const stored = () => page.evaluate(() => localStorage.getItem('book-magnets.settings.v1'));
  assert.equal(await stored(), null);
  const search = page.getByLabel('Search covers');
  const sort = page.getByRole('combobox', { name: 'Sort by', exact: true });
  const libraryOrder = () => page.locator('.book').evaluateAll(rows => rows.map(row => row.dataset.bookId));
  const proofOrder = () => page.locator('.gallery input').evaluateAll(inputs => inputs.map(input => input.getAttribute('aria-label')));
  const initialProof = await proofOrder();
  assert.equal(await sort.inputValue(), 'ranking');
  const rankOrder = await libraryOrder();
  assert.deepEqual(rankOrder.slice(0, 8).sort(), selectedIds);
  const weights = new Map(rankings.map(book => [book.id, book.weight]));
  assert.deepEqual(rankOrder.slice(0, rankings.length).map(id => weights.get(id)), rankings.map(book => book.weight));
  await sort.selectOption('series');
  const seriesOrder = await libraryOrder();
  assert(seriesOrder.indexOf('iron_prince') > seriesOrder.indexOf('soul_relic'));
  assert(seriesOrder.indexOf('wandering-inn-2') < seriesOrder.indexOf('wandering-inn-10'));
  await sort.selectOption('author');
  const authorOrder = await libraryOrder();
  assert(authorOrder.indexOf('iron_prince') < authorOrder.indexOf('soul_relic'));
  assert.deepEqual(await proofOrder(), initialProof);
  assert.deepEqual(JSON.parse(await stored()), { librarySort: 'author' });
  await page.reload();
  await page.locator('.workshop:not([inert])').waitFor();
  assert.equal(await sort.inputValue(), 'author');
  assert.deepEqual(await libraryOrder(), authorOrder);
  assert.deepEqual(await proofOrder(), initialProof);
  await sort.selectOption('ranking');
  assert.deepEqual(await libraryOrder(), rankOrder);
  assert.equal(await stored(), null);
  // The existing ranked Cradle selection represents the Foundation omnibus.
  const bookById = id => page.locator(`.book[data-book-id="${id}"]`);
  await search.fill('Cradle Omnibus Digital collection');
  assert.deepEqual(await page.locator('.book strong').allTextContents(), ['Foundation', 'Path of Gold', 'Rise of Lords', 'Ascension']);
  assert.equal(await bookById('cradle').getAttribute('aria-pressed'), 'true');
  await search.fill('Cradle Unsouled');
  const originalUnsouled = bookById('cradle-standard-1');
  const torUnsouled = bookById('cradle-special-tor-1');
  assert.match(await originalUnsouled.innerText(), /Cradle 1 · Original ebook/);
  assert.match(await torUnsouled.innerText(), /Cradle 1 · Tor UK/);
  assert.notEqual(await originalUnsouled.locator('img').getAttribute('src'), await torUnsouled.locator('img').getAttribute('src'));
  await search.fill('Cradle Threshold');
  assert.match(await bookById('cradle-standard-13').innerText(), /Cradle · Short-story collection · Original ebook/);
  assert.match(await bookById('cradle-special-tor-13').innerText(), /Cradle · Short-story collection · Tor UK/);

  // Two editions of the same volume must be independently selectable and persist across refresh.
  const hardcover = page.locator('.book[data-book-id="carl-print-1"]');
  const originalEdition = page.locator('.book[data-book-id="dungeon_crawler_carl"]');
  await search.fill('Carl hardcover');
  await hardcover.click();
  await page.reload();
  await page.locator('.workshop:not([inert])').waitFor();
  assert.equal(await hardcover.getAttribute('aria-pressed'), 'true');
  assert.equal(await originalEdition.getAttribute('aria-pressed'), 'true');
  assert.notEqual(await hardcover.locator('img').getAttribute('src'), await originalEdition.locator('img').getAttribute('src'));
  await hardcover.click();
  assert.equal(await originalEdition.getAttribute('aria-pressed'), 'true');
  const volumeButton = title => page.locator('.book').filter({ has: page.getByText(title, { exact: true }) });
  const spineTitle = title => page.getByLabel('Spine title for ' + title, { exact: true });
  await search.fill('Manifestation');
  assert.deepEqual(await page.locator('.book strong').allTextContents(), volumes);
  assert.equal(new Set(await page.locator('.book img').evaluateAll(images => images.map(img => img.src))).size, 6);
  assert.equal(await spineTitle('Soul Relic').inputValue(), 'Manifestation');
  for (const title of volumes.slice(1)) await volumeButton(title).click();
  await page.reload();
  await page.locator('.workshop:not([inert])').waitFor();
  for (const title of volumes) assert.equal(await spineTitle(title).inputValue(), title);
  for (const title of volumes.slice(0, -1)) await volumeButton(title).click();
  assert.equal(await spineTitle('Sovereign').inputValue(), 'Manifestation');
  await spineTitle('Sovereign').fill('Sovereign');
  await page.reload();
  await page.locator('.workshop:not([inert])').waitFor();
  assert.equal(await spineTitle('Sovereign').inputValue(), 'Sovereign');
  await spineTitle('Sovereign').fill('');
  await page.evaluate(() => localStorage.removeItem('book-magnets.settings.v1'));
  await page.reload();
  await page.locator('.workshop:not([inert])').waitFor();
  await transform.selectOption('title');
  assert.deepEqual(JSON.parse(await stored()), { transform: 'title' });
  await page.reload();
  await page.locator('astro-island:not([ssr]) .workshop:not([inert])').waitFor();
  assert.equal(await transform.inputValue(), 'title');
  await transform.selectOption('uppercase');
  assert.equal(await stored(), null);
  const fontPicker = page.getByLabel('Spine font', { exact: true });
  await page.waitForFunction(() => !document.querySelector('[aria-label="Spine font"]').disabled);
  const preferredNames = ['Gill Sans', 'Palatino', 'Palatino Linotype', 'Hoefler Text', 'Georgia', 'Baskerville'];
  const availableFonts = await page.evaluate(async names => {
    const available = [];
    for (const name of names) {
      try { await new FontFace('Test availability', 'local(' + JSON.stringify(name) + ')').load(); available.push(name); }
      catch { /* This machine doesn't expose the face. */ }
    }
    return available;
  }, preferredNames);
  assert.equal(await fontPicker.inputValue(), 'auto');
  assert.equal(await fontPicker.locator('option:checked').textContent(), 'Default · ' + (availableFonts[0] ?? 'Inter (bundled)'));
  const result = await capture();
  const first = result['sheet-01.png'];
  const meta = await sharp(first).metadata();
  assert.deepEqual([meta.width, meta.height, meta.density], [4961, 7016, 600]);
  const bundledId = availableFonts.length ? 'bundled' : 'auto';
  if (availableFonts.length) {
    await fontPicker.selectOption(bundledId);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Spine font"]').disabled);
    assert.equal(await fontPicker.inputValue(), 'bundled');
  }
  const inter = availableFonts.length ? await capture() : result;
  assert.deepEqual(Buffer.from(inter['fonts/Inter.woff2']), await readFile('src/assets/fonts/inter-v20-latin.woff2'));
  assert(inter['fonts/Inter-OFL.txt']);
  if (availableFonts.length) assert(!Buffer.from(inter['sheet-01.png']).equals(first), 'the automatically selected font must reach the export');
  await fontPicker.selectOption('auto');
  assert.equal(await page.evaluate(() => localStorage.getItem('book-magnets.font.v1')), null);
  const { data, info } = await sharp(first).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => {
    const i = (Math.round(y * info.height / 297) * info.width + Math.round(x * info.width / 210)) * info.channels;
    return [...data.subarray(i, i + 3)];
  };
  assert(pixel(10, 20).some(channel => channel > 10)); // colour-matched leather back
  function assertBlackStrip(left, top, right, bottom) {
    const x = mm => Math.round(mm * info.width / 210);
    const y = mm => Math.round(mm * info.height / 297);
    for (let row = y(top); row < y(bottom); row++) {
      const start = (row * info.width + x(left)) * info.channels;
      const end = (row * info.width + x(right)) * info.channels;
      assert(data.subarray(start, end).every(v => v === 0), 'the entire gap between wraps should print black');
    }
  }
  const gap = 0.3; // specified physical spacing, in mm
  for (const left of [65, 122 + gap]) assertBlackStrip(left, 8, left + gap, 128 + 2 * gap);
  for (const top of [48, 88 + gap]) assertBlackStrip(8, top, 179 + 2 * gap, top + gap);
  assert(pixel(48, 48.4).some(channel => channel > 10), 'artwork resumes after the row gap');
  assert(pixel(65.4, 20).some(channel => channel > 0), 'artwork resumes after the column gap');
  assert.equal(await page.getByRole('button', { name: 'Download 1 sheet', exact: true }).count(), 1);
  assert(pixel(44, 20).some(channel => channel > 12)); // original front cover
  assert(pixel(8, 7).some(channel => channel > 60)); // trim mark at the back edge
  assert(pixel(33, 7).some(channel => channel > 60)); // first fold
  assert(pixel(40, 7).some(channel => channel > 60)); // second fold
  assert(pixel(65, 7).some(channel => channel > 60)); // front edge
  assert(pixel(65 + gap, 7).some(channel => channel > 60)); // next wrap's back edge
  assert(Buffer.from((await capture())['sheet-01.png']).equals(first), 'repeated exports must match');

  await bookHeight.fill('25');
  await spineWidth.fill('5');
  await page.getByLabel('Paper', { exact: true }).selectOption('Custom');
  await page.getByLabel('Paper width (mm)').fill('54');
  await page.getByLabel('Paper height (mm)').fill('50');
  assert.equal(await page.getByRole('button', { name: 'Sheet', exact: true }).count(), 0);
  assert.equal(await page.locator('.gallery canvas').count(), 8);
  await page.getByLabel('Binding', { exact: true }).selectOption('none');
  const fontFile = 'src/assets/fonts/architects-daughter-v20-latin.woff2';
  await page.getByLabel('Open font file', { exact: true }).setInputFiles(fontFile);
  await fontPicker.locator('option[value^=file-]').waitFor({ state: 'attached' });
  await page.waitForFunction(() => localStorage.getItem('book-magnets.font.v1')?.includes('file-'));
  await page.reload();
  await fontPicker.locator('option[value^=file-]').waitFor({ state: 'attached' });
  assert.equal(await bookHeight.inputValue(), '25');
  assert.equal(await spineWidth.inputValue(), '5');
  assert.equal(await page.getByLabel('Paper width (mm)').inputValue(), '54');
  assert.equal(await page.getByLabel('Binding', { exact: true }).inputValue(), 'none');
  const custom = await capture();
  assert.equal(Object.keys(custom).filter(k => k.endsWith('.png')).length, 8);
  assert.deepEqual(Buffer.from(custom['fonts/architects-daughter-v20-latin.woff2']), await readFile(fontFile));
  const small = await sharp(custom['sheet-08.png']).metadata();
  assert.deepEqual([small.width, small.height, small.density], [1276, 1181, 600]);

  await page.getByLabel('Paper width (mm)').fill('20');
  assert(await download.isDisabled());
  await page.getByLabel('Paper', { exact: true }).selectOption('US Letter');
  await page.getByRole('button', { name: 'Clear selection' }).click();
  assert(await download.isDisabled());
  await page.getByLabel('Search covers').fill('greatest archmage');
  await page.getByRole('button', { name: /The Greatest Archmage/ }).click();
  await page.getByLabel('Resolution (DPI)').fill('600');
  await bookHeight.fill('90');
  await page.getByText(/Below 600 DPI/).waitFor();
  await bookHeight.fill('25');
  await page.getByLabel(/Spine title for/).fill('Archmage');
  assert.equal(await wrapWidth(), desktopWidth, 'a single wrap keeps its desktop card width');
  await fontPicker.selectOption(bundledId);
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await page.getByLabel('Search covers').fill('Manifestation');
  await volumeButton('Soul Relic').click();
  await page.getByLabel('Paper', { exact: true }).selectOption('Custom');
  await page.getByLabel('Paper width (mm)').fill('54');
  await texture.selectOption('none');
  // Compare the optimiser and the canvas fallback on the same one-book sheet.
  const codecUrl = /squoosh_oxipng_bg[^/]*\.wasm/;
  await page.context().route(codecUrl, route => route.abort());
  let original;
  try { original = (await capture())['sheet-01.png']; }
  finally { await page.context().unroute(codecUrl); }
  const compressed = (await capture())['sheet-01.png'];
  assert(compressed.length < original.length, 'optimisation should reduce the PNG itself');
  assert((await sharp(original).ensureAlpha().raw().toBuffer()).equals(await sharp(compressed).ensureAlpha().raw().toBuffer()));
  assert.equal((await sharp(compressed).metadata()).density, 600);
  // The second volume is on another sheet, but both spines use their book titles.
  await volumeButton('Scion of Storms').click();
  assert(!(await sharp((await capture())['sheet-01.png']).raw().toBuffer()).equals(await sharp(compressed).raw().toBuffer()));
  await spineTitle('Soul Relic').fill('Manifestation');
  assert((await sharp((await capture())['sheet-01.png']).raw().toBuffer()).equals(await sharp(compressed).raw().toBuffer()));
  await spineTitle('Soul Relic').fill('');
  await volumeButton('Scion of Storms').click();
  async function sampleWrap() {
    const png = (await capture())['sheet-01.png'];
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x, y) => {
      const i = (Math.round(y * info.height / 50) * info.width + Math.round(x * info.width / 54)) * info.channels;
      return [...data.subarray(i, i + 3)];
    };
    const inks = new Map();
    for (let y = 10; y < 31; y += 0.05) {
      for (let x = 24; x < 28.3; x += 0.05) {
        const color = pixel(x, y);
        if (color[0] > 205) inks.set(color.join(','), (inks.get(color.join(',')) ?? 0) + 1);
      }
    }
    return { pixel, inks };
  }
  await lettering.selectOption('flat');
  await transform.selectOption('title');
  const plain = await sampleWrap();
  const saturation = visual.getByRole('slider', { name: 'Background saturation', exact: true });
  const darkness = visual.getByRole('slider', { name: 'Background darkness', exact: true });
  assert.equal(await saturation.inputValue(), '100');
  assert.equal(await darkness.inputValue(), '65');
  const originalBack = plain.pixel(10, 20);
  await saturation.press('Home');
  await darkness.press('Home');
  await page.reload();
  await page.locator('astro-island:not([ssr]) .workshop:not([inert])').waitFor();
  assert.equal(await saturation.inputValue(), '0');
  assert.equal(await darkness.inputValue(), '0');
  const neutral = await sampleWrap();
  const grey = neutral.pixel(10, 20);
  assert.equal(new Set(grey).size, 1, 'zero saturation produces a neutral back');
  assert.deepEqual(neutral.pixel(24, 10), grey, 'spine and back use the same adjusted colour');
  await page.waitForFunction(expected => {
    const c = document.querySelector('.gallery canvas');
    return c && [...c.getContext('2d').getImageData(10, 10, 1, 1).data].slice(0, 3).every((v, i) => v === expected[i]);
  }, grey);
  assert.deepEqual(neutral.pixel(34, 20), plain.pixel(34, 20), 'front-cover colours stay faithful');
  await saturation.press('End');
  const vivid = (await sampleWrap()).pixel(10, 20);
  assert(Math.max(...vivid) - Math.min(...vivid) > Math.max(...originalBack) - Math.min(...originalBack));
  await darkness.press('End');
  assert.deepEqual((await sampleWrap()).pixel(10, 20), [0, 0, 0]);
  for (const [slider, value] of [[saturation, '100'], [darkness, '65']]) {
    await slider.evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  }
  assert.equal(JSON.parse(await stored()).darkness, undefined);
  assert.equal(JSON.parse(await stored()).saturation, undefined);
  assert.deepEqual((await sampleWrap()).pixel(10, 20), originalBack);
  await transform.selectOption('uppercase');
  const uppercase = await sampleWrap();
  await transform.selectOption('small-caps');
  const smallCaps = await sampleWrap();
  assert.notDeepEqual(smallCaps.inks, uppercase.inks);
  assert.notDeepEqual(smallCaps.inks, plain.inks);
  assert.notDeepEqual(uppercase.inks, plain.inks);
  await transform.selectOption('title');
  const [gold, count] = [...plain.inks].sort((a, b) => b[1] - a[1])[0];
  const [r, g, b] = gold.split(',').map(Number);
  assert(r > 240 && g >= 183 && g <= 220 && b < 140 && g - b > 75, 'Manifestation title should yield saturated gold');
  assert.deepEqual(plain.pixel(10, 20), plain.pixel(24, 10));
  await texture.selectOption('gradient');
  const flatShadedBack = await sampleWrap();
  assert.equal(flatShadedBack.inks.get(gold), plain.inks.get(gold), 'background shading is independent of flat ink');
  await lettering.selectOption('gradient');
  const shaded = await sampleWrap();
  assert.deepEqual(shaded.pixel(10, 20), plain.pixel(10, 20));
  assert(shaded.pixel(28.3, 10)[0] < shaded.pixel(23.8, 10)[0]);
  assert((shaded.inks.get(gold) ?? 0) < count / 3, 'gradient must reach the foreground lettering');
  await texture.selectOption('leather');
  await lettering.selectOption('flat');
  await page.getByLabel('Binding', { exact: true }).selectOption('fillet');
  const leather = await sampleWrap();
  // Average the grain above the top fillet so the ink and rules can't affect the measurement.
  const leatherRed = x => Array.from({ length: 18 }, (_, i) => leather.pixel(x, 8.12 + i * 0.05)[0])
    .reduce((sum, value) => sum + value, 0) / 18;
  const crown = leatherRed(25.7);
  assert(crown > leatherRed(23.7) + 3 && crown > leatherRed(28.5) + 3, 'leather should shade both sides of the spine');
  assert(leather.inks.get(gold) > count * 0.5, 'grain must leave the printed ink intact');
  assert(new Set(Array.from({ length: 40 }, (_, i) => leather.pixel(10 + i * 0.07, 20).join(','))).size > 3);
  await texture.selectOption('gradient');
  const examples = [
    ['Manifestation', 'metallic'], ['Mother of Learning', 'metallic'], ['Dungeon Crawler Carl', 'flat'],
    ['Cradle', 'flat'], ['The Legend of William Oh', 'gradient'],
  ];
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await page.getByLabel('Paper width (mm)').fill('100');
  await page.getByLabel('Paper height (mm)').fill('110');
  for (const [title] of examples) {
    await page.getByLabel('Search covers').fill(title);
    await page.locator('.book').first().click();
  }
  await lettering.selectOption('dynamic');
  for (const [i, [, expected]] of examples.entries()) {
    const wrap = page.locator('.gallery figure').nth(i);
    await wrap.locator('canvas').scrollIntoViewIfNeeded();
    await wrap.locator('canvas[data-text-effect=' + expected + ']').waitFor();
  }
  const automatic = (await capture())['sheet-01.png'];
  async function extractSpine(png, index) {
    const ppm = 600 / 25.4;
    return sharp(png).extract({
      left: Math.ceil((23.625 + (index % 2) * (36.25 + gap)) * ppm),
      top: Math.ceil((8 + Math.floor(index / 2) * (25 + gap)) * ppm),
      width: Math.floor(5 * ppm) - 1, height: Math.floor(25 * ppm) - 1,
    }).raw().toBuffer();
  }
  for (const effect of ['flat', 'gradient', 'metallic']) {
    await lettering.selectOption(effect);
    const manual = (await capture())['sheet-01.png'];
    for (const [i, [title, expected]] of examples.entries()) {
      assert.equal((await extractSpine(automatic, i)).equals(await extractSpine(manual, i)), effect === expected,
        title + ' should match only its expected manual effect');
    }
  }
  await page.getByRole('button', { name: 'Compare five spine fillets' }).click();
  await page.locator('.samples button').last().waitFor();
  assert.equal(await page.locator('.samples button').count(), 5);
  const heads = new Set(), feet = new Set(), centres = new Set();
  for (const btn of await page.locator('.samples button').all()) {
    await btn.click();
    assert.equal(await btn.getAttribute('aria-pressed'), 'true');
    const png = (await capture())['sheet-01.png'];
    const region = async (top, height) => (await sharp(png).extract({ left: 560, top, width: 115, height }).raw().toBuffer()).toString('base64');
    heads.add(await region(190, 85)); centres.add(await region(275, 419)); feet.add(await region(694, 82));
  }
  assert.deepEqual([heads.size, centres.size, feet.size], [5, 1, 5], 'fillet styles change only the two ends');

  // Inspect the printed gaps around a long transformed title. A flat background
  // lets us separate the dark fillet strokes from the light lettering.
  await texture.selectOption('none');
  await lettering.selectOption('flat');
  await transform.selectOption('uppercase');
  await page.getByLabel('Spine (mm)').fill('2');
  await spineTitle('Soul Relic').fill('A very long title with a flourish at either end');
  const testPpm = 600 / 25.4;
  for (const style of ['fillet', 'double', 'weighted', 'tapered', 'diamond']) {
    await page.getByLabel('Binding', { exact: true }).selectOption(style);
    const png = (await capture())['sheet-01.png'];
    const { data, info } = await sharp(png).extract({
      left: Math.ceil(23.625 * testPpm) + 1, top: Math.ceil(8 * testPpm),
      width: Math.floor(2 * testPpm) - 2, height: Math.floor(25 * testPpm) - 1,
    }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const base = data[0];
    let lastHead = -1, firstFoot = info.height, firstInk = info.height, lastInk = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const r = data[(y * info.width + x) * 3];
        if (r > base + 70) { firstInk = Math.min(firstInk, y); lastInk = Math.max(lastInk, y); }
        if (r < base - 4) {
          if (y < info.height / 2) lastHead = Math.max(lastHead, y);
          else firstFoot = Math.min(firstFoot, y);
        }
      }
    }
    assert(lastHead >= 0 && firstFoot < info.height && lastInk >= firstInk);
    assert(Math.min(firstInk - lastHead, firstFoot - lastInk) >= 0.75 * testPpm - 2, style + ' should clear the ink at both ends');
  }
  const bounds = async selector => page.locator(selector).boundingBox();
  const settings = await bounds('.settings'), proof = await bounds('.proof'), library = await bounds('.catalogue');
  assert(settings.y + settings.height <= proof.y + 1);
  assert(Math.abs(library.y + library.height - proof.y - proof.height) < 2);
  assert(await page.locator('.gallery').evaluate(el => el.scrollHeight === el.clientHeight && el.clientWidth === el.scrollWidth));

  // Compare every wrap and fillet sample, including those currently off-screen.
  const selector = '.gallery canvas, .samples canvas';
  const snapshots = () => page.locator(selector).evaluateAll(nodes => nodes.map(c => c.toDataURL()));
  const before = await snapshots();
  await page.context().grantPermissions(['local-fonts']);
  await fontPicker.selectOption('list');
  await fontPicker.locator('option[value^=device-]').first().waitFor({ state: 'attached' });
  const device = await fontPicker.locator('option[value^=device-]').evaluateAll(nodes =>
    (nodes.find(n => n.textContent === 'Georgia') ?? nodes[0]).value);
  await fontPicker.selectOption(device);
  await page.waitForFunction(({before, selector}) => [...document.querySelectorAll(selector)]
    .every((c, i) => c.toDataURL() !== before[i]), {before, selector});
  const deviceExport = await capture();
  assert(Object.keys(deviceExport).some(name => /^fonts\/.+\.(ttf|otf|ttc)$/.test(name)), 'include the selected font bytes');
  await fontPicker.selectOption('auto');
  await page.setViewportSize({ width: 375, height: 812 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await wrapWidth(), await page.locator('.gallery').evaluate(el => el.getBoundingClientRect().width));
  await page.getByRole('button', { name: 'Clear selection' }).click();
  for (const name of ['Mage Errant', 'Mother of Learning']) {
    await page.getByLabel('Search covers').fill(name);
    await page.locator('.book').first().click();
  }
  await page.getByLabel('Spine title for Mage Errant', { exact: true }).fill('Into the Labyrinth');
  await page.getByLabel('Spine (mm)').fill('5');
  await page.getByLabel('Resolution (DPI)').fill('300');
  await page.getByLabel('Paper', { exact: true }).selectOption('A4');
  await page.reload();
  await page.locator('astro-island:not([ssr]) .workshop:not([inert])').waitFor();
  assert.equal(await page.locator('.gallery canvas').count(), 2);
  assert.equal(await page.getByLabel('Spine title for Mage Errant').inputValue(), 'Into the Labyrinth');
  assert.equal(await page.getByLabel('Resolution (DPI)').inputValue(), '300');
  assert.equal(await page.evaluate(() => localStorage.getItem('book-magnets.font.v1')), null);

  // Compare both render paths to an independent centred crop of each original.
  // At 1.6 these covers lose width. At 1.0 they lose height.
  for (const ratio of [1.6, 1]) {
    await page.getByLabel('Height / width').fill(String(ratio));
    const sheetPng = (await capture())['sheet-01.png'];
    const face = 25 / ratio, wrap = 2 * face + 5;
    for (const [i, id] of ['mage_errant', 'mother_of_learning'].entries()) {
      const canvas = page.locator('.gallery canvas').nth(i);
      await page.waitForFunction(({ i, wrap }) => {
        const c = document.querySelectorAll('.gallery canvas')[i];
        return c.width >= 900 && Math.abs(c.width / c.height - wrap / 25) < 0.01;
      }, { i, wrap });
      const preview = Buffer.from(await canvas.evaluate(c => c.toDataURL().split(',')[1]), 'base64');
      const dimensions = await sharp(preview).metadata();
      const target = { width: Math.round(60 / ratio), height: 60 };
      const expected = await sharp('content/reviews/' + id + '/cover.jpg').resize({ ...target, fit: 'cover', position: 'centre' }).removeAlpha().raw().toBuffer();
      for (const [png, left, top, scale] of [
        [preview, face + 5, 0, dimensions.width / wrap],
        [sheetPng, 8 + i * (wrap + gap) + face + 5, 8, 300 / 25.4],
      ]) {
        const actual = await sharp(png).extract({ left: Math.round(left * scale), top: Math.round(top * scale),
          width: Math.floor(face * scale), height: Math.floor(25 * scale) }).resize({ ...target, fit: 'fill' }).removeAlpha().raw().toBuffer();
        const meanError = actual.reduce((sum, v, j) => sum + Math.abs(v - expected[j]), 0) / actual.length;
        assert(meanError < 6, id + ' should have a centred, full-bleed front (mean error ' + meanError + ')');
      }
    }
  }
  // The yellow illustrations on these hardcovers compete with the solid title ink.
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await search.fill('Carl hardcover');
  await page.getByLabel('Height / width').fill('1.6');
  await lettering.selectOption('dynamic');
  // Use the undarkened source colour so shading cannot mask a bad sample.
  await darkness.press('Home');
  const hardcovers = [
    { id: 'carl-print-2', ink: (r, g, b) => r > 210 && g < 100 && b > 150 },
    { id: 'carl-print-3', ink: (r, g, b) => r > 210 && g < 100 && b < 100 },
  ];
  for (const { id } of hardcovers) await page.locator(`.book[data-book-id="${id}"]`).click();
  const hardcoverSheet = (await capture())['sheet-01.png'];
  for (const [i, { id, ink }] of hardcovers.entries()) {
    const proof = page.locator('.gallery figure').nth(i);
    await proof.locator('canvas[data-text-effect=flat]').waitFor();
    const preview = Buffer.from(await proof.locator('canvas').evaluate(c => c.toDataURL().split(',')[1]), 'base64');
    const face = 25 / 1.6, wrap = 2 * face + 5;
    for (const [source, left, top, scale] of [
      [preview, face, 0, (await sharp(preview).metadata()).width / wrap],
      [hardcoverSheet, 8 + i * (wrap + gap) + face, 8, 300 / 25.4],
    ]) {
      const pixels = await sharp(source).extract({
        left: Math.ceil(left * scale), top: Math.ceil(top * scale),
        width: Math.floor(5 * scale) - 1, height: Math.floor(25 * scale) - 1,
      }).removeAlpha().raw().toBuffer();
      const back = await sharp(source).extract({
        left: Math.round((left - face / 2) * scale), top: Math.round((top + 12.5) * scale), width: 1, height: 1,
      }).removeAlpha().raw().toBuffer();
      assert(Math.max(...back) <= 6, id + ' should have a black back');
      let matching = 0, black = 0;
      for (let p = 0; p < pixels.length; p += 3) {
        if (ink(pixels[p], pixels[p + 1], pixels[p + 2])) matching++;
        if (Math.max(pixels[p], pixels[p + 1], pixels[p + 2]) <= 6) black++;
      }
      assert(matching > pixels.length / 3 * 0.01, id + ' should use the cover title colour on its spine');
      assert(black > pixels.length / 3 * 0.75, id + ' should have a black spine behind the lettering');
    }
  }
  const firstProof = page.locator('.gallery figure').first();
  const stylePicker = firstProof.getByRole('combobox');
  const swatch = firstProof.getByRole('button', { name: /^Spine text colour for/ });
  await swatch.click();
  const colourPicker = firstProof.getByLabel('Hex', { exact: true });
  const initialColour = await colourPicker.inputValue();
  await firstProof.getByRole('button', { name: 'Pick from cover' }).click();
  const front = firstProof.getByRole('button', { name: 'Sample a pixel from the front cover' });
  await front.scrollIntoViewIfNeeded();
  const box = await front.boundingBox();
  const point = { x: Math.floor(box.x + box.width / 2), y: Math.floor(box.y + box.height / 2) };
  const sampled = await firstProof.locator('canvas').evaluate((canvas, pt) => {
    const r = canvas.getBoundingClientRect();
    const pixel = canvas.getContext('2d').getImageData(Math.floor((pt.x-r.left)*canvas.width/r.width), Math.floor((pt.y-r.top)*canvas.height/r.height), 1, 1).data;
    return '#' + [...pixel.slice(0,3)].map(c => c.toString(16).padStart(2,'0')).join('');
  }, point);
  await page.mouse.click(point.x, point.y);
  await swatch.click();
  assert.equal(await colourPicker.inputValue(), sampled);
  await stylePicker.selectOption('flat');
  if (!(await colourPicker.isVisible())) await swatch.click();
  await colourPicker.fill('#12f792');
  await page.reload();
  await page.locator('.workshop:not([inert])').waitFor();
  assert.equal(await stylePicker.inputValue(), 'flat');
  await swatch.click();
  assert.equal(await colourPicker.inputValue(), '#12f792');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.gallery figure').nth(1).getByRole('combobox').inputValue(), '');
  const customisedSheet = (await capture())['sheet-01.png'];
  const countInk = async png => {
    const pixels = await sharp(png).extract({
      left: Math.ceil((8 + 25 / 1.6) * 300 / 25.4), top: Math.ceil(8 * 300 / 25.4),
      width: 55, height: 290,
    }).removeAlpha().raw().toBuffer();
    let hits = 0;
    for (let p = 0; p < pixels.length; p += 3)
      if (pixels[p] === 18 && pixels[p + 1] === 247 && pixels[p + 2] === 146) hits++;
    return hits;
  };
  assert(await countInk(customisedSheet) > 10);
  assert.equal(await countInk(hardcoverSheet), 0);
  await stylePicker.selectOption('metallic');
  assert(!(await sharp((await capture())['sheet-01.png']).raw().toBuffer()).equals(await sharp(customisedSheet).raw().toBuffer()));
  await swatch.click();
  await firstProof.getByRole('button', { name: 'Use cover colour' }).click();
  await stylePicker.selectOption('');
  await swatch.click();
  assert.equal(await colourPicker.inputValue(), initialColour);
  assert.equal(JSON.parse(await stored()).spineStyles, undefined);
  await page.keyboard.press('Escape');
  const backgroundSwatch = firstProof.getByRole('button', { name: /^Background colour for/ });
  await backgroundSwatch.click();
  await colourPicker.fill('#2389ab');
  await page.keyboard.press('Escape');
  await saturation.press('Home');
  await darkness.press('End');
  await page.reload();
  await page.locator('.workshop:not([inert])').waitFor();
  await backgroundSwatch.click();
  assert.equal(await colourPicker.inputValue(), '#2389ab');
  await page.keyboard.press('Escape');
  const customBackgroundSheet = (await capture())['sheet-01.png'];
  const backPixel = await sharp(customBackgroundSheet).extract({
    left: Math.ceil(12 * 300 / 25.4), top: Math.ceil(12 * 300 / 25.4), width: 1, height: 1,
  }).removeAlpha().raw().toBuffer();
  assert.deepEqual([...backPixel], [35, 137, 171]);
  await backgroundSwatch.click();
  await firstProof.getByRole('button', { name: 'Use cover colour' }).click();
  assert.equal(JSON.parse(await stored()).spineStyles, undefined);
  assert.deepEqual(errors, []);
  console.log('Passed default and custom exports, repeatability, cut and fold positions, pagination, fonts, resolution warnings and mobile layout.');
} finally {
  await browser.close();
}
