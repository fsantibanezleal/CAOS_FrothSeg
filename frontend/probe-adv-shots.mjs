// Throwaway probe 3: (a) real KaTeX .katex-html overflow check at 1280,
// (b) Benchmark ranking DOM numbers vs served artifact, (c) canvas blank check,
// (d) full-page screenshots of every tab state, light+dark, 1280, EN + a few ES.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4627';
const DIR = 'E:/_Temp/frothseg-adv/shots';
fs.mkdirSync(DIR, { recursive: true });
const PAGES = ['/introduction', '/methodology', '/implementation', '/experiments', '/benchmark'];
const report = { katex: [], numbers: [], canvas: [] };

const browser = await chromium.launch();

async function walkStates(page, fn) {
  const topTabs = await page.$$('.tablist [role=tab]');
  if (!topTabs.length) { await fn(null, null); return; }
  for (let i = 0; i < topTabs.length; i++) {
    const tt = (await page.$$('.tablist [role=tab]'))[i];
    const tabName = (await tt.textContent())?.trim();
    await tt.click(); await page.waitForTimeout(200);
    const subTabs = await page.$$('.subtablist [role=tab]');
    if (!subTabs.length) { await fn(tabName, null); continue; }
    for (let j = 0; j < subTabs.length; j++) {
      const st = (await page.$$('.subtablist [role=tab]'))[j];
      const subName = (await st.textContent())?.trim();
      await st.click(); await page.waitForTimeout(200);
      await fn(tabName, subName);
    }
  }
}

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((t) => { localStorage.setItem('caos.theme', t); localStorage.setItem('caos.lang', 'en'); }, theme);
  const page = await ctx.newPage();
  for (const route of PAGES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    try { await page.waitForSelector('.fs-spinner', { state: 'detached', timeout: 8000 }); } catch {}
    await page.waitForTimeout(300);
    const slug = route.replace('/', '');
    await walkStates(page, async (tab, sub) => {
      const name = `${slug}__${(tab || 'root').replace(/[^\w-]+/g, '_')}__${(sub || '-').replace(/[^\w-]+/g, '_')}__${theme}.png`;
      await page.screenshot({ path: `${DIR}/${name}`, fullPage: true });
      // real KaTeX overflow: visible .katex-html only
      const kx = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('.katex-display .katex-html')) {
          const r = el.getBoundingClientRect();
          if (r.width < 2) continue;
          const host = el.closest('.equation') || el.closest('.katex-display');
          const hr = host.getBoundingClientRect();
          const clipped = el.scrollWidth > el.clientWidth + 2;
          const overV = r.right > window.innerWidth + 1;
          const overH = r.right > hr.right + 2;
          if (clipped || overV || overH) out.push({ clipped, overViewport: overV, overHost: overH, right: Math.round(r.right), sw: el.scrollWidth, cw: el.clientWidth, text: (el.textContent || '').slice(0, 60) });
        }
        return out;
      });
      if (kx.length) report.katex.push({ route, tab, sub, theme, kx });
      // canvas blank check
      const cv = await page.evaluate(() => {
        const out = [];
        for (const c of document.querySelectorAll('canvas')) {
          const r = c.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          try {
            const g = c.getContext('2d');
            if (!g) { out.push({ w: c.width, h: c.height, note: 'no-2d-ctx' }); continue; }
            const d = g.getImageData(0, 0, c.width, c.height).data;
            let nonzero = 0, distinct = new Set();
            for (let i = 0; i < d.length; i += 397 * 4) {
              const v = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2] | (d[i + 3] << 24);
              if (d[i + 3] !== 0) nonzero++;
              distinct.add(v);
            }
            out.push({ w: c.width, h: c.height, sampledNonZero: nonzero, distinct: distinct.size });
          } catch (e) { out.push({ w: c.width, h: c.height, note: String(e).slice(0, 60) }); }
        }
        return out;
      });
      for (const c of cv) {
        if (c.note || c.distinct <= 1) report.canvas.push({ route, tab, sub, theme, ...c });
      }
    });
  }
  // Benchmark ranking numbers vs artifact (once per theme is redundant; do on light only)
  if (theme === 'light') {
    await page.goto(BASE + '/benchmark', { waitUntil: 'networkidle' });
    try { await page.waitForSelector('.fs-spinner', { state: 'detached', timeout: 8000 }); } catch {}
    await page.click('.tablist [role=tab]:has-text("Results")');
    await page.waitForTimeout(300);
    await page.click('.subtablist [role=tab]:has-text("Ranking")');
    await page.waitForTimeout(400);
    const dom = await page.evaluate(() => {
      const rows = [];
      for (const tr of document.querySelectorAll('[role=tabpanel] table tbody tr')) {
        const cells = [...tr.querySelectorAll('td,th')].map((c) => c.textContent.trim());
        if (cells.length) rows.push(cells);
      }
      return rows;
    });
    report.numbers.push({ where: 'benchmark ranking', rows: dom.slice(0, 20) });
    await page.click('.subtablist [role=tab]:has-text("Complete matrix")');
    await page.waitForTimeout(400);
    const dom2 = await page.evaluate(() => {
      const t = document.querySelector('[role=tabpanel] table');
      if (!t) return null;
      const head = [...t.querySelectorAll('thead th')].map((c) => c.textContent.trim());
      const rows = [...t.querySelectorAll('tbody tr')].slice(0, 4).map((tr) => [...tr.querySelectorAll('td,th')].map((c) => c.textContent.trim()));
      return { head, rows };
    });
    report.numbers.push({ where: 'benchmark complete matrix', dom2 });
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync('E:/_Temp/frothseg-adv/shots-report.json', JSON.stringify(report, null, 1));
console.log('katex issues:', report.katex.length, 'canvas issues:', report.canvas.length);
console.log(JSON.stringify(report.katex, null, 1).slice(0, 3000));
