import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

// Inspect the first review card
const reviewCard = await page.$('[data-review-card]');
const reviewBox = await reviewCard.boundingBox();
console.log('Review card box:', reviewBox);

const reviewImg = await reviewCard.$('img');
const imgBox = await reviewImg.boundingBox();
console.log('Review img box:', imgBox);

const imgStyles = await reviewImg.evaluate((el) => {
  const cs = getComputedStyle(el);
  return { width: cs.width, height: cs.height, display: cs.display, maxWidth: cs.maxWidth, maxHeight: cs.maxHeight, position: cs.position };
});
console.log('Review img computed:', imgStyles);

const fig = await reviewCard.$('figure');
const figBox = await fig.boundingBox();
const figStyles = await fig.evaluate((el) => {
  const cs = getComputedStyle(el);
  return { width: cs.width, height: cs.height, display: cs.display };
});
console.log('Review figure box:', figBox, 'styles:', figStyles);

console.log('\n--- POST CARD ---');
const postCard = await page.$('[data-post-card]');
const postBox = await postCard.boundingBox();
console.log('Post card box:', postBox);

const pf = await postCard.$('figure');
const pfBox = await pf.boundingBox();
const pfStyles = await pf.evaluate((el) => {
  const cs = getComputedStyle(el);
  return { width: cs.width, height: cs.height, paddingBottom: cs.paddingBottom };
});
console.log('Post figure box:', pfBox, 'styles:', pfStyles);

const pi = await postCard.$('img');
const piBox = await pi.boundingBox();
console.log('Post img box:', piBox);

await browser.close();
