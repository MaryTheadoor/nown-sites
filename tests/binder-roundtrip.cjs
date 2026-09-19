#!/usr/bin/env node
/* ==========================================================================
   binder-roundtrip.cjs — does the baker produce what the binder would?

   The binding rules exist twice: src/js/sites-content.js (the browser binder) and
   makeBinder() in tools/bake.mjs (the build-time baker). Nothing checked that they
   agree, and this is the same shape as a bug that already bit once:
   sites-builder.js carried a hand-written mirror of the compiler's copy handling,
   went stale, and silently flattened multi-paragraph bodies.

   It matters more here. When these two disagree, the served HTML and the JS-rendered
   DOM differ - the page changes under the reader on load, and the no-JS version is
   the wrong one. For a crawler or a scraper that is the only version there is.

   The check is a differential: bake a fixture, then load the baked page twice, once
   with JavaScript disabled and once with it enabled. With JS off you see the baker's
   output; with JS on the real binder re-applies the same content over the top. If the
   two DOMs differ, the mirror has diverged.

   Needs playwright (no dependency in this repo). Looked for at
   %USERPROFILE%\.agents\tools\browser, or wherever --playwright <dir> points.
   Run: node tests/binder-roundtrip.cjs
   ========================================================================== */
const { skip } = require('./_skip.cjs');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');

/* --------------------------------------------------------- playwright? */
const pwIdx = process.argv.indexOf('--playwright');
const PW_DIR = pwIdx >= 0 ? path.resolve(process.argv[pwIdx + 1])
  : path.join(os.homedir(), '.agents', 'tools', 'browser');
let chromium = null;
try {
  chromium = createRequire(path.join(PW_DIR, 'noop.js'))('playwright').chromium;
} catch (err) {
  skip('playwright not found at ' + PW_DIR, 'Pass --playwright <dir> to point at it.');
}

/* ------------------------------------------------------------- fixture */
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };

const doc = {
  site: { name: 'Binder Fixture', baseUrl: 'https://fixture.test', lang: 'en',
    seo: { title: 'Binder fixture', description: 'Proves the baker and the binder agree.' } },
  theme: { defaultTheme: 'system', colors: { background: '#FFFFFF', primary: '#1B3A5C', accent: '#D97706' } },
  nav: [{ label: 'Home', href: '/' }, { label: 'Shop', href: '/shop.html' }],
  assets: { hero: '/assets/hero.svg' },
  content: [
    { id: 'chrome-announcement', type: 'announcement', config: { text: 'Open late Fridays.' } },
    { id: 'fx-hero', type: 'hero', layout: { span: 7, spanSm: 4, start: 2 }, variant: 'wide', config: {
      headline: 'Cash for tools: same day',
      body: 'First paragraph.\n\nSecond paragraph, after a blank line.\n\nThird.',
      actions: [
        { label: 'Get a quote', href: '/contact.html', style: 'gold' },
        { label: 'Browse', href: '/shop.html', style: 'ghost' },
      ],
      media: { src: 'asset:hero', alt: 'A hero plate' },
    } },
    { id: 'fx-menu', type: 'menu', config: {
      title: 'What we take',
      categories: [
        { name: 'Tools', items: 'Drills|40\nSaws|60' },
        { name: 'Gold', items: 'Chains|410' },
      ],
    } },
    { id: 'fx-faq', type: 'faq', config: {
      title: 'Questions',
      items: [
        { question: 'Do you take walk-ins?', answer: 'Yes, no appointment needed.' },
        { question: 'A boolean-looking answer', answer: 'yes' },
      ],
    } },
    { id: 'fx-visit', type: 'visit', layout: { span: 5 }, config: {
      headline: 'Visit us',
      address: '1200 E 6th St, Austin, TX 78702',
      note: 'Parking in the rear.',
      actions: [{ label: 'Get directions', href: 'https://maps.google.com/?q=1', style: 'gold' }],
      hoursTitle: 'Opening hours',
      hours: 'Mon–Fri 9:00–19:00\nSat 10:00–18:00',
    } },
    { id: 'chrome-footer', type: 'footer', config: { brand: 'Binder Fixture', tagline: 'Built with S.I.T.E.S.', copyright: '© 2026' } },
  ],
};

const site = fs.mkdtempSync(path.join(os.tmpdir(), 'binder-roundtrip-'));
fs.mkdirSync(path.join(site, 'src/css'), { recursive: true });
fs.mkdirSync(path.join(site, 'src/js'), { recursive: true });
fs.mkdirSync(path.join(site, 'src/modules'), { recursive: true });
fs.mkdirSync(path.join(site, 'assets'), { recursive: true });
fs.writeFileSync(path.join(site, 'content.json'), JSON.stringify(doc, null, 2), 'utf8');
for (const f of ['nown-plate.css', 'nown-tiles.css']) {
  fs.copyFileSync(path.join(ROOT, 'src/css', f), path.join(site, 'src/css', f));
}
for (const f of ['sites.js', 'tile-registry.js', 'sites-content.js', 'sites-theme.js', 'sites-assets.js']) {
  fs.copyFileSync(path.join(ROOT, 'src/js', f), path.join(site, 'src/js', f));
}
fs.writeFileSync(path.join(site, 'assets/hero.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="#1B3A5C"/></svg>', 'utf8');

/* The page the baker fills: chrome + every tile, with the ids the doc uses. */
function snippet(type) {
  const found = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === type + '.html') found.push(p); } })(path.join(ROOT, 'src/modules'));
  return found.length ? fs.readFileSync(found[0], 'utf8').replace(/^\s*<!--[\s\S]*?-->\s*/, '') : null;
}
function stamp(type, id) {
  const html = snippet(type);
  if (!html) throw new Error('no snippet for ' + type);
  return /data-tile-id="/.test(html)
    ? html.replace(/data-tile-id="[^"]*"/, 'data-tile-id="' + id + '"')
    : html.replace('data-tile="' + type + '"', 'data-tile="' + type + '" data-tile-id="' + id + '"');
}

const page = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8" /><title>Binder fixture</title>',
  '<link rel="stylesheet" href="src/css/nown-plate.css" />',
  '<link rel="stylesheet" href="src/css/nown-tiles.css" />',
  '<script src="src/js/sites-theme.js"><\/script></head>',
  '<body data-content="content.json"><div class="sites-plate">',
  '<header class="site-header">',
  '  <div class="tile-announcement" data-tile="announcement" data-tile-id="chrome-announcement"><span data-role="text">placeholder</span></div>',
  '  <nav class="nav-dock" data-tile="nav-dock" aria-label="Primary">',
  '    <div class="nav-dock__links" data-role="nav-links"><template><a class="nav-dock-link" data-role="action"><span data-role="label"></span></a></template><a class="nav-dock-link" data-role="action"><span data-role="label">Home</span></a></div>',
  '    <button class="nav-dock-link nav-dock-theme" data-role="theme-toggle" type="button"><span>Theme</span></button>',
  '  </nav>',
  '</header>',
  '<main class="sites-container">',
  stamp('hero', 'fx-hero'),
  stamp('menu', 'fx-menu'),
  stamp('faq', 'fx-faq'),
  stamp('visit', 'fx-visit'),
  '</main>',
  stamp('footer', 'chrome-footer'),
  '</div>',
  '<script src="src/js/tile-registry.js"><\/script>',
  '<script src="src/js/sites.js"><\/script>',
  '<script src="src/js/sites-assets.js"><\/script>',
  '<script src="src/js/sites-content.js"><\/script>',
  '<script>document.addEventListener("DOMContentLoaded", function () { SITES.content.load("content.json"); });<\/script>',
  '</body></html>',
].join('\n');

fs.writeFileSync(path.join(site, 'index.html'), page, 'utf8');

/* Bake it, using the real tool. */
try {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/bake.mjs'), site, '--quiet'], { stdio: 'pipe' });
} catch (err) {
  console.log('FAIL: tools/bake.mjs failed on the fixture');
  console.log(String(err.stdout || '') + String(err.stderr || ''));
  process.exit(1);
}

/* ------------------------------------------------ differential in a browser */
const serve = (route) => {
  const url = new URL(route.request().url());
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(site, rel);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    route.fulfill({ path: file, contentType: MIME[path.extname(file)] || 'application/octet-stream' });
  } else {
    route.fulfill({ status: 404, body: 'not found' });
  }
};

const SLOTS = () => {
  const out = {};
  document.querySelectorAll('[data-tile-id]').forEach((tile) => {
    const id = tile.getAttribute('data-tile-id');
    // The root's own layout and variant attributes are part of what the binder
    // applies, so they are part of what the two implementations must agree on.
    out[id] = {
      root: {
        span: tile.getAttribute('data-span'),
        spanSm: tile.getAttribute('data-span-sm'),
        start: tile.getAttribute('data-start'),
        variantClass: [...tile.classList].filter((c) => c.indexOf('--') !== -1).sort(),
      },
      slots: [...tile.querySelectorAll('[data-role]')]
      .filter((n) => !n.closest('template'))
      .map((n) => ({
        role: n.getAttribute('data-role'),
        tag: n.tagName.toLowerCase(),
        text: (n.textContent || '').trim().replace(/\s+/g, ' '),
        href: n.getAttribute('href'),
        src: n.getAttribute('src'),
        alt: n.getAttribute('alt'),
      })),
    };
  });
  return out;
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const snap = async (jsEnabled) => {
    const ctx = await browser.newContext({ javaScriptEnabled: jsEnabled });
    await ctx.route('**/*', serve);
    const p = await ctx.newPage();
    await p.goto('http://fixture.test/index.html', { waitUntil: 'load' });
    if (jsEnabled) await p.waitForTimeout(700);
    const data = await p.evaluate(SLOTS);
    await ctx.close();
    return data;
  };

  const baked = await snap(false);   // what the baker produced — what a crawler reads
  const bound = await snap(true);    // the real binder, re-applied over the top
  await browser.close();

  /* ------------------------------------------------------------------ diff */
  let dumpAll = process.argv.includes('--dump') ? 99 : 0;
  let pass = 0, fail = 0;
  const ids = [...new Set([...Object.keys(baked), ...Object.keys(bound)])].sort();
  if (!ids.length) { console.log('FAIL: the fixture rendered no tiles at all'); process.exit(1); }

  for (const id of ids) {
    const bakedTile = baked[id] || null;
    const boundTile = bound[id] || null;
    if (JSON.stringify(bakedTile) === JSON.stringify(boundTile)) { pass++; continue; }

    fail++;
    console.log('FAIL ' + id + ' - the baker and the binder disagree');

    // Root first: layout and variant are applied to the tile itself, so a
    // disagreement there would otherwise be buried under slot output.
    const ra = JSON.stringify(bakedTile && bakedTile.root);
    const rb = JSON.stringify(boundTile && boundTile.root);
    if (ra !== rb) {
      console.log('  root attributes:');
      console.log('    baked (JS off): ' + ra);
      console.log('    bound (JS on):  ' + rb);
    }

    const A = (bakedTile && bakedTile.slots) || [];
    const B = (boundTile && boundTile.slots) || [];
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const x = JSON.stringify(A[i]), y = JSON.stringify(B[i]);
      if (x === y) continue;
      const role = (A[i] || B[i] || {}).role;
      console.log('  slot[' + i + '] data-role="' + role + '"');
      console.log('    baked (JS off): ' + x);
      console.log('    bound (JS on):  ' + y);
      if (!A[i]) console.log('    -> the baker produced NO slot here; the binder did');
      else if (!B[i]) console.log('    -> the binder produced NO slot here; the baker did');
      break;
    }
    if (--dumpAll >= 0) {
      console.log('  baked: ' + JSON.stringify(bakedTile));
      console.log('  bound: ' + JSON.stringify(boundTile));
    }
  }
  if (fail) {
    console.log('');
    console.log('fixture kept for inspection: ' + site);
    console.log('  index.html    - what the baker produced');
    console.log('  content.json  - the input');
  } else {
    fs.rmSync(site, { recursive: true, force: true });
  }
  console.log(pass + ' tile(s) agree, ' + fail + ' disagree');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.log('FAIL: ' + err.message); process.exit(1); });