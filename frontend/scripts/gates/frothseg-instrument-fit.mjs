/* The App route's instrument has the same two failure modes the focus canvas had: cropped by
   its stage (overflow eats the frame) or underfilling it (a 256px source refuses to upscale).
   "No document scroll" catches neither, so measure both lanes explicitly. */
import { chromium } from 'playwright';

/* Exit non-zero on a real defect so this runs as a gate, not just a probe. The thresholds are
   the two failures it actually caught: a cropped instrument (any spill past the stage) and an
   underfilled one (a 256px source that refused to upscale and drew at 7% of the viewport). */
const BASE = process.env.FS_BASE || 'http://localhost:4627';
const browser = await chromium.launch();
let failures = 0;
for (const [w, h] of [[1280, 800], [1600, 900], [2560, 1440]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  for (const lane of ['still', 'sequence']) {
    if (lane === 'sequence') {
      await page.getByRole('button', { name: /Sequence|Secuencia/ }).first().click();
      await page.waitForTimeout(1600);
    }
    const m = await page.evaluate(() => {
      const stage = document.querySelector('.fs-main');
      const inst = document.querySelector('.fs-overlay-view, .fs-sequence-stage, .fs-main canvas, .fs-main img');
      if (!stage || !inst) return { missing: true };
      const s = stage.getBoundingClientRect(), i = inst.getBoundingClientRect();
      return {
        instPct: +(100 * (i.width * i.height) / (innerWidth * innerHeight)).toFixed(1),
        fillOfStage: +(100 * (i.width * i.height) / (s.width * s.height)).toFixed(1),
        cropped: i.bottom > s.bottom + 2 || i.right > s.right + 2,
        docOverflow: document.documentElement.scrollHeight > innerHeight + 2,
      };
    });
    const bad = m.missing || m.cropped || m.docOverflow || m.fillOfStage < 30;
    if (bad) failures += 1;
    console.log(`${w}x${h} ${lane.padEnd(8)} ${bad ? 'FAIL' : 'PASS'}`, JSON.stringify(m));
  }
  await ctx.close();
}
await browser.close();
console.log(failures
  ? '\nINSTRUMENT GATE FAILED: the instrument is cropped, missing or underfilling its stage.'
  : '\nINSTRUMENT GATE PASSED: uncropped and filling its stage in both lanes at three viewports.');
process.exit(failures ? 1 : 0);
