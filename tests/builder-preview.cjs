#!/usr/bin/env node
/* ==========================================================================
   builder-preview.cjs — the preview panel, driven in a real browser

   Covers the three things that make the preview a tool rather than a picture:

     - viewport switching, which resizes the FRAME (the correct emulation, since
       the framework has no page-level layout media queries and the 12/6 tier is a
       container query whose width tracks the frame)
     - the grid overlay, which reads the same --grid-cols tokens the grid does and
       shades the columns the selected tile spans
     - selection: clicking a tile in the inspector marks it in the preview and
       scrolls the preview to it

   Plus two contracts that were silently broken and are easy to break again:
   contentDoc must be set by apply() as well as load(), or tile behaviours that
   read it at init do nothing; and the export must carry site.business, because
   the export is a projection of state and a forgotten key is a silent drop.

   Needs playwright; SKIPS loudly without it.
   Run: node tests/builder-preview.cjs [--playwright <dir>]
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

  const frame = () => page.evaluate(() => Math.round(document.querySelector('.bld-preview').getBoundingClientRect().width));
  const vtile = () => page.locator('.bld-viewbar-row .bld-tool');

  // --- add tiles, in page, and load the visit behaviour ------------------
  await page.evaluate(async () => {
    for (const n of ['Hero', 'Visit us']) {
      const btn = [...document.querySelectorAll('.bld-pick')].find((x) => x.querySelector('strong').textContent.trim().endsWith(n));
      if (btn) { btn.click(); await new Promise((r) => setTimeout(r, 1100)); }
    }
  });
  await page.evaluate(() => {
    const inst = SITES.builder.instance;
    const t = inst.state.tiles.find((x) => x.type === 'visit');
    t.config.headline = 'Visit us';
    t.config.hoursTitle = 'Opening hours';
    t.config.hours = 'Mon-Fri 09:00-19:00\nSat 10:00-18:00';
    inst.state.site.business = { openingHours: ['Mo-Fr 09:00-19:00'] };
    inst.refresh();
  });
  await page.waitForTimeout(1000);

  const wire = await page.evaluate(() => {
    const w = document.querySelector('.bld-preview').contentWindow;
    const st = w.document.querySelector('.tile-visit__state');
    return { behaviourLoaded: !!(w.SITES && w.SITES.tiles && w.SITES.tiles.visit), contentDoc: !!(w.SITES && w.SITES.contentDoc), stateShown: st ? !st.hidden : false };
  });
  check('the tile behaviour module loads into the preview', wire.behaviourLoaded, true);
  check('apply() records contentDoc, not only load()', wire.contentDoc, true);
  check('the behaviour runs and shows its line', wire.stateShown, true);
  check('the export carries site.business', await page.evaluate(() => SITES.builder.instance.content().site.business), { openingHours: ['Mo-Fr 09:00-19:00'] });

  // --- viewport switching ------------------------------------------------
  //
  // THE CONTRACT CHANGED, deliberately. The frame used to be laid out at the preset
  // width and scaled down to fit the column, which meant the container queries inside
  // saw 1280 while the author saw a 760px box — a desktop layout squeezed into a
  // phone-width frame at desktop proportions, with unreadable text. Now the frame's
  // layout width IS its display width: 1:1, no transform. A preset wider than the
  // column is clamped, and the readout says so.
  await vtile().nth(3).click(); await page.waitForTimeout(700);
  check('mobile renders at 390px', await page.evaluate(() => document.querySelector('.bld-preview').getAttribute('data-render-width')), '390');
  await vtile().nth(1).click(); await page.waitForTimeout(700);
  const wideFrame = await page.evaluate(() => {
    const f = document.querySelector('.bld-preview');
    return {
      render: Number(f.getAttribute('data-render-width')),
      rendered: Math.round(f.getBoundingClientRect().width),
      transform: getComputedStyle(f).transform,
      readout: document.querySelector('.bld-viewreadout').textContent,
      displayScale: f.getAttribute('data-display-scale'),
    };
  });
  check('desktop is clamped to the column, not laid out at 1280', wideFrame.render < 1280, true);
  check('and the layout width equals the displayed width', wideFrame.render, wideFrame.rendered);
  check('no transform is applied', wideFrame.transform, 'none');
  check('the old scale attribute is gone', wideFrame.displayScale, null);
  check('and the readout admits the clamp', wideFrame.readout.indexOf('widest that fits') !== -1, true);
  // 768px is where the framework's wide tier begins, so a clamped desktop has to
  // clear it or the desktop layout cannot be previewed at all.
  check('the clamped desktop still clears the wide-tier boundary', wideFrame.render > 768, true);
  check('nothing overflows the page', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  // --- grid overlay and span shading -------------------------------------
  // The grid MODE is site-level and lives in the Site tab now; the per-tile span is
  // in Layout. Finding a control by its tab matches where a person would look.
  await page.locator('.bld-tab', { hasText: 'Site' }).click(); await page.waitForTimeout(400);
  await page.locator('.bld-col--edit select').filter({ hasText: 'Configured' }).first().selectOption('cols');
  await page.waitForTimeout(600);
  await page.locator('.bld-tab', { hasText: 'Layout' }).click(); await page.waitForTimeout(400);
  await page.locator('.bld-tabbody input[type=number]').first().fill('7');
  await page.keyboard.press('Tab'); await page.waitForTimeout(600);
  await vtile().last().click(); await page.waitForTimeout(800);
  const wide = await page.evaluate(() => { const o = document.querySelector('.bld-preview').contentDocument.querySelector('.bld-grid-overlay'); return o ? { cols: o.getAttribute('data-cols'), shade: o.getAttribute('data-shade'), shaded: o.querySelectorAll('span.shaded').length } : null; });
  check('the overlay draws 12 columns in the wide tier', wide && wide.cols, '12');
  check('it shades the 7 columns the tile spans', wide && wide.shaded, 7);
  await vtile().nth(3).click(); await page.waitForTimeout(900);
  const narrow = await page.evaluate(() => { const o = document.querySelector('.bld-preview').contentDocument.querySelector('.bld-grid-overlay'); return o ? o.getAttribute('data-cols') : null; });
  check('the overlay follows the frame into the 6-column tier', narrow, '6');
  await vtile().nth(1).click(); await page.waitForTimeout(700);
  await vtile().last().click(); await page.waitForTimeout(400);

  // --- selection marks and scrolls the preview ---------------------------
  await page.locator('.bld-name').first().click(); await page.waitForTimeout(900);
  const first = await page.evaluate(() => { const d = document.querySelector('.bld-preview').contentDocument; const m = d.querySelector('.bld-marked'); return { id: m && m.getAttribute('data-tile-id'), count: d.querySelectorAll('.bld-marked').length }; });
  check('selecting a tile marks it in the preview', first.count, 1);
  await page.locator('.bld-name').nth(1).click(); await page.waitForTimeout(1200);
  const second = await page.evaluate(() => {
    const d = document.querySelector('.bld-preview').contentDocument;
    const m = d.querySelector('.bld-marked');
    const r = m ? m.getBoundingClientRect() : null;
    const h = d.documentElement.clientHeight;
    return {
      id: m && m.getAttribute('data-tile-id'),
      count: d.querySelectorAll('.bld-marked').length,
      scroll: Math.round(d.documentElement.scrollTop),
      inView: !!(r && r.top >= -12 && r.top < h),
    };
  });
  check('the mark moves to the new selection', second.count, 1);
  check('only one tile is ever marked', second.id !== first.id, true);
  // The requirement is that the selected tile is brought into view, not that the
  // preview scrolled — at a wide preset the content can already fit, and asserting
  // scrollTop > 0 then fails for the wrong reason.
  check('the selected tile is brought into view', second.inView, true);

  check('no console errors', errors.slice(0, 3), []);
  await browser.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.log('FAIL: ' + err.message); process.exit(1); });