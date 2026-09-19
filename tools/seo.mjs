#!/usr/bin/env node
/* ==========================================================================
   seo.mjs — S.I.T.E.S SEO artifact generator (build-time only)

   A crawler and a social scraper read the HTML the server hands them and run
   nothing. Everything this tool writes is therefore a plain static file:

     • sitemap.xml — one <url> per indexable page, with <lastmod>
     • robots.txt  — crawlable, pointing at the sitemap
     • each page   — a marker-delimited <head> block holding <title>,
                     <meta name="description">, <link rel="canonical">,
                     OpenGraph, a Twitter card and JSON-LD

   Nothing here ships to the browser: the output is plain .html/.xml/.txt, and
   the site still runs with this tool absent. The runtime binder keeps filling
   the visible copy from content.json — this tool only makes the *metadata*
   static, so it exists before any script runs. See docs/SEO.md.

   Idempotency contract
     The generated block always sits between <!-- seo:start --> and
     <!-- seo:end -->. A re-run replaces exactly that span, and a file is only
     written when its bytes actually change — so running the tool twice leaves
     an empty 'git diff'. After adoption, nothing outside the markers is ever
     rewritten.

   Adoption (the first run on a hand-authored page)
     A page written by hand already carries <title>, <meta name="description">
     and friends. Emitting a second set would duplicate them, so on the first
     run only those known tags are absorbed into the block (moved, not copied).
     Tags the tool does not own — favicon, stylesheets, <meta name="robots">,
     fonts, preloads — are never touched.

   Page titles and descriptions resolve in this order (first hit wins):
     1. content.json → site.seo.pages["/<page>"] { title, description, image }
     2. the page's own copy — the first headline/body among the content entries
        whose "page" points at this page (entries with no "page" belong to "/")
     3. content.json → site.seo.{title,description} (site-wide fallback)

   JSON-LD is always a WebSite node; a LocalBusiness node is added when the
   content file carries the optional site.business block. Pages marked
   <meta name="robots" content="noindex"> are kept out of sitemap.xml, because
   listing a noindex URL is the classic way to contradict yourself.

   Usage:
     node tools/seo.mjs [publicDir] [--content content.json] [--quiet] [--dry-run]

   Exit: 0 clean · 1 warnings · 2 cannot proceed (no content file / no baseUrl)
   ========================================================================== */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/* --------------------------------------------------------------------- cli */
const argv = process.argv.slice(2);
const dir = resolve(process.cwd(), argv.find((a) => !a.startsWith('--')) || 'site/public');
const cIdx = argv.indexOf('--content');
const contentFile = resolve(dir, cIdx >= 0 ? argv[cIdx + 1] : 'content.json');
const quiet = argv.includes('--quiet');
const dryRun = argv.includes('--dry-run');

const warnings = [];
const errors = [];
const actions = [];
const warn = (m) => warnings.push(m);
const fail = (m) => errors.push(m);

if (!existsSync(contentFile)) {
  console.error('seo: no content file at ' + contentFile);
  process.exit(2);
}
const doc = JSON.parse(readFileSync(contentFile, 'utf8'));
const site = doc.site || {};
const seo = site.seo || {};

// site.seo.noindex keeps an entire site out of the index — the pre-launch state.
// It is a SITE setting rather than a per-page tag because the decision is "this site
// is not ready to be found", not "this page is different from its neighbours".
//
// Deliberately paired with a crawlable robots.txt rather than a Disallow: a
// Disallow stops the crawler fetching the page, so it never reads the noindex tag
// and the page can stay indexed. Crawlable + noindex is the only combination that
// reliably removes a URL. See docs/SEO.md.
const SITE_NOINDEX = seo.noindex === true;
const siteName = String(site.name || '').trim();

// canonical/og:url/sitemap need an absolute origin, so a missing baseUrl is a
// stop-the-line error rather than a warning: guessing the domain would publish
// someone else's URL as this site's canonical.
const base = String(site.baseUrl || '').replace(/\/+$/, '');
if (!base) {
  console.error('seo: site.baseUrl is missing from ' + basename(contentFile) +
    ' — canonical URLs, OpenGraph and sitemap.xml all need an absolute origin.');
  process.exit(2);
}

/* --------------------------------------------------------------- utilities */
/** Escape a value for an HTML text node or an attribute value. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One line, collapsed whitespace, clipped at a word boundary. */
function clip(text, max) {
  const flat = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  const body = space > max * 0.6 ? cut.slice(0, space) : cut;
  return body.replace(/[.,;:!?\u2014-]+$/, '') + '\u2026';
}

/** Keep the page's own line ending: a mixed-EOL file keeps its dominant one. */
function eolOf(text) {
  return text.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
}

/** '/index.html' -> '/', 'docs.html' -> '/docs.html'. */
function pagePathOf(file) {
  return file === 'index.html' ? '/' : '/' + file;
}

/** Every spelling of a page's path a content file might use. */
function pageKeys(file) {
  const path = pagePathOf(file);
  const keys = new Set([path]);
  if (path === '/') keys.add('/index.html');
  else { keys.add(file); keys.add(path.replace(/\.html$/, '')); }
  return keys;
}

/** A site-relative or absolute asset reference -> absolute URL. */
function absolute(p) {
  const v = String(p || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return base + (v.charAt(0) === '/' ? v : '/' + v);
}

/* ------------------------------------------------- site-level page metadata */
const overrides = (function () {
  const table = new Map();
  const pages = seo.pages && typeof seo.pages === 'object' ? seo.pages : {};
  Object.keys(pages).forEach((k) => {
    const norm = k.charAt(0) === '/' ? k : '/' + k;
    table.set(norm, pages[k] && typeof pages[k] === 'object' ? pages[k] : {});
  });
  return table;
})();

function overrideFor(file) {
  for (const k of pageKeys(file)) if (overrides.has(k)) return overrides.get(k);
  return {};
}

/** Content entries that belong to this page ("page" defaults to the home page). */
function entriesForPage(file) {
  const keys = pageKeys(file);
  return (Array.isArray(doc.content) ? doc.content : []).filter((e) => {
    const raw = typeof e.page === 'string' && e.page ? e.page : '/';
    const norm = raw.charAt(0) === '/' ? raw : '/' + raw;
    return keys.has(norm);
  });
}

function deriveCopy(file) {
  const list = entriesForPage(file);
  const first = (key) => {
    const hit = list.find((e) => e.config && typeof e.config[key] === 'string' && e.config[key].trim());
    return hit ? hit.config[key].trim() : '';
  };
  return { headline: first('headline'), sectionTitle: first('title'), body: first('body') };
}

/* ----------------------------------------------------------------- JSON-LD */
/**
 * Build the JSON-LD graph. Site-level, so it is computed once: the WebSite node
 * describes the whole site, and every page points at it through its canonical.
 */
function buildJsonLd() {
  const graph = [];
  const website = {
    '@type': 'WebSite',
    '@id': base + '/#website',
    url: base + '/',
    name: siteName || seo.title || '',
  };
  if (seo.description || site.description) website.description = seo.description || site.description;
  if (site.lang) website.inLanguage = site.lang;
  graph.push(website);

  const b = site.business;
  if (b && typeof b === 'object') graph.push(buildLocalBusiness(b));
  else if (b != null && typeof b !== 'object') warn('site.business must be an object — LocalBusiness JSON-LD skipped');

  const out = { '@context': 'https://schema.org', '@graph': graph };
  // A '</script' inside a string would end the script element early; escaping
  // '<' as \u003c is the standard, still-valid-JSON way to prevent that.
  return {
    json: JSON.stringify(out, null, 2).replace(/</g, '\\u003c'),
    hasLocalBusiness: graph.length > 1,
  };
}

function buildLocalBusiness(b) {
  const node = {
    // Schema.org has specific LocalBusiness subtypes (PawnShop, FoodEstablishment,
    // …); naming the real one is strictly more useful to an AI answer engine than
    // the generic parent, so allow it while defaulting to LocalBusiness.
    '@type': String(b.type || 'LocalBusiness'),
    '@id': base + '/#localbusiness',
    name: String(b.name || siteName || '').trim(),
    url: base + '/',
  };
  if (b.telephone) node.telephone = String(b.telephone);
  if (b.priceRange) node.priceRange = String(b.priceRange);

  const image = absolute((seo.image || seo.ogImage || ''));
  if (image) node.image = image;

  const a = b.address && typeof b.address === 'object' ? b.address : null;
  if (a) {
    const address = { '@type': 'PostalAddress' };
    ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry'].forEach((k) => {
      if (a[k]) address[k] = String(a[k]);
    });
    if (Object.keys(address).length > 1) node.address = address;
    else warn('site.business.address has no usable parts — address dropped from JSON-LD');
  }

  const g = b.geo && typeof b.geo === 'object' ? b.geo : null;
  if (g) {
    const lat = Number(g.latitude);
    const lng = Number(g.longitude);
    // A dropped coordinate is silently invisible to a search engine, so say so
    // instead of emitting geo with nulls (which is invalid schema).
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      node.geo = { '@type': 'GeoCoordinates', latitude: lat, longitude: lng };
    } else {
      warn('site.business.geo.latitude/longitude must both be numbers — geo dropped from JSON-LD');
    }
  }

  const hours = Array.isArray(b.openingHours) ? b.openingHours : (b.openingHours ? [b.openingHours] : []);
  const clean = hours.map((h) => String(h).trim()).filter(Boolean);
  if (clean.length) node.openingHours = clean;
  return node;
}

const { json: jsonLd, hasLocalBusiness: jsonLdHasLocalBusiness } = buildJsonLd();

/* ------------------------------------------------- the generated <head> block */
const START = '<!-- seo:start -->';
const END = '<!-- seo:end -->';
const GENERATED = '<!-- Generated by tools/seo.mjs — edit content.json, then re-run the tool. -->';

function renderBlock(meta, indent, eol) {
  const L = [];
  const add = (line) => L.push(indent + line);
  add(START);
  add(GENERATED);
  add('<title>' + esc(meta.title) + '</title>');
  // site.seo.noindex keeps a pre-launch site out of the index. It goes FIRST in the
  // block, and only when the page does not already carry its own tag outside the
  // block — a page with a hand-written noindex (admin.html) must not end up with two.
  if (meta.noindex) add('<meta name="robots" content="noindex" />');
  add('<meta name="description" content="' + esc(meta.description) + '" />');
  add('<link rel="canonical" href="' + esc(meta.canonical) + '" />');
  add('<meta property="og:type" content="website" />');
  add('<meta property="og:site_name" content="' + esc(siteName) + '" />');
  add('<meta property="og:title" content="' + esc(meta.title) + '" />');
  add('<meta property="og:description" content="' + esc(meta.description) + '" />');
  add('<meta property="og:url" content="' + esc(meta.canonical) + '" />');
  if (site.lang) add('<meta property="og:locale" content="' + esc(site.lang) + '" />');
  if (meta.image) add('<meta property="og:image" content="' + esc(meta.image) + '" />');
  add('<meta name="twitter:card" content="' + (meta.image ? 'summary_large_image' : 'summary') + '" />');
  add('<meta name="twitter:title" content="' + esc(meta.title) + '" />');
  add('<meta name="twitter:description" content="' + esc(meta.description) + '" />');
  if (meta.image) add('<meta name="twitter:image" content="' + esc(meta.image) + '" />');
  add('<script type="application/ld+json">');
  jsonLd.split('\n').forEach((line) => L.push(indent + line));
  add('</script>');
  add(END);
  return L.join(eol) + eol;
}

/* Tags this tool owns. On adoption they are moved into the block rather than
   duplicated — matched whole-line so neighbouring markup is never disturbed. */
const OWNED_TAGS = [
  /^[ \t]*<title\b[\s\S]*?<\/title>[ \t]*\r?\n/gim,
  /^[ \t]*<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>[ \t]*\r?\n/gim,
  /^[ \t]*<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>[ \t]*\r?\n/gim,
  /^[ \t]*<meta\b[^>]*\bproperty\s*=\s*["'](?:og|article):[^"']*["'][^>]*>[ \t]*\r?\n/gim,
  /^[ \t]*<meta\b[^>]*\bname\s*=\s*["']twitter:[^"']*["'][^>]*>[ \t]*\r?\n/gim,
  /^[ \t]*<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>[ \t]*\r?\n/gim,
];

/** Where the block goes when the page has no markers yet. */
function insertionPoint(html) {
  const anchors = [
    /^[ \t]*<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>[ \t]*\r?\n/m,
    /^[ \t]*<meta\b[^>]*\bcharset\b[^>]*>[ \t]*\r?\n/m,
    /^[ \t]*<head\b[^>]*>[ \t]*\r?\n/m,
  ];
  for (const re of anchors) {
    const m = html.match(re);
    if (m) return { at: m.index + m[0].length, indent: (m[0].match(/^[ \t]*/) || [''])[0] };
  }
  return null;
}

/** Replace the marked block, or adopt a hand-written head on the first run. */
function injectBlock(html, eol) {
  const marked = /^[ \t]*<!--\s*seo:start\s*-->[\s\S]*?<!--\s*seo:end\s*-->[ \t]*\r?\n?/m;
  const found = html.match(marked);
  if (found) {
    const indent = (found[0].match(/^[ \t]*/) || [''])[0];
    const fresh = renderBlock(currentMeta, indent, eol);
    return { html: html.slice(0, found.index) + fresh + html.slice(found.index + found[0].length), mode: 'refresh', absorbed: 0 };
  }

  // Adoption: strip the tags we are about to re-emit, then insert the block.
  let absorbed = 0;
  let next = html;
  OWNED_TAGS.forEach((re) => {
    next = next.replace(re, () => { absorbed++; return ''; });
  });
  const spot = insertionPoint(next);
  if (!spot) return { html, mode: 'skip', absorbed: 0 };
  const fresh = renderBlock(currentMeta, spot.indent, eol);
  return { html: next.slice(0, spot.at) + fresh + next.slice(spot.at), mode: 'adopt', absorbed };
}

/* -------------------------------------------------------------------- pages */
let currentMeta = null; // the page being rendered; renderBlock has no other channel

const pages = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
const sitemap = [];
let blocks = 0;
let wrote = 0;

pages.forEach((file) => {
  const full = join(dir, file);
  const original = readFileSync(full);
  const html = original.toString('utf8');

  // A page that is not valid UTF-8 cannot be read/written losslessly; skip it
  // rather than mangle a byte we did not understand.
  if (!Buffer.from(html, 'utf8').equals(original)) {
    fail(file + ': not valid UTF-8 — skipped (fix the encoding, then re-run)');
    return;
  }

  const eol = eolOf(html);
  const path = pagePathOf(file);
  const canonical = base + (path === '/' ? '/' : path);
  // A robots tag already inside the generated block is the tool's own output from a
  // previous run, not an author's intent, so it is removed before the hand-written
  // check — otherwise every re-run would read its own tag back as a page-level
  // decision and the site-wide flag could never be turned off cleanly.
  const outsideBlock = html.replace(/^[ \t]*<!--\s*seo:start\s*-->[\s\S]*?<!--\s*seo:end\s*-->[ \t]*\r?\n?/m, '');
  const handWritten = /<meta[^>]*\bname\s*=\s*["']robots["'][^>]*\bnoindex\b/i.test(outsideBlock);
  const noindex = SITE_NOINDEX || handWritten;
  const override = overrideFor(file);
  const derived = deriveCopy(file);
  const headline = (derived.headline || derived.sectionTitle || '').trim();

  let title = '';
  let source = '';
  if (override.title) { title = String(override.title).trim(); source = 'seo.pages'; }
  else if (headline) { title = (siteName && headline.indexOf(siteName) === -1) ? headline + ' \u2014 ' + siteName : headline; source = 'page headline'; }
  else { title = String(seo.title || siteName).trim(); source = 'site.seo'; }

  let description = '';
  let descSource = '';
  if (override.description) { description = String(override.description).trim(); descSource = 'seo.pages'; }
  else if (derived.body) { description = clip(derived.body, 155); descSource = 'page copy'; }
  else { description = String(seo.description || site.description || '').trim(); descSource = 'site.seo'; }

  if (!title) fail(file + ': no title — set site.seo.title or site.seo.pages["' + path + '"].title');
  if (!description) fail(file + ': no description — set site.seo.description or site.seo.pages["' + path + '"].description');
  if (!title || !description) return;

  // Both of these are authoring smells that cost clicks in a real result page,
  // so they are reported rather than silently published.
  // The home page legitimately wears the site-wide title; every other page
  // sharing it is a real SEO defect, so it is reported.
  if (source === 'site.seo' && !noindex && path !== '/') warn(file + ': falls back to the site-wide title — add site.seo.pages["' + path + '"] so pages do not all share one title');
  if (descSource === 'site.seo' && !noindex) warn(file + ': falls back to the site-wide description — add site.seo.pages["' + path + '"]');
  if (title.length > 65) warn(file + ': title is ' + title.length + ' characters — search results truncate around 60');
  if (description.length > 165) warn(file + ': description is ' + description.length + ' characters — search results truncate around 155');

  currentMeta = {
    title, description, canonical,
    image: absolute(override.image || seo.image || seo.ogImage || ''),
    noindex: noindex && !handWritten,
  };

  const { html: next, mode, absorbed } = injectBlock(html, eol);
  if (mode === 'skip') { fail(file + ': no <head> to inject the SEO block into'); return; }
  blocks++;

  // lastmod comes from the file's own timestamp, so it is only honest when the
  // tool has just written the page or the page genuinely has not changed.
  if (next === html) {
    // Nothing to do: this is the state a second run finds, and the proof that
    // the block is stable.
  } else if (dryRun) {
    actions.push('page ' + file + ' — would ' + (mode === 'adopt' ? 'adopt ' + absorbed + ' hand-written tag(s) and write' : 'refresh') + ' the SEO block');
  } else {
    writeFileSync(full, next, 'utf8');
    wrote++;
    actions.push('page ' + file + ' — ' + (mode === 'adopt' ? 'adopted ' + absorbed + ' hand-written tag(s), wrote' : 'refreshed') + ' the SEO block');
  }

  if (!noindex) sitemap.push({ loc: canonical, lastmod: statSync(full).mtime.toISOString().slice(0, 10) });
});

/* --------------------------------------------------------- sitemap & robots */
const xml = ['<?xml version="1.0" encoding="UTF-8"?>',
  '<!-- Generated by tools/seo.mjs — re-run after adding a page or editing copy. -->',
  '<!-- Only indexable pages appear here; noindex pages are named in robots.txt\'s comment. -->',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
  .concat(sitemap.slice().sort((a, b) => (a.loc < b.loc ? -1 : 1)).map((u) =>
    '  <url>\n    <loc>' + esc(u.loc) + '</loc>\n    <lastmod>' + u.lastmod + '</lastmod>\n  </url>'))
  .concat(['</urlset>', '']).join('\n');

// A Disallow here would hide <meta name="robots" content="noindex"> from the
// crawler too, so noindex pages are deliberately left crawlable.
const robots = ['# robots.txt — generated by tools/seo.mjs',
  '# Crawling is allowed everywhere. Pages that should stay out of search results',
  '# carry <meta name="robots" content="noindex"> themselves and are left out of',
  '# sitemap.xml; a Disallow here would hide that tag and do the opposite.']
  .concat(SITE_NOINDEX
    ? ['#',
       '# This site sets site.seo.noindex, so every page carries that tag and no',
       '# sitemap is advertised — submitting one would ask a crawler to index a site',
       '# that is asking not to be indexed. Removing the setting restores both.']
    : ['', 'Sitemap: ' + base + '/sitemap.xml'])
  .concat(['User-agent: *', 'Allow: /', ''])
  .join('\n');

// A sitemap listing a site that is asking not to be indexed contradicts itself, and
// an empty <urlset> is not worth publishing. So with noindex on there is no sitemap
// file at all — removed if a previous run left one, so the tree never carries a stale
// list of URLs nothing should fetch.
const sitemapPath = join(dir, 'sitemap.xml');
if (SITE_NOINDEX) {
  if (existsSync(sitemapPath)) {
    if (dryRun) actions.push('sitemap.xml — would remove (site.seo.noindex is on)');
    else { rmSync(sitemapPath); wrote++; actions.push('sitemap.xml — removed (site.seo.noindex is on)'); }
  }
} else {
  const before = existsSync(sitemapPath) ? readFileSync(sitemapPath, 'utf8') : null;
  if (before !== xml) {
    if (dryRun) actions.push('sitemap.xml — would write');
    else { writeFileSync(sitemapPath, xml, 'utf8'); wrote++; actions.push('sitemap.xml — ' + (before === null ? 'written' : 'updated')); }
  }
}

const robotsPath = join(dir, 'robots.txt');
const robotsBefore = existsSync(robotsPath) ? readFileSync(robotsPath, 'utf8') : null;
if (robotsBefore !== robots) {
  if (dryRun) actions.push('robots.txt — would write');
  else { writeFileSync(robotsPath, robots, 'utf8'); wrote++; actions.push('robots.txt — ' + (robotsBefore === null ? 'written' : 'updated')); }
}

/* ------------------------------------------------------------------ report */
if (!quiet) {
  console.log('[seo] ' + basename(dir) + ' — ' + pages.length + ' page(s), base ' + base +
    (dryRun ? ' (dry run)' : ''));
  actions.forEach((a) => console.log('  ' + a));
  warnings.forEach((w) => console.log('  \u26a0 ' + w));
}
errors.forEach((e) => console.log('  \u2716 ' + e));
if (errors.length) {
  console.log('  FAILED — ' + errors.length + ' error(s), ' + warnings.length + ' warning(s)');
  process.exit(2);
}
console.log('  \u2713 ' + blocks + ' SEO block(s), ' + sitemap.length + ' sitemap url(s), ' +
  'JSON-LD: WebSite' + (jsonLdHasLocalBusiness ? ' + LocalBusiness' : ' only') +
  (wrote ? ' — ' + wrote + ' file(s) written' : ' — up to date, nothing to write (idempotent)'));
process.exit(warnings.length ? 1 : 0);
