import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

const card = await page.$('[data-review-card]');
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(100);

await card.hover();
await page.waitForTimeout(300);

const vars = await card.evaluate((el) => ({
  rx: el.style.getPropertyValue('--rx'),
  ry: el.style.getPropertyValue('--ry'),
  o: el.style.getPropertyValue('--o'),
  mx: el.style.getPropertyValue('--mx'),
  my: el.style.getPropertyValue('--my'),
}));
console.log('vars after hover:', vars);

await browser.close();
