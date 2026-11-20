// Run after `npm run build`, with `npm run preview` running on port 4321.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import { chromium } from 'playwright';

const baseURL = process.env.PREVIEW_URL ?? 'http://localhost:4321';
const videos = {
  bottle: ['ctVzDgybE2I'],
  box: ['2LKnORvwsoI'],
  brissicence: ['HeBCtK-7FXE'],
  gemini: ['kSKv_OYdgt4', 'lSwGeVXESAM', 'RrYRq9Ta0cc'],
  pub: ['_exAC0U9Hdc?start=1255'],
  surveyvis: ['Zmy-ycEHY8k', 'gFRNffGapls'],
};
const presentations = {
  dsgo: 'https://docs.google.com/presentation/d/e/2PACX-1vQL0qL0w6AjIqFSRaB4hdtjWtQoGkCQmXlredflXQQbjnQ8wC_muMxg6lG9TebM0Apv31sinoCBkaXr/embed?start=false&loop=false&delayms=60000',
  gemini: 'https://docs.google.com/presentation/d/1x4xm6cncCdiSzpdlAy8HEiFcOSH0zJPr_J99SKmXgXA/embed?start=false&loop=false&delayms=5000',
};
const posters = {
  bao: ['poster'],
  chainconsumer: ['poster'],
  europe2019: ['cover'],
  kubo: ['kubo'],
  marz: ['poster'],
  ozdes: ['ozdes'],
  refractorium: ['cover', 'mixed', 'cylinder'],
};
const pdfs = {
  gumdale: { file: 'gumdale.pdf', height: '500px' },
  globular: { file: 'presentation.pdf', height: '50vh' },
};
const slugs = [...new Set([
  ...Object.keys(videos), ...Object.keys(presentations),
  ...Object.keys(posters), ...Object.keys(pdfs),
])];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // Verify local output without depending on YouTube, Google Slides, or analytics.
  await page.route('**/*', (route) => new URL(route.request().url()).origin === new URL(baseURL).origin
    ? route.continue() : route.abort());

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const slug of slugs) {
      const response = await page.goto(`${baseURL}/blogs/${slug}/`);
      assert.equal(response.status(), 200, `${slug}: page exists`);
      const post = page.locator('#post-container');
      for (const [src, ratio] of [
        ...(videos[slug] ?? []).map((id) => [`https://www.youtube.com/embed/${id}`, 16 / 9]),
        ...(presentations[slug] ? [[presentations[slug], 4 / 3]] : []),
      ]) {
        const frame = post.locator(`iframe[src="${src}"]`);
        assert.equal(await frame.count(), 1, `${slug}: missing embed ${src}`);
        assert.ok(await frame.getAttribute('title'), `${slug}: iframe has a title`);
        assert.notEqual(await frame.getAttribute('allowfullscreen'), null);
        const box = await frame.boundingBox();
        assert.ok(box && box.width > 0 && box.height > 0, `${slug}: visible iframe`);
        assert.ok(Math.abs(box.width / box.height - ratio) < 0.02, `${slug}: iframe aspect ratio`);
        assert.ok(box.x >= 0 && box.x + box.width <= viewport.width, `${slug}: iframe fits viewport`);
      }
      if (posters[slug]) {
        const images = post.locator('figure.img-poster img');
        assert.equal(await images.count(), posters[slug].length, `${slug}: poster count`);
        for (const [index, filename] of posters[slug].entries()) {
          const image = images.nth(index);
          await image.scrollIntoViewIfNeeded();
          await page.waitForFunction((element) => element.complete, await image.elementHandle());
          await image.evaluate((element) => element.decode());
          assert.match(await image.getAttribute('src'), new RegExp(`/_astro/${filename}\\.`));
          assert.ok(await image.getAttribute('alt'), `${slug}: image has alternative text`);
          const box = await image.boundingBox();
          assert.ok(box && box.width > 0 && box.x >= 0 && box.x + box.width <= viewport.width,
            `${slug}: image fits viewport`);
        }
        if (slug === 'kubo') assert.equal(await post.locator('figure.img-poster.img-invert').count(), 1);
      }
      if (pdfs[slug]) {
        const { file, height } = pdfs[slug];
        const src = `/blogs/${slug}/${file}`;
        const object = post.locator(`object[type="application/pdf"][data="${src}"]`);
        assert.equal(await object.count(), 1, `${slug}: PDF embed`);
        assert.ok(await object.getAttribute('aria-label'), `${slug}: PDF has a title`);
        assert.equal(await object.evaluate((element) => element.style.height), height);
        assert.equal(await object.locator(`iframe[src="${src}"]`).count(), 1);
        assert.equal(await object.locator(`a[href="${src}"]`).count(), 1);
        const asset = await page.request.get(`${baseURL}${src}`);
        assert.equal(asset.status(), 200, `${slug}: PDF is published`);
        assert.equal((await asset.body()).subarray(0, 5).toString(), '%PDF-');
      }
    }
  }

  const files = await glob([
    'content/**/*.{md,mdx}',
    'dist/{blogs,reviews,tutorials}/**/index.html',
  ]);
  for (const file of files) {
    assert.doesNotMatch(await readFile(file, 'utf8'), /\{%\s*include|\{\{(?:<|&lt;|%)/,
      `${file}: unconverted include or shortcode`);
  }
  console.log(`Verified all 22 migrated embeds across ${slugs.length} posts at desktop and mobile sizes.`);
  console.log(`Scanned ${files.length} source and generated files for legacy syntax.`);
} finally {
  await browser.close();
}
