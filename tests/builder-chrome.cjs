#!/usr/bin/env node
/* ==========================================================================
   builder-chrome.cjs — menu bar and footer bar variants

   entry.variant is applied by the binder and the baker as .tile-<type>--<variant>
   on the tile root. That machinery existed for two phases with nothing to drive
   it: no variant classes for the chrome, no way to choose one, and one variant
   (.tile-cta--center) that every snippet hardcoded in markup so the content model
   could not express it at all.

   This asserts the four things that make a variant real:
     1. it is DECLARED, so the builder can offer it and check-site can validate it
     2. choosing it writes to the entry, and the export and blueprint carry it
     3. the binder puts the class on the tile root, so the CSS applies
     4. the CSS actually changes how it looks — asserted on computed style, not on
        the presence of a class, because a class with no matching rule is exactly
        the failure the gate exists to catch

   Plus the crawl-path rule the minimal variants have to respect: the links are
   HIDDEN, not removed. A footer that deletes its own link destinations to look
   tidy costs real SEO.

   Needs playwright; SKIPS loudly without it.
   Run: node tests/builder-chrome.cjs [--playwright <dir>]
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
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  await ctx.route('**/*', serve);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) errors.push(t); });
  await page.goto('http://builder.test/builder.html', { waitUntil: 'load' });
  await page.waitForSelector('.bld-pick', { timeout: 20000 });
  await page.evaluate(() => localStorage.removeItem('sites.builder.draft.v1'));

  // Add the chrome and a cta, in page.
  await page.evaluate(async () => {
    for (const n of ['Navigation (links are site-level)', 'Footer', 'CTA band']) {
      const btn = [...document.querySelectorAll('.bld-pick')].find((x) => x.querySelector('strong').textContent.trim().endsWith(n));
      if (btn) { btn.click(); await new Promise((r) => setTimeout(r, 700)); }
    }
    const inst = SITES.builder.instance;
    inst.state.site.name = 'Chrome Test';
    inst.refresh();
  });
  await page.waitForTimeout(700);
  check('the three chrome tiles are on the page', await page.evaluate(() => SITES.builder.instance.state.tiles.length), 3);

  // ---- 1. declared, and offered -------------------------------------------
  await page.locator('.bld-tab', { hasText: 'Site' }).click();
  await page.waitForTimeout(500);
  const offered = await page.evaluate(() => [...document.querySelectorAll('.bld-chromefield')].map((w) => ({
    type: w.getAttribute('data-chrome'),
    options: [...w.querySelectorAll('option')].map((o) => o.value),
  })));
  check('the Chrome section covers the menu bar and the footer', offered.map((o) => o.type), ['nav-dock', 'footer']);
  check('the menu bar offers dock, bar and minimal', offered[0].options, ['', 'bar', 'minimal']);
  check('the footer offers full, one row and legal only', offered[1].options, ['', 'simple', 'minimal']);

  const navSel = page.locator('.bld-chromefield[data-chrome=nav-dock] select');
  const footSel = page.locator('.bld-chromefield[data-chrome=footer] select');

  // ---- 2. choosing writes to the entry, and the export carries it ----------
  await navSel.selectOption('bar');
  await page.waitForTimeout(600);
  check('choosing a variant writes to the entry', await page.evaluate(() => SITES.builder.instance.state.tiles.filter((t) => t.type === 'nav-dock')[0].variant), 'bar');
  check('and the export carries it', await page.evaluate(() => SITES.builder.instance.content().content.filter((e) => e.type === 'nav-dock')[0].variant), 'bar');
  check('and the blueprint carries it', await page.evaluate(() => SITES.builder.instance.blueprint().indexOf('variant: bar') !== -1), true);

  // ---- 3 & 4. the binder applies it, and the CSS changes the look ----------
  //
  // Set the preview to Desktop FIRST. The dock's shape is a container query on the
  // header's own width, and at the default "Fill" the frame is about 710px — narrow
  // enough that the compact form is correct. Asserting "it is a pill" there tests
  // the wrong thing and fails for the right reason.
  await page.locator('.bld-viewbar-row .bld-tool', { hasText: 'Desktop' }).click();
  await page.waitForTimeout(800);
  const navLook = () => page.evaluate(() => {
    const f = document.querySelector('.bld-preview');
    const el = f.contentDocument.querySelector('[data-tile="nav-dock"]');
    const cs = getComputedStyle(el);
    return {
      classes: el.className,
      radius: cs.borderTopLeftRadius,
      maxWidth: cs.maxWidth,
      display: cs.display,
      links: el.querySelectorAll('.nav-dock-link').length,
      firstLinkVisible: el.querySelector('.nav-dock-link') ? el.querySelector('.nav-dock-link').getBoundingClientRect().width > 0 : null,
    };
  });
  const bar = await navLook();
  check('the binder puts the variant class on the tile root', bar.classes.indexOf('tile-nav-dock--bar') !== -1, true);
  check('and the bar is square, not a pill', bar.radius, '0px');
  check('and it is not clamped to a pill width', bar.maxWidth, 'none');

  await navSel.selectOption('');
  await page.waitForTimeout(600);
  const dock = await navLook();
  check('the default drops the variant class', dock.classes.indexOf('tile-nav-dock--bar'), -1);
  check('and it is back to a pill', dock.radius !== '0px', true);

  // ---- the minimal variant hides links without deleting them ---------------
  await navSel.selectOption('minimal');
  await page.waitForTimeout(700);
  // Three attempts were needed to ask this correctly, so the reasoning is worth
  // keeping. getBoundingClientRect().width alone was wrong because the links are
  // clipped but had kept their padding, so their boxes stayed 24px. The padding is
  // zeroed now. checkVisibility() was the tempting "just ask the browser" answer and
  // is ALSO wrong: it checks display, visibility and opacity, and does not consider
  // clip-path at all — it reports the clipped links as visible. So the assertion is
  // on the mechanism, which is the standard visually-hidden pattern: a 1px box,
  // clipped, still present in the DOM.
  const minimal = await page.evaluate(() => {
    const f = document.querySelector('.bld-preview');
    const el = f.contentDocument.querySelector('[data-tile="nav-dock"]');
    const links = [...el.querySelectorAll('.nav-dock-link')];
    const probe = (n) => {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return { w: Math.round(r.width), h: Math.round(r.height), clipped: cs.clipPath !== 'none' };
    };
    const plain = links.filter((l) => !l.classList.contains('nav-dock-theme'));
    const toggles = links.filter((l) => l.classList.contains('nav-dock-theme'));
    return {
      linkCount: links.length,
      stillInDom: plain.filter((l) => !!l.closest('[data-tile="nav-dock"]')).length,
      hidden: plain.filter((l) => { const p = probe(l); return p.w <= 1 && p.h <= 1 && p.clipped; }).length,
      toggles: toggles.length,
      toggleVisible: toggles.some((l) => !probe(l).clipped && probe(l).w > 10),
    };
  });
  check('minimal keeps every link in the DOM', minimal.stillInDom, minimal.linkCount - minimal.toggles);
  check('and every one is visually hidden, not removed', minimal.hidden, minimal.linkCount - minimal.toggles);
  check('but keeps the theme toggle reachable', minimal.toggleVisible, true);

  // ---- the footer variants ------------------------------------------------
  await footSel.selectOption('simple');
  await page.waitForTimeout(700);
  const simple = await page.evaluate(() => {
    const f = document.querySelector('.bld-preview');
    const el = f.contentDocument.querySelector('[data-tile="footer"]');
    return { classes: el.className, columns: getComputedStyle(el).gridTemplateColumns, legalBorder: getComputedStyle(el.querySelector('.tile-footer__legal')).borderTopWidth };
  });
  check('the footer takes its variant class', simple.classes.indexOf('tile-footer--simple') !== -1, true);
  check('and lays out on one row', simple.columns.split(' ').length, 2);
  check('and drops the legal separator', simple.legalBorder, '0px');

  await footSel.selectOption('');
  await page.waitForTimeout(600);
  check('the full footer is a single column again', (await page.evaluate(() => getComputedStyle(document.querySelector('.bld-preview').contentDocument.querySelector('[data-tile="footer"]')).gridTemplateColumns.split(' ').length)), 1);

  // ---- the container query still reflows the nav when the header is narrow --
  await page.locator('.bld-viewbar-row .bld-tool', { hasText: 'Mobile' }).click();
  await page.waitForTimeout(900);
  const narrow = await page.evaluate(() => {
    const f = document.querySelector('.bld-preview');
    const el = f.contentDocument.querySelector('[data-tile="nav-dock"]');
    return { radius: getComputedStyle(el).borderTopLeftRadius, headerWidth: Math.round(f.contentDocument.querySelector('.site-header').getBoundingClientRect().width) };
  });
  check('a narrow header makes the dock compact rather than a pill', narrow.radius, '0px');
  check('and the header really is narrow', narrow.headerWidth < 768, true);
  await page.locator('.bld-viewbar-row .bld-tool', { hasText: 'Desktop' }).click();
  await page.waitForTimeout(700);

  // ---- the cta variant is selectable from the tile editor ------------------
  await page.evaluate(() => {
    const inst = SITES.builder.instance;
    inst.state.index = inst.state.tiles.findIndex((t) => t.type === 'cta');
    inst.refresh();
  });
  await page.locator('.bld-tab', { hasText: 'Content' }).click();
  await page.waitForTimeout(500);
  const ctaVariants = await page.evaluate(() => {
    const sel = [...document.querySelectorAll('.bld-col--edit select')].filter((s) => [...s.options].some((o) => o.value === 'center'))[0];
    return sel ? [...sel.options].map((o) => o.value) : null;
  });
  check('a cta variant is selectable from the editor', ctaVariants, ['', 'center']);
  await page.locator('.bld-col--edit select').filter({ hasText: 'Centred' }).first().selectOption('center');
  await page.waitForTimeout(700);
  check('and it reaches the entry', await page.evaluate(() => SITES.builder.instance.state.tiles.filter((t) => t.type === 'cta')[0].variant), 'center');
  check('and the class lands on the tile', await page.evaluate(() => {
    const el = document.querySelector('.bld-preview').contentDocument.querySelector('[data-tile="cta"]');
    return el.className.indexOf('tile-cta--center') !== -1;
  }), true);

  check('no console errors', errors.slice(0, 4), []);
  await browser.close();
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.log('FAIL: ' + err.message); process.exit(1); });
