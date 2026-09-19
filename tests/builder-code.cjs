#!/usr/bin/env node
/* ==========================================================================
   builder-code.cjs — the code panel

   The design calls this a demonstration surface first and an editor second, so
   this asserts both halves: that the view is readable, annotated and connected to
   the inspector, and that editing writes into the same document the UI edits.

   It asserts FIDELITY, which is the panel's whole claim. Values must be quoted
   exactly as JSON.stringify writes them — an earlier version exploded a multi-line
   string into an array of paragraphs, which read nicely and was a lie about the
   artifact. And Edit mode must be byte-identical to JSON.stringify(entry, null, 2),
   because that is the form Apply round-trips through.

   Pointer assertions use REAL pointer movement. Dispatching a synthetic MouseEvent
   proves the listener exists and nothing about whether hovering works — a mistake
   this suite has now made three times, always in the direction of a false failure.

   Needs playwright; SKIPS loudly without it.
   Run: node tests/builder-code.cjs [--playwright <dir>]
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
if (!fs.existsSync(path.join(SITE, 'builder.html'))) skip('no site/public/builder.html to drive');

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const serve = (route) => {
  const url = new URL(route.request().url());
  const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = path.join(SITE, rel);
  if (file.startsWith(SITE) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    route.fulfill({ path: file, contentType: MIME[path.extname(file)] || 'application/octet-stream' });
  } else { route.fulfill({ status: 404, body: 'not found' }); }
};

let pass = 0, fail = 0;
const check = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return; }
  fail++;
  console.log('FAIL ' + label + '\n  got  ' + JSON.stringify(got) + '\n  want ' + JSON.stringify(want));
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1020 } });
  await ctx.route('**/*', serve);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) errors.push(t); });
  await page.goto('http://builder.test/builder.html', { waitUntil: 'load' });
  await page.waitForSelector('.bld-pick', { timeout: 20000 });
  await page.evaluate(() => localStorage.removeItem('sites.builder.draft.v1'));

  await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('.bld-pick')].find((x) => x.querySelector('strong').textContent.trim().endsWith('Hero'));
    btn.click();
    await new Promise((r) => setTimeout(r, 900));
    const inst = SITES.builder.instance;
    inst.state.site.name = 'Code Panel Test';
    inst.state.tiles[0].config = { headline: 'Same-day cash for gold', body: 'Line one.\n\nLine two.' };
    inst.state.tiles[0].layout = { span: 7 };
    inst.refresh();
  });

  const codeTab = page.locator('.bld-tab', { hasText: 'Code' });
  const contentTab = page.locator('.bld-tab', { hasText: 'Content' });
  await codeTab.click(); await page.waitForTimeout(600);

  // --- the view is annotated and readable ---------------------------------
  const rows = await page.evaluate(() => [...document.querySelectorAll('.bld-coderow')].map((r) => r.querySelector('.bld-codetext').textContent));
  const notes = await page.evaluate(() => [...document.querySelectorAll('.bld-codenote')].map((r) => r.textContent));
  check('the entry renders as code rows', rows.length > 6, true);
  check('the opening brace is the first row', rows[0], '{');
  check('the closing brace is the last row', rows[rows.length - 1], '}');
  check('the id line is present', rows.some((r) => r.includes('"id": "hero-1"')), true);
  check('the layout line is present', rows.some((r) => r.includes('"layout"')), true);
  check('annotations are rendered', notes.length >= 4, true);
  check('and they are NOT truncated', notes.includes('← the binder matches data-tile-id against this'), true);
  check('the role annotation names the slot', notes.some((n) => n.includes('[data-role="headline"]')), true);
  check('multi-line copy is annotated with its paragraph count', notes.some((n) => n.includes('2 paragraphs')), true);

  // --- fidelity: values are quoted exactly as the artifact writes them -----
  const strings = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.bld-coderow').forEach((r) => {
      const t = r.querySelector('.bld-codetext').textContent;
      const m = t.match(/^\s*"(headline|body)": (.*?),?$/);
      if (m) out[m[1]] = m[2];
    });
    return out;
  });
  check('a multi-line string stays ONE escaped string, not an array', strings.body, JSON.stringify('Line one.\n\nLine two.'));
  check('a plain string is quoted the same way', strings.headline, JSON.stringify('Same-day cash for gold'));

  // --- colourising ---------------------------------------------------------
  const tokens = await page.evaluate(() => {
    const set = new Set();
    document.querySelectorAll('.bld-codetext span').forEach((x) => set.add(x.className));
    return [...set].sort();
  });
  check('keys are tokenised', tokens.includes('tok-key'), true);
  check('strings are tokenised', tokens.includes('tok-str'), true);
  check('numbers are tokenised', tokens.includes('tok-num'), true);
  check('punctuation is tokenised', tokens.includes('tok-punc'), true);

  // --- UI sync, with REAL pointer movement --------------------------------
  await contentTab.click(); await page.waitForTimeout(400);
  await page.locator('.bld-fieldwrap[data-field=headline]').hover();
  await page.waitForTimeout(300);
  check('hovering a field lights its line', await page.evaluate(() => [...document.querySelectorAll('.bld-coderow.is-lit')].map((r) => r.getAttribute('data-field'))), ['headline']);
  await page.mouse.move(20, 20);
  await page.waitForTimeout(400);
  check('leaving clears the light', await page.evaluate(() => document.querySelectorAll('.bld-coderow.is-lit').length), 0);
  await page.locator('.bld-fieldwrap[data-field=body]').hover();
  await page.waitForTimeout(300);
  check('a different field lights a different line', await page.evaluate(() => [...document.querySelectorAll('.bld-coderow.is-lit')].map((r) => r.getAttribute('data-field'))), ['body']);

  // --- read-only until asked ----------------------------------------------
  await codeTab.click(); await page.waitForTimeout(400);
  check('the view is shown and the editor hidden by default', await page.evaluate(() => ({ view: !document.querySelector('.bld-code').hidden, edit: document.querySelector('.bld-codeedit').hidden })), { view: true, edit: true });

  const editBtn = page.locator('.bld-codemode .bld-tool', { hasText: 'Edit' });
  const applyBtn = page.locator('.bld-codemode .bld-tool', { hasText: 'Apply' });
  await editBtn.click(); await page.waitForTimeout(400);
  check('Edit reveals the textarea', await page.evaluate(() => ({ view: document.querySelector('.bld-code').hidden, edit: !document.querySelector('.bld-codeedit').hidden })), { view: true, edit: true });

  // --- Edit mode is byte-exact --------------------------------------------
  check('Edit mode is byte-identical to the artifact', await page.evaluate(() => {
    const t = SITES.builder.instance.state.tiles[0];
    const entry = { id: t.id, type: t.type };
    if (t.variant) entry.variant = t.variant;
    if (t.layout) entry.layout = t.layout;
    entry.config = t.config;
    return document.querySelector('.bld-codeedit').value === JSON.stringify(entry, null, 2);
  }), true);

  // --- guards --------------------------------------------------------------
  const msg = () => page.locator('.bld-codemsg').innerText();
  await page.locator('.bld-codeedit').fill('{ not json');
  await applyBtn.click(); await page.waitForTimeout(350);
  check('invalid JSON is refused', (await msg()).startsWith('Not valid JSON:'), true);
  await page.locator('.bld-codeedit').fill(JSON.stringify({ id: '', type: 'hero', config: {} }));
  await applyBtn.click(); await page.waitForTimeout(350);
  check('an empty id is refused', (await msg()).includes('non-empty "id"'), true);
  await page.locator('.bld-codeedit').fill(JSON.stringify({ id: 'a-1', type: 'nope', config: {} }));
  await applyBtn.click(); await page.waitForTimeout(350);
  check('an unregistered type is refused', (await msg()).includes('not a registered tile type'), true);
  check('and none of the refusals changed the tile', await page.evaluate(() => SITES.builder.instance.state.tiles[0].id), 'hero-1');

  // --- a real edit writes into the same document ---------------------------
  await page.locator('.bld-codeedit').fill(JSON.stringify({ id: 'a-1', type: 'hero', layout: { span: 5 }, config: { headline: 'Edited in code' } }, null, 2));
  await applyBtn.click(); await page.waitForTimeout(1000);
  const applied = await page.evaluate(() => {
    const inst = SITES.builder.instance;
    const t = inst.state.tiles[0];
    return {
      id: t.id,
      headline: t.config.headline,
      span: t.layout && t.layout.span,
      inExport: inst.content().content[0].config.headline,
      inBlueprint: inst.blueprint().indexOf('Edited in code') !== -1,
    };
  });
  check('the edit lands in the tile state', applied.id, 'a-1');
  check('and in the config', applied.headline, 'Edited in code');
  check('and in the layout', applied.span, 5);
  check('and in the content.json export', applied.inExport, 'Edited in code');
  check('and in the blueprint', applied.inBlueprint, true);
  check('the panel returns to the view afterwards', await page.evaluate(() => !document.querySelector('.bld-code').hidden), true);
  check('and says what happened', (await msg()).includes('Applied to #a-1'), true);

  // --- undo covers a code edit --------------------------------------------
  await page.locator('.bld-toolbar .bld-tool', { hasText: 'Undo' }).first().click();
  await page.waitForTimeout(700);
  check('undo reverses a code edit', await page.evaluate(() => { const t = SITES.builder.instance.state.tiles[0]; return { id: t.id, headline: t.config.headline }; }), { id: 'hero-1', headline: 'Same-day cash for gold' });

  check('no console errors', errors.slice(0, 4), []);
  await browser.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.log('FAIL: ' + err.message); process.exit(1); });
