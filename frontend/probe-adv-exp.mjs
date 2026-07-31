// Throwaway probe 4: /experiments only. Its top-level nav is SubTabs, which the
// earlier walkers missed. Geometry at 3 viewports x theme x lang, text capture,
// screenshots (1280 EN light+dark), katex + canvas checks.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4627';
fs.mkdirSync('E:/_Temp/frothseg-adv/shots', { recursive: true });
fs.mkdirSync('E:/_Temp/frothseg-adv/text', { recursive: true });
const out = fs.createWriteStream('E:/_Temp/frothseg-adv/exp-results.jsonl', { flags: 'w' });

const measureFn = () => {
  const vw = window.innerWidth;
  const res = { vw, scrollW: document.documentElement.scrollWidth };
  const pb = document.querySelector('.page-body');
  if (pb) { const r = pb.getBoundingClientRect(); res.pageBody = { w: Math.round(r.width), centerErr: Math.round(r.left - (vw - r.width) / 2) }; }
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null; return r; };
  res.katex = [];
  for (const el of document.querySelectorAll('.katex-display .katex-html')) {
    const r = el.getBoundingClientRect(); if (r.width < 2) continue;
    if (el.scrollWidth > el.clientWidth + 2 || r.right > vw + 1) res.katex.push({ sw: el.scrollWidth, cw: el.clientWidth, right: Math.round(r.right), text: (el.textContent || '').slice(0, 50) });
  }
  res.tables = [];
  for (const t of document.querySelectorAll('table')) {
    const r = vis(t); if (!r) continue;
    if (r.right > vw + 1) res.tables.push({ right: Math.round(r.right), head: (t.querySelector('th')?.textContent || '').slice(0, 40) });
  }
  res.overflow = [];
  for (const el of document.querySelectorAll('.page-body div, .page-body img, .page-body table, .page-body pre, .page-body figure')) {
    const r = vis(el); if (!r) continue;
    if (r.right > vw + 1 || r.left < -1) { res.overflow.push({ key: el.tagName + '.' + el.className, right: Math.round(r.right) }); if (res.overflow.length > 8) break; }
  }
  res.svgTiny = [];
  const seen = new Set();
  for (const tx of document.querySelectorAll('svg text')) {
    const r = vis(tx); if (!r) continue;
    if (r.height < 7.5) { const key = tx.closest('svg')?.getAttribute('class') || '?'; if (!seen.has(key)) { seen.add(key); res.svgTiny.push({ svg: key, h: +r.height.toFixed(1) }); } }
  }
  res.tabRows = [];
  for (const tl of document.querySelectorAll('.tablist, .subtablist')) {
    const btns = [...tl.querySelectorAll('[role=tab]')]; if (!btns.length) continue;
    const tops = new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top / 5)));
    res.tabRows.push({ cls: tl.className, rows: tops.size, count: btns.length });
  }
  const panels = [...document.querySelectorAll('[role=tabpanel]')].filter((p) => { const r = p.getBoundingClientRect(); return r.width > 2 && r.height > 2; });
  res.panelChars = panels.length ? Math.max(...panels.map((p) => (p.textContent || '').length)) : 0;
  res.canvas = [];
  for (const c of document.querySelectorAll('canvas')) {
    const r = c.getBoundingClientRect(); if (r.width < 4) continue;
    try {
      const g = c.getContext('2d'); if (!g) { res.canvas.push({ note: 'no2d' }); continue; }
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const distinct = new Set(); for (let i = 0; i < d.length; i += 397 * 4) distinct.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2] | (d[i + 3] << 24));
      res.canvas.push({ w: c.width, h: c.height, distinct: distinct.size });
    } catch (e) { res.canvas.push({ note: String(e).slice(0, 50) }); }
  }
  return res;
};

const browser = await chromium.launch();
const combos = [];
for (const vw of [[1280, 800], [1600, 900], [2560, 1440]]) for (const theme of ['light', 'dark']) for (const lang of ['en', 'es']) combos.push([vw, theme, lang]);
for (const [[w, h], theme, lang] of combos) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(([t, l]) => { localStorage.setItem('caos.theme', t); localStorage.setItem('caos.lang', l); }, [theme, lang]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 200)));
  await page.goto(BASE + '/experiments', { waitUntil: 'networkidle' });
  try { await page.waitForSelector('.fs-spinner', { state: 'detached', timeout: 8000 }); } catch {}
  await page.waitForTimeout(400);
  const tabs = await page.$$('.subtablist [role=tab]');
  for (let i = 0; i < tabs.length; i++) {
    const tt = (await page.$$('.subtablist [role=tab]'))[i];
    const name = (await tt.textContent())?.trim();
    await tt.click();
    await page.waitForTimeout(350);
    const m = await page.evaluate(measureFn);
    out.write(JSON.stringify({ vw: w, theme, lang, tab: name, ...m }) + '\n');
    const safe = name.replace(/[^\w-]+/g, '_');
    if (w === 1280 && lang === 'en') await page.screenshot({ path: `E:/_Temp/frothseg-adv/shots/experiments__${safe}__-__${theme}.png`, fullPage: true });
    if (w === 1440 || (w === 1280 && theme === 'light')) {
      const text = await page.evaluate(() => document.querySelector('.page-body')?.innerText || '');
      fs.writeFileSync(`E:/_Temp/frothseg-adv/text/experiments__${safe}__-__${lang}.txt`, text);
    }
  }
  if (errors.length) out.write(JSON.stringify({ vw: w, theme, lang, consoleErrors: errors }) + '\n');
  await ctx.close();
}
await browser.close();
out.end();
console.log('done');
