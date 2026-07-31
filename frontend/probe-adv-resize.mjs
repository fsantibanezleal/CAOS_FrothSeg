import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => { localStorage.setItem('caos.lang', 'en'); localStorage.setItem('caos.theme', 'light'); });
await page.goto('http://localhost:4627/experiments', { waitUntil: 'networkidle' });
await page.click('.subtablist [role=tab]:has-text("Canonical cases")');
await page.waitForTimeout(1200);
const before = await page.evaluate(() => {
  const c = document.querySelector('canvas'); const r = c.getBoundingClientRect();
  return { cssW: Math.round(r.width), cssH: Math.round(r.height) };
});
await page.setViewportSize({ width: 1600, height: 1200 });
await page.waitForTimeout(800);
const after = await page.evaluate(() => {
  const c = document.querySelector('canvas'); const r = c.getBoundingClientRect();
  return { cssW: Math.round(r.width), cssH: Math.round(r.height) };
});
console.log('before', JSON.stringify(before), 'after', JSON.stringify(after));
const sel = await page.$('text=Inspect case');
if (sel) { await sel.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); }
await page.screenshot({ path: 'E:/_Temp/frothseg-adv/slices/cases_resized_1600.png' });
await browser.close();
