#!/usr/bin/env node
/* ==========================================================================
   builder-validate.cjs — the live validation panel

   The builder mirrors the rules tools/check-site.mjs enforces so a defect is
   visible where it is made rather than at the gate. This asserts the rules fire
   on a deliberately broken page, that a clean page is quiet, and that the panel
   is honest about the difference between an error and a warning.

   It also asserts there are NO page errors, which is how a scope mistake in the
   validator was caught: ensureSnippets() sat at module scope, threw 'state is not
   defined' on every render, and still left the panel looking correct because the
   throw happened after the render. Only a console check sees that.

   Needs playwright; SKIPS loudly without it.
   Run: node tests/builder-validate.cjs [--playwright <dir>]
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

  // Set state directly and ask the validator, rather than driving the whole UI.
  const ask = (patch) => page.evaluate((src) => {
    const inst = SITES.builder.instance;
    Object.assign(inst.state, JSON.parse(src));
    inst.refresh();
    return inst.validate();
  }, JSON.stringify(patch));
  const rules = (ps) => ps.map((x) => x.level + ':' + x.message);

  // --- a clean page is quiet ---------------------------------------------
  await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('.bld-pick')].find((x) => x.querySelector('strong').textContent.trim().endsWith('Hero'));
    btn.click(); await new Promise((r) => setTimeout(r, 900));
  });
  let ps = await ask({ site: { name: 'Quiet', baseUrl: 'https://example.com' } });
  check('a named site with a base URL and one hero is clean', ps, []);
  ps = await page.evaluate(() => SITES.builder.instance.validate());
  check('and it stays clean on a second look', ps, []);

  // --- unnamed, unbased ----------------------------------------------------
  ps = await ask({ site: { name: '', baseUrl: '' } });
  check('an unnamed site warns', rules(ps).filter((r) => r.includes('no name')).length, 1);
  check('a site with no base URL warns', rules(ps).filter((r) => r.includes('No base URL')).length, 1);

  // --- duplicate ids -------------------------------------------------------
  ps = await page.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.site = { name: 'X', baseUrl: 'https://x.test' };
    inst.state.tiles = [
      { id: 'dup', type: 'hero', config: {}, description: '' },
      { id: 'dup', type: 'hero', config: {}, description: '' },
    ];
    inst.state.index = 0;
    inst.refresh();
    return inst.validate();
  });
  check('a duplicate id is an error', ps.filter((x) => x.level === 'error' && x.message.includes('Duplicate id')).length, 1);

  // --- missing id ----------------------------------------------------------
  ps = await page.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.tiles = [{ id: '', type: 'hero', config: {}, description: '' }];
    inst.refresh();
    return inst.validate();
  });
  check('a tile with no id is an error', ps.filter((x) => x.level === 'error' && x.message.includes('has no id')).length, 1);

  // --- unregistered type ---------------------------------------------------
  ps = await page.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.tiles = [{ id: 'x-1', type: 'not-a-tile', config: {}, description: '' }];
    inst.refresh();
    return inst.validate();
  });
  check('an unregistered type is an error', ps.filter((x) => x.level === 'error' && x.message.includes('not a registered tile type')).length, 1);

  // --- layout ranges -------------------------------------------------------
  const spanCase = (span) => page.evaluate((v) => {
    const inst = SITES.builder.instance;
    inst.state.site = { name: 'X', baseUrl: 'https://x.test', layout: { mode: 'cols' } };
    inst.state.tiles = [{ id: 'a-1', type: 'hero', config: {}, description: '', layout: { span: v } }];
    inst.state.index = 0;
    inst.refresh();
    return inst.validate();
  }, span);
  check('span 0 is an error', (await spanCase(0)).filter((x) => x.level === 'error').length, 1);
  check('span 13 is an error', (await spanCase(13)).filter((x) => x.level === 'error').length, 1);
  check('span 6 is fine', (await spanCase(6)).filter((x) => x.level === 'error').length, 0);
  check('span 2.5 is an error', (await spanCase(2.5)).filter((x) => x.level === 'error').length, 1);
  check('spanSm 7 is an error', await page.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.tiles[0].layout = { spanSm: 7 };
    inst.refresh();
    return inst.validate().filter((x) => x.level === 'error' && x.message.includes('spanSm')).length;
  }), 1);

  // --- layout in automatic mode is only a warning --------------------------
  const autoMode = await page.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.site.layout = { mode: 'auto' };
    inst.state.tiles = [{ id: 'a-1', type: 'hero', config: {}, description: '', layout: { span: 6 } }];
    inst.refresh();
    return inst.validate();
  });
  check('a span in automatic mode warns but does not error', autoMode.filter((x) => x.level === 'error').length, 0);
  check('and it says why', autoMode.filter((x) => x.message.includes('automatic mode')).length, 1);

  // --- unknown layout key --------------------------------------------------
  const unknownKey = await page.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.tiles = [{ id: 'a-1', type: 'hero', config: {}, description: '', layout: { nope: 3 } }];
    inst.refresh();
    return inst.validate();
  });
  check('an unknown layout key warns', unknownKey.filter((x) => x.message.includes('not a known key')).length, 1);

  // --- no tiles ------------------------------------------------------------
  const empty = await page.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.tiles = [];
    inst.state.index = -1;
    inst.refresh();
    return inst.validate();
  });
  check('an empty page warns', empty.filter((x) => x.message.includes('No tiles yet')).length, 1);

  // --- the panel itself ----------------------------------------------------
  const panel = await page.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.site = { name: 'Panel', baseUrl: 'https://panel.test' };
    inst.state.tiles = [{ id: 'a-1', type: 'hero', config: {}, description: '', layout: { span: 99 } }];
    inst.state.index = 0;
    inst.refresh();
    const box = document.querySelector('.bld-problems');
    return { shown: !box.hidden, head: box.querySelector('.bld-problems__head').innerText.replace(/\n/g, ' | '), items: [...box.querySelectorAll('.bld-problems__jump')].map((x) => x.textContent) };
  });
  check('the panel appears when there are problems', panel.shown, true);
  check('the header counts an error', panel.head.includes('1 error'), true);
  // Two, not one: an out-of-range span in automatic mode is BOTH an error and a
  // warning, and both are worth saying.
  check('the panel lists every problem', panel.items.length, 2);
  check('including the range error', panel.items.some((s) => s.includes('layout.span is 99')), true);
  check('and the mode warning', panel.items.some((s) => s.includes('automatic mode')), true);

  const quietPanel = await page.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.tiles = [{ id: 'a-1', type: 'hero', config: {}, description: '' }];
    inst.refresh();
    return document.querySelector('.bld-problems').hidden;
  });
  check('and disappears when there are none', quietPanel, true);

  check('no page errors', errors.slice(0, 4), []);
  await browser.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.log('FAIL: ' + err.message); process.exit(1); });