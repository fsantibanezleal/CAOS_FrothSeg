// Throwaway adversarial probe: walk the five doc pages, every tab/subtab,
// both themes, both languages, three viewports. Measures geometry defects.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4627';
const OUT = process.env.OUT || 'E:/_Temp/frothseg-adv/walk-results.jsonl';
const PAGES = ['/introduction', '/methodology', '/implementation', '/experiments', '/benchmark'];
const VIEWPORTS = [[1280, 800], [1600, 900], [2560, 1440]];
const COMBOS = [
  // theme, lang
  ['light', 'en'], ['dark', 'en'], ['light', 'es'], ['dark', 'es'],
];

fs.mkdirSync('E:/_Temp/frothseg-adv', { recursive: true });
const out = fs.createWriteStream(OUT, { flags: 'w' });

const measureFn = () => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const res = { vw, vh, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight };
  const pb = document.querySelector('.page-body');
  if (pb) {
    const r = pb.getBoundingClientRect();
    res.pageBody = { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), centerErr: Math.round(r.left - (vw - r.width) / 2) };
  }
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    return r;
  };
  // horizontal overflow offenders
  res.overflow = [];
  const seen = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    const r = vis(el);
    if (!r) continue;
    if (r.right > vw + 1 || r.left < -1) {
      const key = el.tagName + '.' + (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '');
      if (seen.has(key)) continue;
      seen.add(key);
      res.overflow.push({ key, right: Math.round(r.right), left: Math.round(r.left), text: (el.textContent || '').slice(0, 60) });
      if (res.overflow.length > 15) break;
    }
  }
  // KaTeX clipping
  res.katex = [];
  for (const el of document.querySelectorAll('.katex-display')) {
    const r = vis(el); if (!r) continue;
    const host = el.closest('.equation') || el.parentElement;
    const hs = getComputedStyle(host);
    if (el.scrollWidth > el.clientWidth + 2) {
      res.katex.push({ clippedBy: el.scrollWidth - el.clientWidth, hostOverflowX: hs.overflowX, tex: (el.textContent || '').slice(0, 50) });
    }
  }
  // inline math clipped
  for (const el of document.querySelectorAll('p .katex')) {
    const r = vis(el); if (!r) continue;
    if (r.right > vw + 1) res.katex.push({ inline: true, right: Math.round(r.right), tex: (el.textContent || '').slice(0, 40) });
  }
  // tables
  res.tables = [];
  for (const t of document.querySelectorAll('table')) {
    const r = vis(t); if (!r) continue;
    let anc = t.parentElement, scrollable = false, clipped = false;
    while (anc && anc !== document.body) {
      const cs = getComputedStyle(anc);
      if (/(auto|scroll)/.test(cs.overflowX) && anc.scrollWidth > anc.clientWidth + 2) { scrollable = true; break; }
      if (cs.overflowX === 'hidden' && t.getBoundingClientRect().right > anc.getBoundingClientRect().right + 2) { clipped = true; break; }
      anc = anc.parentElement;
    }
    const over = r.right > vw + 1;
    if (over || clipped) res.tables.push({ w: Math.round(r.width), right: Math.round(r.right), clipped, scrollable, head: (t.querySelector('th')?.textContent || '').slice(0, 40) });
    else if (scrollable) res.tables.push({ w: Math.round(r.width), scrollableOk: true, head: (t.querySelector('th')?.textContent || '').slice(0, 40) });
  }
  // svg text too small to read
  res.svgTiny = [];
  const svgSeen = new Set();
  for (const tx of document.querySelectorAll('svg text')) {
    const r = vis(tx); if (!r) continue;
    if (r.height < 7.5) {
      const svg = tx.closest('svg');
      const key = svg?.getAttribute('class') || svg?.getAttribute('viewBox') || '?';
      if (svgSeen.has(key)) continue;
      svgSeen.add(key);
      res.svgTiny.push({ svg: key, textH: +r.height.toFixed(1), sample: (tx.textContent || '').slice(0, 30) });
    }
  }
  // svg overflowing its container
  res.svgOver = [];
  for (const svg of document.querySelectorAll('svg')) {
    const r = vis(svg); if (!r) continue;
    if (r.right > vw + 1 || r.width < 40 && r.height > 100) res.svgOver.push({ cls: svg.getAttribute('class'), w: Math.round(r.width), right: Math.round(r.right) });
  }
  // tab bar wrap
  res.tabRows = [];
  for (const tl of document.querySelectorAll('.tablist, .subtablist')) {
    const r = vis(tl); if (!r) continue;
    const btns = [...tl.querySelectorAll('[role=tab]')];
    if (!btns.length) continue;
    const tops = new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top / 5)));
    res.tabRows.push({ cls: tl.className, rows: tops.size, count: btns.length });
  }
  // active panel text volume
  const panels = [...document.querySelectorAll('[role=tabpanel]')].filter((p) => vis(p));
  res.panelChars = panels.length ? Math.max(...panels.map((p) => (p.textContent || '').length)) : (document.querySelector('.page-body')?.textContent || '').length;
  // mojibake / i18n leak heuristics
  const body = document.body.innerText;
  res.mojibake = (body.match(/Ã.|â€|\uFFFD/g) || []).slice(0, 5);
  return res;
};

const browser = await chromium.launch();
let states = 0;
for (const [vwW, vwH] of VIEWPORTS) {
  for (const [theme, lang] of COMBOS) {
    const ctx = await browser.newContext({ viewport: { width: vwW, height: vwH } });
    await ctx.addInitScript(([t, l]) => {
      localStorage.setItem('caos.theme', t);
      localStorage.setItem('caos.lang', l);
    }, [theme, lang]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 200)));
    for (const route of PAGES) {
      await page.goto(BASE + route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      // wait for spinner to clear
      try { await page.waitForSelector('.fs-spinner', { state: 'detached', timeout: 8000 }); } catch {}
      const record = async (tab, sub) => {
        const m = await page.evaluate(measureFn);
        out.write(JSON.stringify({ route, vw: vwW, theme, lang, tab, sub, ...m }) + '\n');
        states++;
      };
      const topTabs = await page.$$('.tablist [role=tab]');
      if (!topTabs.length) { await record(null, null); continue; }
      for (let i = 0; i < topTabs.length; i++) {
        const tt = (await page.$$('.tablist [role=tab]'))[i];
        const tabName = (await tt.textContent())?.trim();
        await tt.click();
        await page.waitForTimeout(250);
        const subTabs = await page.$$('.subtablist [role=tab]');
        if (!subTabs.length) { await record(tabName, null); continue; }
        for (let j = 0; j < subTabs.length; j++) {
          const st = (await page.$$('.subtablist [role=tab]'))[j];
          const subName = (await st.textContent())?.trim();
          await st.click();
          await page.waitForTimeout(250);
          await record(tabName, subName);
        }
      }
      if (errors.length) { out.write(JSON.stringify({ route, vw: vwW, theme, lang, consoleErrors: errors.splice(0) }) + '\n'); }
    }
    await ctx.close();
  }
}
await browser.close();
out.end();
console.log('states measured:', states);
