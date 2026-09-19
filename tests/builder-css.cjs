#!/usr/bin/env node
/* ==========================================================================
   builder-css.cjs — the tile CSS level

   The cosmetic escape hatch from docs/BUILDER-PLAN.md 3.6: a small block of CSS
   per instance, held in a site-level stylesheet, token-linted. Three claims make
   it safe, and all three are asserted here:

     1. IT CANNOT ESCAPE ITS SCOPE. The framework wraps the block in
        [data-tile-id="…"], so a rule written for one tile does not touch its
        neighbour — including a neighbour of the same type. That is the whole
        safety property, and it is why the lint refuses braces before the text
        ever reaches a stylesheet.

     2. IT OBEYS RULE 3. Tokens only. A hardcoded colour is the one thing that
        cannot survive a re-theme, and re-theming is what the hatch exists to
        respect.

     3. IT WORKS WITH JAVASCRIPT OFF. Baked into the served HTML, not injected on
        load — a tile block that appears only once a script runs is a flash of
        unstyled tile on every visit.

   The bake half runs against a THROWAWAY site in the temp directory, so the test
   never mutates the repo it is checking.

   Needs playwright; SKIPS loudly without it.
   Run: node tests/builder-css.cjs [--playwright <dir>]
   ========================================================================== */
const { skip } = require('./_skip.cjs');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
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

/* ---- the bake half, against a throwaway site ---------------------------- */
function bakeIntoATempSite(css, id) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sites-css-'));
  const page = [
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title></head>',
    '<body><div class="sites-plate"><main class="sites-container">',
    '<section class="tile tile-hero" data-tile="hero" data-tile-id="' + id + '"><h1 data-role="headline">Hi</h1></section>',
    '</main></div>',
    '<script src="src/js/tile-registry.js"></script>',
    '<script src="src/js/sites.js"></script>',
    '<script src="src/js/sites-content.js"></script>',
    '</body></html>'
  ].join('\n');
  const doc = {
    site: { name: 'Temp', baseUrl: 'https://temp.test' },
    content: [{ id: id, type: 'hero', config: { headline: 'Hi' } }]
  };
  if (css) doc.content[0].css = css;
  fs.writeFileSync(path.join(tmp, 'index.html'), page);
  fs.writeFileSync(path.join(tmp, 'content.json'), JSON.stringify(doc, null, 2));
  // bake.mjs exits 1 whenever it has warnings, and a refused CSS block IS a
  // warning — so a non-zero exit here is expected behaviour half the time, not a
  // failure. This reports what happened and returns the file either way; the caller
  // decides whether the outcome was right. (The first version threw on any non-zero
  // exit and reported a bare "Command failed", which said nothing about which case
  // had failed or why.)
  let out = '';
  let code = 0;
  try {
    out = execFileSync('node', [path.join(ROOT, 'tools/bake.mjs'), tmp], { stdio: 'pipe' }).toString();
  } catch (err) {
    code = err.status;
    out = String(err.stdout || '') + String(err.stderr || '');
  }
  const baked = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });
  return { baked, out, code };
}

(async () => {
  // ---- the bake half -----------------------------------------------------
  const good = bakeIntoATempSite('padding: var(--space-12);', 'home-hero');
  check('a clean bake exits 0', good.code, 0);
  check('and writes a site-level style element', good.baked.indexOf('<style data-tile-css') !== -1, true);
  check('scoped to the tile id', good.baked.indexOf('[data-tile-id="home-hero"]') !== -1, true);
  check('with the declarations intact', good.baked.indexOf('padding: var(--space-12);') !== -1, true);

  const clean = bakeIntoATempSite('', 'home-hero');
  check('and no block at all when there is no css', clean.baked.indexOf('data-tile-css'), -1);

  // An escaping brace must never reach a stylesheet, and the bake must say so.
  const brace = bakeIntoATempSite('padding: 1rem; } body { display: none', 'home-hero');
  check('an escaping brace is never baked', brace.baked.indexOf('data-tile-css'), -1);
  check('and the bake reports it', brace.out.indexOf('No braces') !== -1, true);
  check('and exits non-zero', brace.code !== 0, true);

  const colour = bakeIntoATempSite('background: #ff0000;', 'home-hero');
  check('a hardcoded colour is never baked either', colour.baked.indexOf('data-tile-css'), -1);
  check('and it is named in the report', colour.out.indexOf('#ff0000') !== -1, true);

  // ---- the builder half --------------------------------------------------
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  await ctx.route('**/*', serve);
  const page2 = await ctx.newPage();
  const errors = [];
  page2.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page2.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) errors.push(t); });
  await page2.goto('http://builder.test/builder.html', { waitUntil: 'load' });
  await page2.waitForSelector('.bld-pick', { timeout: 20000 });
  await page2.evaluate(() => localStorage.removeItem('sites.builder.draft.v1'));

  // TWO tiles of the SAME type, so scoping has something to fail against.
  await page2.evaluate(async () => {
    const btn = [...document.querySelectorAll('.bld-pick')].find((x) => x.querySelector('strong').textContent.trim().endsWith('Hero'));
    btn.click(); await new Promise((r) => setTimeout(r, 600));
    btn.click(); await new Promise((r) => setTimeout(r, 600));
    const inst = SITES.builder.instance;
    inst.state.site.name = 'CSS Test';
    inst.state.tiles[0].id = 'hero-one';
    inst.state.tiles[1].id = 'hero-two';
    inst.state.index = 0;
    inst.refresh();
  });
  await page2.waitForTimeout(700);
  check('two tiles of the same type are on the page', await page2.evaluate(() => SITES.builder.instance.state.tiles.length), 2);

  await page2.locator('.bld-tab', { hasText: 'Code' }).click();
  await page2.waitForTimeout(500);
  const cssBox = page2.locator('.bld-cssedit');
  check('the Code tab offers a tile CSS box', await cssBox.count(), 1);

  // Live lint.
  await cssBox.fill('padding: 1rem; } body { display: none');
  await page2.waitForTimeout(400);
  check('a brace is reported as an error', await page2.locator('.bld-csslint__item.is-error').count() > 0, true);
  await cssBox.fill('background: #ff0000;');
  await page2.waitForTimeout(400);
  const colourMsg = await page2.locator('.bld-csslint__item.is-error').first().innerText();
  check('a hardcoded colour is reported', colourMsg.indexOf('#ff0000') !== -1, true);
  await cssBox.fill('padding: 1rem !important;');
  await page2.waitForTimeout(400);
  check('!important warns without erroring', await page2.evaluate(() => ({ err: document.querySelectorAll('.bld-csslint__item.is-error').length, warn: document.querySelectorAll('.bld-csslint__item.is-warn').length })), { err: 0, warn: 1 });

  await cssBox.fill('padding: var(--space-12);\nborder-radius: var(--radius-xl);');
  await page2.waitForTimeout(600);
  check('a clean token block reports all clear', await page2.locator('.bld-csslint__item.is-ok').count(), 1);
  check('and it reaches the entry', await page2.evaluate(() => SITES.builder.instance.state.tiles[0].css), 'padding: var(--space-12);\nborder-radius: var(--radius-xl);');

  // ---- scoping: the neighbour must not move ------------------------------
  const scoped = await page2.evaluate(() => {
    const doc = document.querySelector('.bld-preview').contentDocument;
    const style = doc.querySelector('style[data-tile-css]');
    const one = doc.querySelector('[data-tile-id="hero-one"]');
    const two = doc.querySelector('[data-tile-id="hero-two"]');
    const p = (n) => getComputedStyle(n).paddingTop;
    return {
      stylePresent: !!style,
      styleText: style ? style.textContent.trim().slice(0, 60) : null,
      onePadding: p(one),
      twoPadding: p(two),
    };
  });
  check('the preview carries one scoped style element', scoped.stylePresent, true);
  // A block that fails the lint must never reach the preview's stylesheet. The
  // binder used to wrap without checking, so "} body { display: none" closed the
  // scope the wrap had opened and blanked the entire preview — the baker refused
  // the same block, and only the binder did not.
  const escaped = await page2.evaluate(async () => {
    const inst = SITES.builder.instance;
    inst.state.tiles[0].css = 'padding: var(--space-4); } body { display: none';
    inst.refresh();
    await new Promise((r) => setTimeout(r, 500));
    const doc = document.querySelector('.bld-preview').contentDocument;
    const body = doc.body;
    return {
      bodyDisplay: getComputedStyle(body).display,
      tileDisplay: getComputedStyle(doc.querySelector('[data-tile-id="hero-one"]')).display,
      injected: !!doc.querySelector('style[data-tile-css]'),
    };
  });
  check('a block that fails the lint is not injected', escaped.injected, false);
  check('and the page is not hidden by it', escaped.bodyDisplay, 'block');
  check('and the tile still renders', escaped.tileDisplay, 'block');
  await page2.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.tiles[0].css = 'padding: var(--space-12);\nborder-radius: var(--radius-xl);';
    inst.refresh();
  });
  await page2.waitForTimeout(600);
  check('wrapped in the tile id', scoped.styleText.indexOf('[data-tile-id="hero-one"]') === 0, true);
  check('the rule applies to its own tile', scoped.onePadding !== '0px', true);
  check('and NOT to the neighbour of the same type', scoped.twoPadding === '0px' || scoped.twoPadding !== scoped.onePadding, true);

  // Give the neighbour a different block; the first must not change.
  await page2.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.tiles[1].css = 'padding: var(--space-1);';
    inst.refresh();
  });
  await page2.waitForTimeout(700);
  const both = await page2.evaluate(() => {
    const doc = document.querySelector('.bld-preview').contentDocument;
    return {
      one: getComputedStyle(doc.querySelector('[data-tile-id="hero-one"]')).paddingTop,
      two: getComputedStyle(doc.querySelector('[data-tile-id="hero-two"]')).paddingTop,
      blocks: (doc.querySelector('style[data-tile-css]').textContent.match(/\[data-tile-id=/g) || []).length,
    };
  });
  check('two tiles carry two scoped blocks', both.blocks, 2);
  check('and each keeps its own padding', both.one !== both.two, true);

  // ---- the export and the blueprint --------------------------------------
  check('the export carries the block', await page2.evaluate(() => SITES.builder.instance.content().content[0].css), 'padding: var(--space-12);\nborder-radius: var(--radius-xl);');
  check('and the blueprint does', await page2.evaluate(() => SITES.builder.instance.blueprint().indexOf('css: |') !== -1), true);

  // ---- undo covers it -----------------------------------------------------
  await page2.locator('.bld-toolbar .bld-tool', { hasText: 'Undo' }).first().click();
  await page2.waitForTimeout(700);
  check('undo reverses a CSS edit', await page2.evaluate(() => SITES.builder.instance.state.tiles[1].css), undefined);

  check('no console errors', errors.slice(0, 4), []);
  await browser.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.log('FAIL: ' + err.message); process.exit(1); });
