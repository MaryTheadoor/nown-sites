#!/usr/bin/env node
/* ==========================================================================
   builder-plate.cjs — the background plate

   site.plate is the last piece of the brief with no implementation: a background
   that can be a static colour, a static image or a simple animation. It has to
   satisfy three things at once, and this asserts all three:

     1. THE CONTENT MODEL. The builder writes it, the export carries it, and the
        blueprint carries it. The export is a projection of state, so a key the
        projection forgets is silently dropped — site.plate was missing from that
        list until this test's fixture was added, exactly as site.layout had been.

     2. THE BAKED PAGE. tools/bake.mjs writes data-plate and the CSS variables into
        the served HTML, so a page with JavaScript disabled looks the same. This is
        asserted with JavaScript OFF, because a JS-enabled check cannot tell the
        difference — the binder would repair the page either way.

     3. REDUCED MOTION. The accessibility checklist requires it be honoured, so
        "simple animation" must degrade to the identical STILL wash rather than to
        nothing.

   Needs playwright; SKIPS loudly without it.
   Run: node tests/builder-plate.cjs [--playwright <dir>]
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

  // ---- 1. the served page carries the plate with JavaScript OFF -------------
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1200, height: 800 } });
  await noJs.route('**/*', serve);
  const p1 = await noJs.newPage();
  await p1.goto('http://builder.test/index.html', { waitUntil: 'load' });
  const baked = await p1.evaluate(() => {
    const host = document.querySelector('.sites-plate');
    const amb = document.querySelector('.plate-ambient');
    return { attr: host && host.getAttribute('data-plate'), bg: amb ? getComputedStyle(amb).backgroundImage.slice(0, 15) : null };
  });
  check('a baked page carries data-plate with JS off', baked.attr, 'ambient');
  check('and the ambient layer actually paints', baked.bg, 'radial-gradient');
  await noJs.close();

  // ---- 2. the builder writes site.plate, and the export carries it ----------
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
    inst.state.site.name = 'Plate Test';
    inst.refresh();
  });
  await page.locator('.bld-tab', { hasText: 'Site' }).click();
  await page.waitForTimeout(500);

  // Scoped to the plate's own container, not ".bld-col--edit select:last()". The
  // Site tab gained the grid-mode and chrome selectors, so "the last select" stopped
  // being the plate's — the same positional brittleness that made a viewport probe
  // read the wrong button. Scope by container, always.
  const plateSelect = page.locator('.bld-platefields select').first();
  const modes = await page.evaluate(() => {
    const plate = document.querySelector('.bld-platefields select');
    return plate ? [...plate.options].map((o) => o.value) : null;
  });
  check('the builder offers every plate mode', modes, ['ambient', 'color', 'image', 'animation', 'none']);

  await plateSelect.selectOption('color');
  await page.waitForTimeout(500);
  const colourInput = page.locator('.bld-col--edit input[type=color]').last();
  check('choosing a colour plate reveals a colour input', await colourInput.count(), 1);
  await colourInput.evaluate((el) => { el.value = '#123456'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(600);

  const state = await page.evaluate(() => SITES.builder.instance.state.site.plate);
  check('the plate lands in state', state.mode, 'color');
  check('with the colour', state.color, '#123456');

  // The control must follow state changed anywhere else — an import, an undo, the
  // code panel — not only its own events. renderPlate() was missing from refresh(),
  // so the Mode select read "ambient" while the state said "color".
  await page.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.site.plate = { mode: 'animation' };
    inst.refresh();
  });
  await page.waitForTimeout(400);
  check('the Mode select follows state changed elsewhere', await page.locator('.bld-platefields select').first().inputValue(), 'animation');
  check('and the preview follows it', await page.evaluate(() => document.querySelector('.bld-preview').contentDocument.querySelector('.sites-plate').getAttribute('data-plate')), 'animation');
  await page.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.site.plate = { mode: 'color', color: '#123456' };
    inst.refresh();
  });
  await page.waitForTimeout(500);

  const exported = await page.evaluate(() => SITES.builder.instance.content().site.plate);
  check('and in the content.json export', exported, { mode: 'color', color: '#123456' });
  check('and in the blueprint', await page.evaluate(() => SITES.builder.instance.blueprint().indexOf('plate:') !== -1), true);

  // ---- 3. the preview applies it live ---------------------------------------
  const preview = () => page.evaluate(() => {
    const f = document.querySelector('.bld-preview');
    const host = f.contentDocument.querySelector('.sites-plate');
    const amb = f.contentDocument.querySelector('.plate-ambient');
    if (!host) return null;
    return {
      attr: host.getAttribute('data-plate'),
      style: host.getAttribute('style'),
      plateBg: getComputedStyle(host).backgroundColor,
      ambientDisplay: getComputedStyle(amb).display,
    };
  });
  const colorMode = await preview();
  check('the preview shows the colour plate', colorMode.attr, 'color');
  check('and paints it', colorMode.plateBg, 'rgb(18, 52, 86)');
  check('and hides the ambient layer', colorMode.ambientDisplay, 'none');

  await plateSelect.selectOption('image');
  await page.waitForTimeout(500);
  // The image widget renders TWO inputs — src and alt — and it is the src that
  // matters. Two earlier versions of this line were wrong in the same silent way:
  // one aimed at input[type=url] and filled the site's base URL, the other aimed at
  // the last input and filled alt. Both produced a plate with no image and no error.
  check('choosing an image plate reveals its fields', await page.locator('.bld-platefields .adm-field input').count(), 2);
  const imageInput = page.locator('.bld-platefields .adm-field input').first();
  await imageInput.fill('/assets/hero-plate.svg');
  await page.waitForTimeout(700);
  const imageMode = await preview();
  check('the preview resolves the plate image', imageMode.attr, 'image');
  // The colour stays in the variable once set, and that is deliberate: it is inert
  // while the mode is not "color", and it comes back if the author switches back.
  // What matters is that it is not PAINTED.
  check('and does not paint the old colour', imageMode.plateBg, 'rgba(0, 0, 0, 0)');
  check('and the ambient layer carries the image', await page.evaluate(() => {
    const amb = document.querySelector('.bld-preview').contentDocument.querySelector('.plate-ambient');
    return getComputedStyle(amb).backgroundImage.indexOf('hero-plate.svg') !== -1;
  }), true);

  await plateSelect.selectOption('animation');
  await page.waitForTimeout(700);
  const animMode = await preview();
  check('the preview runs the drifting wash', await page.evaluate(() => getComputedStyle(document.querySelector('.bld-preview').contentDocument.querySelector('.plate-ambient')).animationName), 'plate-drift');

  await plateSelect.selectOption('none');
  await page.waitForTimeout(600);
  check('none hides the layer', (await preview()).ambientDisplay, 'none');

  // ---- 4. reduced motion degrades the animation to the still wash -----------
  await plateSelect.selectOption('animation');
  await page.waitForTimeout(600);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(600);
  const reduced = await page.evaluate(() => {
    const amb = document.querySelector('.bld-preview').contentDocument.querySelector('.plate-ambient');
    const cs = getComputedStyle(amb);
    return { animation: cs.animationName, bg: cs.backgroundImage.slice(0, 15) };
  });
  check('reduced motion stops the drift', reduced.animation, 'none');
  check('but keeps the wash — it degrades to still, not to nothing', reduced.bg, 'radial-gradient');
  await page.emulateMedia({ reducedMotion: null });

  check('no console errors', errors.slice(0, 4), []);
  await browser.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.log('FAIL: ' + err.message); process.exit(1); });
