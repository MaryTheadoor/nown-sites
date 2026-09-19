#!/usr/bin/env node
/* ==========================================================================
   blueprint.mjs — S.I.T.E.S blueprint compiler (build-time only)
   Parses a Markdown blueprint (docs/BLUEPRINT-FORMAT.md) into the standardized
   content.json (backend copy file), validating tiles + fields against the tile
   registry and the JSON schema's required shape.

   Usage:
     node tools/blueprint.mjs <blueprint.md> [--out <content.json>] [--stdout] [--quiet]
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/* ---------------------------------------------------------------- registry */
/** Load src/js/tile-registry.js (an IIFE that fills window.SITES). */
function loadRegistry() {
  const code = readFileSync(join(ROOT, 'src/js/tile-registry.js'), 'utf8');
  const win = {};
  new Function('window', code)(win); // eslint-disable-line no-new-func
  return (win.SITES && win.SITES.tileRegistry) || {};
}

/* ------------------------------------------------------- mini-YAML subset */
function scalar(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  // strip surrounding quotes
  const m = v.match(/^"(.*)"$/) || v.match(/^'(.*)'$/);
  return m ? m[1] : v;
}

/** Detect a plain quoted scalar (e.g. "Mo-Fr 09:00-19:00") so sequence items
 *  containing colons are not mis-parsed as key/value pairs. */
function isQuotedScalar(v) {
  return /^"(?:[^"\\]|\\.)*"$/.test(v) || /^'(?:[^'\\]|\\.)*'$/.test(v);
}

function prepare(text) {
  const out = [];
  text.replace(/\r\n?/g, '\n').split('\n').forEach((raw) => {
    const content = raw.trim();
    if (content === '') {
      // A blank line is *content* inside a `|` block scalar — it is what separates
      // paragraphs — and noise everywhere else. Keep it, marked, so the block-scalar
      // reader can use it and the map/seq readers can skip it. Dropping it here
      // silently flattened every multi-paragraph field into one block.
      out.push({ indent: -1, content: '', blank: true });
      return;
    }
    if (content.startsWith('#')) return;
    out.push({ indent: raw.length - raw.trimStart().length, content, blank: false });
  });
  return out;
}

/** Parse the documented YAML subset: maps, seqs, block scalars. */
function parseYaml(text) {
  const lines = prepare(text);
  let i = 0;
  const atEnd = () => i >= lines.length;
  const isSeq = (l) => l.content.startsWith('- ');
  /** Advance past blank lines; they are only significant inside a block scalar. */
  const skipBlanks = () => { while (i < lines.length && lines[i].blank) i++; };

  function parseScalarOrNested(keyIndent) {
    skipBlanks();
    if (!atEnd() && lines[i].indent > keyIndent) return parseBlock(lines[i].indent);
    return null;
  }

  function readScalarValue(rest, keyIndent) {
    if (rest === '|' || rest === '>') {
      const parts = [];
      while (!atEnd()) {
        if (lines[i].blank) { parts.push(''); i++; continue; }
        if (lines[i].indent <= keyIndent) break;
        parts.push(lines[i].content); i++;
      }
      // Trailing blanks belong to the gap after the block, not to the block.
      while (parts.length && parts[parts.length - 1] === '') parts.pop();
      return rest === '|' ? parts.join('\n') : parts.join(' ');
    }
    return rest === '' ? undefined : scalar(rest);
  }

  function parseMap(indent) {
    const obj = {};
    for (skipBlanks(); !atEnd() && lines[i].indent === indent && !isSeq(lines[i]); skipBlanks()) {
      const m = lines[i].content.match(/^([^:\n]+?)\s*:\s*(.*)$/);
      if (!m) { i++; continue; }
      const key = m[1]; const rest = m[2];
      i++;
      const v = readScalarValue(rest, indent);
      obj[key] = v === undefined ? parseScalarOrNested(indent) : v;
    }
    return obj;
  }

  function parseSeq(indent) {
    const arr = [];
    for (skipBlanks(); !atEnd() && lines[i].indent === indent && isSeq(lines[i]); skipBlanks()) {
      const itemText = lines[i].content.slice(2).trim();
      const itemIndent = indent + 2; // keys after "- " sit two columns in
      i++;
      if (itemText === '') {
        skipBlanks();
        arr.push(!atEnd() && lines[i].indent > indent ? parseBlock(lines[i].indent) : null);
        continue;
      }
      if (isQuotedScalar(itemText)) { arr.push(scalar(itemText)); continue; }
      const m = itemText.match(/^([^:\n]+?)\s*:\s*(.*)$/);
      if (!m) { arr.push(scalar(itemText)); continue; }

      const obj = {};
      const key = m[1]; const rest = m[2];
      const v = readScalarValue(rest, indent);
      obj[key] = v === undefined ? (parseScalarOrNested(indent)) : v;
      // merge the item's remaining keys (indented to itemIndent or deeper)
      for (skipBlanks(); !atEnd() && lines[i].indent > indent; skipBlanks()) {
        const line = lines[i];
        const mm = line.content.match(/^([^:\n]+?)\s*:\s*(.*)$/);
        if (!mm) { i++; continue; }
        const k2 = mm[1]; const r2 = mm[2];
        i++;
        const v2 = readScalarValue(r2, line.indent);
        obj[k2] = v2 === undefined ? parseScalarOrNested(line.indent) : v2;
      }
      arr.push(obj);
    }
    return arr;
  }

  function parseBlock() {
    skipBlanks();
    if (atEnd()) return null;
    return isSeq(lines[i]) ? parseSeq(lines[i].indent) : parseMap(lines[i].indent);
  }

  return atEnd() ? null : (isSeq(lines[0]) ? parseSeq(lines[0].indent) : parseMap(lines[0].indent));
}

/* ------------------------------------------------------------- blueprint */
function splitFrontMatter(src) {
  // \r?\n, not \n: a blueprint authored on Windows is CRLF, and a bare-\n pattern
  // silently matches nothing — which drops the whole front matter (site identity,
  // theme tokens, nav, integrations) and compiles an "Untitled" site with an empty
  // palette. Every other parser in this file already normalises line endings; this
  // one has to tolerate both.
  const m = src.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { front: '', body: src };
  return { front: m[1], body: src.slice(m[0].length) };
}

function parseSections(body) {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const pages = [];
  let page = null, tile = null;
  const pushTile = () => {
    if (!tile || !page) { tile = null; return; }
    tile.fields = parseYaml(tile.lines.join('\n')) || {};
    page.tiles.push(tile); tile = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    // Structure markers must sit at the top level. An indented line belongs to a
    // block scalar — e.g. a `code` tile showing markdown — so it is never structure.
    const indented = raw.length !== raw.trimStart().length;
    const hp = !indented && line.match(/^##\s+Page:\s*(.+)$/i);
    const ht = !indented && line.match(/^###\s+Tile:\s*(.+)$/i);
    if (hp) { pushTile(); page = { name: hp[1].trim(), path: '/', tiles: [] }; pages.push(page); continue; }
    if (ht) { pushTile(); tile = { type: ht[1].trim(), lines: [] }; continue; }
    if (line.startsWith('# ')) continue; // document title
    if (tile) tile.lines.push(raw);
    else if (page) {
      const mp = line.match(/^path\s*:\s*(.+)$/i);
      if (mp) page.path = mp[1].trim();
    }
  }
  pushTile();
  return pages;
}

/** nav entries may be `- Label: href` maps or `- {label,href}`. */
function normalizeNav(nav) {
  if (!Array.isArray(nav)) return [];
  return nav.map((n) => {
    if (n && typeof n === 'object') {
      if (n.label && n.href) return { label: n.label, href: n.href };
      const keys = Object.keys(n);
      if (keys.length === 1) return { label: keys[0], href: String(n[keys[0]]) };
    }
    return { label: String(n), href: '#' };
  });
}

function compile(md, registry) {
  const { front, body } = splitFrontMatter(md);
  const fm = parseYaml(front) || {};
  const warnings = [];

  // A missing front matter is the one failure the compiler cannot infer on its
  // own: it used to compile {name:'Untitled'} with an empty palette and no nav,
  // in silence. Naming it turns a mystery into a one-line fix.
  if (front.trim() === '') {
    warnings.push('no front matter — site identity, theme and nav fell back to defaults');
  } else if (!fm.site || !fm.site.name) {
    warnings.push('front matter has no site.name — the compiled site is named "Untitled"');
  }

  // Theme groups map 1:1 to CSS variable families; unknown keys fall back to `colors`
  // for backwards compatibility with flat `theme: { primary: ... }` front matter.
  const THEME_GROUPS = ['colors', 'dark', 'fonts', 'radii', 'spacing', 'shadows'];
  const theme = { defaultTheme: 'system' };
  if (fm.theme && typeof fm.theme === 'object') {
    Object.entries(fm.theme).forEach(([k, v]) => {
      if (k === 'defaultTheme') theme.defaultTheme = v;
      else if (THEME_GROUPS.includes(k)) theme[k] = v;
      else { theme.colors = theme.colors || {}; theme.colors[k] = v; }
    });
    if (!theme.colors) theme.colors = {};
  }

  const pages = parseSections(body);
  if (!pages.length) warnings.push('no "## Page:" sections found');

  const content = [];
  pages.forEach((page) => {
    page.tiles.forEach((t) => {
      const reg = registry[t.type];
      if (!reg) warnings.push(`unknown tile type "${t.type}" (page ${page.name})`);
      // variant, layout and css are entry-level, not config: they describe the
      // tile's placement and appearance rather than its copy, and the binder/baker
      // apply them to the element. They are lifted out here so they never reach the
      // registry check (which would flag them as unknown fields) or the config
      // object. A key that is NOT lifted lands in config and is then reported as an
      // unregistered field — which is how a missing lift announces itself.
      const { description, id, variant, layout, css, panel, ...rest } = t.fields;
      if (!id) warnings.push(`tile "${t.type}" on page ${page.name} has no id`);
      if (reg) {
        const known = new Set(reg.fields.map((f) => f.key));
        Object.keys(rest).forEach((k) => {
          if (!known.has(k)) warnings.push(`tile "${t.type}" (${id || '?'}): field "${k}" is not in the registry`);
        });
      }
      const entry = { id, type: t.type, config: {} };
      if (variant != null && variant !== '') entry.variant = String(variant);
      if (layout && typeof layout === 'object') entry.layout = layout;
      if (css != null && String(css).trim() !== '') entry.css = String(css);
      if (panel != null && String(panel).trim() !== '') entry.panel = String(panel);
      Object.entries(rest).forEach(([k, v]) => { entry.config[k] = v; });
      if (page.path && page.path !== '/') entry.page = page.path;
      content.push(entry);
    });
  });

  const doc = {
    $schema: '../ai-skill/sites-schema.json',
    site: fm.site || { name: 'Untitled' },
    theme,
    nav: normalizeNav(fm.nav),
    content,
  };
  if (fm.integrations) doc.integrations = fm.integrations;
  if (fm.assets) doc.assets = fm.assets;
  return { doc, warnings, pages: pages.map((p) => ({ name: p.name, path: p.path, tiles: p.tiles.length })) };
}

/* ------------------------------------------------------------------- cli */
const argv = process.argv.slice(2);
const input = argv.find((a) => !a.startsWith('--'));
const outIdx = argv.indexOf('--out');
const out = outIdx >= 0 ? argv[outIdx + 1] : null;
const toStdout = argv.includes('--stdout');
const quiet = argv.includes('--quiet');

if (!input) {
  console.error('usage: node tools/blueprint.mjs <blueprint.md> [--out <content.json>] [--stdout] [--quiet]');
  process.exit(2);
}

const md = readFileSync(resolve(process.cwd(), input), 'utf8');
const registry = loadRegistry();
const { doc, warnings, pages } = compile(md, registry);

if (!quiet) {
  console.error(`[blueprint] ${input}`);
  pages.forEach((p) => console.error(`  page ${p.name} (${p.path}) — ${p.tiles} tiles`));
  console.error(`  total: ${doc.content.length} tiles, ${doc.nav.length} nav links`);
  warnings.forEach((w) => console.error(`  ⚠ ${w}`));
  if (!warnings.length) console.error('  ✓ no warnings');
}

const json = JSON.stringify(doc, null, 2) + '\n';
if (out) { writeFileSync(resolve(process.cwd(), out), json); if (!quiet) console.error(`[blueprint] wrote ${out}`); }
if (toStdout || !out) process.stdout.write(json);
// Warnings used to exit 0 unconditionally, which made the documented "fix every
// warning" step unenforceable in a pipeline. A clean compile still exits 0.
process.exit(warnings.length ? 1 : 0);