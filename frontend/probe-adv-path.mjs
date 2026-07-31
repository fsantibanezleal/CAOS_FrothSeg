import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:4627/introduction', { waitUntil: 'networkidle' });
const info = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('path')) {
    const r = el.getBoundingClientRect();
    if (r.right > 1281 || r.left < -1) {
      const svg = el.closest('svg');
      const sr = svg?.getBoundingClientRect();
      out.push({ d: (el.getAttribute('d') || '').slice(0, 40), cls: el.getAttribute('class'), right: Math.round(r.right), svgCls: svg?.getAttribute('class'), svgRight: sr ? Math.round(sr.right) : null, svgOverflow: svg ? getComputedStyle(svg).overflow : null, inKatex: !!el.closest('.katex') });
    }
  }
  return out.slice(0, 10);
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
