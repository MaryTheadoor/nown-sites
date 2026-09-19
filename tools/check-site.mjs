#!/usr/bin/env node
/* ==========================================================================
   check-site.mjs — static S.I.T.E.S site linter (no browser needed)

   Verifies the contract between a site's pages and its content file:

     • every `data-tile-id` on a page has an entry in content.json
     • every `data-role` slot has a matching key in that tile's config
     • every content entry is actually used by some page (no orphans)
     • every internal nav link resolves to a file that exists
     • every `asset:<key>` / relative image path resolves
     • tile types are registered, and CSS/JS files referenced exist
     • SEO: every page carries the generated <title>, description, canonical,
       OpenGraph, Twitter and JSON-LD block between <!-- seo:start --> and
       <!-- seo:end -->, appears in sitemap.xml, and robots.txt points at that
       sitemap (see docs/SEO.md; the block is written by tools/seo.mjs)

   Usage:
     node tools/check-site.mjs [publicDir] [--content content.json] [--quiet]
   ========================================================================== */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const args = process.argv.slice(2);
const dir = resolve(process.cwd(), args.find((a) => !a.startsWith('--')) || 'site/public');
const cIdx = args.indexOf('--content');
const contentFile = resolve(dir, cIdx >= 0 ? args[cIdx + 1] : 'content.json');
const quiet = args.includes('--quiet');

/* ------------------------------------------------------------------ registry */
function loadRegistry() {
  const code = readFileSync(join(ROOT, 'src/js/tile-registry.js'), 'utf8');
  const win = {};
  new Function('window', code)(win); // eslint-disable-line no-new-func
  return (win.SITES && win.SITES.tileRegistry) || {};
}

/** The CSS lint, from the same file the builder and the baker read. */
function loadCssLint() {
  const code = readFileSync(join(ROOT, 'src/js/tile-registry.js'), 'utf8');
  const win = {};
  new Function('window', code)(win); // eslint-disable-line no-new-func
  return (win.SITES && win.SITES.cssLint) || null;
}

/** The declared chrome variants, from the same file the builder reads. */
function loadVariants() {
  const code = readFileSync(join(ROOT, 'src/js/tile-registry.js'), 'utf8');
  const win = {};
  new Function('window', code)(win); // eslint-disable-line no-new-func
  return (win.SITES && win.SITES.tileVariants) || {};
}

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/* ------------------------------------------------------------------- input */
if (!existsSync(contentFile)) {
  console.error(`check-site: no content file at ${contentFile}`);
  process.exit(2);
}
const doc = JSON.parse(readFileSync(contentFile, 'utf8'));
const registry = loadRegistry();
const variants = loadVariants();
const entries = Array.isArray(doc.content) ? doc.content : [];
const byId = new Map(entries.filter((e) => e.id).map((e) => [e.id, e]));
const assets = doc.assets || {};

const htmlFiles = readdirSync(dir).filter((f) => f.endsWith('.html'));

/* ------------------------------- 1. content entries are valid & registered */
entries.forEach((e, i) => {
  if (!e.type) fail(`content[${i}] has no type`);
  else if (!registry[e.type]) fail(`content[${i}] (${e.id || '?'}): tile type "${e.type}" is not registered`);
  if (!e.id) warn(`content[${i}] (${e.type}) has no id — pages can only match it positionally`);

  const known = new Set(((registry[e.type] || {}).fields || []).map((f) => f.key));
  Object.keys(e.config || {}).forEach((k) => {
    if (known.size && !known.has(k)) warn(`${e.id || e.type}: config key "${k}" is not a field of tile "${e.type}"`);
  });
  // assets referenced by the config
  JSON.stringify(e.config || {}).replace(/"((?:asset|)[^"]*?)"/g, () => '');
  walkStrings(e.config, (s) => {
    if (typeof s !== 'string') return;
    const m = s.match(/^asset:([A-Za-z0-9_-]+)$/);
    if (m && !(m[1] in assets)) fail(`${e.id || e.type}: asset:${m[1]} is not in the assets map`);
  });

  // Grid placement. The numbers have to match the column tokens the stylesheet
  // defines (12 wide, 6 narrow) or the tile lands somewhere unintended — and an
  // out-of-range span degrades silently, because the attribute simply does not
  // match any rule.
  const where = e.id || e.type;
  if (e.layout != null && (typeof e.layout !== 'object' || Array.isArray(e.layout))) {
    fail(`${where}: layout must be an object like { span: 6, spanSm: 3 }`);
  } else if (e.layout) {
    const RANGES = { span: [1, 12], spanSm: [1, 6], start: [1, 12] };
    Object.keys(e.layout).forEach((k) => {
      if (!RANGES[k]) { warn(`${where}: layout."${k}" is not a known key (span, spanSm, start)`); return; }
      const v = e.layout[k];
      const [lo, hi] = RANGES[k];
      if (!Number.isInteger(v) || v < lo || v > hi) {
        fail(`${where}: layout.${k} is ${JSON.stringify(v)} — must be a whole number from ${lo} to ${hi}`);
      }
    });
  }
});

function walkStrings(v, fn) {
  if (typeof v === 'string') return fn(v);
  if (Array.isArray(v)) return v.forEach((x) => walkStrings(x, fn));
  if (v && typeof v === 'object') return Object.values(v).forEach((x) => walkStrings(x, fn));
}

/* ------------- 1b. framework consistency: every snippet can receive its fields */
// A catalog snippet is the copy-paste source of truth AND what the builder renders,
// so a snippet missing a slot its registry declares is a real defect: typed copy
// would be silently dropped.
const modulesDir = join(ROOT, 'src/modules');
if (existsSync(modulesDir)) {
  const snippets = {};
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) snippets[e.name.replace(/\.html$/, '')] = p;
    }
  })(modulesDir);

  const kebab = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  for (const [type, reg] of Object.entries(registry)) {
    const file = snippets[type];
    if (!file) { fail(`snippets: tile "${type}" is registered but src/modules has no <type>.html`); continue; }
    const html = readFileSync(file, 'utf8');
    const roles = new Set([...html.matchAll(/data-role="([^"]+)"/g)].map((m) => m[1]));
    const missing = (reg.fields || []).map((f) => f.key).filter((k) =>
      !roles.has(k) && !new RegExp(`data-(?:[a-z0-9]+-)*${kebab(k)}=`).test(html));
    if (missing.length) {
      fail(`snippets: ${type}.html has no slot for ${missing.join(', ')} — typed copy would be dropped`);
    }
  }

  // The panel. An unknown value matches no CSS rule, so the tile silently gets no
  // fill and no padding — the exact inconsistency this feature exists to remove.
  const PANEL_MODES = ['plate', 'surface', 'accent', 'none'];
  entries.forEach((e) => {
    if (e.panel == null || e.panel === '') return;
    if (PANEL_MODES.indexOf(e.panel) === -1) {
      fail(`panel: ${e.id || e.type} sets panel "${e.panel}" — must be one of ${PANEL_MODES.join(', ')}, or omitted for the invisible box`);
    }
  });

  // Per-tile CSS. The lint is loaded from tile-registry.js — the SAME function the
  // builder shows as you type and tools/bake.mjs refuses to ship — so there is one
  // implementation of the rule, not three that drift.
  const lint = loadCssLint();
  entries.forEach((e) => {
    if (!e.css) return;
    if (!lint) { warn('tile css: lint unavailable, `' + (e.id || e.type) + '` was not checked'); return; }
    lint.check(e.css).forEach((p) => {
      const where = `tile css ${e.id || e.type} line ${p.line}`;
      if (p.level === 'error') fail(`${where}: ${p.message}`);
      else warn(`${where}: ${p.message}`);
    });
  });

  // Variants, both directions. A variant with no CSS is a class that silently does
  // nothing; a CSS rule with no declaration is dead weight nobody can pick. The
  // registry is the single source both sides are checked against.
  const tilesCssPath = join(ROOT, 'src/css/nown-tiles.css');
  const variantsCss = existsSync(tilesCssPath) ? readFileSync(tilesCssPath, 'utf8') : '';
  for (const [type, list] of Object.entries(variants)) {
    if (!registry[type]) fail(`variants: "${type}" declares variants but is not a registered tile`);
    for (const v of list) {
      if (v.name && variantsCss && variantsCss.indexOf('.tile-' + type + '--' + v.name) === -1) {
        fail(`variants: "${type}" declares "${v.name}" but nown-tiles.css has no .tile-${type}--${v.name} rule — the class would do nothing`);
      }
    }
  }
  // And every variant rule in the CSS must be declared somewhere.
  const cssRules = [...variantsCss.matchAll(/\.tile-([a-z0-9-]+)--([a-z0-9-]+)/g)];
  const declared = new Set();
  Object.entries(variants).forEach(([t, list]) => list.forEach((v) => v.name && declared.add(t + '--' + v.name)));
  new Set(cssRules.map((m) => m[1] + '--' + m[2])).forEach((key) => {
    if (!declared.has(key)) warn(`variants: .tile-${key} has CSS but no declaration in tile-registry.js — nothing can select it`);
  });
  // And an entry that uses one.
  entries.forEach((e) => {
    if (!e.variant) return;
    const list = variants[e.type];
    if (!list) { warn(`content: ${e.id || e.type} sets variant "${e.variant}" but ${e.type} declares no variants`); return; }
    if (!list.some((v) => v.name === e.variant)) {
      fail(`content: ${e.id || e.type} sets variant "${e.variant}", which ${e.type} does not declare — the class would do nothing`);
    }
  });

  // site.plate. The runtime tolerates a bad value by falling back to 'ambient', which
  // is the right behaviour for a served page and the wrong behaviour for a lint: a
  // typo would silently produce a plate nobody asked for.
  const PLATE_MODES = ['ambient', 'color', 'image', 'animation', 'none'];
  if (doc.site && doc.site.plate) {
    const plate = doc.site.plate;
    if (typeof plate !== 'object' || Array.isArray(plate)) {
      fail('site.plate must be an object');
    } else {
      if (plate.mode != null && PLATE_MODES.indexOf(plate.mode) === -1) {
        fail(`site.plate.mode is "${plate.mode}" — must be one of ${PLATE_MODES.join(', ')}`);
      }
      const mode = plate.mode || 'ambient';
      if (mode === 'image' && !plate.image) fail("site.plate.mode is 'image' but site.plate.image is empty — the plate would fall back to no background at all");
      if (mode === 'color' && !plate.color) warn("site.plate.mode is 'color' with no site.plate.color — the plate uses --color-background");
      const unknown = Object.keys(plate).filter((k) => ['mode', 'color', 'image'].indexOf(k) === -1);
      if (unknown.length) warn(`site.plate has unknown key(s): ${unknown.join(', ')} — they are ignored`);
    }
  }
  // A top-level plate is the ambiguous twin of site.plate (see docs/BUILDER-PLAN.md 3.5
  // vs 3.7). The runtime reads site.plate only, so this is a silent no-op otherwise.
  if (doc.plate) warn('a top-level "plate" is ignored — the plate belongs at site.plate');

  // Every tile must carry the metadata the builder library renders. Without an
  // icon and a one-line description a tile is invisible in the picker, which is
  // how a tile ends up existing but unusable.
  const tilesCss = existsSync(join(ROOT, 'src/css/nown-tiles.css'))
    ? readFileSync(join(ROOT, 'src/css/nown-tiles.css'), 'utf8') : '';
  for (const [type, reg] of Object.entries(registry)) {
    if (!reg.icon) fail(`tile metadata: "${type}" has no icon — it cannot be shown in the library`);
    if (!reg.about) fail(`tile metadata: "${type}" has no about line — the library has nothing to explain it with`);
    if (!reg.role) fail(`tile metadata: "${type}" has no role (content | chrome)`);

    // A declared behaviour must have a file, and a file must be declared — the same
    // both-directions check the schema enum gets. Without it the builder either
    // 404s on a tile that claims a module it lacks, or silently never loads one
    // that exists.
    const jsPath = join(ROOT, 'src/modules');
    let hasJs = false;
    (function findJs(d) {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) findJs(p);
        else if (e.name === type + '.js') hasJs = true;
      }
    })(jsPath);
    if (reg.behaviour && !hasJs) fail(`tile metadata: "${type}" declares a behaviour but src/modules has no ${type}.js`);
    if (hasJs && !reg.behaviour) fail(`tile metadata: src/modules has ${type}.js but "${type}" does not declare behaviour: true`);

    // NB: there was a "styling reachability" warning here — every tile should have
    // a CSS rule. It was removed rather than kept: the root element also carries
    // the shared `tile` and `section` classes, which are always present in the
    // stylesheet, so the check passed vacuously; and the four tiles that do not
    // follow the .tile-<name> convention (content-card -> .tile-card, feature ->
    // .tile-feature-block, pricing -> .tile-price, nav-dock -> .nav-dock) needed an
    // allowlist to avoid false alarms. A gate that is either vacuous or wrong is
    // worse than no gate. An unstyled tile is obvious on sight; leave it to review.
  }
}

/* ------------------------- 2. pages: tile ids + slots + referenced files */
const usedIds = new Set();

/**
 * Strip the contents of <style> and <script> before looking for tiles.
 *
 * They are not markup, and the per-tile stylesheet makes them dangerous: the binder
 * collects every entry's CSS into ONE site-level <style>, which bake writes into
 * EVERY page. So a rule like [data-tile-id="home-model"] { --grid-min: 400px; }
 * appears on all eight pages, and scanning the raw HTML found "home-model" on each
 * of them — 16 false warnings about config keys having no slot on pages that do not
 * contain the tile at all.
 *
 * The same trap would hit anyone whose script or stylesheet happens to contain a
 * data-tile-id string.
 */
function withoutCode(html) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>');
}

function tileBlocks(html) {
  // Everything here works on the STRIPPED string. Taking the match indices from one
  // string and slicing the other is how the first version of this fix produced 74
  // warnings instead of 16: the stripped string is shorter, so every offset was off
  // by however much CSS and JS had been removed before it.
  const clean = withoutCode(html);
  // Approximate each tile as the span from its root tag to the next root tag.
  const marks = [...clean.matchAll(/data-tile-id="([^"]+)"/g)];
  return marks.map((m, i) => ({
    id: m[1],
    start: clean.lastIndexOf('<', m.index),
    end: i + 1 < marks.length ? clean.lastIndexOf('<', marks[i + 1].index) : clean.length,
  })).map((b) => ({ id: b.id, html: clean.slice(b.start, b.end) }));
}

for (const file of htmlFiles) {
  const html = readFileSync(join(dir, file), 'utf8');

  // referenced local css/js exist.
  //
  // A leading "/" is SITE-root-relative, not filesystem-absolute. path.resolve()
  // treats it as the latter, so on Windows "/assets/x.svg" resolved to C:\assets\x.svg
  // and every rooted reference was reported missing. That never showed up while the
  // pages shipped with unbaked src=""; the first bake that filled in resolved asset
  // URLs exposed it as seven errors on a site whose files were all present.
  const sitePath = (p) => (/^[A-Za-z]:[\\/]/.test(p) ? p : p.startsWith('/') ? join(dir, p.replace(/^\/+/, '')) : resolve(dir, p));
  for (const m of html.matchAll(/(?:src|href)="((?!https?:|mailto:|tel:|#|data:)[^"]+\.(?:css|js|svg|png|jpg|jpeg|webp|ico))"/g)) {
    const p = m[1];
    if (!existsSync(sitePath(p))) fail(`${file}: references missing file ${p}`);
  }

  const blocks = tileBlocks(html);

  // the page's tiles must all exist in content.json (unless it is not content-driven)
  if (blocks.length && !html.includes('data-content=')) {
    warn(`${file}: has tiles but no data-content attribute`);
  }

  for (const b of blocks) {
    const entry = byId.get(b.id);
    if (!entry) {
      // Chrome tiles (announcement/nav/footer) may be shared; still must exist.
      fail(`${file}: data-tile-id="${b.id}" has no entry in ${basename(contentFile)}`);
      continue;
    }
    usedIds.add(b.id);
    const roles = new Set([...b.html.matchAll(/data-role="([^"]+)"/g)].map((m) => m[1]));
    const keys = new Set(Object.keys(entry.config || {}));
    // Extra roles in markup that receive no content are harmless (placeholders).
    // A config key is satisfied either by a data-role slot, or by a data-* attribute
    // on the tile: calendarUrl -> data-calendar-url, provider -> data-form-provider.
    const kebab = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    for (const k of keys) {
      const asAttr = new RegExp(`data-(?:[a-z0-9]+-)*${kebab(k)}=`).test(b.html);
      if (!roles.has(k) && !asAttr) {
        warn(`${file}: tile "${b.id}" has config key "${k}" but no data-role slot or data-* attribute`);
      }
    }

    // A page that shows opening hours to a human must also carry them in
    // site.business.openingHours, which is what tools/seo.mjs turns into JSON-LD.
    // Search engines and AI answer engines read the structured data, not the page —
    // so hours on the page and no hours in the JSON-LD is worse than neither: the
    // site looks open to a visitor and closed to the machine deciding whether to
    // show it. This is the local-ranking failure mode worth an error, not a warning.
    if (entry.type === 'visit') {
      const shown = String((entry.config || {}).hours || '')
        .split('\n').map((r) => r.trim()).filter(Boolean);
      const business = doc.site && doc.site.business;
      const structured = (business && Array.isArray(business.openingHours) ? business.openingHours : [])
        .map((h) => String(h).trim()).filter(Boolean);
      if (shown.length && !structured.length) {
        fail(`${file}: tile "${b.id}" shows opening hours but content.json has no site.business.openingHours — a human sees them and a search engine does not`);
      } else if (shown.length && structured.length && shown.length !== structured.length) {
        warn(`${file}: tile "${b.id}" shows ${shown.length} hour row(s) but site.business.openingHours has ${structured.length} — check they still agree`);
      }
    }
  }

  // A layout block is inert unless the tiles sit in a configured grid. The binder
  // writes data-span either way and the attribute then matches no rule, so the
  // tile silently renders full width — a placement change that appears to do
  // nothing. pageEntries are the entries this page owns.
  const filePath = file === 'index.html' ? '/' : '/' + file;
  const pageEntries = entries.filter((e) => {
    const raw = typeof e.page === 'string' && e.page ? e.page : '/';
    const norm = raw.charAt(0) === '/' ? raw : '/' + raw;
    return norm === filePath || norm === file;
  });
  const mode = (doc.site && doc.site.layout && doc.site.layout.mode) || 'auto';
  if (pageEntries.some((e) => e.layout) && !html.includes('sites-grid--cols')) {
    warn(`${file}: an entry carries layout placement but no .sites-grid--cols container wraps the tiles — the span will not apply. Set site.layout.mode to "cols" and wrap the tiles, or drop the layout block.`);
  }
  if (mode === 'cols' && !html.includes('sites-grid--cols')) {
    warn(`${file}: site.layout.mode is "cols" but this page has no .sites-grid--cols container`);
  }

  // internal links resolve
  for (const m of html.matchAll(/href="(\/[^"#?]*)(?:\?[^"]*)?"/g)) {
    const p = m[1];
    if (p === '/') { if (!existsSync(join(dir, 'index.html'))) fail(`${file}: "/" has no index.html`); continue; }
    const candidates = [join(dir, p), join(dir, p + '.html'), join(dir, p.replace(/\/$/, ''), 'index.html')];
    if (!candidates.some((c) => existsSync(c) && statSync(c).isFile())) fail(`${file}: internal link ${p} does not resolve`);
  }
}

/* nav targets (they live in the content file, not the markup) */
for (const n of doc.nav || []) {
  const href = n.href || '';
  if (/^https?:|^mailto:|^tel:|^#/.test(href)) continue;
  if (href === '/') continue;
  const p = href.replace(/^\//, '');
  const candidates = [join(dir, p), join(dir, p + '.html')];
  if (!candidates.some((c) => existsSync(c))) fail(`nav: "${n.label}" → ${href} does not resolve`);
}

/* 3. orphans + referenced assets */
for (const e of entries) {
  if (e.id && !usedIds.has(e.id)) warn(`content entry "${e.id}" is not used by any page (orphan)`);
}
for (const [k, v] of Object.entries(assets)) {
  if (/^https?:|^data:/.test(v)) continue;
  if (!existsSync(resolve(dir, v.replace(/^\//, '')))) warn(`assets["${k}"] → ${v} does not exist yet`);
}

/* ------------------------------------------------------------------ 4. SEO
   A crawler and a social scraper read the HTML the server hands them and run
   nothing, so the static block tools/seo.mjs writes *is* the site's metadata.
   The product promise is "optimised for SEO and AI search" (docs/SEO.md), so a
   missing or malformed artifact is an error here — not a warning to ship over.
*/
const site = doc.site || {};
const base = String(site.baseUrl || '').replace(/\/+$/, '');
const sitemapFile = join(dir, 'sitemap.xml');
const robotsFile = join(dir, 'robots.txt');
const seoHint = ' — run: node tools/seo.mjs ' + basename(dir);

const pagePath = (file) => (file === 'index.html' ? '/' : '/' + file);
const isNoindex = (html) => /<meta[^>]*\bname\s*=\s*["']robots["'][^>]*\bnoindex\b/i.test(html);
const attr = (block, re) => { const m = block.match(re); return m ? m[1].trim() : null; };

// Without an origin there is nothing to compare a canonical URL against, so
// say that once instead of emitting one confusing error per page.
if (!base) fail('site.baseUrl is missing — canonical URLs and sitemap.xml cannot be verified (docs/SEO.md)');

// site.seo.noindex means the site is deliberately asking not to be indexed. In that
// state a sitemap must NOT exist and robots.txt must NOT advertise one — both would
// ask a crawler to index a site that is asking it not to. So these are asserted in
// BOTH directions rather than skipped: a stale sitemap left behind after flipping the
// flag on is exactly the drift this catches.
const siteNoindex = (site.seo && site.seo.noindex) === true;

let locs = new Set();
if (siteNoindex) {
  if (existsSync(sitemapFile)) {
    fail('site.seo.noindex is on, but sitemap.xml still exists — it lists URLs the site is asking not to index' + seoHint);
  }
} else if (!existsSync(sitemapFile)) {
  fail('sitemap.xml is missing' + seoHint);
} else {
  const xml = readFileSync(sitemapFile, 'utf8');
  locs = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()));
  if (!locs.size) fail('sitemap.xml lists no <loc> entries');
}

if (!existsSync(robotsFile)) {
  fail('robots.txt is missing' + seoHint);
} else {
  const txt = readFileSync(robotsFile, 'utf8');
  // A blanket Disallow hides the pages from search entirely, and it also hides
  // their noindex tag from the crawler — the opposite of what it looks like.
  if (/^\s*Disallow:\s*\/\s*$/im.test(txt)) fail('robots.txt blocks every crawler (Disallow: /) — the site would be invisible');
  const line = txt.match(/^\s*Sitemap:\s*(\S+)\s*$/im);
  if (siteNoindex) {
    if (line) fail('site.seo.noindex is on, but robots.txt still advertises "' + line[1] + '" — do not submit a sitemap for a site asking not to be indexed' + seoHint);
  } else if (!line) fail('robots.txt has no "Sitemap:" line — crawlers cannot discover sitemap.xml');
  else if (!/^https?:\/\//i.test(line[1])) fail('robots.txt "Sitemap:" must be an absolute URL, found "' + line[1] + '"');
  else if (base && line[1] !== base + '/sitemap.xml') fail('robots.txt points at ' + line[1] + ' but this site\'s sitemap is ' + base + '/sitemap.xml');
}

for (const file of htmlFiles) {
  const html = readFileSync(join(dir, file), 'utf8');
  const path = pagePath(file);
  const canonical = base ? base + (path === '/' ? '/' : path) : null;

  const marked = html.match(/<!--\s*seo:start\s*-->([\s\S]*?)<!--\s*seo:end\s*-->/);
  if (!marked) { fail(file + ': no <!-- seo:start --> … <!-- seo:end --> block' + seoHint); continue; }
  const block = marked[1];

  const title = attr(block, /<title>([\s\S]*?)<\/title>/);
  if (!title) fail(file + ': the SEO block has no non-empty <title>');
  const titles = (html.match(/<title[\s>]/gi) || []).length;
  if (titles !== 1) fail(file + ': ' + titles + ' <title> elements in the document — the SEO block must own the only one');

  if (!attr(block, /<meta\s+name="description"\s+content="([^"]*)"/)) fail(file + ': the SEO block has no non-empty <meta name="description">');

  const canon = attr(block, /<link\s+rel="canonical"\s+href="([^"]+)"/);
  if (!canon) fail(file + ': the SEO block has no <link rel="canonical">');
  else if (canonical && canon !== canonical) fail(file + ': canonical is ' + canon + ' but this page is served at ' + canonical);

  ['og:title', 'og:description', 'og:url', 'og:type'].forEach((prop) => {
    if (!attr(block, new RegExp('<meta\\s+property="' + prop + '"\\s+content="([^"]*)"'))) {
      fail(file + ': missing or empty <meta property="' + prop + '">');
    }
  });
  const ogUrl = attr(block, /<meta\s+property="og:url"\s+content="([^"]+)"/);
  if (ogUrl && canonical && ogUrl !== canonical) fail(file + ': og:url (' + ogUrl + ') does not match the canonical URL');
  const ogImage = attr(block, /<meta\s+property="og:image"\s+content="([^"]+)"/);
  if (ogImage && !/^https?:\/\//i.test(ogImage)) fail(file + ': og:image must be an absolute URL — social scrapers do not resolve relative ones (' + ogImage + ')');

  const card = attr(block, /<meta\s+name="twitter:card"\s+content="([^"]+)"/);
  if (!card) fail(file + ': missing <meta name="twitter:card">');
  else if (!/^(summary|summary_large_image)$/.test(card)) fail(file + ': twitter:card must be "summary" or "summary_large_image", found "' + card + '"');

  // Structured data that does not parse is worse than none: the search engine
  // sees a syntax error exactly where the business details should be.
  const ldBlocks = [...block.matchAll(/<script\s+type="application\/ld\+json"\s*>([\s\S]*?)<\/script>/g)];
  if (!ldBlocks.length) fail(file + ': no <script type="application/ld+json"> in the SEO block');
  const nodes = [];
  ldBlocks.forEach((m, i) => {
    try {
      const data = JSON.parse(m[1]);
      if (Array.isArray(data['@graph'])) nodes.push(...data['@graph']);
      else nodes.push(data);
    } catch (err) {
      fail(file + ': JSON-LD block ' + (i + 1) + ' does not parse as JSON (' + err.message + ')');
    }
  });
  const types = nodes.map((n) => String((n && n['@type']) || ''));
  if (!types.includes('WebSite')) fail(file + ': JSON-LD has no WebSite node');
  const business = site.business && typeof site.business === 'object' ? site.business : null;
  if (business) {
    const want = String(business.type || 'LocalBusiness');
    if (!types.includes(want)) fail(file + ': content.json carries site.business but the JSON-LD has no ' + want + ' node');
  }

  if (canonical) {
    // A URL cannot be both "index this" and "do not index this".
    if (isNoindex(html) && locs.has(canonical)) fail(file + ': page is noindex but is listed in sitemap.xml — drop it from the sitemap');
    if (!isNoindex(html) && !locs.has(canonical)) fail(file + ': ' + canonical + ' is not listed in sitemap.xml' + seoHint);
  }
}

// The reverse direction: a URL nobody serves is a 404 advertised to crawlers.
[...locs].forEach((loc) => {
  const known = base && htmlFiles.some((f) => loc === base + (f === 'index.html' ? '/' : '/' + f));
  if (!known) warn('sitemap.xml lists ' + loc + ', which is not a page in this directory');
});

/* ------------------------------------------------------------------ report */
console.log(`check-site: ${basename(dir)} — ${htmlFiles.length} page(s), ${entries.length} content entries, ${(doc.nav || []).length} nav links`);
if (!quiet) {
  warnings.forEach((w) => console.log('  ⚠ ' + w));
}
errors.forEach((e) => console.log('  ✖ ' + e));
console.log(errors.length
  ? `  FAILED — ${errors.length} error(s), ${warnings.length} warning(s)`
  : `  ✓ no errors (${warnings.length} warning${warnings.length === 1 ? '' : 's'})`);
process.exit(errors.length ? 1 : 0);