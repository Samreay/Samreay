import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

const card = await page.$('[data-review-card]');
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(100);
const box = await card.boundingBox();

// Hover near top-right corner
await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.15);
await page.waitForTimeout(300);

let vars = await card.evaluate((el) => ({
  rx: el.style.getPropertyValue('--rx'),
  ry: el.style.getPropertyValue('--ry'),
  o: el.style.getPropertyValue('--o'),
  mx: el.style.getPropertyValue('--mx'),
  my: el.style.getPropertyValue('--my'),
}));
console.log('top-right hover:', vars);

const post = await page.$('[data-post-card]');
await post.scrollIntoViewIfNeeded();
await page.waitForTimeout(100);
const pbox = await post.boundingBox();

await page.mouse.move(pbox.x + pbox.width * 0.2, pbox.y + pbox.height * 0.8);
await page.waitForTimeout(300);

vars = await post.evaluate((el) => ({
  rx: el.style.getPropertyValue('--rx'),
  ry: el.style.getPropertyValue('--ry'),
  o: el.style.getPropertyValue('--o'),
}));
console.log('post bottom-left hover:', vars);

await browser.close();
