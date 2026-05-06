import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (msg) => console.log('[BROWSER]', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('[BROWSER ERROR]', err.message));
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

const debug = await page.evaluate(() => ({
  hoverNone: window.matchMedia('(hover: none)').matches,
  bound: document.documentElement.dataset.fancyCardBound,
  fancyCount: document.querySelectorAll('.fancy_card').length,
}));
console.log('debug:', debug);
await browser.close();
