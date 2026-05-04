import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

// Reviews row
const r = await page.$('h1:has-text("Book Reviews")');
await r.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/reviews2.png' });

// Tutorials row
const t = await page.$('h1:has-text("Latest Tutorials")');
await t.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/tutorials2.png' });

// Blogs row
const b = await page.$('h1:has-text("Latest Blog Posts")');
await b.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/blogs2.png' });

await browser.close();
