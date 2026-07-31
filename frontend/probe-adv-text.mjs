// Throwaway probe: capture rendered text of every tab state in EN and ES,
// scan for internal-path leaks, placeholders, and untranslated markers.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4627';
const DIR = 'E:/_Temp/frothseg-adv/text';
const PAGES = ['/introduction', '/methodology', '/implementation', '/experiments', '/benchmark'];
fs.mkdirSync(DIR, { recursive: true });

const LEAK = /(docs\/[\w-]+|data\/derived|verification\/[\w-]+|frontend\/|data-pipeline\/|[\w-]+\.(?:py|tsx|ts|mjs)\b|[\w][\w-]*\.json\b|D:\\|_Repos|TODO\b|FIXME|lorem ipsum|undefined|NaN\b|\[object Object\])/g;

const browser = await chromium.launch();
const findings = [];
for (const lang of ['en', 'es']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((l) => { localStorage.setItem('caos.lang', l); localStorage.setItem('caos.theme', 'light'); }, lang);
  const page = await ctx.newPage();
  for (const route of PAGES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    try { await page.waitForSelector('.fs-spinner', { state: 'detached', timeout: 8000 }); } catch {}
    await page.waitForTimeout(300);
    const slug = route.replace('/', '') || 'root';
    const capture = async (tab, sub) => {
      const text = await page.evaluate(() => document.querySelector('.page-body')?.innerText || document.body.innerText);
      const name = `${slug}__${(tab || 'root').replace(/[^\w-]+/g, '_')}__${(sub || '-').replace(/[^\w-]+/g, '_')}__${lang}.txt`;
      fs.writeFileSync(`${DIR}/${name}`, text);
      const leaks = [...new Set((text.match(LEAK) || []))];
      if (leaks.length) findings.push({ route, tab, sub, lang, leaks });
    };
    const topTabs = await page.$$('.tablist [role=tab]');
    if (!topTabs.length) { await capture(null, null); continue; }
    for (let i = 0; i < topTabs.length; i++) {
      const tt = (await page.$$('.tablist [role=tab]'))[i];
      const tabName = (await tt.textContent())?.trim();
      await tt.click(); await page.waitForTimeout(200);
      const subTabs = await page.$$('.subtablist [role=tab]');
      if (!subTabs.length) { await capture(tabName, null); continue; }
      for (let j = 0; j < subTabs.length; j++) {
        const st = (await page.$$('.subtablist [role=tab]'))[j];
        const subName = (await st.textContent())?.trim();
        await st.click(); await page.waitForTimeout(200);
        await capture(tabName, subName);
      }
    }
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync('E:/_Temp/frothseg-adv/text-findings.json', JSON.stringify(findings, null, 1));
console.log(JSON.stringify(findings, null, 1));
