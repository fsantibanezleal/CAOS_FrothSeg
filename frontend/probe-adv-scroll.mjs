import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:4627/introduction', { waitUntil: 'networkidle' });
const info = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 100) {
      out.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), ch: el.clientHeight, sh: el.scrollHeight });
    }
  }
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
