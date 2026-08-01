/** ADR-0017 section 2, the content-depth rubric, measured instead of judged.
 *
 *  The ADR states per-page floors and they are numeric, so there is no reason for anyone to
 *  eyeball whether a page is "deep enough". Its own reference totals across the five RotorVitals
 *  doc pages are ~82 dense bilingual paragraphs, 34 captioned equations, ~10 hand-authored SVGs,
 *  14 honest callouts and 24 DOI-verified references.
 *
 *  Measured on FrothSeg before this gate existed: Introduction 757 words, Methodology 449,
 *  Implementation 300, Experiments 343, Benchmark 358. Every one of those passed CI, because
 *  nothing was checking. "A two-line tab is an automatic FAIL" was in the ADR the whole time.
 *
 *  A "dense paragraph" is counted as a <p> of at least 40 words, which is the smallest thing the
 *  ADR's phrase "rigorous, hundreds-of-words explanation" could charitably mean.
 */
import { chromium } from 'playwright';

const BASE = process.env.FS_BASE || 'http://localhost:4627';
const DENSE_WORDS = 40;

/** Per-page floors, quoted from ADR-0017 section 2. */
const FLOORS = {
  introduction: {
    sections: 5, equations: 3, svgs: 1, honest: 1, refsBlocks: 5, minTabs: 0,
    note: '>=5 deep sections, >=3 captioned equations, 1 honest callout, inline Refs in EVERY section',
  },
  methodology: {
    tabs: 6, equations: 12, svgs: 6, honest: 6, refsBlocks: 6, densePerTab: 4,
    note: '>=6 method-family tabs; each >=4 dense paragraphs, >=2 captioned equations, >=1 SVG, 1 honest callout, 1 Refs',
  },
  implementation: {
    tabs: 8, equations: 8, svgs: 1, honest: 8, refsBlocks: 1, densePerTab: 2,
    note: '>=8 tabs, a real architecture SVG, exact algorithm steps and constants per engine tab',
  },
  experiments: {
    tabs: 6, equations: 6, svgs: 1, honest: 1, refsBlocks: 1, densePerTab: 2,
    note: '>=6 tabs, prose and tabs never info-box cards, exact metric equations with real constants',
  },
  benchmark: {
    tabs: 0, equations: 2, svgs: 1, honest: 1, refsBlocks: 1, densePerTab: 0,
    note: 'numbers ONLY from a committed artifact; honest degradation curve; per-row provenance',
  },
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
let failures = 0;
const totals = { dense: 0, equations: 0, svgs: 0, honest: 0, refs: 0 };

for (const [route, floor] of Object.entries(FLOORS)) {
  await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  /** Tabs are traversed, because content inside an unopened tab still has to exist. */
  /* The doc pages use the shell's SubTabs (.subtablist); the App uses Tabs (.tablist).
     An earlier revision of this gate looked only for .tablist and reported "tabs 0/6" on
     pages that have eight. That is a false failure, and it is exactly the kind of unchecked
     measurement this file exists to prevent. Both are counted now. */
  /* Scoped to the FIRST tab strip on the page and re-resolved on every iteration. Clicking a
     top-level tab swaps the nested SubTabs underneath it, so a count taken once and indexed
     blindly walks off the end: the previous revision timed out on .nth(6) after the set shrank. */
  const strip = page.locator('.tablist, .subtablist').first();
  const tabCount = await strip.locator('button').count();
  const perTab = [];
  for (let i = 0; i < Math.max(tabCount, 1); i += 1) {
    if (tabCount > 0) {
      const buttons = strip.locator('button');
      if (i >= await buttons.count()) break;
      await buttons.nth(i).click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(650);
    }
    perTab.push(await page.evaluate((minWords) => {
      const scope = document.querySelector('.tabpanel:not([hidden])')
        || document.querySelector('.subtabpanel:not([hidden])')
        || document.querySelector('.page-body');
      const paras = [...scope.querySelectorAll('p')]
        .filter((p) => p.innerText.split(/\s+/).filter(Boolean).length >= minWords);
      return {
        dense: paras.length,
        equations: scope.querySelectorAll('.equation, .katex-display').length,
        captioned: [...scope.querySelectorAll('.equation')].filter((e) => e.innerText.trim().length > 40).length,
        svgs: scope.querySelectorAll('svg').length,
        honest: scope.querySelectorAll('.callout-honest').length,
        refs: scope.querySelectorAll('.th-refs').length,
        longestPara: Math.max(0, ...[...scope.querySelectorAll('p')]
          .map((el) => el.innerText.split(/\s+/).filter(Boolean).length)),
      };
    }, DENSE_WORDS));
  }

  const sum = (k) => perTab.reduce((a, t) => a + t[k], 0);
  const m = {
    tabs: tabCount,
    dense: sum('dense'),
    equations: sum('equations'),
    captioned: sum('captioned'),
    svgs: sum('svgs'),
    honest: sum('honest'),
    refs: sum('refs'),
    minDenseInAnyTab: perTab.length ? Math.min(...perTab.map((t) => t.dense)) : 0,
    longestPara: Math.max(0, ...perTab.map((t) => t.longestPara || 0)),
  };
  totals.dense += m.dense; totals.equations += m.equations; totals.svgs += m.svgs;
  totals.honest += m.honest; totals.refs += m.refs;

  const short = [];
  if (floor.tabs && m.tabs < floor.tabs) short.push(`tabs ${m.tabs}/${floor.tabs}`);
  if (floor.equations && m.equations < floor.equations) short.push(`equations ${m.equations}/${floor.equations}`);
  if (floor.svgs && m.svgs < floor.svgs) short.push(`svgs ${m.svgs}/${floor.svgs}`);
  if (floor.honest && m.honest < floor.honest) short.push(`honest callouts ${m.honest}/${floor.honest}`);
  if (floor.refsBlocks && m.refs < floor.refsBlocks) short.push(`Refs blocks ${m.refs}/${floor.refsBlocks}`);
  if (floor.densePerTab && m.minDenseInAnyTab < floor.densePerTab) {
    short.push(`thinnest tab has ${m.minDenseInAnyTab} dense paragraphs, floor is ${floor.densePerTab} ("a two-line tab is an automatic FAIL")`);
  }
  if (floor.sections && m.dense < floor.sections) short.push(`deep sections ${m.dense}/${floor.sections}`);
  /* The ADR asks for "a rigorous, hundreds-of-words explanation". A page whose LONGEST
     paragraph is caption-length has no dense prose at all, whatever its section count says. */
  if (m.longestPara < 90) short.push(`longest paragraph ${m.longestPara} words (no dense prose on the page)`);

  if (short.length) {
    failures += 1;
    console.log(`${route.padEnd(15)} FAIL  ${short.join(' · ')}`);
    console.log(`${''.padEnd(15)}       ADR floor: ${floor.note}`);
  } else {
    console.log(`${route.padEnd(15)} PASS  ${JSON.stringify(m)}`);
  }
}

await browser.close();
console.log(`\ntotals across the five doc pages: ${totals.dense} dense paragraphs · ${totals.equations} equations · ${totals.svgs} svgs · ${totals.honest} honest callouts · ${totals.refs} Refs blocks`);
console.log('ADR-0017 reference totals (RotorVitals): ~82 dense paragraphs · 34 equations · ~10 svgs · 14 honest callouts · 24 references');
console.log(failures
  ? `\nCONTENT DEPTH GATE FAILED on ${failures} of ${Object.keys(FLOORS).length} pages`
  : '\nCONTENT DEPTH GATE PASSED: every page meets its ADR-0017 section 2 floor.');
process.exit(failures ? 1 : 0);
