// Throwaway probe 5: tall-viewport full-content screenshots of every tab state,
// both themes (EN), width 1280. The shell scrolls inside main.page, so normal
// fullPage screenshots only capture the viewport.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4627';
const DIR = 'E:/_Temp/frothseg-adv/tall';
fs.mkdirSync(DIR, { recursive: true });
const PAGES = ['/introduction', '/methodology', '/implementation', '/experiments', '/benchmark'];

const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((t) => { localStorage.setItem('caos.theme', t); localStorage.setItem('caos.lang', 'en'); }, theme);
  const page = await ctx.newPage();
  for (const route of PAGES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    try { await page.waitForSelector('.fs-spinner', { state: 'detached', timeout: 8000 }); } catch {}
    await page.waitForTimeout(300);
    const slug = route.replace('/', '');
    const shot = async (tab, sub) => {
      const sh = await page.evaluate(() => document.querySelector('main.page')?.scrollHeight || document.documentElement.scrollHeight);
      const h = Math.min(sh + 260, 20000);
      await page.setViewportSize({ width: 1280, height: h });
      await page.waitForTimeout(250);
      const name = `${slug}__${(tab || 'root').replace(/[^\w-]+/g, '_')}__${(sub || '-').replace(/[^\w-]+/g, '_')}__${theme}.png`;
      await page.screenshot({ path: `${DIR}/${name}` });
      await page.setViewportSize({ width: 1280, height: 900 });
    };
    // experiments' top level is SubTabs; the rest use Tabs
    const topSel = (await page.$$('.tablist [role=tab]')).length ? '.tablist [role=tab]' : '.subtablist [role=tab]';
    const topTabs = await page.$$(topSel);
    if (!topTabs.length) { await shot(null, null); continue; }
    for (let i = 0; i < topTabs.length; i++) {
      const tt = (await page.$$(topSel))[i];
      const tabName = (await tt.textContent())?.trim();
      await tt.click(); await page.waitForTimeout(250);
      let subTabs = topSel === '.tablist [role=tab]' ? await page.$$('.subtablist [role=tab]') : [];
      if (!subTabs.length) { await shot(tabName, null); continue; }
      for (let j = 0; j < subTabs.length; j++) {
        const st = (await page.$$('.subtablist [role=tab]'))[j];
        const subName = (await st.textContent())?.trim();
        await st.click(); await page.waitForTimeout(250);
        await shot(tabName, subName);
      }
    }
  }
  await ctx.close();
}
await browser.close();
console.log('done', fs.readdirSync(DIR).length);
