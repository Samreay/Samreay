import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import sharp from 'sharp';
import { glob } from 'glob';
import matter from 'gray-matter';
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((x, i, a) => (x.startsWith('--') ? [x.slice(2), a[i + 1]?.startsWith('--') ? true : (a[i + 1] ?? true)] : []))
    .filter((x) => x.length)
);
const base = args['base-url'] || 'http://127.0.0.1:4321';
const output = args.output;
assert(output, '--output required');
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
// Resolve source files independently of generated URLs so a wrong-book image
// cannot pass simply because its descriptor matches its own file.
async function sourceInventory() {
  const colocated = (await glob('content/**/{cover,thumbnail}.{jpg,jpeg,png,webp,gif}')).sort();
  const bundled = (await glob('src/assets/img/covers/*.{jpg,jpeg,png,webp}')).sort();
  const placeholders = (await glob('src/assets/img/jeff/placeholder_*.{jpg,jpeg,png,webp}')).sort(
    (a, b) => Number(a.match(/_(\d+)\./)[1]) - Number(b.match(/_(\d+)\./)[1])
  );
  const rows = [];
  for (const file of (await glob('content/reviews/*/index.md')).sort()) {
    const id = file.split('/').at(-2);
    const { data } = matter(await readFile(file, 'utf8'));
    const explicit = data.images?.[0];
    const original =
      (explicit &&
        colocated.find((p) => p.includes('/' + id + '/') && p.toLowerCase().endsWith(explicit.toLowerCase()))) ||
      colocated.find((p) => p.includes('/' + id + '/')) ||
      bundled.find((p) => path.basename(p).split('.')[0] === id) ||
      placeholders[((new Date(data.date).getDate() || 1) - 1) % placeholders.length];
    const { width, height, format } = await sharp(original).metadata();
    rows.push({ id, name: data.name, original, width, height, format });
  }
  return rows;
}
const inventory = args.inventory ? JSON.parse(await readFile(args.inventory)) : await sourceInventory();
await writeFile(path.join(output, 'source-inventory.json'), JSON.stringify(inventory, null, 2));
const originals = Object.fromEntries(inventory.map((p) => [p.id, p]));
const samples = ['cradle', 'bastion', 'mother_of_learning', 'dungeon_crawler_carl', 'greatest_archmage'].filter(
  (id) => originals[id]
);
const profiles = [
  [375, 812, 3],
  [390, 844, 3],
  [430, 932, 3],
  [412, 915, 4],
  [1350, 940, 1],
  [1350, 940, 2],
];
const result = { base, baseline: !!args.baseline, samples, browsers: {}, rows: [], exports: [], behavior: [] };
const save = () => writeFile(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
const decode = ([t, v]) =>
  t === 1
    ? v.map(decode)
    : t === 0
      ? v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]))
        : v
      : undefined;
async function ready(page) {
  await page.locator('astro-island[component-url*="ReviewsExplorer"]:not([ssr])').waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function postsFor(page) {
  const raw = await page.locator('astro-island[component-url*="ReviewsExplorer"]').getAttribute('props');
  return decode(JSON.parse(raw).posts);
}
async function identity(page, posts) {
  const data = await page.locator('[data-review-card]').evaluateAll((cards) =>
    cards.map((c) => {
      const i = c.querySelector('img');
      return {
        link: c.querySelector('a').getAttribute('href'),
        title: c.querySelector('.leader,.tier-title')?.textContent.trim(),
        alt: i?.alt,
        src: i?.getAttribute('src'),
        srcset: i?.getAttribute('srcset'),
        currentSrc: i?.currentSrc,
      };
    })
  );
  for (const d of data) {
    const p = posts.find((p) => p.link === d.link);
    assert(p, 'unknown card ' + d.link);
    if (p.video) continue;
    assert.equal(d.alt, p.name);
    if (d.title) assert.equal(d.title, p.name);
    assert.equal(d.src, p.img, 'src belongs to another book ' + d.link);
    if (p.cover) assert.equal(d.srcset, p.cover.srcset);
    if (d.currentSrc)
      assert(
        [p.img, ...(p.cover?.srcset || '').split(',').map((s) => s.trim().split(' ')[0])].some(
          (s) => s && new URL(s, base).href === d.currentSrc
        ),
        'selected wrong book ' + d.link
      );
  }
  return data.length;
}
async function measure(page, selector) {
  return page.locator(selector).evaluate((i) => {
    const b = i.getBoundingClientRect();
    const r = performance.getEntriesByName(i.currentSrc).at(-1);
    return {
      src: i.currentSrc,
      srcset: i.getAttribute('srcset'),
      sizes: i.getAttribute('sizes'),
      css: { width: b.width, height: b.height },
      dpr: devicePixelRatio,
      natural: { width: i.naturalWidth, height: i.naturalHeight },
      transferBytes: r?.transferSize,
      decodedBodyBytes: r?.decodedBodySize,
      loading: i.loading,
    };
  });
}
async function inspect(page, engine, profile, layout, id) {
  const selector = `a[href="/reviews/${id}/"] img`;
  const img = page.locator('[data-review-card] ' + selector);
  await img.scrollIntoViewIfNeeded();
  await img.evaluate((i) => i.decode());
  await page.waitForTimeout(60);
  const row = { browser: engine, profile, layout, id, ...(await measure(page, '[data-review-card] ' + selector)) };
  row.caption = await img.evaluate(
    (i) => i.closest('[data-review-card]').querySelector('.tier-title')?.style.backgroundColor
  );
  assert.equal(row.loading, 'lazy');
  if (layout === 'tier' && id === 'bastion') assert(row.caption, 'loaded cover did not tint its caption');
  const data = Buffer.from(await (await page.request.get(row.src)).body());
  const meta = await sharp(data).metadata();
  row.selected = { width: meta.width, height: meta.height, bytes: data.length, format: meta.format };
  const original = originals[id];
  row.original = { width: original.width, height: original.height, path: original.original };
  row.resolutionOK =
    meta.width + 2 >= Math.min(original.width, row.css.width * row.dpr) &&
    meta.height + 3 >= Math.min(original.height, row.css.height * row.dpr);
  // References preserve the UI's existing 5:8 stretch, without cropping.
  const stem = `${engine}-${profile.join('x')}-${layout}-${id}`;
  await img.screenshot({ path: path.join(output, stem + '.png'), scale: 'device', animations: 'disabled' });
  const screen = await sharp(path.join(output, stem + '.png')).metadata();
  await sharp(original.original)
    .resize(screen.width, screen.height, { fit: 'fill' })
    .png()
    .toFile(path.join(output, stem + '-reference.png'));
  result.rows.push(row);
  if (!args.baseline) assert(row.resolutionOK, JSON.stringify(row));
}
async function exportList(page, engine, layout, mode) {
  await page.locator('#search-input').fill(mode === 'short' ? 'cradle' : '');
  await page.locator(`label[for="layout_${layout}"]`).click();
  const row = { browser: engine, layout, mode };
  result.exports.push(row);
  const wait = Promise.race([
    page.waitForEvent('download', { timeout: 180000 }),
    page
      .waitForEvent('console', {
        predicate: (m) => m.type() === 'error' && m.text().includes('Screenshot failed'),
        timeout: 180000,
      })
      .then((m) => {
        throw new Error(m.text());
      }),
  ]);
  await page.getByRole('button', { name: 'Download a screenshot of the current view' }).click();
  await page.locator('.screenshotting').waitFor();
  row.geometry = await page.evaluate((layout) => {
    const root = document.querySelector(layout === 'tier' ? '#all-card-wrapper' : '[data-capture-root]');
    const r = root.getBoundingClientRect();
    return {
      width: r.width,
      height: r.height,
      dpr: devicePixelRatio,
      images: [...root.querySelectorAll('img')].map((i) => {
        const b = i.getBoundingClientRect();
        return { src: i.currentSrc || i.src, alt: i.alt, x: b.x - r.x, y: b.y - r.y, width: b.width, height: b.height };
      }),
    };
  }, layout);
  const download = await wait;
  const file = path.join(output, `${engine}-${mode}-${layout}-${download.suggestedFilename()}`);
  await download.saveAs(file);
  row.file = file;
  const meta = await sharp(file).metadata();
  row.output = { width: meta.width, height: meta.height, format: meta.format };
  assert(meta.width <= 8000 && meta.height <= 8000 && meta.width * meta.height <= 16000000 + 16000);
  assert(file.endsWith('.' + meta.format));
  const scale = meta.width / row.geometry.width;
  const verticalScale = meta.height / row.geometry.height;
  row.pixelChecks = [];
  for (const img of row.geometry.images) {
    const source = inventory.find((p) => p.name === img.alt);
    assert(source);
    const left = Math.round((img.x + img.width * 0.1) * scale),
      top = Math.round((img.y + img.height * 0.1) * verticalScale),
      width = Math.max(1, Math.round(img.width * 0.8 * scale)),
      height = Math.max(1, Math.round(img.height * 0.8 * verticalScale));
    if (left < 0 || top < 0 || left + width > meta.width || top + height > meta.height) {
      row.pixelChecks.push({ id: source.id, error: 'out of bounds' });
      continue;
    }
    const actual = await sharp(file)
      .extract({ left, top, width, height })
      .resize(32, 48, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
    const reference = await sharp(source.original)
      .extract({
        left: Math.round(source.width * 0.1),
        top: Math.round(source.height * 0.1),
        width: Math.round(source.width * 0.8),
        height: Math.round(source.height * 0.8),
      })
      .resize(32, 48, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
    let sum = 0;
    for (let i = 0; i < actual.length; i++) sum += Math.abs(actual[i] - reference[i]);
    row.pixelChecks.push({ id: source.id, mae: sum / actual.length });
  }
  row.failedPixels = row.pixelChecks.filter((p) => p.error || p.mae > 30);
  if (!args.baseline) assert.equal(row.failedPixels.length, 0, JSON.stringify(row.failedPixels));
  if (mode === 'short' && !args.baseline) {
    // Cradle's small lettering catches a sharp source being rasterized at 1x
    // and then enlarged for a 2x export. The observed WebKit failure scored 0.12.
    const img = row.geometry.images[0];
    const source = inventory.find((p) => p.name === img.alt);
    const box = {
      left: Math.round(img.x * scale),
      top: Math.round(img.y * verticalScale),
      width: Math.round(img.width * scale),
      height: Math.round(img.height * verticalScale),
    };
    const region = {
      left: Math.round(box.width * 0.08),
      top: Math.round(box.height * 0.7875),
      width: Math.round(box.width * 0.8),
      height: Math.round(box.height * 0.15),
    };
    const exported = await sharp(file).extract(box).png().toBuffer();
    const reference = await sharp(source.original).resize(box.width, box.height, { fit: 'fill' }).png().toBuffer();
    const energy = async (buffer) => {
      const pixels = await sharp(buffer).extract(region).greyscale().raw().toBuffer();
      let sum = 0;
      for (let y = 1; y < region.height - 1; y++)
        for (let x = 1; x < region.width - 1; x++) {
          const i = y * region.width + x;
          const edge =
            4 * pixels[i] - pixels[i - 1] - pixels[i + 1] - pixels[i - region.width] - pixels[i + region.width];
          sum += edge * edge;
        }
      return sum;
    };
    row.letteringEdgeRatio = (await energy(exported)) / (await energy(reference));
    assert(row.letteringEdgeRatio >= 0.5, `export lost fine lettering: ${row.letteringEdgeRatio}`);
  }
  console.log('export', engine, layout, mode, row.output, 'bad covers', row.failedPixels.length);
  await save();
  return row;
}

async function deferredCover(page, posts) {
  const post = posts.at(-1);
  const urls = new Set(
    [post.img, ...(post.cover?.srcset || '').split(',').map((s) => s.trim().split(' ')[0])]
      .filter(Boolean)
      .map((s) => new URL(s, base).href)
  );
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const matches = (url) => urls.has(url.href);
  await page.route(matches, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto(base + '/reviews/?l=cover', { waitUntil: 'domcontentloaded' });
    await ready(page);
    const img = page.locator(`[data-review-card] a[href="${post.link}"] img`);
    const before = await img.boundingBox();
    const listBefore = await page.locator('#all-card-wrapper').boundingBox();
    assert.equal(await img.getAttribute('loading'), 'lazy');
    await img.scrollIntoViewIfNeeded();
    assert.equal(await img.evaluate((i) => i.naturalWidth), 0, 'deferred cover unexpectedly loaded before release');
    release();
    await img.evaluate((i) => i.decode());
    const after = await img.boundingBox();
    const listAfter = await page.locator('#all-card-wrapper').boundingBox();
    assert(Math.abs(before.width - after.width) < 0.1 && Math.abs(before.height - after.height) < 0.1);
    assert(Math.abs(listBefore.height - listAfter.height) < 0.1, 'image decode moved the grid');
    await identity(page, posts);
    return { link: post.link, before, after, listHeightBefore: listBefore.height, listHeightAfter: listAfter.height };
  } finally {
    release();
    await page.unroute(matches);
  }
}
for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  if (args.browser && args.browser !== engineName) continue;
  const browser = await engine.launch();
  result.browsers[engineName] = browser.version();
  try {
    if (!args['exports-only'] && !args['upscale-only'])
      for (const profile of profiles) {
        if (args.profile && args.profile !== profile.join('x')) continue;
        const [width, height, deviceScaleFactor] = profile;
        for (const layout of ['wide', 'cover', 'tier']) {
          const context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor,
            isMobile: width < 600,
            hasTouch: width < 600,
          });
          await context.addInitScript(() => {
            window.coverIdentityFailures = [];
            const revive = ([t, v]) =>
              t === 1
                ? v.map(revive)
                : t === 0
                  ? v && typeof v === 'object'
                    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]))
                    : v
                  : undefined;
            let posts;
            const check = () => {
              const island = document.querySelector('astro-island[component-url*="ReviewsExplorer"]');
              if (island && !posts) posts = revive(JSON.parse(island.getAttribute('props')).posts);
              if (posts)
                for (const img of document.querySelectorAll('[data-review-card] img')) {
                  const box = img.getBoundingClientRect();
                  if (
                    !img.currentSrc ||
                    box.bottom < 0 ||
                    box.top > innerHeight ||
                    getComputedStyle(img).visibility === 'hidden'
                  )
                    continue;
                  const link = img.closest('a').getAttribute('href');
                  const post = posts.find((p) => p.link === link);
                  const sources = post && [
                    post.img,
                    ...(post.cover?.srcset || '').split(',').map((s) => s.trim().split(' ')[0]),
                  ];
                  if (post && !sources.some((s) => s && new URL(s, document.baseURI).href === img.currentSrc)) {
                    window.coverIdentityFailures.push({ link, alt: img.alt, currentSrc: img.currentSrc });
                  }
                }
              requestAnimationFrame(check);
            };
            requestAnimationFrame(check);
          });
          const page = await context.newPage();
          const errors = [];
          const requestedImages = new Set();
          page.on('request', (r) => {
            if (r.resourceType() === 'image') requestedImages.add(r.url());
          });
          page.on('pageerror', (e) => errors.push(String(e)));
          await page.goto(`${base}/reviews/?o=0&l=${layout}`, { waitUntil: 'load' });
          await ready(page);
          const posts = await postsFor(page);
          await identity(page, posts);
          for (const id of samples) await inspect(page, engineName, profile, layout, id);
          for (const to of ['cover', 'tier', 'wide', layout]) {
            await page.locator(`label[for="layout_${to}"]`).click();
            await page.waitForTimeout(80);
            await identity(page, posts);
          }
          console.log('matrix', engineName, profile.join('x'), layout);
          assert.deepEqual(
            await page.evaluate(() => window.coverIdentityFailures),
            [],
            "a frame displayed another book's cover"
          );
          await save();
          if (width === 375 && layout === 'tier') {
            await page.setViewportSize({ width: height, height: width });
            for (const layout of ['wide', 'cover', 'tier']) {
              await page.locator(`label[for="layout_${layout}"]`).click();
              await inspect(page, engineName, [height, width, deviceScaleFactor], layout, 'cradle');
            }
          }
          const cradle = (await postsFor(page)).find((p) => p.link === '/reviews/cradle/');
          if (cradle.cover && !args.baseline) {
            const candidates = cradle.cover.srcset.split(',').map((s) => {
              const [url, descriptor] = s.trim().split(' ');
              return { url: new URL(url, base).href, width: Number.parseInt(descriptor) };
            });
            const largestNeeded = candidates.find((c) => c.width >= 250 * deviceScaleFactor) ?? candidates.at(-1);
            const requested = candidates.filter((c) => requestedImages.has(c.url));
            assert(
              requested.every((c) => c.width <= largestNeeded.width),
              'layout transition requested an oversized cover'
            );
            result.behavior.push({
              browser: engineName,
              profile,
              requestedCradleWidths: requested.map((c) => c.width),
            });
          }
          result.behavior.push({ browser: engineName, profile, errors });
          assert.deepEqual(errors, []);
          await context.close();
        }
      }
    if (!args['matrix-only']) {
      const context = await browser.newContext({
        viewport: { width: 1350, height: 940 },
        deviceScaleFactor: 3,
        acceptDownloads: true,
      });
      const page = await context.newPage();
      await page.goto(base + '/reviews/?o=0&include=cultivation', { waitUntil: 'load' });
      await ready(page);
      const posts = await postsFor(page);
      const behavior = { browser: engineName, filteredCount: await identity(page, posts) };
      assert(behavior.filteredCount > 0 && behavior.filteredCount < posts.length);
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      behavior.resetCount = await identity(page, posts);
      assert.equal(behavior.resetCount, posts.length);
      await page.locator('label[for="sort-order"]').click();
      await identity(page, posts);
      await page.locator('#search-input').fill('cradle');
      await identity(page, posts);
      assert.equal(await page.locator('[data-review-card]').count(), 1);
      await page.getByRole('button', { name: 'Add to reading list', exact: true }).click();
      await page.locator('#search-input').fill('');
      await page.getByTitle('Show reading list only').click();
      await identity(page, posts);
      assert.equal(await page.locator('[data-review-card]').count(), 1);
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      result.behavior.push(behavior);
      behavior.deferred = await deferredCover(page, posts);
      if (!args['skip-exports']) {
        if (!args['upscale-only']) {
          for (const layout of ['wide', 'cover', 'tier'])
            for (const mode of ['short', 'long']) await exportList(page, engineName, layout, mode);
          // A very wide virtual viewport makes the area budget bind before the
          // side limit. This is a limit test, not a physical-device claim.
          await page.setViewportSize({ width: 7000, height: 940 });
          const area = await exportList(page, engineName, 'wide', 'area');
          assert(area.output.width * area.output.height >= 15980000, 'area limit was not exercised');
        }
        await page.setViewportSize({ width: 1350, height: 940 });
        await page.goto(base + '/reviews/?l=wide&include=companion', { waitUntil: 'load' });
        await ready(page);
        const tiled = await exportList(page, engineName, 'wide', 'tiled');
        assert(
          tiled.geometry.height > 4000 && tiled.output.height / tiled.geometry.height > 1,
          'upscaled multi-tile export was not exercised'
        );
      }
      await context.close();
      await save();
    }
  } finally {
    await browser.close();
    await save();
  }
}
console.log('Saved', output);
