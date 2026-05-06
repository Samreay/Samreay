import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

const cards = await page.$$('[data-review-card]');
await cards[1].scrollIntoViewIfNeeded();
// Wait for images to load
await page.evaluate(() => Promise.all(
  Array.from(document.querySelectorAll('img')).map(img =>
    img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
  )
));
await page.waitForTimeout(500);

const b = await cards[1].boundingBox();
await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.25);
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/reviews-hover.png' });

await browser.close();
