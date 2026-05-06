import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

const reviewsHeading = await page.$('h1:has-text("Book Reviews")');
await reviewsHeading.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/reviews.png' });

const blogHeading = await page.$('h1:has-text("Latest Blog Posts")');
await blogHeading.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/blogs.png' });

await browser.close();
