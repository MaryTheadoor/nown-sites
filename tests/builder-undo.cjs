#!/usr/bin/env node
/* ==========================================================================
   builder-undo.cjs — the builder's state layer, driven in a real browser

   History, drafts and import are the three things that make a builder safe to
   use, and all three are behaviour rather than data — a unit test of snapshot()
   would prove nothing about whether an undo button actually undoes. So this
   drives the real page: add tiles, move one, delete one, undo each, and assert
   on SITES.builder.instance.state, which is the authority.

   It asserts on STATE, not on DOM rows. The structure list renders an <li> for
   its own empty state, so counting rows measures nothing — a mistake this test
   made on its first run and now documents.

   Needs playwright; SKIPS loudly without it.
   Run: node tests/builder-undo.cjs [--playwright <dir>]
   ========================================================================== */
const { skip } = require('./_skip.cjs');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site/public');

const pwIdx = process.argv.indexOf('--playwright');
const PW_DIR = pwIdx >= 0 ? path.resolve(process.argv[pwIdx + 1]) : path.join(os.homedir(), '.agents', 'tools', 'browser');
let chromium = null;
try { chromium = createRequire(path.join(PW_DIR, 'noop.js'))('playwright').chromium; }
catch (err) {
  skip('playwright not found at ' + PW_DIR, 'Pass --playwright <dir> to point at it.');
}

if (!fs.existsSync(path.join(SITE, 'builder.html'))) {
  skip('no site/public/builder.html to drive');
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const serve = (route) => {
  const url = new URL(route.request().url());
  const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = path.join(SITE, rel);
  if (file.startsWith(SITE) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    route.fulfill({ path: file, contentType: MIME[path.extname(file)] || 'application/octet-stream' });
  } else {
    route.fulfill({ status: 404, body: 'not found' });
  }
};

let pass = 0, fail = 0;
const check = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return; }
  fail++;
  console.log('FAIL ' + label + '\n  got  ' + JSON.stringify(got) + '\n  want ' + JSON.stringify(want));
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.route('**/*', serve);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });

  await page.goto('http://builder.test/builder.html', { waitUntil: 'load' });
  await page.waitForSelector('.bld-pick', { timeout: 20000 });

  const tiles = () => page.evaluate(() => SITES.builder.instance.state.tiles.length);
  const order = () => page.evaluate(() => SITES.builder.instance.state.tiles.map((t) => t.type).join(','));
  const depth = () => page.evaluate(() => SITES.builder.instance.historyDepth());
  const undo = page.locator('.bld-tool', { hasText: 'Undo' }).first();
  const redo = page.locator('.bld-tool', { hasText: 'Redo' }).first();

  const tools = await page.evaluate(() => [...document.querySelectorAll('.bld-toolbar .bld-tool')].map((x) => x.textContent));
  check('toolbar exposes undo/redo/open', tools, ['Undo', 'Redo', 'Open…']);
  check('the toolbar leads with the screen name', await page.locator('.bld-screenname').count(), 1);
  check('the inspector has four tabs', await page.evaluate(() => [...document.querySelectorAll('.bld-tab')].map((x) => x.textContent)), ['Content', 'Layout', 'Site', 'Code']);
  check('the preview offers four viewports plus the overlay', await page.evaluate(() => [...document.querySelectorAll('.bld-viewbar-row .bld-tool')].map((x) => x.textContent)), ['Fill', 'Desktop', 'Tablet', 'Mobile', 'Grid']);
  check('undo starts disabled', await undo.isDisabled(), true);

  for (const i of [0, 1, 2]) { await page.locator('.bld-pick').nth(i).click(); await page.waitForTimeout(320); }
  check('three adds', await tiles(), 3);
  check('undo enabled after an edit', await undo.isDisabled(), false);

  await undo.click(); await page.waitForTimeout(280);
  check('undo removes the last tile', await tiles(), 2);
  await undo.click(); await page.waitForTimeout(280);
  check('undo again', await tiles(), 1);
  await redo.click(); await page.waitForTimeout(280);
  check('redo restores it', await tiles(), 2);

  // The page-order list lives in the inspector's Layout tab, so select a tile the
  // way a person would: switch to that tab first.
  const layoutTab = page.locator('.bld-tab', { hasText: 'Layout' });
  const contentTab = page.locator('.bld-tab', { hasText: 'Content' });
  await layoutTab.click(); await page.waitForTimeout(300);
  check('the structure list is reachable from the Layout tab', await page.locator('.bld-move').count() > 0, true);

  const before = await order();
  await page.locator('.bld-move').nth(2).click(); await page.waitForTimeout(350);
  const moved = await order();
  check('move reorders', moved !== before, true);
  await undo.click(); await page.waitForTimeout(280);
  check('undo restores the order', await order(), before);

  const n0 = await tiles();
  await page.locator('.bld-del').first().click(); await page.waitForTimeout(350);
  check('delete removes a tile', await tiles(), n0 - 1);
  await undo.click(); await page.waitForTimeout(280);
  check('undo restores a deleted tile', await tiles(), n0);

  // The admin widgets fire on every keystroke. Without coalescing, typing a
  // headline would be forty undo steps and the history would be useless.
  //
  // Driven IN PAGE. Measuring this across a CDP round trip made the assertion
  // flaky: each locator.fill() costs a round trip, so three of them plus the
  // waits could straddle the 600ms window and produce two steps instead of one.
  // The rule being tested is about the gap between edits, not about Playwright's
  // latency, so the edits are dispatched where the clock is the app's.
  await page.locator('.bld-name').first().click(); await page.waitForTimeout(300);
  await contentTab.click(); await page.waitForTimeout(300);
  const burst = await page.evaluate(async () => {
    const inst = SITES.builder.instance;
    const inputs = [...document.querySelectorAll('.bld-col--edit .adm-field input')];
    const field = inputs[2];
    if (!field) return { error: 'no field at index 2', count: inputs.length };
    const before = inst.historyDepth();
    const type = async (v) => {
      field.value = v;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
    };
    await type('A');
    await type('AB');
    await type('ABC');
    return { before, after: inst.historyDepth(), value: field.value, key: inst.state.tiles[inst.state.index].config && Object.keys(inst.state.tiles[inst.state.index].config)[0] };
  });
  check('a burst of edits to one field is one undo step', burst.after - burst.before, 1);
  check('the typed value reached the tile', burst.value, 'ABC');
  // And a second burst on the SAME field later is a separate step.
  const second = await page.evaluate(async () => {
    const inst = SITES.builder.instance;
    await new Promise((r) => setTimeout(r, 700));
    const field = [...document.querySelectorAll('.bld-col--edit .adm-field input')][2];
    const before = inst.historyDepth();
    field.value = 'ABCD';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return { before, after: inst.historyDepth() };
  });
  check('a later edit to the same field is a new step', second.after - second.before, 1);

  // The export must reflect the state the UI shows.
  check('export matches the tile count', await page.evaluate(() => SITES.builder.instance.content().content.length), await tiles());

  // Draft: written on edit, offered after a reload, restorable.
  await page.waitForTimeout(500);
  const draft = await page.evaluate(() => { const d = localStorage.getItem('sites.builder.draft.v1'); return d ? JSON.parse(d).state.tiles.length : null; });
  check('a draft is written', draft, await tiles());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);
  check('the draft is offered after a reload', await page.locator('.bld-notice').count(), 1);
  await page.locator('.bld-notice button', { hasText: 'Restore' }).click();
  await page.waitForTimeout(500);
  check('restoring brings the tiles back', await tiles(), draft);

  check('no console errors', errors.slice(0, 3), []);

  await browser.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.log('FAIL: ' + err.message); process.exit(1); });