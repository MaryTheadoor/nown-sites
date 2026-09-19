#!/usr/bin/env node
/* ==========================================================================
   build.cjs — scaffold the pawn-shop recipe's pages, then bake them

   Two jobs, deliberately separated:

     1. STRUCTURE — create one .html file per page in content.json, with each
        tile's markup taken from the framework's own snippet
        (src/modules/<type>.html). That is what makes the markup single-sourced:
        a snippet edited in the framework reaches this recipe on the next build.
     2. COPY — hand off to tools/bake.mjs, which fills the data-role slots from
        content.json, draws the og:image and regenerates the SEO block.

   Nothing here writes copy into the HTML. That is bake.mjs's job, and keeping it
   separate is what makes the pipeline re-runnable: run it twice and the second
   run changes nothing.

   Usage (from examples/pawn-shop/):
     node build.cjs
   ========================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const recipeDir = process.argv[2] || __dirname;
const rootDir = path.resolve(recipeDir, '../..');

/* ------------------------------------------------------- 1. runtime copy */
const runtime = [
  ['src/css/nown-plate.css', 'src/css/nown-plate.css'],
  ['src/css/nown-tiles.css', 'src/css/nown-tiles.css'],
  ['src/js/sites.js', 'src/js/sites.js'],
  ['src/js/tile-registry.js', 'src/js/tile-registry.js'],
  ['src/js/sites-content.js', 'src/js/sites-content.js'],
  ['src/js/sites-theme.js', 'src/js/sites-theme.js'],
  ['src/js/sites-assets.js', 'src/js/sites-assets.js'],
];
for (const [from, to] of runtime) {
  const dest = path.join(recipeDir, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(rootDir, from), dest);
}
// Module files are copied per tile type the site actually uses, not wholesale:
// a recipe is meant to be read, and 37 files it does not reference is noise.
// Deliberately before the content file is parsed below.
const modulesDir = path.join(recipeDir, 'src/modules');
fs.mkdirSync(modulesDir, { recursive: true });

/* ------------------------------------------------------- 2. tile snippets */
/** type -> snippet source. The basename IS the tile type. */
function loadSnippets() {
  const map = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) map.set(e.name.replace(/\.html$/, ''), p);
    }
  };
  walk(path.join(rootDir, 'src/modules'));
  return map;
}
const snippets = loadSnippets();

/** A snippet, minus its documentation comment, stamped with this entry's id. */
function tileStructure(entry) {
  const file = snippets.get(entry.type);
  if (!file) throw new Error('no snippet for tile type "' + entry.type + '"');
  let html = fs.readFileSync(file, 'utf8').replace(/^\s*<!--[\s\S]*?-->\s*/, '');
  if (/data-tile-id="/.test(html)) {
    html = html.replace(/data-tile-id="[^"]*"/, 'data-tile-id="' + entry.id + '"');
  } else {
    // Every snippet should carry one, but stamping is cheap insurance: without it
    // the tile cannot be matched to its content entry and silently shows placeholders.
    const needle = 'data-tile="' + entry.type + '"';
    if (!html.includes(needle)) throw new Error('snippet for "' + entry.type + '" has no ' + needle);
    html = html.replace(needle, needle + ' data-tile-id="' + entry.id + '"');
  }
  return html.split('\n').map((line) => (line.trim() ? '      ' + line : line)).join('\n');
}

const doc = JSON.parse(fs.readFileSync(path.join(recipeDir, 'content.json'), 'utf8'));
const contentPath = 'content.json';
const chromeTypes = new Set(['announcement', 'footer']);

// Which tile types this site uses, and which of those ship a behaviour.
const usedTypes = new Set(doc.content.map((e) => e.type).concat(['announcement', 'footer']));
const moduleSource = new Map();
(function indexModules(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { indexModules(p); continue; }
    if (!/\.(html|js)$/.test(e.name)) continue;
    moduleSource.set(e.name, p);
  }
})(path.join(rootDir, 'src/modules'));
const behaviours = new Set();
for (const [name, p] of moduleSource) {
  const type = name.replace(/\.(html|js)$/, '');
  if (!usedTypes.has(type)) continue;
  fs.copyFileSync(p, path.join(modulesDir, name));
  if (name.endsWith('.js')) behaviours.add(type);
}

const byPage = new Map();
doc.content.forEach((entry) => {
  const key = entry.page || '/';
  if (!byPage.has(key)) byPage.set(key, []);
  byPage.get(key).push(entry);
});

const announcement = doc.content.find((e) => e.type === 'announcement');
const footer = doc.content.find((e) => e.type === 'footer');

/* ------------------------------------------------------------- 3. shells */
// How the tiles are laid out. 'cols' wraps them in the configured 12-column grid
// so per-entry layout.span applies; 'auto' is the automatic auto-fit grid, where
// a span does nothing. The binder and baker apply the spans either way.
const gridMode = (doc.site.layout && doc.site.layout.mode) === 'cols' ? 'cols' : 'auto';

function shell(pagePath, entries) {
  const nav = (doc.nav || [])
    .map((n) => '          <a class="nav-dock-link" href="' + n.href + '"><span>' + n.label + '</span></a>')
    .join('\n');
  const main = entries
    .filter((e) => !chromeTypes.has(e.type))
    .map(tileStructure)
    .join('\n\n');

  // Only the behaviours this page actually needs, so a page does not download the
  // code for tiles it does not have.
  const used = new Set(entries.map((e) => e.type));
  const scripts = [...behaviours].filter((t) => used.has(t))
    .map((t) => '  <script src="src/modules/' + t + '.js"></script>')
    .join('\n');

  return [
    '<!doctype html>',
    '<html lang="' + (doc.site.lang || 'en') + '" data-theme="light">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '  <title>' + doc.site.name + '</title>',
    '  <meta name="description" content="' + ((doc.site.seo && doc.site.seo.description) || '') + '" />',
    '  <link rel="stylesheet" href="src/css/nown-plate.css" />',
    '  <link rel="stylesheet" href="src/css/nown-tiles.css" />',
    '  <script src="src/js/sites-theme.js"></script>',
    '</head>',
    '<body data-content="' + contentPath + '">',
    '  <div class="sites-plate">',
    '    <div class="plate-ambient" aria-hidden="true"></div>',
    '    <header class="site-header">',
    announcement ? tileStructure(announcement) : '',
    '      <nav class="nav-dock" data-tile="nav-dock" aria-label="Primary">',
    '        <div class="nav-dock__links" data-role="nav-links">',
    '          <template><a class="nav-dock-link" data-role="action"><span data-role="label"></span></a></template>',
    nav,
    '        </div>',
    '        <button class="nav-dock-link nav-dock-theme" data-role="theme-toggle" type="button" aria-label="Toggle dark mode"><span>Theme</span></button>',
    '      </nav>',
    '    </header>',
    '    <main class="sites-container">',
    gridMode === 'cols' ? '      <div class="sites-grid sites-grid--cols">' : '',
    gridMode === 'cols' ? main.replace(/^ {6}/gm, '        ') : main,
    gridMode === 'cols' ? '      </div>' : '',
    '    </main>',
    footer ? tileStructure(footer).replace(/^ {6}/gm, '    ') : '',
    '  </div>',
    '  <script src="src/js/tile-registry.js"></script>',
    '  <script src="src/js/sites.js"></script>',
    '  <script src="src/js/sites-assets.js"></script>',
    '  <script src="src/js/sites-content.js"></script>',
    scripts,
    '  <script>',
    "    document.addEventListener('DOMContentLoaded', function () {",
    "      SITES.content.load('" + contentPath + "');",
    '    });',
    '  </script>',
    '</body>',
    '</html>',
    '',
  ].filter((l) => l !== '').join('\n');
}

const written = [];
for (const [pagePath, entries] of byPage) {
  const fileName = pagePath === '/' ? 'index.html' : pagePath.replace(/^\//, '');
  fs.mkdirSync(path.dirname(path.join(recipeDir, fileName)), { recursive: true });
  fs.writeFileSync(path.join(recipeDir, fileName), shell(pagePath, entries), 'utf8');
  written.push(fileName);
}

// A page from a previous run whose keyword no longer exists would keep a stale
// tile id and fail the gate, so drop anything this script owns and no longer wants.
const keep = new Set(written);
let removed = 0;
for (const f of fs.readdirSync(recipeDir)) {
  if (!f.endsWith('.html') || keep.has(f)) continue;
  const html = fs.readFileSync(path.join(recipeDir, f), 'utf8');
  if (html.includes('src/js/sites-content.js')) { fs.unlinkSync(path.join(recipeDir, f)); removed++; }
}

console.log('scaffolded ' + written.length + ' page(s)' + (removed ? ', removed ' + removed + ' stale' : ''));
console.log('copied runtime to src/');

/* --------------------------------------------------------------- 4. bake */
execFileSync(process.execPath,
  [path.join(rootDir, 'tools/bake.mjs'), recipeDir, '--og', '--seo'],
  { stdio: 'inherit' });