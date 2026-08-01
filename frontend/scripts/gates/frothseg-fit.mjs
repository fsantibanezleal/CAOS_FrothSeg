import { chromium } from 'playwright';
const BASE = process.env.CC_BASE || 'http://localhost:4183';
const b = await chromium.launch();
let fail = 0;
for (const [w,h] of [[1600,900],[1280,800],[2560,1440]]) {
  const p = await (await b.newContext({viewport:{width:w,height:h}})).newPage();
  await p.addInitScript(() => localStorage.setItem('caos.theme','dark'));
  await p.goto(BASE + '/', {waitUntil:'networkidle', timeout:60000});
  await p.waitForTimeout(2200);
  const r = await p.evaluate(() => {
    const de = document.documentElement;
    const body = document.querySelector('.page-body');
    const q = body?.getBoundingClientRect();
    const viz = [...document.querySelectorAll('canvas,svg')].map(e=>{const z=e.getBoundingClientRect();return z.width*z.height;}).sort((a,c)=>c-a)[0]||0;
    return { vw: innerWidth, scrollW: de.scrollWidth, overX: de.scrollWidth > innerWidth + 1,
             vh: innerHeight, scrollH: de.scrollHeight, overY: de.scrollHeight > innerHeight + 2,
             bodyW: q?Math.round(q.width):0, widthPct: q?+(100*q.width/innerWidth).toFixed(1):0,
             vizPct: +(100*viz/(innerWidth*innerHeight)).toFixed(1) };
  });
  const ok = !r.overX && r.widthPct > 98 && !r.overY;
  if (!ok) fail++;
  console.log(`${w}x${h} ${ok?'PASS':'FAIL'} ` + JSON.stringify(r));
  await p.context().close();
}
await b.close();
console.log(fail ? '\nFIT GATE FAILED' : '\nFIT GATE PASSED: full width, no horizontal drag, no scroll to reach the footer.');
process.exit(fail?1:0);
