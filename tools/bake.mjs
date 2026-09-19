#!/usr/bin/env node
/* ==========================================================================
   bake.mjs — render content.json into complete static pages

   The framework's runtime binder fills data-role slots from the content file
   when a page loads. That is right for a human editing copy in the admin, and
   wrong as the *only* source of a page's text: a crawler and a social scraper
   run no JavaScript, so what they see is whatever the file already contained.

   It matters most for the pages this framework is aimed at. A compact-keyword
   page's <h1> IS the keyword, and a hub tile's cards ARE the internal links that
   expose the cluster. Leave those to the binder and the page has no headline and
   no crawl path as far as any machine is concerned.

   So this tool bakes: it renders the copy into the HTML at build time, and the
   binder re-applies the same values on load as a visual no-op. tools/seo.mjs
   already does this for the <head>; this is the same principle for the body.

   Markup is single-sourced from src/modules/<type>.html, so a baked page and a
   hand-composed page cannot drift.

   Usage:
     node tools/bake.mjs <siteDir> [--content <file>] [--out <dir>] [--og] [--seo]

   --og / --seo also run tools/og-image.mjs and tools/seo.mjs afterwards, in that
   order. Baking rewrites every page and would otherwise drop the SEO block a
   previous run added, so wiring them here is safer than documenting a sequence.

   Build-time only: the output is plain .html and needs nothing to serve.
   ========================================================================== */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/* ============================================================== mini HTML
   A tolerant tag tree. Enough to find an element by attribute, set its text or
   an attribute, and replace its children — which is all baking needs. Not a
   parser: unbalanced tags are kept as-is rather than repaired.
   ========================================================================== */
/**
 * The registry, for the CSS lint. Loaded with new Function() rather than imported:
 * tile-registry.js is a browser IIFE that assigns to window.SITES, and this is the
 * same way tools/check-site.mjs reads it. One implementation of the lint, two
 * consumers — a second copy here would be a second thing to keep in step.
 */
function loadRegistry() {
  const code = readFileSync(join(ROOT, 'src/js/tile-registry.js'), 'utf8');
  const win = {};
  new Function('window', code)(win); // eslint-disable-line no-new-func
  return (win.SITES && win.SITES.tileRegistry) || {};
}

function loadCssLint() {
  const code = readFileSync(join(ROOT, 'src/js/tile-registry.js'), 'utf8');
  const win = {};
  new Function('window', code)(win); // eslint-disable-line no-new-func
  return (win.SITES && win.SITES.cssLint) || null;
}

/** The page's <head>, for the one node bake inserts rather than fills. */
function findHead(root) {
  let hit = null;
  walk(root, (el) => { if (!hit && el.tag === 'head') hit = el; });
  return hit;
}

const VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

function parseHtml(html) {
  const root = { tag: null, attrs: {}, children: [], parent: null };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/\s*([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
  let last = 0, m;
  const push = (node) => { node.parent = stack[stack.length - 1]; stack[stack.length - 1].children.push(node); };

  // serialize() escapes exactly one character — the double quote — so parse must
  // decode exactly that, or the round trip is lossy. It was: an attribute value
  // containing a quote came back as the six literal characters "&quot;", the next
  // bake escaped nothing, and the damage compounded on every run. Latent until an
  // attribute actually contained a quote, which the plate's url("…") was the first
  // to do. tests/bake-idempotent.cjs now bakes twice and compares.
  const decodeAttr = (s) => String(s == null ? '' : s).replace(/&quot;/g, '"');

  const parseAttrs = (raw) => {
    const attrs = {};
    const are = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let a;
    while ((a = are.exec(raw || ''))) {
      attrs[a[1].toLowerCase()] = decodeAttr(a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '');
    }
    return attrs;
  };

  while ((m = re.exec(html))) {
    if (m.index > last) push({ type: 'text', text: html.slice(last, m.index) });
    const token = m[0];
    if (token.startsWith('<!--') || token.startsWith('<![') || /^<!doctype/i.test(token)) {
      push({ type: 'raw', text: token });
    } else if (m[1]) {
      // closing tag: pop to the matching open tag if one is on the stack
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === m[1].toLowerCase()) { stack.length = i; break; }
      }
    } else {
      const node = { type: 'el', tag: m[2].toLowerCase(), attrs: parseAttrs(m[3]), children: [], selfClosing: m[4] === '/' || VOID_TAGS.has(m[2].toLowerCase()) };
      push(node);
      if (!node.selfClosing) stack.push(node);
    }
    last = m.index + token.length;
  }
  if (last < html.length) push({ type: 'text', text: html.slice(last) });
  return root;
}

const escapeHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function serialize(node) {
  // Leaf checks first: a text or raw node has no tag either, and testing for the
  // root before them swallows every text node and every comment in the document.
  if (node.type === 'text' || node.type === 'raw') return node.text;
  // The document root has no tag of its own: serialize its children only. Without
  // this the root emits <null>…</null>, which the next parse reads as a real
  // element and wraps — so every bake nested the document one level deeper.
  if (!node.tag) return (node.children || []).map(serialize).join('');
  // Always the explicit form, even for an empty value: <img src alt /> and
  // <img src="" alt="" /> mean the same thing, but only one of them round-trips
  // byte-identically, and bake has to be idempotent.
  const attrs = Object.entries(node.attrs || {})
    .map(([k, v]) => ' ' + k + '="' + String(v == null ? '' : v).replace(/"/g, '&quot;') + '"')
    .join('');
  const open = '<' + node.tag + attrs + (node.selfClosing ? ' />' : '>');
  if (node.selfClosing) return open;
  return open + node.children.map(serialize).join('') + '</' + node.tag + '>';
}

/** Depth-first walk over element nodes. */
function walk(node, fn) {
  for (const child of node.children || []) {
    if (child.type !== 'el') continue;
    fn(child);
    walk(child, fn);
  }
}

/** First element (in document order) carrying data-role="<role>". */
/** The plate element, by class. There is exactly one per page. */
function findPlate(root) {
  let hit = null;
  walk(root, (el) => {
    if (hit) return;
    const cls = String(el.attrs.class || '').split(/\s+/);
    if (cls.indexOf('sites-plate') !== -1) hit = el;
  });
  return hit;
}

function findByRole(root, role) {
  let hit = null;
  walk(root, (el) => { if (!hit && el.attrs['data-role'] === role) hit = el; });
  return hit;
}

function findTemplate(root) {
  let hit = null;
  walk(root, (el) => { if (!hit && el.tag === 'template') hit = el; });
  return hit;
}

/** Replace an element's children with plain text (the DOM's textContent). */
function setText(el, value) {
  el.children = value === '' ? [] : [{ type: 'text', text: String(value) }];
}

/** All descendant text, concatenated — the DOM's textContent. */
function textOf(el) {
  let out = '';
  const rec = (n) => {
    if (n.type === 'text') out += n.text;
    else (n.children || []).forEach(rec);
  };
  rec(el);
  return out;
}

const isBlank = (el) => textOf(el).trim() === '' && (el.children || []).every((c) => c.type !== 'el');

/** Deep structural clone. Attributes are copied rather than shared — a shallow
 *  spread would leave every clone pointing at the same attrs object, so binding
 *  an href on the last item would silently rewrite all of them. The parent
 *  back-reference is dropped, which would otherwise make the tree circular. */
function cloneNode(node) {
  const copy = { ...node, attrs: node.attrs ? { ...node.attrs } : undefined };
  delete copy.parent;
  if (node.children) copy.children = node.children.map(cloneNode);
  return copy;
}
/* ============================================================ the binder
   Mirrors the runtime binder in src/js/sites-content.js. The rules have to
   match, because the browser binder re-applies them on load: if baking and
   binding disagreed, the page would change under the reader's eyes — and the
   no-JS version would be the wrong one.
   ========================================================================== */
const STYLE_CLASSES = {
  gold: 'btn-tactile btn-gold-tactile',
  primary: 'btn-tactile btn-primary-tactile',
  plum: 'btn-tactile btn-plum-tactile',
  ghost: 'btn-ghost',
  outline: 'btn-ghost',
};
// Mirrors PLATE_MODES in src/js/sites-content.js.
const PLATE_MODES = ['ambient', 'color', 'image', 'animation', 'none'];

const VARIANT_CLASSES = ['btn-tactile', 'btn-gold-tactile', 'btn-primary-tactile', 'btn-plum-tactile', 'btn-ghost'];

function makeBinder(assets) {
  const resolveSrc = (v) => {
    const s = String(v == null ? '' : v);
    const m = s.match(/^asset:([A-Za-z0-9_-]+)$/);
    if (m && assets && assets[m[1]]) return String(assets[m[1]]);
    return s;
  };

  function applyActionStyle(el, style) {
    const classes = STYLE_CLASSES[style];
    if (!classes) return;
    let btn = el;
    if (el.tag !== 'a' && el.tag !== 'button') {
      let found = null;
      walk(el, (n) => { if (!found && (n.tag === 'a' || n.tag === 'button')) found = n; });
      btn = found;
    }
    if (!btn) return;
    const existing = String(btn.attrs.class || '').split(/\s+/).filter((c) => c && !VARIANT_CLASSES.includes(c));
    btn.attrs.class = existing.concat('btn', classes.split(' ')).join(' ');
  }

  /** Bind one item object into a cloned template node. */
  function bindItem(node, item) {
    if (item == null) return;
    if (typeof item !== 'object') { setText(node, item); return; }
    if (item.style) applyActionStyle(node, item.style);
    for (const [key, value] of Object.entries(item)) {
      if (value == null) continue;
      const target = findByRole(node, key);
      if (target) { bindValue(target, key, value); continue; }
      if (key === 'href' && node.tag === 'a') node.attrs.href = String(value);
      if (key === 'src' || key === 'alt') {
        let img = node.tag === 'img' ? node : null;
        if (!img) walk(node, (n) => { if (!img && n.tag === 'img') img = n; });
        if (img) img.attrs[key] = String(value);
      }
    }
    if (item.href) {
      let a = node.tag === 'a' ? node : null;
      if (!a) walk(node, (n) => { if (!a && n.tag === 'a') a = n; });
      if (a) a.attrs.href = String(item.href);
    }
    if (item.src) {
      let media = node.tag === 'img' ? node : null;
      if (!media) walk(node, (n) => { if (!media && (n.tag === 'img' || n.tag === 'iframe')) media = n; });
      if (media) media.attrs.src = resolveSrc(item.src);
    }
  }

  /** Bind one scalar or object value onto an element. Mirrors bindValue(). */
  function bindValue(el, key, value) {
    if (!el || value == null) return;
    const tag = el.tag;
    if ((key === 'href' || key === 'url') && (tag === 'a' || 'href' in el.attrs)) {
      el.attrs.href = String(value);
      return;
    }
    const attrTarget = el.attrs['data-attr'];
    if (attrTarget) {
      el.attrs[attrTarget] = key === 'src' ? resolveSrc(value) : String(value);
      return;
    }
    if (tag === 'img' && key === 'src') { el.attrs.src = resolveSrc(value); return; }
    if (tag === 'img' && key === 'alt') { el.attrs.alt = String(value); return; }
    if (key === 'src' && (tag === 'iframe' || tag === 'source')) { el.attrs.src = resolveSrc(value); return; }
    if (key === 'src' && (el.attrs['data-role'] === 'media' || el.attrs['data-role'] === 'image')) {
      let img = el.tag === 'img' ? el : null;
      if (!img) walk(el, (n) => { if (!img && n.tag === 'img') img = n; });
      if (img) { img.attrs.src = resolveSrc(value); return; }
    }
    if (tag === 'ul' || tag === 'ol') {
      const raw = String(value);
      const lines = (raw.includes('\n') ? raw.split('\n') : raw.split(',')).map((s) => s.trim()).filter(Boolean);
      el.children = lines.map((line) => {
        const li = { type: 'el', tag: 'li', attrs: {}, children: [] };
        const parts = line.split('|');
        if (parts.length > 1) {
          li.children.push({ type: 'el', tag: 'span', attrs: {}, children: [{ type: 'text', text: parts[0].trim() }] });
          li.children.push({ type: 'el', tag: 'span', attrs: { class: 'tile-price__amount' }, children: [{ type: 'text', text: parts.slice(1).join('|').trim() }] });
        } else {
          li.children.push({ type: 'text', text: line });
        }
        return li;
      });
      return;
    }
    // Multi-paragraph copy: a blank line becomes one <p> per block. Restricted to
    // <div>, and never innerHTML — the text is data.
    const raw = String(value);
    if (tag === 'div' && /\n\s*\n/.test(raw)) {
      el.children = raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
        .map((para) => ({ type: 'el', tag: 'p', attrs: {}, children: [{ type: 'text', text: para }] }));
      return;
    }
    setText(el, raw);
  }

  /** Render a repeatable container from its <template> + an array. */
  function renderList(scope, key, list) {
    const container = findByRole(scope, key);
    if (!container) return;
    const tpl = findTemplate(container);
    // No template: keep whatever the page shipped. A snippet carries a static
    // placeholder next to its template precisely so a no-JS page renders.
    if (!tpl || !Array.isArray(list)) return;
    // The first ELEMENT child, not the first child: a snippet whose <template> is
    // written across lines starts with a whitespace text node, and cloning that
    // produces an empty string per item — a container full of blank lines where
    // the items should be. The browser binder uses tpl.content.firstElementChild
    // and is immune; this is the divergence that made baked lists come out empty.
    const marker = (tpl.children || []).find((c) => c.type === 'el');
    if (!marker) return;
    const rendered = list.map((item) => {
      const node = cloneNode(marker);
      bindItem(node, item);
      return node;
    });
    container.children = [tpl].concat(rendered);
  }

  /** Append a class, the way classList.add does — idempotent. */
  function addClass(el, cls) {
    const list = String(el.attrs.class || '').split(/\s+/).filter(Boolean);
    if (list.indexOf(cls) === -1) list.push(cls);
    el.attrs.class = list.join(' ');
  }

  /**
   * Layout and variant, mirrored from applyLayout() in src/js/sites-content.js.
   * Both implementations must agree: they are the same rules applied at build time
   * and at load time, and tests/binder-roundtrip.cjs compares the two DOMs.
   */
  function applyLayout(tile, entry) {
    if (entry.variant) addClass(tile, 'tile-' + entry.type + '--' + entry.variant);
    // Before the layout's early return, mirroring the binder: an entry may carry a
    // panel with no layout.
    if (entry.panel) tile.attrs['data-panel'] = String(entry.panel);
    else delete tile.attrs['data-panel'];

    const layout = entry.layout;
    if (!layout || typeof layout !== 'object') return;
    const set = (attr, value) => {
      if (value == null || value === '') delete tile.attrs[attr];
      else tile.attrs[attr] = String(value);
    };
    set('data-span', layout.span);
    set('data-span-sm', layout.spanSm);
    set('data-start', layout.start);
  }

  /** Apply an entry's layout, variant and config to its tile. */
  function applyEntry(tile, entry) {
    applyLayout(tile, entry);
    applyConfig(tile, entry.config);
  }

  /** Apply a tile's config object to its element. Mirrors applyConfig(). */
  function applyConfig(tile, config) {
    if (!config) return;
    for (const [key, value] of Object.entries(config)) {
      if (value == null) continue;
      if (Array.isArray(value)) { renderList(tile, key, value); continue; }
      if (typeof value === 'object') {
        const container = findByRole(tile, key);
        if (!container) continue;
        if (value.src != null) {
          let media = container.tag === 'img' ? container : null;
          if (!media) walk(container, (n) => { if (!media && (n.tag === 'img' || n.tag === 'iframe')) media = n; });
          if (!media) media = container;
          media.attrs.src = resolveSrc(value.src);
          if (value.alt != null && media.tag === 'img') media.attrs.alt = String(value.alt);
          continue;
        }
        for (const [k, v] of Object.entries(value)) {
          if (v == null) continue;
          const target = findByRole(container, k);
          if (target) bindValue(target, k, v);
        }
        continue;
      }
      const target = findByRole(tile, key);
      if (target) bindValue(target, key, value);
    }
  }

  return { applyConfig, applyEntry, applyLayout, bindValue, renderList, resolveSrc };
}/* ================================================================ baking
   Baking fills copy into pages that already exist. It does not decide page
   structure: AGENTS.md §3 is explicit that the HTML owns structure and the
   content file owns copy, and a baker that invented pages would be a second,
   competing source of truth for layout.

   So the input is a site directory of .html files whose tiles already carry
   data-tile-id, and the output is the same files with their data-role slots
   filled from the content file. Adding a tile means editing the page; changing
   its words means editing content.json.
   ========================================================================== */

/**
 * Bake one page. Returns { html, tiles, bound } — tiles matched to a content
 * entry, and how many entries actually landed.
 */
function bakePage(html, doc, binder, warn) {
  const root = parseHtml(html);
  const byId = new Map((doc.content || []).filter((e) => e.id).map((e) => [e.id, e]));
  const byType = new Map();
  (doc.content || []).forEach((e) => {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type).push(e);
  });

  let tiles = 0, bound = 0;
  const claimed = new Set();

  walk(root, (el) => {
    const id = el.attrs['data-tile-id'];
    const type = el.attrs['data-tile'];
    if (!id && !type) return;
    tiles++;

    let entry = null;
    if (id) {
      // An explicit id is authoritative: bind it, or leave the tile showing its
      // own placeholder. Never fall back to type-matching — one content file can
      // serve many pages, and a fallback would let pages steal each other's tiles.
      entry = byId.get(id) || null;
      if (entry && !claimed.has(entry)) { claimed.add(entry); binder.applyEntry(el, entry); bound++; }
      else if (!entry) warn('data-tile-id="' + id + '" has no entry in the content file');
    } else {
      const pool = byType.get(type) || [];
      entry = pool.find((e) => !claimed.has(e));
      if (entry) { claimed.add(entry); binder.applyEntry(el, entry); bound++; }
    }
  });

  // The plate. Baked, not left to the binder, because the background is the first
  // thing painted: a page that sets it only on load flashes the default first, and a
  // page with JavaScript off never sets it at all. The binder applies the identical
  // two things (a data-plate attribute and two CSS variables) from the same values.
  const plateHost = findPlate(root);
  if (plateHost) {
    const plate = doc.site && doc.site.plate;
    const p = plate && typeof plate === 'object' ? plate : {};
    const mode = PLATE_MODES.includes(p.mode) ? p.mode : 'ambient';
    plateHost.attrs['data-plate'] = mode;

    const decls = [];
    if (p.color) decls.push('--plate-color:' + String(p.color));
    // Only resolve the image for image mode; a stray path in another mode would
    // otherwise ship a URL the browser fetches and never uses.
    // Single quotes inside url(): the attribute is double-quoted, so this needs no
    // escaping at all. The parser fix above makes either work; this makes it not
    // matter.
    if (mode === 'image' && p.image) decls.push("--plate-image:url('" + binder.resolveSrc(p.image) + "')");

    // REPLACE the plate's own declarations; preserve anything else on the element.
    // Merging alone was not idempotent: a colour removed from content.json stayed in
    // the style attribute across every later bake, so the site kept a background the
    // content file no longer asked for and no re-bake could clear it.
    const kept = String(plateHost.attrs.style || '')
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d && !/^--plate-(color|image)\s*:/.test(d));
    const merged = kept.concat(decls).join(';');
    if (merged) plateHost.attrs.style = merged;
    else delete plateHost.attrs.style;
  }

  // Per-tile CSS, into one site-level style element — the same thing the binder
  // builds at load. Written into the served HTML so a page with JavaScript disabled
  // is styled identically; a tile block that only appears once a script runs would
  // be a flash of unstyled tile on every visit.
  //
  // The old block is REMOVED first. Appending would leave the previous run's CSS in
  // place, so a rule deleted from content.json would be baked into the page forever
  // — the same non-idempotency the plate had.
  const head = findHead(root);
  if (head) {
    head.children = (head.children || []).filter((n) => !(n.type === 'el' && n.tag === 'style' && n.attrs && n.attrs['data-tile-css'] !== undefined));
    const lint = loadCssLint();
    const withCss = (doc.content || []).filter((e) => e && e.css && e.id);
    if (withCss.length) {
      if (!lint) {
        warn('per-tile CSS was found in the content file but the lint did not load — nothing was baked');
      } else {
        const bad = [];
        withCss.forEach((e) => {
          lint.check(e.css).filter((p) => p.level === 'error').forEach((p) => bad.push(e.id + ' line ' + p.line + ': ' + p.message));
        });
        if (bad.length) {
          // Fail the bake rather than ship it. The whole safety property is that the
          // block cannot escape its scope, and an escaping brace is not a warning.
          bad.forEach((b) => warn('tile css — ' + b));
        } else {
          const css = withCss.map((e) => lint.wrap(e.id, e.css)).join('\n');
          head.children.push({ type: 'el', tag: 'style', attrs: { 'data-tile-css': '' }, children: [{ type: 'text', text: '\n' + css + '\n' }] });
        }
      }
    }
  }

  // Chrome: nav links come from the content file, exactly as the runtime binder
  // does it, so a baked page and a bound page agree.
  if (Array.isArray(doc.nav)) {
    const navRoot = findByRole(root, 'nav-links');
    if (navRoot) {
      const tpl = findTemplate(navRoot);
      if (tpl && tpl.children[0]) {
        navRoot.children = [tpl].concat(doc.nav.map((n) => {
          const node = cloneNode(tpl.children[0]);
          bindNavItem(node, n);
          return node;
        }));
      }
    }
  }
  const ann = findByRole(root, 'announcement');
  if (ann && doc.site && doc.site.announcement) ann.children = [{ type: 'text', text: String(doc.site.announcement) }];

  return { html: serialize(root), tiles, bound };
}

/** Bind one nav entry onto a cloned nav template. */
function bindNavItem(node, nav) {
  const label = findByRole(node, 'label');
  if (label) setText(label, nav.label);
  if (node.tag === 'a') node.attrs.href = String(nav.href);
  else {
    let a = null;
    walk(node, (n) => { if (!a && n.tag === 'a') a = n; });
    if (a) a.attrs.href = String(nav.href);
  }
  if (nav.target) {
    const target = node.tag === 'a' ? node : null;
    if (target) target.attrs.target = String(nav.target);
  }
}

/* ==================================================================== cli */
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const siteDir = resolve(argv.find((a) => !a.startsWith('--')) || 'site/public');
const contentFile = resolve(siteDir, flag('--content', 'content.json'));
const quiet = argv.includes('--quiet');
const check = argv.includes('--check');

if (!existsSync(contentFile)) {
  console.error('bake: no content file at ' + contentFile);
  process.exit(2);
}

const doc = JSON.parse(readFileSync(contentFile, 'utf8'));
const binder = makeBinder(doc.assets || {});
const warnings = [];

const pages = readdirSync(siteDir).filter((f) => f.endsWith('.html')).sort();
if (!pages.length) {
  console.error('bake: no .html pages in ' + siteDir);
  process.exit(2);
}

let changed = 0, tilesTotal = 0;

for (const file of pages) {
  const full = join(siteDir, file);
  const before = readFileSync(full, 'utf8');
  // A page that is not valid UTF-8 cannot be round-tripped losslessly.
  if (!Buffer.from(before, 'utf8').equals(readFileSync(full))) {
    warnings.push(file + ': not valid UTF-8 — skipped');
    continue;
  }
  // Normalise to \n for the round trip and restore afterwards. Converting a
  // second time on already-CRLF text would append a \r on every run, which is
  // exactly the kind of silent drift that makes a tool look non-idempotent.
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const normalised = eol === '\n' ? before : before.replace(/\r\n/g, '\n');
  const pageWarn = (m) => warnings.push(file + ': ' + m);
  const { html, tiles } = bakePage(normalised, doc, binder, pageWarn);
  tilesTotal += tiles;

  // The file keeps its own line endings, so a Windows checkout does not show
  // every line as changed.
  const next = eol === '\n' ? html : html.replace(/\n/g, '\r\n');

  if (check) {
    if (next !== before) { console.log('  would change ' + file); changed++; }
    continue;
  }
  if (next !== before) { writeFileSync(full, next, 'utf8'); changed++; }
}

/* ------------------------------------------------------------------ report */
if (!quiet) {
  console.log('[bake] ' + basename(siteDir) + ' — ' + pages.length + ' page(s), ' +
    tilesTotal + ' tile(s), ' + doc.content.length + ' content entr' + (doc.content.length === 1 ? 'y' : 'ies'));
  console.log('  ' + (check ? changed + ' page(s) would change' : changed + ' page(s) written') +
    (changed === pages.length ? '' : ', ' + (pages.length - changed) + ' already up to date'));
  warnings.forEach((w) => console.log('  ⚠ ' + w));
  if (!warnings.length) console.log('  ✓ no warnings');
}

/* -------------------------------------------------- close out the pipeline
   Run after baking, in this order. Baking rewrites every page, so a stale SEO
   block would otherwise survive a copy change, and a stale og:image would keep
   yesterday's headline in every link preview. */

/** Run a sibling tool, inheriting stdio. */
function runTool(name, extra) {
  execFileSync(process.execPath, [join(HERE, name), siteDir, ...(extra || [])], { stdio: 'inherit' });
}

if (argv.includes('--og')) runTool('og-image.mjs');
if (argv.includes('--seo')) runTool('seo.mjs');

process.exit(warnings.length ? 1 : 0);