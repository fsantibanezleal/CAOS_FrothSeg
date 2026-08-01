/* ADR-0071 section 8 with the delegated definition: the instrument is the interactive pan/zoom
   window (.fs-instrument), it must hold >= 50% of the viewport on the App route in BOTH lanes,
   and AT REST (zoom 1) no band element may intersect the frame. */
import { chromium } from 'playwright';
const BASE = process.env.FS_BASE || 'http://localhost:4627';
const b = await chromium.launch();
let fails = 0;
const overlap = (a, c) => Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left))
  * Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
for (const [w, h] of [[1280, 800], [1600, 900], [2560, 1440]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2600);
  for (const lane of ['still', 'sequence']) {
    if (lane === 'sequence') {
      await p.getByRole('button', { name: /Sequence|Secuencia/ }).first().click();
      await p.waitForTimeout(2000);
    }
    const m = await p.evaluate(() => {
      const inst = document.querySelector('.fs-instrument');
      if (!inst) return null;
      const r = inst.getBoundingClientRect();
      const frame = inst.querySelector('canvas, img');
      const fr = frame ? frame.getBoundingClientRect() : null;
      const band = inst.querySelector('.fs-instrument-band');
      const br = band ? band.getBoundingClientRect() : null;
      return {
        instPct: +(100 * (r.width * r.height) / (innerWidth * innerHeight)).toFixed(1),
        frame: fr ? { left: fr.left, right: fr.right, top: fr.top, bottom: fr.bottom } : null,
        band: br ? { left: br.left, right: br.right, top: br.top, bottom: br.bottom } : null,
        docOverflow: document.documentElement.scrollHeight > innerHeight + 2,
      };
    });
    if (!m) { console.log(`${w}x${h} ${lane} FAIL: no .fs-instrument`); fails++; continue; }
    const cover = m.frame && m.band ? overlap(m.band, m.frame) : 0;
    const ok = m.instPct >= 50 && cover <= 1 && !m.docOverflow;
    if (!ok) fails++;
    console.log(`${w}x${h} ${lane.padEnd(8)} ${ok ? 'PASS' : 'FAIL'} instrument=${m.instPct}% bandOverFrame=${Math.round(cover)}px2 docOverflow=${m.docOverflow}`);
  }
  await ctx.close();
}
await b.close();
console.log(fails ? `\nINSTRUMENT-50: ${fails} FAILURES` : '\nINSTRUMENT-50 PASS: the window holds >=50% in both lanes and never covers the frame at rest.');
process.exit(fails ? 1 : 0);
