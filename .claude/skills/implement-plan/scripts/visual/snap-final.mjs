import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

const t = await page.$('h1:has-text("Latest Tutorials")');
await t.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/tutorials-final.png' });
const b = await page.$('h1:has-text("Latest Blog Posts")');
await b.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/blogs-final.png' });

await browser.close();
