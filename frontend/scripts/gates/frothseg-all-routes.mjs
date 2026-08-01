/** Every route, both themes, three viewports. The gate that should have existed first.
 *
 *  The existing gates check the App route: `_fit.mjs`, `frothseg-instrument-fit.mjs` and
 *  `frothseg-focus-flow.mjs` all load `/` and measure the workbench. That is exactly the blind
 *  spot that let a real regression ship twice: a `height: 100dvh; overflow: hidden` rule added
 *  for the App leaked to every route and truncated all five documentation pages, leaving 12% of
 *  Introduction reachable with no scrollbar. Every App gate passed while it did.
 *
 *  So this asserts the properties that must hold on EVERY route:
 *    - content is reachable: nothing extends past its scroll container without a way to scroll
 *    - no horizontal drag
 *    - the page is not empty, and not a bare heading with nothing under it
 *    - zero console errors and zero failed requests
 *
 *  A document SHOULD scroll and a workbench MUST NOT, so "reachable" is checked against
 *  whichever element actually owns the overflow, not against the document alone.
 */
import { chromium } from 'playwright';

const BASE = process.env.FS_BASE || 'http://localhost:4627';
const ROUTES = ['', 'introduction', 'methodology', 'implementation', 'experiments', 'benchmark'];
const SIZES = [[1280, 800], [1600, 900], [2560, 1440]];
const THEMES = ['dark', 'light'];
/** The App route is the one place where the viewport lock is correct. */
const NO_SCROLL = new Set(['']);


/** One measurement of the currently loaded page. */
async function measure(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.app-shell > .page');
    const body = document.querySelector('.page-body');
    const doc = document.documentElement;
    /** The element that actually owns vertical overflow for this route. */
    const owner = shell && getComputedStyle(shell).overflowY === 'auto' ? shell : doc;
    const clipped = shell
      ? shell.scrollHeight > shell.clientHeight + 2 && getComputedStyle(shell).overflowY === 'hidden'
      : false;
    return {
      words: document.body.innerText.split(/\s+/).filter(Boolean).length,
      overX: doc.scrollWidth > window.innerWidth + 2,
      contentH: shell ? shell.scrollHeight : doc.scrollHeight,
      viewH: shell ? shell.clientHeight : window.innerHeight,
      canScroll: owner.scrollHeight > owner.clientHeight + 2,
      clipped,
      bodyW: body ? Math.round(body.getBoundingClientRect().width) : 0,
    };
  });
}

const browser = await chromium.launch();
let failures = 0;

for (const theme of THEMES) {
  for (const [width, height] of SIZES) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(`js: ${String(e).slice(0, 90)}`));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 90)}`); });
    page.on('requestfailed', (r) => problems.push(`net: ${r.failure()?.errorText} ${r.url().slice(-50)}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()} ${r.url().slice(-50)}`); });
    await page.addInitScript((t) => localStorage.setItem('caos.theme', t), theme);

    for (const route of ROUTES) {
      /* Loaded twice on trouble before failing. The first revision of this gate failed 4 of 36
         combinations on a build that then passed 36 of 36 unchanged: a transient artifact fetch
         during hydration reported as a console error. A gate that fails at random teaches people
         to re-run it until it is green, which is worse than having no gate at all. A defect that
         is real reproduces on the second load; a race usually does not. */
      let m = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        problems.length = 0;
        await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(attempt === 0 ? 1800 : 3200);
        m = await measure(page);
        if (!problems.length) break;
      }

      const label = route || 'app(/)';
      const reasons = [];
      if (m.clipped) reasons.push(`CONTENT UNREACHABLE (${m.contentH}px in a ${m.viewH}px box, overflow hidden)`);
      if (m.overX) reasons.push('horizontal drag');
      if (m.words < 120) reasons.push(`thin page (${m.words} words)`);
      if (NO_SCROLL.has(route) && m.canScroll) reasons.push('workbench route scrolls');
      if (problems.length) reasons.push(`${problems.length} console/network problems`);

      if (reasons.length) {
        failures += 1;
        console.log(`${theme} ${width}x${height} ${label.padEnd(15)} FAIL: ${reasons.join('; ')}`);
        problems.slice(0, 2).forEach((p) => console.log('      ', p));
      } else {
        console.log(`${theme} ${width}x${height} ${label.padEnd(15)} PASS ${JSON.stringify({ words: m.words, contentH: m.contentH, scrolls: m.canScroll })}`);
      }
    }
    await context.close();
  }
}

await browser.close();
console.log(failures
  ? `\nALL-ROUTES GATE FAILED (${failures} route/viewport/theme combinations)`
  : '\nALL-ROUTES GATE PASSED: every route reachable, no horizontal drag, no empty pages, no console or network errors.');
process.exit(failures ? 1 : 0);
