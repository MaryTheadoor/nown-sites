#!/usr/bin/env node
/* ==========================================================================
   builder-library.cjs — the tile picker

   The brief asked for a tile list with "a short name slash description and icon
   and foldable drop down section for more info". The name, icon and description
   shipped two phases ago; this covers the fold-out, and the one thing that is easy
   to get wrong about it: ADDING and READING are two different intentions, so they
   are two different controls. Making the whole row a <details> would mean the
   obvious click — the one that adds a tile — sometimes just opened a box instead.

   Every fact in the fold-out is assembled from declarations the rest of the
   framework already reads: the registry fields, the variants table, the behaviours
   list. Nothing is restated, so nothing here can drift from what the gates check —
   and this asserts that, by expecting a tile WITH a behaviour to name its .js file
   and a tile WITHOUT one to say so.

   Needs playwright; SKIPS loudly without it.
   Run: node tests/builder-library.cjs [--playwright <dir>]
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
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1150 } });
  await ctx.route('**/*', serve);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) errors.push(t); });
  await page.goto('http://builder.test/builder.html', { waitUntil: 'load' });
  await page.waitForSelector('.bld-pick', { timeout: 20000 });
  await page.evaluate(() => localStorage.removeItem('sites.builder.draft.v1'));
  await page.waitForTimeout(600);

  const row = (name) => page.locator('.bld-pickrow').filter({ hasText: name }).first();
  const facts = (name) => row(name).locator('.bld-pickrow__info').evaluate((d) => {
    const out = {};
    const kids = [...d.children];
    for (let i = 0; i < kids.length; i += 2) out[kids[i].textContent] = kids[i + 1].textContent;
    return out;
  });

  // ---- the list itself ----------------------------------------------------
  const counts = await page.evaluate(() => ({
    rows: document.querySelectorAll('.bld-pickrow').length,
    pickers: document.querySelectorAll('.bld-pick').length,
    toggles: document.querySelectorAll('.bld-pickrow__more').length,
    icons: [...document.querySelectorAll('.bld-pick__icon')].filter((x) => x.textContent.trim()).length,
    abouts: [...document.querySelectorAll('.bld-pick__about')].filter((x) => x.textContent.trim()).length,
    registered: Object.keys(SITES.tileRegistry).length,
  }));
  check('every registered tile has a picker row', counts.rows, counts.registered);
  check('one add control per row', counts.pickers, counts.registered);
  check('and one info toggle per row', counts.toggles, counts.registered);
  check('every row shows an icon', counts.icons, counts.registered);
  check('and a description', counts.abouts, counts.registered);
  check('the fold-outs start closed', await page.locator('.bld-pickrow__info:visible').count(), 0);

  // ---- what the fold-out says --------------------------------------------
  await row('Visit us').locator('.bld-pickrow__more').click();
  await page.waitForTimeout(400);
  const visit = await facts('Visit us');
  check('it names the type', visit.Type, 'visit');
  check('it names the snippet the builder fetches', visit.Snippet, 'src/modules/visit.html');
  check('it lists the registry fields', visit.Fields.indexOf('Opening hours') !== -1, true);
  check('it names the behaviour module', visit.Behaviour, 'src/modules/visit.js');
  check('and says there is only one shape', visit.Variants, 'one shape only');

  // A tile with no behaviour must SAY so rather than showing a path to nothing.
  await row('Hero').locator('.bld-pickrow__more').click();
  await page.waitForTimeout(400);
  const hero = await facts('Hero');
  check('a tile without a behaviour says so', hero.Behaviour, 'none — static markup');
  check('and a tile with no variants says so', hero.Variants, 'one shape only');

  // A chrome tile: no per-instance fields, and the variants it does offer.
  await row('Navigation (links are site-level)').locator('.bld-pickrow__more').click();
  await page.waitForTimeout(400);
  const nav = await facts('Navigation (links are site-level)');
  check('a chrome tile explains its empty field list', nav.Fields.indexOf('set up by the site') !== -1, true);
  check('and lists its variants by label', nav.Variants, 'Full-width bar · Minimal');

  // A tile with a variant and no behaviour: the cta.
  await row('CTA band').locator('.bld-pickrow__more').click();
  await page.waitForTimeout(400);
  const cta = await facts('CTA band');
  check('the cta offers its centred variant', cta.Variants, 'Centred');
  check('and has no behaviour module', cta.Behaviour, 'none — static markup');

  // ---- one open at a time -------------------------------------------------
  check('only one fold-out is ever open', await page.locator('.bld-pickrow__info:visible').count(), 1);
  const expanded = await page.evaluate(() => [...document.querySelectorAll('.bld-pickrow__more')].filter((b) => b.getAttribute('aria-expanded') === 'true').length);
  check('and only one toggle reports itself expanded', expanded, 1);
  await row('CTA band').locator('.bld-pickrow__more').click();
  await page.waitForTimeout(300);
  check('clicking again closes it', await page.locator('.bld-pickrow__info:visible').count(), 0);

  // ---- adding is still adding ---------------------------------------------
  const before = await page.evaluate(() => SITES.builder.instance.state.tiles.length);
  await page.locator('.bld-pick', { hasText: 'Hero' }).first().click();
  await page.waitForTimeout(700);
  check('clicking the label adds a tile', (await page.evaluate(() => SITES.builder.instance.state.tiles.length)) - before, 1);
  check('and does not open a panel instead', await page.locator('.bld-pickrow__info:visible').count(), 0);

  // With a panel open, adding still adds.
  await row('Footer').locator('.bld-pickrow__more').click();
  await page.waitForTimeout(300);
  const before2 = await page.evaluate(() => SITES.builder.instance.state.tiles.length);
  await page.locator('.bld-pick', { hasText: 'Footer' }).first().click();
  await page.waitForTimeout(700);
  check('adding works with a panel open', (await page.evaluate(() => SITES.builder.instance.state.tiles.length)) - before2, 1);

  // ---- the filter still works, and searches the descriptions --------------
  await page.locator('.bld-filter').fill('hours');
  await page.waitForTimeout(500);
  const filtered = await page.evaluate(() => [...document.querySelectorAll('.bld-pick strong')].map((s) => s.textContent.trim()));
  check('searching a description word finds the tile', filtered.some((t) => t.indexOf('Visit') !== -1), true);
  check('and hides the rest', filtered.length < counts.registered, true);
  await page.locator('.bld-filter').fill('');
  await page.waitForTimeout(400);
  check('clearing the filter brings everything back', await page.locator('.bld-pickrow').count(), counts.registered);

  check('no console errors', errors.slice(0, 4), []);
  await browser.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.log('FAIL: ' + err.message); process.exit(1); });
