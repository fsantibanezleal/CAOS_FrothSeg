/** ADR-0070 8: the flow IS the feature, and verification is by CLICKING.
 *
 *  A check that navigates straight to /focus/<id> proves the route renders and proves nothing
 *  about whether a user can get there. ChargeCascade shipped exactly that failure: route, deep
 *  links, parameter rail, all deployed, and no way to open any of it from the App. It passed a
 *  URL fetch and passed screenshots.
 *
 *  So this loads the App, CLICKS the entry control, asserts the focus view rendered on the
 *  selected scenario, measures the stage share, CLICKS return, and asserts the App came back
 *  with the same scenario still selected.
 */
import { chromium } from 'playwright';

const BASE = process.env.FS_BASE || 'http://localhost:4627';
const SIZES = [[1280, 800], [1600, 900], [2560, 1440]];
const THEMES = ['dark', 'light'];

const browser = await chromium.launch();
let failures = 0;

for (const theme of THEMES) {
  for (const [width, height] of SIZES) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
    await page.addInitScript((t) => localStorage.setItem('caos.theme', t), theme);

    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    // Pick a scenario that is NOT the default, so "same scenario preserved" is a real assertion.
    await page.getByRole('button', { name: /Sequence|Secuencia/ }).first().click();
    await page.waitForTimeout(1200);
    const select = page.locator('.fs-side select').first();
    const options = await select.locator('option').all();
    const targetValue = options.length > 2 ? await options[2].getAttribute('value') : null;
    if (targetValue) { await select.selectOption(targetValue); await page.waitForTimeout(900); }
    const chosenBefore = await select.inputValue().catch(() => '');

    // 1. the entry control must exist and be visible IN THE APP
    const entry = page.locator('.fs-focus-enter');
    const entryVisible = await entry.isVisible().catch(() => false);
    if (!entryVisible) {
      console.log(`${theme} ${width}x${height} FAIL: no visible focus entry control in the App`);
      failures++; await context.close(); continue;
    }

    // 2. clicking it opens the focus view
    await entry.click();
    await page.waitForTimeout(1800);
    const focusRendered = await page.locator('.fs-focus').isVisible().catch(() => false);
    const url = page.url();
    if (!focusRendered) {
      console.log(`${theme} ${width}x${height} FAIL: clicking the entry did not render the focus view (url ${url})`);
      failures++; await context.close(); continue;
    }

    // 3. the stage owns the viewport (ADR-0070 1: at least 80%)
    const stage = await page.evaluate(() => {
      const el = document.querySelector('.fs-focus-stage');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const canvas = el.querySelector('canvas');
      const c = canvas ? canvas.getBoundingClientRect() : null;
      return {
        stagePct: +(100 * (r.width * r.height) / (innerWidth * innerHeight)).toFixed(1),
        canvasPct: c ? +(100 * (c.width * c.height) / (innerWidth * innerHeight)).toFixed(1) : 0,
        hud: Boolean(document.querySelector('.fs-focus-hud')),
        label: Boolean(document.querySelector('.fs-focus-label')),
        rail: Boolean(document.querySelector('.fs-focus-rail')),
        docOverflow: document.documentElement.scrollHeight > innerHeight + 2,
      };
    });

    // 4. the return control lands back on the App with the SAME scenario
    await page.locator('.fs-focus-exit').first().click();
    await page.waitForTimeout(1800);
    const backOnApp = await page.locator('.fs-layout').isVisible().catch(() => false);
    const chosenAfter = await page.locator('.fs-side select').first().inputValue().catch(() => '');
    const preserved = Boolean(chosenBefore) && chosenBefore === chosenAfter;

    const ok = focusRendered && backOnApp && preserved
      && stage && stage.stagePct >= 80 && stage.hud && stage.label && stage.rail
      && !stage.docOverflow && errors.length === 0;
    if (!ok) failures++;
    console.log(
      `${theme} ${width}x${height} ${ok ? 'PASS' : 'FAIL'} `
      + JSON.stringify({ ...stage, backOnApp, scenario: `${chosenBefore}->${chosenAfter}`, preserved, errors: errors.length }),
    );
    if (errors.length) errors.slice(0, 3).forEach((e) => console.log('    ', e));
    await context.close();
  }
}

await browser.close();
console.log(failures ? '\nFOCUS FLOW GATE FAILED' : '\nFOCUS FLOW GATE PASSED: reachable by clicking, stage owns the viewport, round trip preserves the scenario.');
process.exit(failures ? 1 : 0);
