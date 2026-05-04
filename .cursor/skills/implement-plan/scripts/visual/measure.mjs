import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

const tBlock = await page.$('h1:has-text("Latest Tutorials")');
await tBlock.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);

const cards = await page.$$('[data-post-card]');
for (const c of cards.slice(0, 9)) {
  const data = await c.evaluate((el) => {
    const article = el.querySelector('article');
    const fig = el.querySelector('figure');
    const meta = el.querySelector('article > div'); // .px-4 pb-4
    const h4 = el.querySelector('h4');
    return {
      cardH: el.getBoundingClientRect().height,
      figH: fig?.getBoundingClientRect().height,
      metaH: meta?.getBoundingClientRect().height,
      title: h4?.textContent?.trim(),
    };
  });
  console.log(data);
}
await browser.close();
