import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (msg) => console.log('[B]', msg.text()));
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

await page.evaluate(() => {
  document.addEventListener('mousemove', (e) => {
    if (e.target instanceof Element) {
      const card = e.target.closest('.fancy_card');
      console.log('mousemove target:', e.target.tagName, 'card found?', !!card);
    }
  }, true);
});

const card = await page.$('[data-review-card]');
const box = await card.boundingBox();
await page.mouse.move(box.x + 50, box.y + 50);
await page.waitForTimeout(200);

const vars = await card.evaluate((el) => ({
  rx: el.style.getPropertyValue('--rx'),
  ry: el.style.getPropertyValue('--ry'),
  o: el.style.getPropertyValue('--o'),
}));
console.log('vars:', vars);

await browser.close();
