import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => { localStorage.setItem('caos.lang', 'en'); localStorage.setItem('caos.theme', 'light'); });
await page.goto('http://localhost:4627/experiments', { waitUntil: 'networkidle' });
await page.click('.subtablist [role=tab]:has-text("Canonical cases")');
await page.waitForTimeout(1200);
const info = await page.evaluate(() => {
  const out = { canvases: [], tables: [] };
  for (const c of document.querySelectorAll('canvas')) {
    const r = c.getBoundingClientRect();
    out.canvases.push({ attrW: c.width, attrH: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height), cls: c.className });
  }
  for (const t of document.querySelectorAll('table')) {
    const r = t.getBoundingClientRect();
    const rows = [...t.querySelectorAll('tr')].map((tr) => Math.round(tr.getBoundingClientRect().height));
    out.tables.push({ h: Math.round(r.height), rows });
  }
  return out;
});
console.log(JSON.stringify(info, null, 1));
// scroll to the inspect section and screenshot
const sel = await page.$('text=Inspect case');
if (sel) { await sel.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); }
await page.screenshot({ path: 'E:/_Temp/frothseg-adv/slices/cases_inspect_900.png' });
await browser.close();
