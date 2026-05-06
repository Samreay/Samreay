import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (msg) => console.log('[B]', msg.text()));
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

// Move mouse so we get an initial position
await page.mouse.move(0, 0);
await page.waitForTimeout(100);

const card = await page.$('[data-review-card]');
const box = await card.boundingBox();

// First move to outside, then into card to ensure mousemove events dispatch
await page.mouse.move(10, 10, { steps: 5 });
await page.waitForTimeout(50);
await page.mouse.move(box.x + 50, box.y + 50, { steps: 10 });
await page.waitForTimeout(200);

const vars = await card.evaluate((el) => ({
  rx: el.style.getPropertyValue('--rx'),
  ry: el.style.getPropertyValue('--ry'),
  o: el.style.getPropertyValue('--o'),
}));
console.log('vars after move with steps:', vars);

await browser.close();
