import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

const card = await page.$('[data-review-card]');
const box = await card.boundingBox();
// hover near top right of card
await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3);
await page.waitForTimeout(200);

const cssVars = await card.evaluate((el) => {
  const cs = getComputedStyle(el);
  return {
    rx: el.style.getPropertyValue('--rx'),
    ry: el.style.getPropertyValue('--ry'),
    o: el.style.getPropertyValue('--o'),
    mx: el.style.getPropertyValue('--mx'),
    my: el.style.getPropertyValue('--my'),
  };
});
console.log('Review card vars after hover:', cssVars);

const post = await page.$('[data-post-card]');
const pbox = await post.boundingBox();
await page.mouse.move(pbox.x + pbox.width * 0.4, pbox.y + pbox.height * 0.6);
await page.waitForTimeout(200);
const pvars = await post.evaluate((el) => ({
  rx: el.style.getPropertyValue('--rx'),
  ry: el.style.getPropertyValue('--ry'),
  o: el.style.getPropertyValue('--o'),
}));
console.log('Post card vars after hover:', pvars);

await browser.close();
