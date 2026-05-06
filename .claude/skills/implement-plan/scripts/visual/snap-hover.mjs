import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

const cards = await page.$$('[data-review-card]');
await cards[1].scrollIntoViewIfNeeded();
await page.waitForTimeout(100);
const b = await cards[1].boundingBox();
await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.25);
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/reviews-hover.png' });

const posts = await page.$$('[data-post-card]');
await posts[1].scrollIntoViewIfNeeded();
await page.waitForTimeout(100);
const pb = await posts[1].boundingBox();
await page.mouse.move(pb.x + pb.width * 0.7, pb.y + pb.height * 0.25);
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/blogs-hover.png' });

await browser.close();
