/* ==========================================================================
   sites-builder.js — S.I.T.E.S programmatic builder ("pick tiles, see it live")
   Assembles a site from the tile registry, previews it through the real runtime in
   an isolated document, and exports the two authoring artifacts:

     • blueprint.md  — the Markdown format in docs/BLUEPRINT-FORMAT.md
     • content.json  — the backend copy file, identical to what
                       "node tools/blueprint.mjs <blueprint.md> --stdout" emits

   Tile markup is never re-authored here. The snippets in src/modules/<type>.html are
   the single source of truth (published to src/modules/ by tools/sync-site-runtime.sh)
   and are fetched when a tile is added — the builder only stamps the unique
   data-tile-id the binder matches on. Field widgets come from SITES.tileRegistry
   through the admin's own factory, so the builder cannot drift from the registry.

   The page this runs in is chrome only: it holds no tile markup and binds no content
   of its own. The preview is a separate document, so a half-edited site can never
   touch the tool's DOM.
   ========================================================================== */
(function () {
  'use strict';
  const SITES = (window.SITES = window.SITES || {});

  /* --------------------------------------------------------------- constants */
  const SNIPPET_DIR = 'src/modules/';
  const PREVIEW_HOST = 'builder-preview';

  // Mirrors tools/blueprint.mjs so the exported content.json is exactly what the
  // compiler derives from the exported blueprint — the two artifacts never drift.
  const SCHEMA_REF = '../ai-skill/sites-schema.json';
  const THEME_GROUPS = ['colors', 'dark', 'fonts', 'radii', 'spacing', 'shadows'];

  const SITE_FIELDS = [
    { key: 'name', label: 'Site name', type: 'text' },
    { key: 'baseUrl', label: 'Base URL', type: 'url' },
    { key: 'description', label: 'One-line description', type: 'text' },
  ];
  const PAGE_FIELDS = [
    { key: 'name', label: 'Page name', type: 'text' },
    { key: 'path', label: 'Page path', type: 'text' },
  ];
  const NAV_FIELDS = [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'href', label: 'Href', type: 'url' },
  ];
  // Integration selections are front matter, not tile fields; the enums are the
  // ones the adapters implement (docs/INTEGRATIONS.md §3) and are exported verbatim.
  // No provider logic lives here — only the choice.
  const INTEGRATION_FIELDS = [
    { key: 'auth', options: ['none', 'firebase', 'supabase', 'auth0', 'clerk'] },
    { key: 'payments', options: ['none', 'stripe', 'square', 'snipcart', 'paypal'] },
    { key: 'forms', options: ['none', 'formspree', 'tally', 'staticforms'] },
    { key: 'search', options: ['none', 'pagefind'] },
    { key: 'analytics', options: ['none', 'plausible', 'umami'] },
    { key: 'ai', options: ['none', 'assistant', 'generator', 'search'] },
  ];

  /* ------------------------------------------------------------------ helpers */
  const el = (tag, attrs = {}, children = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => { if (c) n.appendChild(c); });
    return n;
  };

  const labelOf = (type) => (SITES.tileRegistry[type] && SITES.tileRegistry[type].label) || type;
  const pad = (n) => ' '.repeat(n);
  const blank = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof o[keys[i]] !== 'object' || o[keys[i]] === null) o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
  }

  /**
   * Copy is normalized the way the compiler reads it (tools/blueprint.mjs
   * prepare()): every line is trimmed, and a line that reads as a comment is
   * dropped. Doing it here keeps blueprint.md and content.json in agreement
   * instead of silently diverging on export.
   *
   * Blank lines are KEPT. Inside a "|" block scalar a blank line is the paragraph
   * break, and the compiler preserves it — dropping it here flattened every
   * multi-paragraph body into a single block, which is precisely the bug
   * blueprint.mjs was fixed for. Leading and trailing blanks are trimmed, because
   * the compiler trims them too: only interior breaks survive a round-trip.
   */
  function normalizeCopy(value) {
    if (typeof value !== 'string' || !value.includes('\n')) return value;
    const lines = value.replace(/\r\n?/g, '\n').split('\n')
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('#'));
    while (lines.length && lines[0] === '') lines.shift();
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  /**
   * Lines the compiler would read as comments — in the blueprint's YAML subset a
   * line whose trim starts with "#" is never content. There is no escape for it,
   * so the copy loses those lines; the editor says so rather than dropping them
   * silently.
   */
  function droppedCommentLines(value) {
    if (typeof value !== 'string') return 0;
    return value.split('\n').filter((l) => l.trim().startsWith('#')).length;
  }

  /**
   * Registry fields that carry a value, in emission order: single-line values
   * first, multi-line copy last. The compiler reads a "|" block by consuming every
   * deeper line, so a block scalar used as a list item's first key would swallow
   * the keys after it.
   */
  function fieldsInOrder(fields, config) {
    const filled = (fields || []).filter((f) => !blank(config[f.key]));
    const multiline = (f) => typeof config[f.key] === 'string' && config[f.key].includes('\n');
    return filled.filter((f) => !multiline(f)).concat(filled.filter(multiline));
  }

  /** One repeatable row, keeping only the item fields the registry declares. */
  function cleanRow(itemFields, row) {
    const out = {};
    fieldsInOrder(itemFields, row).forEach((f) => {
      const value = normalizeCopy(row[f.key]);
      if (!blank(value)) out[f.key] = value;
    });
    return out;
  }

  /** A field's value with blank rows/sub-fields removed; null when nothing is set. */
  function cleanValue(field, value) {
    if (field.type === 'items' || field.type === 'actions') {
      const rows = (Array.isArray(value) ? value : [])
        .map((row) => cleanRow(field.itemFields || [], row || {}))
        .filter((row) => Object.keys(row).length);
      return rows.length ? rows : null;
    }
    if (field.type === 'image') {
      const row = cleanRow(field.itemFields || [], value || {});
      return Object.keys(row).length ? row : null;
    }
    const scalar = normalizeCopy(value);
    return blank(scalar) ? null : scalar;
  }

  /** The tile's config as both artifacts must carry it (blank fields omitted). */
  function configObject(tile) {
    const config = {};
    fieldsInOrder(SITES.fieldsFor(tile.type), tile.config || {}).forEach((f) => {
      const value = cleanValue(f, tile.config[f.key]);
      if (value !== null) config[f.key] = value;
    });
    return config;
  }

  const hasCopy = (tile) => Object.keys(configObject(tile)).length > 0;

  /* --------------------------------------------------------- YAML emission */
  // docs/BLUEPRINT-FORMAT.md §2: a strict mini-YAML subset. tools/blueprint.mjs
  // scalar() strips one surrounding quote pair, so anything that would not survive
  // as a plain scalar is quoted — a reserved word, a number, a comment/sequence/
  // mapping character, or padded whitespace.
  const PLAIN = /^[A-Za-z0-9][^:#\n]*$/;
  const AMBIGUOUS = /^(?:true|false|null|~|yes|no|-?\d+(?:\.\d+)?)$/i;

  function yamlScalar(value) {
    // Numbers and booleans emit BARE. AMBIGUOUS exists so that a STRING which looks
    // like a number stays a string when the compiler reads it back — and applying it
    // to an actual number did the opposite, turning layout.span 7 into "7". The
    // content model says span is an integer, so it has to survive as one; this was
    // invisible until the round-trip test asserted the value instead of comparing
    // the builder's output against the compiler's.
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    const s = String(value);
    return (PLAIN.test(s) && !AMBIGUOUS.test(s) && !/^\s|\s$/.test(s)) ? s : '"' + s + '"';
  }

  /** "key: value", or a "|" block for multi-line copy. */
  function yamlField(key, value, indent) {
    const p = pad(indent);
    if (typeof value === 'string' && value.includes('\n')) {
      return [p + key + ': |'].concat(value.split('\n').map((l) => p + '  ' + l)).join('\n');
    }
    return p + key + ': ' + yamlScalar(value);
  }

  /**
   * Emit one key at the given indent, choosing a scalar, a nested map or a list.
   *
   * Recursion is the point. yamlMap used to call yamlField on every entry, so a
   * nested object became String(value) — the front matter carried
   * "seo": "[object Object]" and the compiler could not read it back. The site
   * block is the one place with arbitrary nesting (business.address,
   * business.openingHours, seo.pages), so it is where this showed up first.
   */
  function yamlValue(key, value, indent) {
    const p = pad(indent);
    if (Array.isArray(value)) {
      if (!value.length) return p + key + ': []';
      const lines = [p + key + ':'];
      value.forEach((item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          Object.entries(item).forEach(([k, v], i) => {
            const text = yamlValue(k, v, indent + (i === 0 ? 2 : 4));
            lines.push(i === 0 ? text.replace(/^(\s*)/, '$1- ') : text);
          });
        } else {
          // yamlScalar quotes anything with a colon, which a sequence item must be:
          // unquoted, the compiler reads it as a key/value pair. That is the bug
          // that once turned "Mo-Fr 09:00-19:00" into {"Mo-Fr 09": "00-19:00"}.
          lines.push(p + '  - ' + yamlScalar(item));
        }
      });
      return lines.join('\n');
    }
    if (value && typeof value === 'object') return yamlMap(key, value, indent);
    return yamlField(key, value, indent);
  }

  /** A nested map: the key, then its entries indented by two, recursively. */
  function yamlMap(key, obj, indent) {
    const lines = [pad(indent) + key + ':'];
    Object.entries(obj).forEach(([k, v]) => lines.push(yamlValue(k, v, indent + 2)));
    return lines.join('\n');
  }

  /** A list of maps: "  - key: value", continuation keys two columns deeper. */
  function yamlList(key, rows, indent, itemFields) {
    const lines = [pad(indent) + key + ':'];
    rows.forEach((row) => {
      fieldsInOrder(itemFields, row).forEach((f, i) => {
        const text = yamlField(f.key, row[f.key], indent + (i === 0 ? 2 : 4));
        lines.push(i === 0 ? text.replace(/^(\s*)/, '$1- ') : text);
      });
    });
    return lines.join('\n');
  }

  /* ------------------------------------------------- artifact construction */
  /**
   * The site block.
   *
   * The export is a PROJECTION of state, so any field the projection forgets is
   * silently dropped — which is how site.layout, added for the grid-mode control,
   * was written by the UI and lost on export. Import had the mirror problem: it
   * rebuilt the site block from three keys, so a content file's business, seo or
   * lang vanished on the next export.
   *
   * The three edited keys are normalized; everything else the block carries is
   * passed through untouched.
   */
  const SITE_PASSTHROUGH = ['lang', 'seo', 'layout', 'business', 'announcement', 'plate', 'favicon'];
  function siteObject(state) {
    const src = state.site || {};
    const site = { name: (src.name || '').trim() || 'Untitled' };
    if (!blank(src.baseUrl)) site.baseUrl = src.baseUrl.trim();
    if (!blank(src.description)) site.description = src.description.trim();
    SITE_PASSTHROUGH.forEach((k) => {
      const v = src[k];
      if (v == null || blank(v)) return;
      if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) return;
      site[k] = v;
    });
    return site;
  }

  /**
   * The theme block. The colors group is always present because the compiler fills
   * it in even when empty; other groups appear only when they carry a token.
   */
  function themeObject(state) {
    const theme = { defaultTheme: state.theme.defaultTheme || 'system' };
    THEME_GROUPS.forEach((group) => {
      const clean = {};
      Object.entries(state.theme[group] || {}).forEach(([k, v]) => { if (!blank(v)) clean[k] = v; });
      if (group === 'colors' || Object.keys(clean).length) theme[group] = clean;
    });
    return theme;
  }

  function navRows(state) {
    return state.nav.map((row) => cleanRow(NAV_FIELDS, row)).filter((row) => Object.keys(row).length);
  }

  function integrationsObject(state) {
    const out = {};
    INTEGRATION_FIELDS.forEach((f) => { out[f.key] = state.integrations[f.key] || 'none'; });
    return out;
  }

  /** The standardized content file — key order mirrors tools/blueprint.mjs. */
  function buildContentDoc(state) {
    const doc = {
      $schema: SCHEMA_REF,
      site: siteObject(state),
      theme: themeObject(state),
      nav: navRows(state),
      content: state.tiles.map((tile) => {
        const entry = { id: tile.id, type: tile.type, config: configObject(tile) };
        // A path is only recorded for non-root pages (the compiler omits "/").
        if (state.page.path && state.page.path !== '/') entry.page = state.page.path;
        // Entry-level placement and shape. These are the same two keys the binder
        // and the baker read, and the builder omitted BOTH from its export for two
        // phases: it wrote them into state, applied them in the editor's own
        // controls, and then dropped them on the way out. The round-trip test did
        // not catch it because it compared the builder's output against the
        // compiler's output and both were equally absent — the same symmetric
        // weakness this file's own plan section warns about.
        if (tile.variant) entry.variant = tile.variant;
        if (tile.layout) entry.layout = tile.layout;
        if (tile.css && String(tile.css).trim()) entry.css = tile.css;
        if (tile.panel) entry.panel = tile.panel;
        return entry;
      }),
    };
    doc.integrations = integrationsObject(state);
    return doc;
  }

  /** The blueprint that compiles back to exactly the doc above. */
  function buildBlueprint(state) {
    const theme = themeObject(state);
    const lines = [
      '---',
      yamlMap('site', siteObject(state), 0),
      'theme:',
      pad(2) + 'defaultTheme: ' + yamlScalar(theme.defaultTheme),
    ];
    THEME_GROUPS.forEach((group) => {
      const tokens = theme[group];
      if (!tokens) return;
      if (!Object.keys(tokens).length) { lines.push(pad(2) + group + ':'); return; }
      lines.push(pad(2) + group + ':');
      Object.entries(tokens).forEach(([k, v]) => {
        // Palette values are always quoted: a leading "#" would read as a comment.
        const scalar = (group === 'colors' || group === 'dark') ? '"' + v + '"' : yamlScalar(v);
        lines.push(pad(4) + k + ': ' + scalar);
      });
    });
    lines.push(yamlMap('integrations', integrationsObject(state), 0));

    const nav = navRows(state);
    lines.push(nav.length ? yamlList('nav', nav, 0, NAV_FIELDS) : 'nav:');
    lines.push('---', '', '# Pages', '');

    lines.push('## Page: ' + ((state.page.name || '').trim() || 'Home'));
    // parseSections() reads the page path verbatim — it never goes through the
    // YAML scalar pass, so quoting it would store the quotes as part of the path.
    lines.push('path: ' + (blank(state.page.path) ? '/' : String(state.page.path).trim()));

    state.tiles.forEach((tile) => {
      lines.push('', '### Tile: ' + tile.type);
      lines.push(yamlField('description', (tile.description || '').trim() || labelOf(tile.type) + ' tile.', 0));
      lines.push(yamlField('id', tile.id, 0));
      // blueprints lift variant and layout out of the section into the entry
      // (tools/blueprint.mjs), so they belong here beside id — not among the config
      // fields the registry declares.
      if (tile.variant) lines.push(yamlField('variant', tile.variant, 0));
      if (tile.layout) lines.push(yamlMap('layout', tile.layout, 0));
      // A CSS block is multi-line, so yamlField writes it as a "|" scalar — the same
      // form multi-paragraph copy uses.
      if (tile.css && String(tile.css).trim()) lines.push(yamlField('css', String(tile.css).trim(), 0));
      if (tile.panel) lines.push(yamlField('panel', tile.panel, 0));
      const config = configObject(tile);
      fieldsInOrder(SITES.fieldsFor(tile.type), config).forEach((f) => {
        const value = config[f.key];
        if (Array.isArray(value)) lines.push(yamlList(f.key, value, 0, f.itemFields || []));
        else if (typeof value === 'object') lines.push(yamlMap(f.key, value, 0));
        // Scalars go through yamlField below; nested values never reach it.
        else lines.push(yamlField(f.key, value, 0));
      });
    });
    return lines.join('\n') + '\n';
  }

  /* ------------------------------------------------------------- snippets */
  const snippets = new Map();

  /** Fetch a tile's snippet once; null when the sync has not published it. */
  async function loadSnippet(type) {
    if (snippets.has(type)) return snippets.get(type);
    let text = null;
    try {
      const res = await fetch(SNIPPET_DIR + type + '.html', { cache: 'no-store' });
      if (res.ok) text = await res.text();
    } catch (err) {
      text = null;
    }
    snippets.set(type, text);
    return text;
  }

  /**
   * Snippet to preview nodes. The snippet stays the source of truth; the single
   * edit is the unique data-tile-id the binder matches on (snippets are copy-paste
   * starting points and may carry a stale id of their own, e.g. cards/code.html).
   */
  function tileFragment(snippet, id) {
    const tpl = document.createElement('template');
    tpl.innerHTML = snippet;
    const frag = tpl.content.cloneNode(true);
    const root = frag.querySelector('[data-tile]');
    if (!root) return null;
    root.setAttribute('data-tile-id', id);
    return frag;
  }

  /**
   * Registry fields with no slot in this snippet. Catalog snippets are starting
   * points, so a declared field may have no data-role (or kebab-case data-*
   * attribute) to receive it — the same reconciliation tools/check-site.mjs does.
   * Saying so beats a preview that silently ignores typed copy.
   */
  function unboundFields(type, snippet) {
    if (!snippet) return [];
    const kebab = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    return SITES.fieldsFor(type).filter((f) => {
      const role = new RegExp('data-role="' + f.key + '"').test(snippet);
      const attr = new RegExp('data-(?:[a-z0-9]+-)*' + kebab(f.key) + '=').test(snippet);
      return !role && !attr;
    }).map((f) => f.key);
  }

  /* -------------------------------------------------------------- preview */
  /**
   * The isolated preview document: the real stylesheets and the runtime in the
   * order AGENTS.md §3 prescribes (sites-theme.js in head; tile-registry.js,
   * sites.js, sites-assets.js, sites-content.js in body). Tile behaviour modules
   * are not loaded — the preview proves structure and copy binding; a delivered
   * page adds the modules its tiles need.
   */
  function previewShell() {
    const base = new URL('.', document.baseURI).href;
    return [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8" />',
      // srcdoc inherits the parent's base URL; pinning it keeps the relative
      // runtime paths correct when the site is served from a sub-path.
      '<base href="' + base + '" />',
      '<title>S.I.T.E.S preview</title>',
      '<link rel="stylesheet" href="src/css/nown-plate.css" />',
      '<link rel="stylesheet" href="src/css/nown-tiles.css" />',
      '<script src="src/js/sites-theme.js"></script>',
      // Builder-only chrome for the preview's own empty state.
      '<style>',
      '.bld-empty { display: grid; gap: var(--space-3); place-content: center; text-align: center; padding: var(--space-16) var(--space-8); color: var(--color-text-muted); }',
      '.bld-empty strong { font-family: var(--font-display); font-size: 1.6rem; color: var(--color-text); }',
      '.bld-empty span { max-width: 46ch; margin-inline: auto; line-height: 1.6; }',
      // The tile the inspector has selected. An outline rather than a background so
      // it cannot be mistaken for the tile's own styling.
      '.bld-marked { outline: 3px solid var(--color-accent); outline-offset: 4px;',
      '  border-radius: var(--radius-md); }',
      // The column overlay. It uses the grid's own gap and column tokens, so it
      // lines up with what is rendered rather than approximating it.
      '.bld-grid-overlay { position: fixed; inset: 0; z-index: 5; pointer-events: none;',
      '  display: grid; gap: var(--grid-gap); padding-inline: var(--space-6);',
      '  grid-template-columns: repeat(var(--grid-cols), 1fr); }',
      '.bld-grid-overlay[data-cols="6"] { grid-template-columns: repeat(6, 1fr); }',
      '.bld-grid-overlay span { background: color-mix(in srgb, var(--color-accent) 8%, transparent);',
      '  border-inline: 1px solid color-mix(in srgb, var(--color-accent) 18%, transparent); }',
      '.bld-grid-overlay span.shaded { background: color-mix(in srgb, var(--color-accent) 22%, transparent);',
      '  border-inline-color: color-mix(in srgb, var(--color-accent) 45%, transparent); }',
      '</style>',
      '</head>',
      '<body>',
      '<div class="sites-plate">',
      '<div class="plate-ambient" aria-hidden="true"></div>',
      '<main class="sites-container" data-role="' + PREVIEW_HOST + '"></main>',
      '</div>',
      '<script src="src/js/tile-registry.js"></script>',
      '<script src="src/js/sites.js"></script>',
      '<script src="src/js/sites-assets.js"></script>',
      '<script src="src/js/sites-content.js"></script>',
      '</body>',
      '</html>',
    ].join('\n');
  }

  /** Wire the preview: it is a preview, so nothing inside it navigates. */
  function wirePreview(frame) {
    const doc = frame.contentDocument;
    if (!doc || doc.__sitesBuilderWired) return;
    doc.__sitesBuilderWired = true;
    // A snippet's placeholder image points at `/assets/<name>.jpg`, which a repo
    // that has not added that asset does not serve. The request still 404s — the
    // snippet owns its own placeholder path, and rewriting the author's content is
    // not the preview's job — but without this the slot renders as a broken image.
    // Swapping on error gives the slot an honest box instead, using art this repo
    // does ship. Guarded, so a missing fallback cannot loop, and capture-phase
    // because resource errors do not bubble.
    doc.addEventListener('error', (e) => {
      const img = e.target;
      if (!img || img.tagName !== 'IMG' || img.dataset.sitesPlaceholder) return;
      img.dataset.sitesPlaceholder = '1';
      img.src = new URL('assets/tile-media.svg', document.baseURI).href;
    }, true);
    doc.addEventListener('click', (e) => {
      const link = e.target.closest && e.target.closest('a[href]');
      if (link) e.preventDefault();
    }, true);
    doc.addEventListener('submit', (e) => e.preventDefault(), true);
  }

  /**
   * Compose the tile markup into the preview and bind it through the real entry
   * point, SITES.content.apply(). The host is emptied first: the binder claims each
   * element once, so fresh nodes are what let an edit re-bind.
   */
  function renderPreview(state, frame) {
    const win = frame.contentWindow;
    const host = win && win.document.querySelector('[data-role="' + PREVIEW_HOST + '"]');
    if (!host || !win.SITES || !win.SITES.content) return false;
    host.textContent = '';
    if (!state.tiles.length) {
      // An empty preview is a dead end — say what to do instead.
      const hint = win.document.createElement('div');
      hint.className = 'bld-empty';
      hint.innerHTML = '<strong>Pick a tile to begin.</strong>'
        + '<span>Choose one from the left — it appears here immediately, rendered by the real runtime.'
        + ' When it looks right, download the blueprint and the content file from the bar above.</span>';
      host.appendChild(hint);
      win.SITES.content.apply(buildContentDoc(state));
    // Behaviour modules arrive asynchronously (see ensureBehaviour), so a tile whose
    // init lands after the first render would otherwise never run. boot() is
    // idempotent — initTile guards on __sites_init — so calling it per render is
    // cheap and safe.
    if (win.SITES.boot) win.SITES.boot();
      return true;
    }
    state.tiles.forEach((tile) => {
      const frag = tileFragment(snippets.get(tile.type) || '', tile.id);
      if (frag) host.appendChild(frag);
    });
    win.SITES.content.apply(buildContentDoc(state));
    // Behaviour modules arrive asynchronously (see ensureBehaviour), so a tile whose
    // init lands after the first render would otherwise never run. boot() is
    // idempotent — initTile guards on __sites_init — so calling it per render is
    // cheap and safe.
    if (win.SITES.boot) win.SITES.boot();
    return true;
  }

  /* ------------------------------------------------------------------- ui */
  function mount(root) {
    const state = {
      site: { name: '', baseUrl: '', description: '' },
      page: { name: 'Home', path: '/' },
      theme: { defaultTheme: 'system' },
      integrations: {},
      nav: [{ label: 'Home', href: '/' }],
      tiles: [],
      index: -1,
    };

    /* ---- history, drafts and import --------------------------------------
       Three things a builder needs before anything else it does is trustworthy:
       you can undo, a refresh does not lose the site, and you can open work you
       already have. None of them existed.

       History is snapshot-based. state is a plain object, so a deep clone is
       cheap and there is no command log to keep in step with the mutations. The
       work is in the COMMIT BOUNDARY, which is what `edit()` is: every content
       change goes through it and nothing else touches state.
    --------------------------------------------------------------------- */
    const HISTORY_LIMIT = 60;
    const COALESCE_MS = 600;
    const DRAFT_KEY = 'sites.builder.draft.v1';
    const history = { past: [], future: [], label: '', at: 0 };
    let draftTimer = 0;

    function snapshot() {
      return JSON.parse(JSON.stringify({
        site: state.site, page: state.page, theme: state.theme,
        integrations: state.integrations, nav: state.nav,
        tiles: state.tiles, index: state.index,
      }));
    }

    /**
     * Run a content mutation, snapshotting first.
     *
     * `label` identifies the target (e.g. "copy:home-hero:headline"). A burst of
     * edits to the same target inside COALESCE_MS collapses to one undo step, so
     * typing a headline is one undo rather than forty — the admin widgets fire on
     * every keystroke, so without this the history would be useless.
     */
    function edit(label, fn) {
      const now = Date.now();
      const coalesce = label && label === history.label && now - history.at < COALESCE_MS;
      if (!coalesce) {
        history.past.push(snapshot());
        if (history.past.length > HISTORY_LIMIT) history.past.shift();
        history.future.length = 0;
      }
      history.label = label || '';
      history.at = now;
      fn();
      saveDraft();
    }

    function applySnapshot(snap) {
      state.site = snap.site || state.site;
      state.page = snap.page || state.page;
      state.theme = snap.theme || state.theme;
      state.integrations = snap.integrations || state.integrations;
      state.nav = snap.nav || state.nav;
      state.tiles = snap.tiles || [];
      const i = typeof snap.index === 'number' ? snap.index : -1;
      state.index = Math.max(-1, Math.min(i, state.tiles.length - 1));
    }

    function undo() {
      if (!history.past.length) return;
      history.future.push(snapshot());
      applySnapshot(history.past.pop());
      history.label = ''; history.at = 0;
      saveDraft(); refresh();
    }

    function redo() {
      if (!history.future.length) return;
      history.past.push(snapshot());
      applySnapshot(history.future.pop());
      history.label = ''; history.at = 0;
      saveDraft(); refresh();
    }

    /** Debounced draft so a refresh, a crash or a closed tab does not lose work. */
    function saveDraft() {
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        draftTimer = 0;
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), state: snapshot() })); } catch (e) { /* private mode, quota */ }
      }, 400);
    }

    function readDraft() {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        return d && d.state && (d.state.tiles || []).length ? d : null;
      } catch (e) { return null; }
    }

    function clearDraft() {
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    }

    /**
     * Load a content file back into the builder. This is the half that was
     * missing: the builder could create a site but never open one, so editing an
     * existing content.json — the common case — was impossible.
     */
    function loadContentDoc(doc) {
      const clean = (v) => (v == null ? '' : v);
      // Keep everything the site block carried, not just the three keys the builder
      // edits — otherwise business, seo and lang are lost on the next export.
      state.site = Object.assign({}, doc.site || {}, {
        name: clean(doc.site && doc.site.name),
        baseUrl: clean(doc.site && doc.site.baseUrl),
        description: clean(doc.site && doc.site.description),
      });
      state.theme = (doc.theme && typeof doc.theme === 'object') ? doc.theme : { defaultTheme: 'system' };
      state.integrations = (doc.integrations && typeof doc.integrations === 'object') ? doc.integrations : {};
      state.nav = Array.isArray(doc.nav) && doc.nav.length ? doc.nav.map((n) => ({ label: clean(n.label), href: clean(n.href) })) : [{ label: 'Home', href: '/' }];

      // The builder edits one page at a time. Take the entries that belong to the
      // first page the file mentions, and say so if there are more than one — the
      // alternative is silently dropping the rest.
      const pages = [];
      (doc.content || []).forEach((e) => {
        const p = typeof e.page === 'string' && e.page ? e.page : '/';
        if (pages.indexOf(p) === -1) pages.push(p);
      });
      const chosen = pages[0] || '/';
      const entries = (doc.content || []).filter((e) => {
        const p = typeof e.page === 'string' && e.page ? e.page : '/';
        return p === chosen;
      });
      state.page = { name: chosen === '/' ? 'Home' : chosen.replace(/^\//, '').replace(/\.html$/, ''), path: chosen };
      state.tiles = entries.map((e) => {
        const tile = { id: clean(e.id), type: clean(e.type), config: (e.config && typeof e.config === 'object') ? e.config : {}, description: '' };
        if (e.variant) tile.variant = e.variant;
        if (e.layout && typeof e.layout === 'object') tile.layout = e.layout;
        if (e.panel) tile.panel = e.panel;
        return tile;
      });
      state.index = state.tiles.length ? 0 : -1;

      history.past.length = 0; history.future.length = 0; history.label = ''; history.at = 0;
      saveDraft();
      return { pages, chosen, imported: state.tiles.length };
    }

    const status = el('p', { class: 'adm-status', 'aria-live': 'polite' });
    const exportStatus = el('p', { class: 'adm-status', 'aria-live': 'polite' });
    const picker = el('div', { class: 'bld-picker' });
    const filter = el('input', { type: 'search', class: 'bld-filter', placeholder: 'Filter tiles…', 'aria-label': 'Filter tiles' });
    const pickerWrap = el('div', { class: 'bld-picker-wrap' }, [filter, picker]);
    const structure = el('ol', { class: 'bld-list' });
    const editor = el('div', { class: 'bld-panel' });
    const settings = el('div', { class: 'bld-panel' });

    // Layout tab. The page-order list is a fixed child so renderStructure() keeps
    // writing into it; the two rows below it are rebuilt per selection.
    // The plate controls. Created at mount scope, not inside buildSettings, because
    // renderPlate() is called from refresh() as well — otherwise the Mode select
    // showed "ambient" while the state said "color" whenever the plate was changed
    // from anywhere other than this control: an import, an undo, or the code panel.
    const plateBody = el('div', { class: 'bld-panel bld-platefields' });
    // The menu bar and the footer bar. Both are chrome entries, so their variant
    // belongs on their own entry rather than on a page setting — but they sit at
    // the top and bottom of every page rather than in the body, which makes them
    // awkward to reach through "Page order". Hence a section of their own.
    const chromeBody = el('div', { class: 'bld-panel bld-chromefields' });
    const gridModeRow = el('div', { class: 'bld-panel' });
    const spanRow = el('div', { class: 'bld-panel' });
    // Which tile is selected is navigation for the whole inspector, so the list sits
    // ABOVE the tabs rather than inside one. It used to live in the Layout tab, which
    // meant the natural move — find your tile, click it — left you on a tab with no
    // editing fields and no clue where they were. The empty state even said "select a
    // tile in Page order" without saying which tab that was under.
    const orderBlock = el('div', { class: 'bld-order' }, [
      el('h3', { class: 'adm-group', text: 'Tiles on this page' }),
      el('p', { class: 'adm-hint', text: 'Click a tile to edit its copy. Reorder with the arrows.' }),
      structure,
    ]);

    // The Layout tab is now about THIS tile only: how many grid columns it spans.
    // The grid MODE is a site-level decision and moved to the Site tab with it.
    const layoutPanel = el('div', { class: 'bld-panel' }, [
      el('h3', { class: 'adm-group', text: 'Grid placement' }),
      spanRow,
    ]);

    /* Code tab. A demonstration surface first and an editor second: readable and
       annotated by default, editable only after a deliberate mode switch, so the
       default experience is comprehension and nobody breaks a site by typing.
       It shows the SAME document the UI edits, not a rendering of it. */
    const codeOut = el('div', { class: 'bld-code', role: 'region', 'aria-label': 'The selected tile as content.json carries it' });
    const codeEdit = el('textarea', { class: 'bld-codeedit', spellcheck: 'false', 'aria-label': 'Edit the tile entry as JSON' });
    const codeMsg = el('p', { class: 'bld-codemsg', 'aria-live': 'polite' });
    const codeEditBtn = el('button', { type: 'button', class: 'bld-tool', text: 'Edit' });
    const codeApplyBtn = el('button', { type: 'button', class: 'bld-tool', text: 'Apply' });
    const codeCancelBtn = el('button', { type: 'button', class: 'bld-tool', text: 'Cancel' });
    let codeEditing = false;

    /* The tile's own CSS. Always live rather than behind an Edit switch: it is a
       few declarations, the lint runs on every keystroke, and the history coalesces
       a burst into one undo step. */
    // Its own class, NOT bld-codeedit. Sharing that class made every
    // `.bld-codeedit` locator ambiguous the moment there were two of them —
    // tests/builder-code.cjs stopped resolving, and so would anything else
    // reaching for "the" editor. The two textareas share styling by selector
    // group in builder.html, which is where sharing belongs.
    const codeCss = el('textarea', { class: 'bld-cssedit', spellcheck: 'false', rows: '6', 'aria-label': 'CSS for this tile', placeholder: 'padding: var(--space-12);' });
    const codeCssLint = el('div', { class: 'bld-csslint', 'aria-live': 'polite' });

    const codePanel = el('div', { class: 'bld-panel' }, [
      el('p', { class: 'adm-hint', text: 'The selected tile as content.json carries it. Values are exact; nested groups are shown on one line to fit the column, and Edit shows the fully expanded form. Either way it is the same document the UI edits — editing writes straight back into it.' }),
      el('div', { class: 'bld-codemode' }, [codeEditBtn, codeApplyBtn, codeCancelBtn]),
      codeOut,
      codeEdit,
      codeMsg,
      el('h3', { class: 'adm-group', text: 'Tile CSS' }),
      el('p', { class: 'adm-hint', text: 'Declarations only — the framework scopes them to this tile for you. Tokens, not colours: var(--color-accent), never #hex, so the tile survives a re-theme and dark mode.' }),
      codeCss,
      codeCssLint,
    ]);
    codeEdit.hidden = true;
    codeApplyBtn.hidden = true;
    codeCancelBtn.hidden = true;
    const frame = el('iframe', {
      class: 'bld-preview',
      title: 'Live preview of the assembled site',
      srcdoc: previewShell(),
    });

    // Preview controls. The viewport switcher resizes the FRAME, which is the
    // correct emulation rather than an approximation: the framework has no
    // page-level layout media queries, and the 12/6 column tier is a container
    // query on .sites-container, whose width tracks the frame exactly.
    const viewportButtons = new Map();
    const viewportBar = el('div', { class: 'bld-viewbar' });
    const overlayBtn = el('button', { type: 'button', class: 'bld-tool', 'data-viewport': 'grid', text: 'Grid' });
    let overlayOn = false;
    // The frame keeps the requested LAYOUT width and is scaled for DISPLAY. Sizing
    // it to 1280px inside a ~560px column grew the grid track instead of shrinking
    // the frame, which pushed the whole inspector off screen — the iframe's width
    // is a min-content contribution. Scaling keeps the container query honest (the
    // container really is 1280px wide) while the column stays put.
    const frameScaler = el('div', { class: 'bld-frame-scaler' });
    frameScaler.appendChild(frame);
    const viewportReadout = el('span', { class: 'bld-viewreadout', 'aria-live': 'polite' });
    const previewWrap = el('div', { class: 'bld-preview-wrap' }, [
      el('div', { class: 'bld-viewbar-row' }, [viewportBar, viewportReadout, overlayBtn]),
      frameScaler,
    ]);

    // Typing must not rebuild the whole preview per keystroke; structural edits
    // (add / move / remove) render immediately.
    let previewTimer = 0;
    function schedulePreview() {
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(() => { previewTimer = 0; renderPreview(state, frame); }, 80);
    }

    const panel = (heading, hint, body) => el('section', { class: 'adm-card' }, [
      el('h2', { text: heading }),
      el('p', { class: 'adm-hint', text: hint }),
      body,
    ]);

    const blueprintBtn = el('button', { class: 'btn btn-tactile btn-gold-tactile', type: 'button', text: 'Download blueprint.md' });
    const contentBtn = el('button', { class: 'btn btn-tactile btn-ghost', type: 'button', text: 'Download content.json' });

    const undoBtn = el('button', { class: 'bld-tool', type: 'button', text: 'Undo', title: 'Undo (Ctrl+Z)' });
    const redoBtn = el('button', { class: 'bld-tool', type: 'button', text: 'Redo', title: 'Redo (Ctrl+Shift+Z)' });
    const importBtn = el('button', { class: 'bld-tool', type: 'button', text: 'Open…', title: 'Open a content.json you already have' });
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });

    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let doc = null;
        try { doc = JSON.parse(String(reader.result)); } catch (err) {
          status.textContent = 'That file is not valid JSON: ' + err.message;
          return;
        }
        if (!doc || !Array.isArray(doc.content)) {
          status.textContent = 'That looks like a blueprint, not a content file. Compile it first: node tools/blueprint.mjs <file> --out content.json';
          return;
        }
        const info = loadContentDoc(doc);
        refresh();
        status.textContent = 'Opened ' + info.imported + ' tile(s) from page ' + info.chosen +
          (info.pages.length > 1 ? ' — the file also has ' + (info.pages.length - 1) + ' other page(s); the builder edits one page at a time.' : '.');
      };
      reader.readAsText(file);
      fileInput.value = '';
    });

    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);

    // The screen name sits in the toolbar rather than only in the Site tab: it is
    // the first thing an author sets, and tabbing the settings had hidden it.
    const screenName = el('input', {
      type: 'text', class: 'bld-screenname', 'aria-label': 'Site name',
      placeholder: 'Untitled site', maxlength: '80',
    });
    screenName.addEventListener('change', () => {
      edit('site:name', () => { state.site.name = screenName.value; });
      renderStructure();
    });

    // Export lives in a sticky toolbar: on a builder, the way out is never far away.
    const toolbar = el('div', { class: 'bld-toolbar' }, [
      el('div', { class: 'bld-toolbar__actions' }, [
        screenName,
        el('div', { class: 'bld-toolgroup' }, [undoBtn, redoBtn]),
        el('div', { class: 'bld-toolgroup' }, [importBtn, blueprintBtn, contentBtn]),
      ]),
      el('div', { class: 'bld-toolbar__status' }, [exportStatus, status]),
      fileInput,
    ]);

    /* ---- inspector tabs ---------------------------------------------------
       Four panels stacked in one column made it 2934px tall (measured in a
       browser), so the right third of the page sat empty below the preview. They
       are tabbed instead — and the preview moves to the MIDDLE column, because it
       is the thing being worked on rather than a sidebar.
    --------------------------------------------------------------------- */
    const tabBodies = {
      content: el('div', { class: 'bld-tabbody' }, [editor]),
      layout: el('div', { class: 'bld-tabbody' }, [layoutPanel]),
      site: el('div', { class: 'bld-tabbody' }, [settings]),
      code: el('div', { class: 'bld-tabbody' }, [codePanel]),
    };
    const TAB_ORDER = [
      ['content', 'Content'],
      ['layout', 'Layout'],
      ['site', 'Site'],
      ['code', 'Code'],
    ];
    // Problems sit above the tabs rather than inside one: a defect should be visible
    // whichever panel you happen to be in when you cause it.
    const problemsBox = el('div', { class: 'bld-problems' });
    let problemsOpen = true;

    const tabBar = el('div', { class: 'bld-tabs', role: 'tablist' });
    const tabButtons = new Map();
    let activeTab = 'content';

    function showTab(id) {
      activeTab = id;
      Object.keys(tabBodies).forEach((k) => { tabBodies[k].hidden = k !== id; });
      tabButtons.forEach((btn, k) => {
        btn.setAttribute('aria-selected', k === id ? 'true' : 'false');
        btn.classList.toggle('active', k === id);
      });
    }

    TAB_ORDER.forEach((pair) => {
      const btn = el('button', { type: 'button', class: 'bld-tab', role: 'tab', text: pair[1] });
      btn.addEventListener('click', () => showTab(pair[0]));
      tabButtons.set(pair[0], btn);
      tabBar.appendChild(btn);
    });

    const tabBodiesEl = el('div', { class: 'bld-inspector' }, [problemsBox, orderBlock, tabBar]);
    Object.keys(tabBodies).forEach((k) => { tabBodies[k].hidden = true; tabBodiesEl.appendChild(tabBodies[k]); });

    root.append(
      toolbar,
      el('div', { class: 'bld-cols' }, [
        el('div', { class: 'bld-col bld-col--pick' }, [
          panel('Add a tile', 'Grouped by purpose. Markup is fetched from src/modules/<type>.html — the framework\u2019s single source of truth.', pickerWrap),
        ]),
        el('div', { class: 'bld-col bld-col--view' }, [
          panel('Preview', 'An isolated document running the real runtime — bound through SITES.content.apply(). Links and forms inside it are inert.', previewWrap),
        ]),
        el('div', { class: 'bld-col bld-col--edit' }, [
          panel('Inspector', 'Everything about this page and the selected tile.', tabBodiesEl),
        ]),
      ]),
    );
    showTab(activeTab);

    /* ---- picker: grouped by purpose, with a filter ---- */
    // Chrome first: announcement, nav and footer belong to the page frame rather
    // than the catalog, and the registry says which is which (reg.role).
    const GROUP_ORDER = ['chrome', 'hero', 'content', 'commerce', 'conversion', 'other'];
    const GROUP_LABELS = { chrome: 'Chrome', hero: 'Hero', content: 'Content cards', commerce: 'Commerce', conversion: 'Conversion', other: 'Other' };

    let openPickInfo = null;
    function renderPicker(query) {
      const q = (query || '').trim().toLowerCase();
      picker.innerHTML = '';
      openPickInfo = null;   // the old panels are gone with the old DOM
      const byGroup = new Map();
      Object.entries(SITES.tileRegistry || {}).forEach(([type, reg]) => {
        const label = labelOf(type);
        // Search what the tile CAN DO, not just what it is called. "hours" has to
        // find the visit tile, and it is the field list — not the one-line
        // description — that says so. Same for variants: "centred" should find the
        // cta. Everything here is read from the registry, so the index cannot drift
        // from what the fold-out shows.
        const haystack = [
          label,
          type,
          reg.about || '',
          (reg.fields || []).map((f) => (f.label || '') + ' ' + f.key).join(' '),
          ((SITES.tileVariants || {})[type] || []).map((v) => v.label).join(' '),
        ].join(' ').toLowerCase();
        if (q && !haystack.includes(q)) return;
        const g = GROUP_ORDER.includes(reg.group) ? reg.group : 'other';
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push([type, reg]);
      });
      if (!byGroup.size) {
        picker.appendChild(el('p', { class: 'adm-hint', text: 'No tile matches “' + query + '”.' }));
        return;
      }
      GROUP_ORDER.forEach((g) => {
        if (!byGroup.has(g)) return;
        picker.appendChild(el('h3', { class: 'adm-group', text: GROUP_LABELS[g] }));
        byGroup.get(g).forEach((pair) => {
          const type = pair[0];
          const reg = pair[1];
          const row = el('div', { class: 'bld-pickrow' });
          const main = el('div', { class: 'bld-pickrow__main' });

          // Adding and reading are two different intentions, so they are two
          // different controls. Making the whole row a <details> would mean the
          // obvious click — the one that adds a tile — sometimes just opened a box.
          const btn = el('button', { type: 'button', class: 'adm-item bld-pick', 'aria-label': 'Add ' + labelOf(type) + ' tile' });
          const head = el('strong', { class: 'bld-pick__head' });
          // The glyph comes from the registry's tile metadata — the same table the
          // gates keep honest. It was in the registry and rendered nowhere.
          head.append(
            el('span', { class: 'bld-pick__icon', 'aria-hidden': 'true', text: reg.icon || '+' }),
            el('span', { text: labelOf(type) }),
          );
          btn.append(head, el('small', { class: 'bld-pick__about', text: reg.about || (type + ' · ' + ((reg.fields || []).length) + ' fields') }));
          btn.addEventListener('click', () => { addTile(type); });

          const more = el('button', { type: 'button', class: 'bld-pickrow__more', 'aria-expanded': 'false', 'aria-label': 'What the ' + labelOf(type) + ' tile offers' });
          more.appendChild(el('span', { 'aria-hidden': 'true', text: 'i' }));

          // What the tile actually is, assembled from the declarations the rest of
          // the framework already reads — the registry fields, the variants table,
          // the behaviours list. Nothing here is restated, so nothing here can drift.
          const info = el('dl', { class: 'bld-pickrow__info' });
          info.hidden = true;
          const fact = (term, value, cls) => {
            info.appendChild(el('dt', { text: term }));
            const dd = el('dd', { text: value });
            if (cls) dd.className = cls;
            info.appendChild(dd);
          };
          const fields = reg.fields || [];
          const variants = ((SITES.tileVariants || {})[type] || []).filter((v) => v.name);
          fact('Type', type, 'bld-pickrow__code');
          fact('Snippet', SNIPPET_DIR + type + '.html', 'bld-pickrow__code');
          fact('Fields', fields.length ? fields.map((f) => f.label || f.key).join(', ') : 'none — this tile is set up by the site, not per instance');
          fact('Variants', variants.length ? variants.map((v) => v.label).join(' · ') : 'one shape only');
          fact('Behaviour', reg.behaviour ? 'src/modules/' + type + '.js' : 'none — static markup', reg.behaviour ? 'bld-pickrow__code' : '');

          more.addEventListener('click', () => {
            const open = info.hidden;
            // One at a time: the picker is a long list, and several open panels turn
            // it into a wall.
            if (open && openPickInfo && openPickInfo !== info) {
              openPickInfo.hidden = true;
              if (openPickInfo.__more) openPickInfo.__more.setAttribute('aria-expanded', 'false');
            }
            info.hidden = !open;
            more.setAttribute('aria-expanded', open ? 'true' : 'false');
            openPickInfo = open ? info : null;
            info.__more = more;
          });

          main.append(btn, more);
          row.append(main, info);
          picker.appendChild(row);
        });
      });
    }

    filter.addEventListener('input', () => renderPicker(filter.value));
    renderPicker('');

    /* ---- front matter: site / page / nav / integrations / theme ---- */
    function buildSettings() {
      settings.appendChild(el('h3', { class: 'adm-group', text: 'Site' }));
      SITE_FIELDS.forEach((f) => {
        settings.appendChild(SITES.admin.widget(f, state.site[f.key], (key, value) => edit('site:' + key, () => { state.site[key] = value; })));
      });

      settings.appendChild(el('h3', { class: 'adm-group', text: 'Page (this export)' }));
      PAGE_FIELDS.forEach((f) => {
        settings.appendChild(SITES.admin.widget(f, state.page[f.key], (key, value) => edit('page:' + key, () => {
          state.page[key] = value;
          schedulePreview();
        })));
      });

      settings.appendChild(el('h3', { class: 'adm-group', text: 'Nav links' }));
      settings.appendChild(SITES.admin.widget(
        { key: 'nav', label: 'Nav dock links', type: 'actions', itemFields: NAV_FIELDS },
        state.nav,
        (_key, value) => edit('nav', () => { state.nav = value; schedulePreview(); }),
      ));

      settings.appendChild(el('h3', { class: 'adm-group', text: 'Integrations' }));
      INTEGRATION_FIELDS.forEach((f) => {
        settings.appendChild(SITES.admin.widget(
          { key: f.key, label: f.key, type: 'select', options: f.options },
          state.integrations[f.key] || 'none',
          (key, value) => edit('integration:' + key, () => { state.integrations[key] = value; }),
        ));
      });

      // Theme tokens are declared once, in SITES.themeRegistry (THEME-ENGINE.md §4);
      // the builder renders them through it rather than restating any token. They
      // are collapsed: a site usually keeps the framework defaults, and the full
      // palette would otherwise push the rest of the tool below the fold.
      const themeBox = el('details', { class: 'bld-fold' });
      themeBox.appendChild(el('summary', { text: 'Theme tokens (optional)' }));
      const themeBody = el('div', { class: 'bld-panel' });
      themeBody.appendChild(el('p', { class: 'adm-hint', text: 'Leave a token alone to keep the framework default. Anything you set is exported into the blueprint\u2019s theme block.' }));
      ((SITES.themeRegistry || {}).fields || []).forEach((f) => {
        if (f.type === 'heading') { themeBody.appendChild(el('h3', { class: 'adm-group', text: f.label })); return; }
        themeBody.appendChild(SITES.admin.widget(
          { key: f.path, label: f.label, type: f.type, options: f.options },
          getPath(state.theme, f.path),
          (_key, value) => edit('theme:' + f.path, () => { setPath(state.theme, f.path, value); schedulePreview(); }),
        ));
      });
      themeBox.appendChild(themeBody);
      settings.appendChild(themeBox);

      /* ---- the plate: the background behind everything (BUILDER-PLAN 3.5) ---- */
      settings.appendChild(el('h3', { class: 'adm-group', text: 'Background plate' }));
      settings.appendChild(plateBody);
      renderPlate();

      settings.appendChild(el('h3', { class: 'adm-group', text: 'Tile layout mode' }));
      settings.appendChild(gridModeRow);

      settings.appendChild(el('h3', { class: 'adm-group', text: 'Menu & footer bars' }));
      settings.appendChild(chromeBody);
      renderChrome();
    }

    /* ---- chrome: the menu bar and the footer bar ----------------------------
       Variants are applied by the binder and the baker as
       .tile-<type>--<variant> on the tile root, so a variant that has no CSS is a
       class that does nothing. check-site fails on an unknown variant for exactly
       that reason. The empty string is the default shape and writes no variant at
       all, which keeps the export clean for a site that wants the framework's own
       look.
    --------------------------------------------------------------------- */
    const chromeVariants = (type) => (SITES.tileVariants || {})[type] || [{ name: '', label: 'Default', about: '' }];

    function renderChrome() {
      chromeBody.textContent = '';
      ['nav-dock', 'footer'].forEach((type) => {
        const entry = state.tiles.filter((t) => t.type === type)[0];
        const wrap = el('div', { class: 'bld-chromefield' });
        wrap.setAttribute('data-chrome', type);

        if (!entry) {
          wrap.appendChild(el('span', { class: 'adm-label', text: labelOf(type) }));
          wrap.appendChild(el('p', { class: 'adm-hint', text: 'This page has no ' + type + ' entry yet.' }));
          const add = el('button', { type: 'button', class: 'bld-tool', text: 'Add a ' + labelOf(type).toLowerCase() });
          add.addEventListener('click', () => {
            edit('add:' + type, () => {
              state.tiles.push({ id: nextId(type), type, config: {}, description: '' });
              state.index = state.tiles.length - 1;
            });
            refresh();
            ensureBehaviour(type);
          });
          wrap.appendChild(add);
          chromeBody.appendChild(wrap);
          return;
        }

        const current = typeof entry.variant === 'string' ? entry.variant : '';
        const field = el('label', { class: 'adm-field' });
        field.appendChild(el('span', { text: labelOf(type) }));
        const list = chromeVariants(type);
        const sel = el('select');
        list.forEach((v) => sel.appendChild(el('option', { value: v.name, text: v.label })));
        sel.value = list.some((v) => v.name === current) ? current : '';
        field.appendChild(sel);
        wrap.appendChild(field);
        const chosen = list.filter((v) => v.name === sel.value)[0];
        wrap.appendChild(el('p', { class: 'adm-hint', text: chosen ? chosen.about : '' }));

        sel.addEventListener('change', () => {
          edit('chrome:' + type, () => {
            if (sel.value) entry.variant = sel.value;
            else delete entry.variant;
          });
          renderChrome();
          schedulePreview();
        });
        chromeBody.appendChild(wrap);
      });
    }

    /* ---- the plate: the background behind everything (BUILDER-PLAN 3.5) ------ */
    // A class of its own so the controls can be addressed without counting fields:
    // the image widget renders two inputs (src and alt), so "the last input on the
    // Site tab" is the alt box and not the path.
    function renderPlate() {
        plateBody.textContent = '';
        const plate = state.site.plate || {};
        const mode = PLATE_MODES.indexOf(plate.mode) === -1 ? 'ambient' : plate.mode;

        const modeField = el('label', { class: 'adm-field' });
        modeField.appendChild(el('span', { text: 'Mode' }));
        const modeSel = el('select');
        PLATE_MODE_LABELS.forEach((pair) => modeSel.appendChild(el('option', { value: pair[0], text: pair[1] })));
        modeSel.value = mode;
        modeField.appendChild(modeSel);
        plateBody.appendChild(modeField);
        const hint = PLATE_MODE_LABELS.filter((p) => p[0] === mode)[0];
        plateBody.appendChild(el('p', { class: 'adm-hint', text: hint ? hint[2] : '' }));
        modeSel.addEventListener('change', () => {
          edit('plate:mode', () => {
            if (!state.site.plate) state.site.plate = {};
            state.site.plate.mode = modeSel.value;
          });
          renderPlate();
          schedulePreview();
        });

        if (mode === 'color') {
          plateBody.appendChild(SITES.admin.widget(
            { key: 'color', label: 'Colour', type: 'color' },
            plate.color || '',
            (_k, v) => edit('plate:color', () => {
              if (!state.site.plate) state.site.plate = {};
              if (v) state.site.plate.color = v; else delete state.site.plate.color;
              schedulePreview();
            }),
          ));
        }
        if (mode === 'image') {
          plateBody.appendChild(SITES.admin.widget(
            { key: 'image', label: 'Image', type: 'image' },
            // An OBJECT, not the bare path. The image widget does `let obj = value || {}`
            // and spreads patches over it, so a string arrives as {0:"/",1:"a",…} and
            // every edit is silently dropped. A tile's image field is already {src, alt};
            // the plate's single path has to be wrapped to look the same.
            { src: plate.image || '' },
            (_k, v) => edit('plate:image', () => {
              if (!state.site.plate) state.site.plate = {};
              const src = (v && v.src) ? v.src : '';
              if (src) state.site.plate.image = src; else delete state.site.plate.image;
              schedulePreview();
            }),
          ));
        }
        if (mode === 'animation') {
          // The checklist requires reduced motion be honoured, and the plate is the
          // one place it applies. Saying so here beats a surprise later.
          plateBody.appendChild(el('p', { class: 'adm-hint', text: 'The wash drifts slowly. Visitors whose system asks for reduced motion see the same still wash — the motion is decoration, not information.' }));
        }
    }

    /* ---- structure list ---- */
    function renderStructure() {
      structure.textContent = '';
      if (!state.tiles.length) {
        structure.appendChild(el('li', { class: 'adm-hint', text: 'No tiles yet — pick one from \u201cAdd a tile\u201d.' }));
        return;
      }
      state.tiles.forEach((tile, i) => {
        const li = el('li', { class: 'bld-row' + (i === state.index ? ' active' : '') });
        const name = el('button', { type: 'button', class: 'bld-name', 'aria-current': i === state.index ? 'true' : 'false' });
        name.append(el('strong', { text: labelOf(tile.type) }), el('small', { text: tile.id }));
        name.addEventListener('click', () => {
          state.index = i;
          renderStructure();
          renderEditor();
          renderLayout();
          renderCode();
          paintOverlay();
          focusPreviewTile(state.tiles[i] && state.tiles[i].id);
          // Belt and braces with the list now above the tabs: whichever tab you were
          // reading, selecting a tile takes you to its copy.
          showTab('content');
        });
        const up = el('button', { type: 'button', class: 'bld-move', text: '\u2191', 'aria-label': 'Move ' + labelOf(tile.type) + ' up' });
        up.disabled = i === 0;
        up.addEventListener('click', () => moveTile(i, -1));
        const down = el('button', { type: 'button', class: 'bld-move', text: '\u2193', 'aria-label': 'Move ' + labelOf(tile.type) + ' down' });
        down.disabled = i === state.tiles.length - 1;
        down.addEventListener('click', () => moveTile(i, 1));
        const del = el('button', { type: 'button', class: 'bld-del', text: '\u2715', 'aria-label': 'Remove ' + labelOf(tile.type) });
        del.addEventListener('click', () => removeTile(i));
        li.append(name, up, down, del);
        structure.appendChild(li);
      });
    }

    function moveTile(index, delta) {
      const next = index + delta;
      if (next < 0 || next >= state.tiles.length) return;
      edit('move:' + state.tiles[index].id, () => {
        const tile = state.tiles.splice(index, 1)[0];
        state.tiles.splice(next, 0, tile);
        state.index = next;
      });
      refresh();
    }

    function removeTile(index) {
      const gone = state.tiles[index];
      edit('remove:' + (gone ? gone.id : index), () => {
        state.tiles.splice(index, 1);
        state.index = Math.min(index, state.tiles.length - 1);
      });
      refresh();
    }

    /** Copy a tile in place, with a fresh id so the binder can still key on it. */
    function duplicateTile(index) {
      const src = state.tiles[index];
      if (!src) return;
      edit('duplicate:' + src.id, () => {
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = nextId(src.type);
        state.tiles.splice(index + 1, 0, copy);
        state.index = index + 1;
      });
      refresh();
    }

    /** Ids are unique per page — the format requires it and the binder keys on them. */
    function nextId(type) {
      const taken = new Set(state.tiles.map((t) => t.id));
      let n = 1;
      while (taken.has(type + '-' + n)) n++;
      return type + '-' + n;
    }

    /**
     * Fetch a tile's behaviour module into the preview document.
     *
     * The preview previously loaded only the binder, so every dynamic tile was
     * invisible while you configured it — the visit tile's "open now" line, the FAQ
     * accordion, the map, the search box all rendered inert. Loaded on first use so
     * a page does not pull in the code for tiles it does not have.
     *
     * A missing module is normal: most tiles have none. On the dev server the 404
     * is unavoidable (there is no manifest to ask first), so it is swallowed.
     */
    const loadedBehaviours = new Set();
    async function ensureBehaviour(type) {
      if (loadedBehaviours.has(type)) return;
      loadedBehaviours.add(type);
      // Ask the registry first. Probing blindly cost a 404 per tile without a
      // module, which is console noise and a wasted request.
      const reg = (SITES.tileRegistry || {})[type];
      if (!reg || !reg.behaviour) return;
      let code = null;
      try {
        const res = await fetch(SNIPPET_DIR + type + '.js');
        if (res.ok) code = await res.text();
      } catch (e) { code = null; }
      if (!code) return;
      const d = frame.contentDocument;
      if (!d || !d.body) return;
      const s = d.createElement('script');
      s.textContent = code;
      d.body.appendChild(s);
      const w = frame.contentWindow;
      if (w && w.SITES && w.SITES.boot) w.SITES.boot();
    }

    async function addTile(type) {
      const snippet = await loadSnippet(type);
      if (!snippet) {
        status.textContent = 'No snippet published at ' + SNIPPET_DIR + type + '.html — add the snippet and run tools/sync-site-runtime.sh.';
        return;
      }
      edit('add:' + type, () => {
        state.tiles.push({ id: nextId(type), type, config: {}, description: '' });
        state.index = state.tiles.length - 1;
      });
      refresh();
      // After the render, so the script lands in a document that already holds the
      // tile it is meant to bring to life.
      ensureBehaviour(type);
      focusPreviewTile(state.tiles[state.index].id);
      // Focus the first field so typing can start immediately, but do NOT let the
      // browser scroll to it. The editor sits far below the picker, so a plain
      // focus() threw the viewport ~1900px down the page the instant a tile was
      // added — away from both the picker just used and the preview being watched.
      // Measured in a browser, not assumed.
      const first = editor.querySelector('input, textarea, select');
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    }

    /* ---- tile editor ---- */
    function renderEditor() {
      editor.textContent = '';
      const tile = state.tiles[state.index];
      if (!tile) {
        editor.appendChild(el('p', { class: 'adm-hint', text: 'No tile selected. Click one in \u201cTiles on this page\u201d above, or add one from the library on the left.' }));
        return;
      }
      editor.appendChild(el('p', { class: 'adm-hint', text: labelOf(tile.type) + ' · type ' + tile.type + ' · markup from ' + SNIPPET_DIR + tile.type + '.html' }));

      // Blueprint section fields, not registry fields: the compiler needs an id,
      // and "description" documents the section for humans and agents.
      const idField = el('label', { class: 'adm-field' });
      idField.appendChild(el('span', { text: 'Tile id (data-tile-id)' }));
      const idInput = el('input', { type: 'text' });
      idInput.value = tile.id;
      idField.appendChild(idInput);
      idInput.addEventListener('change', () => {
        const next = idInput.value.trim();
        if (!next || state.tiles.some((t) => t !== tile && t.id === next)) {
          idInput.value = tile.id;
          status.textContent = 'Tile ids must be unique on the page.';
          return;
        }
        edit('id:' + tile.id, () => { tile.id = next; });
        renderStructure();
        renderPreview(state, frame);
      });
      editor.appendChild(idField);

      const descField = el('label', { class: 'adm-field' });
      descField.appendChild(el('span', { text: 'Description (for humans — not rendered)' }));
      const descInput = el('input', { type: 'text' });
      descInput.value = tile.description || '';
      descField.appendChild(descInput);
      descInput.addEventListener('input', () => {
        edit('desc:' + tile.id, () => { tile.description = descInput.value; });
      });
      editor.appendChild(descField);

      // Variants, when the type declares more than the default shape. Rendered for
      // every type rather than only for chrome, so a cta can be centred from here
      // instead of by hand-editing a class into the markup.
      const variantList = (SITES.tileVariants || {})[tile.type] || [];
      if (variantList.length > 1) {
        const vField = el('label', { class: 'adm-field' });
        vField.appendChild(el('span', { text: 'Variant' }));
        const vSel = el('select');
        variantList.forEach((v) => vSel.appendChild(el('option', { value: v.name, text: v.label })));
        const vCurrent = typeof tile.variant === 'string' ? tile.variant : '';
        vSel.value = variantList.some((v) => v.name === vCurrent) ? vCurrent : '';
        vField.appendChild(vSel);
        vField.appendChild(el('span', { class: 'adm-hint', text: (variantList.filter((v) => v.name === vSel.value)[0] || {}).about || '' }));
        vSel.addEventListener('change', () => {
          edit('variant:' + tile.id, () => {
            if (vSel.value) tile.variant = vSel.value;
            else delete tile.variant;
          });
          renderEditor();
          schedulePreview();
        });
        editor.appendChild(vField);
      }

      const fields = SITES.fieldsFor(tile.type);
      if (!fields.length) editor.appendChild(el('p', { class: 'adm-hint', text: 'This tile type declares no editable fields.' }));
      fields.forEach((f) => {
        // Wrapped so the Content tab and the Code tab can be connected: hovering or
        // focusing a field lights the line of JSON that carries it. That
        // synchronisation is the lesson — it makes "copy is data" visible rather
        // than theoretical.
        const fieldWrap = el('div', { class: 'bld-fieldwrap' });
        fieldWrap.setAttribute('data-field', f.key);
        editor.appendChild(fieldWrap);
        fieldWrap.appendChild(SITES.admin.widget(f, tile.config[f.key], (key, value) => {
          // Through edit(), or copy changes are not undoable at all. The label keys
          // on the tile AND the field so a burst of typing in one field coalesces
          // into one step while moving to another field starts a new one.
          edit('copy:' + tile.id + ':' + f.key, () => {
            tile.config[key] = value;
            schedulePreview();
            updateStatus();
          });
        }));
      });

      // Content tab -> Code tab. Delegated so it survives the editor re-rendering.
      if (!editor.__codeSyncBound) {
        editor.__codeSyncBound = true;
        const light = (ev) => {
          const wrap = ev.target && ev.target.closest ? ev.target.closest('[data-field]') : null;
          markCodeField(wrap ? wrap.getAttribute('data-field') : null);
        };
        editor.addEventListener('mouseover', light);
        editor.addEventListener('focusin', light);
        editor.addEventListener('mouseleave', () => markCodeField(null));
        editor.addEventListener('focusout', () => markCodeField(null));
      }

      const commented = fields.reduce((n, f) => n + droppedCommentLines(tile.config[f.key]), 0);
      if (commented) {
        editor.appendChild(el('p', {
          class: 'adm-hint',
          text: commented + ' line' + (commented === 1 ? '' : 's') + ' of this copy start with "#". The blueprint format has no escape for that, so the compiler reads ' +
            (commented === 1 ? 'it' : 'them') + ' as comments — ' + (commented === 1 ? 'it is' : 'they are') + ' left out of both exports.',
        }));
      }

      const missing = unboundFields(tile.type, snippets.get(tile.type));
      if (missing.length) {
        editor.appendChild(el('p', {
          class: 'adm-hint',
          text: 'This snippet has no slot for: ' + missing.join(', ') + '. Its placeholder markup stays as authored in ' +
            SNIPPET_DIR + tile.type + '.html — catalog snippets are starting points, and the framework\u2019s own pages add the slots they need.',
        }));
      }
    }

    /* ---- status + export ---- */
    function updateStatus() {
      const total = state.tiles.length;
      const withCopy = state.tiles.filter(hasCopy).length;
      const rest = total - withCopy;
      status.textContent = total + ' tile' + (total === 1 ? '' : 's') + ' · ' + withCopy + ' with copy' +
        (rest ? ' · ' + rest + ' showing snippet placeholder copy (blank fields are omitted)' : '');
    }

    function download(filename, text, mime) {
      const url = URL.createObjectURL(new Blob([text], { type: mime }));
      const a = el('a', { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    blueprintBtn.addEventListener('click', () => {
      download('blueprint.md', buildBlueprint(state), 'text/markdown');
      exportStatus.textContent = 'blueprint.md — compile it with "node tools/blueprint.mjs blueprint.md".';
    });
    contentBtn.addEventListener('click', () => {
      download('content.json', JSON.stringify(buildContentDoc(state), null, 2) + '\n', 'application/json');
      exportStatus.textContent = 'content.json — this is what the blueprint compiles to.';
    });

    // Mirrors PLATE_MODES in src/js/sites-content.js and tools/bake.mjs. Three copies
    // of a five-item list is not ideal, and check-site fails on a value outside it,
    // so drift shows up as an error rather than a silently ignored plate.
    // Mirrors the panel enum in ai-skill/sites-schema.json and the gate in
    // tools/check-site.mjs. The empty value is the default invisible box.
    const PANEL_MODES = [
      ['', 'No box (default)', 'What every tile did before panels existed: the content sits directly on the background with the tile widths rhythm only.'],
      ['plate', 'Invisible box', 'A real box — padding and a rounded corner — with no fill. The content gets the same inset as a filled tile, so tiles align to one rhythm whether or not they are coloured in.'],
      ['surface', 'Raised panel', 'The standard card treatment: a surface fill and a soft shadow.'],
      ['accent', 'Tinted panel', 'A soft tint of the accent colour, for visual pop.'],
      ['none', 'None at all', 'No box: no padding, no radius, no fill.'],
    ];

    const PLATE_MODES = ['ambient', 'color', 'image', 'animation', 'none'];
    const PLATE_MODE_LABELS = [
      ['ambient', 'Ambient wash', 'Two soft radial washes in the accent and primary colours. They follow the theme, so a re-theme carries them.'],
      ['color', 'Flat colour', 'One solid colour behind everything.'],
      ['image', 'Image', 'An image behind everything, sized to cover.'],
      ['animation', 'Drifting wash', 'The ambient wash, in slow motion.'],
      ['none', 'None', 'No background layer — the page background shows through.'],
    ];

    /* ---- validation --------------------------------------------------------
       Mirrors the rules tools/check-site.mjs enforces, but where the problem is
       created rather than at the gate. The point is not to duplicate the gate — it
       is that a defect should be visible while it is being made, not after an
       export and a command line.
    --------------------------------------------------------------------- */
    const SPAN_RANGES = { span: [1, 12], spanSm: [1, 6], start: [1, 12] };

    /**
     * Make sure every type the page uses has had its snippet fetched.
     *
     * Validation needs the snippet to know whether a declared field has a slot to
     * land in, and snippets are otherwise loaded lazily as tiles are added — so a
     * type that arrived by import would go unchecked. Lives inside mount() because
     * it reads state and calls renderProblems, both of which are closures here; an
     * earlier version sat at module scope and threw "state is not defined" on every
     * render, which showed up only as a pageerror in a browser.
     */
    let snippetsLoading = false;
    async function ensureSnippets() {
      if (snippetsLoading) return;
      const missing = [...new Set(state.tiles.map((t) => t.type))].filter((t) => !snippets.has(t));
      if (!missing.length) return;
      snippetsLoading = true;
      try {
        await Promise.all(missing.map((t) => loadSnippet(t)));
      } finally {
        snippetsLoading = false;
      }
      renderProblems();
    }

    function validate() {
      const out = [];
      const add = (level, message, tileId) => out.push({ level, message, tileId: tileId || null });

      if (!state.tiles.length) add('warn', 'No tiles yet — the export would be an empty page.');

      const seen = Object.create(null);
      state.tiles.forEach((tile, i) => {
        const where = tile.id ? '#' + tile.id : 'tile ' + (i + 1);

        if (!tile.id) {
          add('error', where + ' has no id. The binder matches on data-tile-id, so a tile without one never receives content.', null);
        } else if (seen[tile.id]) {
          add('error', 'Duplicate id "' + tile.id + '" — ids must be unique per page.', tile.id);
        } else {
          seen[tile.id] = true;
        }

        if (!SITES.tileRegistry[tile.type]) {
          add('error', where + ': "' + tile.type + '" is not a registered tile type.', tile.id);
          return;
        }

        // A declared field with nowhere to land is typed copy that silently
        // disappears — the same defect check-site fails a snippet for.
        const snippet = snippets.get(tile.type);
        if (snippet === null) {
          add('error', where + ': no snippet published at ' + SNIPPET_DIR + tile.type + '.html — the tile cannot render. Run tools/sync-site-runtime.sh.', tile.id);
        } else if (typeof snippet === 'string') {
          const unbound = unboundFields(tile.type, snippet);
          if (unbound.length) {
            add('warn', where + ': ' + tile.type + '.html has no slot for ' + unbound.join(', ') + ' — typed copy would be dropped.', tile.id);
          }
        }

        const layout = tile.layout;
        if (layout && typeof layout === 'object') {
          Object.keys(layout).forEach((k) => {
            if (!SPAN_RANGES[k]) { add('warn', where + ': layout.' + k + ' is not a known key (span, spanSm, start).', tile.id); return; }
            const v = layout[k];
            const lo = SPAN_RANGES[k][0];
            const hi = SPAN_RANGES[k][1];
            if (!Number.isInteger(v) || v < lo || v > hi) {
              add('error', where + ': layout.' + k + ' is ' + JSON.stringify(v) + ' — must be a whole number from ' + lo + ' to ' + hi + '.', tile.id);
            }
          });
          const mode = (state.site.layout && state.site.layout.mode) === 'cols' ? 'cols' : 'auto';
          if (mode !== 'cols') {
            add('warn', where + ' carries layout placement but the site is in automatic mode, where a span does nothing.', tile.id);
          }
        }
      });

      if (!String(state.site.name || '').trim()) add('warn', 'The site has no name, so the export would say "Untitled".');
      if (!String(state.site.baseUrl || '').trim()) add('warn', 'No base URL — canonical URLs and sitemap entries would have nothing to point at.');

      return out;
    }

    function renderProblems() {
      const problems = validate();
      const errors = problems.filter((p) => p.level === 'error').length;
      const warns = problems.length - errors;

      problemsBox.textContent = '';
      problemsBox.hidden = !problems.length;
      if (!problems.length) return;

      const parts = [];
      if (errors) parts.push(errors + ' error' + (errors === 1 ? '' : 's'));
      if (warns) parts.push(warns + ' warning' + (warns === 1 ? '' : 's'));
      const head = el('button', { type: 'button', class: 'bld-problems__head' });
      head.append(
        el('span', { class: 'bld-problems__dot' + (errors ? ' is-error' : ''), 'aria-hidden': 'true', text: errors ? '!' : 'i' }),
        el('span', { text: parts.join(' · ') }),
        el('span', { class: 'bld-problems__toggle', text: problemsOpen ? 'hide' : 'show' }),
      );
      head.addEventListener('click', () => { problemsOpen = !problemsOpen; renderProblems(); });
      problemsBox.appendChild(head);

      if (!problemsOpen) return;
      const list = el('ul', { class: 'bld-problems__list' });
      problems.forEach((p) => {
        const li = el('li', { class: 'bld-problems__item is-' + p.level });
        const btn = el('button', { type: 'button', class: 'bld-problems__jump', text: p.message });
        if (p.tileId) {
          btn.addEventListener('click', () => {
            const idx = state.tiles.findIndex((t) => t.id === p.tileId);
            if (idx < 0) return;
            state.index = idx;
            renderStructure();
            renderEditor();
            renderLayout();
            renderCode();
            paintOverlay();
            focusPreviewTile(p.tileId);
          });
        }
        li.appendChild(btn);
        list.appendChild(li);
      });
      problemsBox.appendChild(list);
    }

    /* ---- Layout tab ------------------------------------------------------- */
    const GRID_MODES = [
      ['auto', 'Automatic', 'As many equal columns as fit. Per-tile spans do nothing here.'],
      ['cols', 'Configured', 'A real 12-column grid (6 narrow), where each tile declares its span.'],
    ];

    function renderLayout() {
      const mode = (state.site.layout && state.site.layout.mode) === 'cols' ? 'cols' : 'auto';

      // The mode is a site-level decision, so it lives on the site block rather
      // than on a tile. Without it a span is written and matches no rule.
      gridModeRow.textContent = '';
      const modeField = el('label', { class: 'adm-field' });
      modeField.appendChild(el('span', { text: 'Tile layout mode' }));
      const modeSel = el('select');
      GRID_MODES.forEach((m) => modeSel.appendChild(el('option', { value: m[0], text: m[1] })));
      modeSel.value = mode;
      modeField.appendChild(modeSel);
      gridModeRow.appendChild(modeField);
      const modeHint = GRID_MODES.filter((m) => m[0] === mode)[0];
      gridModeRow.appendChild(el('p', { class: 'adm-hint', text: modeHint ? modeHint[2] : '' }));
      modeSel.addEventListener('change', () => {
        edit('gridmode', () => {
          if (!state.site.layout) state.site.layout = {};
          state.site.layout.mode = modeSel.value;
        });
        renderLayout();
      });

      // The panel comes FIRST, before the grid-mode check: the fill has nothing to do
      // with the grid, so a tile should be able to change it in automatic mode too.
      spanRow.textContent = '';
      const tile = state.tiles[state.index];
      if (!tile) {
        spanRow.appendChild(el('p', { class: 'adm-hint', text: 'Select a tile to set its panel and how many columns it spans.' }));
        return;
      }

      const panelField = el('label', { class: 'adm-field' });
      panelField.appendChild(el('span', { text: 'Background panel' }));
      const panelSel = el('select');
      PANEL_MODES.forEach((p) => panelSel.appendChild(el('option', { value: p[0], text: p[1] })));
      panelSel.value = typeof tile.panel === 'string' ? tile.panel : '';
      panelField.appendChild(panelSel);
      const chosenPanel = PANEL_MODES.filter((p) => p[0] === panelSel.value)[0];
      panelField.appendChild(el('span', { class: 'adm-hint', text: chosenPanel ? chosenPanel[2] : '' }));
      panelSel.addEventListener('change', () => {
        edit('panel:' + tile.id, () => {
          if (panelSel.value) tile.panel = panelSel.value;
          else delete tile.panel;
        });
        renderLayout();
        schedulePreview();
      });
      spanRow.appendChild(panelField);

      if (mode !== 'cols') {
        spanRow.appendChild(el('p', { class: 'adm-hint', text: 'Switch the mode to Configured to place tiles on the grid. In automatic mode every tile is full width.' }));
        return;
      }
      const layout = tile.layout || {};
      const spanField = (key, labelText, max, hint) => {
        const f = el('label', { class: 'adm-field' });
        f.appendChild(el('span', { text: labelText }));
        const input = el('input', { type: 'number', min: '1', max: String(max), step: '1' });
        input.value = layout[key] == null ? '' : String(layout[key]);
        f.appendChild(input);
        f.appendChild(el('span', { class: 'adm-hint', text: hint }));
        input.addEventListener('change', () => {
          const v = input.value.trim();
          const n = Number(v);
          // Out of range matches no rule, so the tile would silently render full
          // width. Refuse it here rather than let check-site catch it later.
          if (v === '' || !Number.isInteger(n) || n < 1 || n > max) {
            status.textContent = labelText + ' must be a whole number from 1 to ' + max + '.';
            input.value = layout[key] == null ? '' : String(layout[key]);
            return;
          }
          edit('span:' + key + ':' + tile.id, () => {
            if (!tile.layout) tile.layout = {};
            tile.layout[key] = n;
          });
          refresh();
          paintOverlay();
        });
        return f;
      };
      spanRow.appendChild(spanField('span', 'Columns (wide)', 12, 'Of the 12-column grid, at 48rem and wider.'));
      spanRow.appendChild(spanField('spanSm', 'Columns (narrow)', 6, 'Of the 6-column grid below that.'));
    }

    /* ---- Code tab --------------------------------------------------------- */

    /** The entry exactly as the export will carry it. */
    function codeEntry(tile) {
      const entry = { id: tile.id, type: tile.type };
      if (tile.variant) entry.variant = tile.variant;
      if (tile.panel) entry.panel = tile.panel;
      if (tile.layout) entry.layout = tile.layout;
      entry.config = configObject(tile);
      return entry;
    }

    const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));

    // One pass over the raw text, emitting each token already escaped. Escaping
    // first and highlighting second would break the matcher: a quote becomes
    // &quot; and no longer looks like a string.
    const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}\[\],:])/g;
    function highlightJson(text) {
      let out = '';
      let last = 0;
      let m;
      JSON_TOKEN.lastIndex = 0;
      while ((m = JSON_TOKEN.exec(text)) !== null) {
        out += escapeHtml(text.slice(last, m.index));
        if (m[1] !== undefined) {
          // A string followed by a colon is a key, not a value.
          out += '<span class="tok-' + (m[2] !== undefined ? 'key' : 'str') + '">' + escapeHtml(m[1]) + '</span>';
          if (m[2] !== undefined) out += escapeHtml(m[2]);
        } else if (m[3] !== undefined) out += '<span class="tok-num">' + escapeHtml(m[3]) + '</span>';
        else if (m[4] !== undefined) out += '<span class="tok-lit">' + escapeHtml(m[4]) + '</span>';
        else out += '<span class="tok-punc">' + escapeHtml(m[5]) + '</span>';
        last = JSON_TOKEN.lastIndex;
      }
      out += escapeHtml(text.slice(last));
      return out;
    }

    // Nested groups are condensed to fit the column, and a condensed value that
    // overflows is marked with an ellipsis rather than silently clipped by the
    // scroll container. Scalars are never truncated: they are the values the author
    // typed, and Edit mode is where the whole thing is visible.
    const shortJson = (v) => {
      const s = JSON.stringify(v);
      return s.length > 36 ? s.slice(0, 33) + '…' : s;
    };

    /**
     * The entry as display lines, each with the annotation that explains it and the
     * config field it carries. Built from the entry object rather than by
     * re-parsing JSON text, so every line can be labelled exactly.
     */
    function codeLines(tile) {
      const rows = [];
      const push = (text, note, field) => rows.push({ text, note: note || '', field: field || null });
      const ind = (n) => '  '.repeat(n);
      const fields = SITES.fieldsFor(tile.type);
      const labelFor = (k) => {
        const f = fields.filter((x) => x.key === k)[0];
        return f && f.label ? f.label : k;
      };

      push('{');
      push(ind(1) + '"id": ' + JSON.stringify(tile.id) + ',', 'the binder matches data-tile-id against this');
      push(ind(1) + '"type": ' + JSON.stringify(tile.type) + ',', 'which snippet in src/modules renders it');
      if (tile.variant) {
        push(ind(1) + '"variant": ' + JSON.stringify(tile.variant) + ',', 'adds .tile-' + tile.type + '--' + tile.variant);
      }
      if (tile.layout) {
        const parts = Object.keys(tile.layout).map((k) => JSON.stringify(k) + ': ' + JSON.stringify(tile.layout[k]));
        push(ind(1) + '"layout": { ' + parts.join(', ') + ' },', 'grid placement — the binder writes data-span from this');
      }

      const config = configObject(tile);
      const keys = Object.keys(config);
      if (!keys.length) {
        push(ind(1) + '"config": {}', 'no copy yet — the tile shows its snippet placeholder');
      } else {
        push(ind(1) + '"config": {');
        keys.forEach((k, i) => {
          const comma = i < keys.length - 1 ? ',' : '';
          const v = config[k];
          const note = labelFor(k) + ' → [data-role="' + k + '"]';
          if (typeof v === 'string' && v.indexOf('\n') !== -1) {
            // ONE line, escaped, exactly as JSON.stringify writes it. An earlier
            // version exploded it into an array of paragraphs, which read nicely and
            // was a lie: content.json carries a single string with \n in it, and a
            // panel whose whole claim is "this is the real artifact, not a rendering
            // of it" cannot afford to render. The note carries the explanation
            // instead.
            const paras = v.split(/\n\s*\n/).filter(Boolean).length;
            push(ind(2) + JSON.stringify(k) + ': ' + JSON.stringify(v) + comma,
              note + '  ·  ' + paras + ' paragraph' + (paras === 1 ? '' : 's') + ', one <p> each', k);
          } else if (v && typeof v === 'object') {
            const count = Array.isArray(v) ? v.length + ' item' + (v.length === 1 ? '' : 's') : 'object';
            push(ind(2) + JSON.stringify(k) + ': ' + shortJson(v) + comma, note + '  ·  ' + count, k);
          } else if (typeof v === 'number' || typeof v === 'boolean') {
            push(ind(2) + JSON.stringify(k) + ': ' + JSON.stringify(v) + comma, note, k);
          } else {
            push(ind(2) + JSON.stringify(k) + ': ' + JSON.stringify(v) + comma, note, k);
          }
        });
        push(ind(1) + '}');
      }
      push('}');
      return rows;
    }

    /** Light the code row carrying a config field, and quiet the rest. */
    function markCodeField(key) {
      const rows = codeOut.querySelectorAll('.bld-coderow');
      for (let i = 0; i < rows.length; i++) {
        rows[i].classList.toggle('is-lit', !!key && rows[i].getAttribute('data-field') === key);
      }
    }

    function setCodeMode(editing) {
      codeEditing = editing;
      codeOut.hidden = editing;
      codeEdit.hidden = !editing;
      codeEditBtn.hidden = editing;
      codeApplyBtn.hidden = !editing;
      codeCancelBtn.hidden = !editing;
      codeMsg.textContent = '';
      if (editing) {
        const tile = state.tiles[state.index];
        codeEdit.value = tile ? JSON.stringify(codeEntry(tile), null, 2) : '';
        codeEdit.focus();
      } else {
        renderCode();
      }
    }

    /**
     * Write the edited JSON back into the same tile the UI edits.
     *
     * Guarded rather than trusting: a code edit is more dangerous than a form edit
     * because it can reach fields no widget exposes, so ids and types are checked
     * here and everything else is left to the validator, which will report a bad
     * span or an unknown key in the problems panel like any other mistake.
     */
    function applyCodeEdit() {
      const tile = state.tiles[state.index];
      if (!tile) return;
      let parsed;
      try {
        parsed = JSON.parse(codeEdit.value);
      } catch (err) {
        codeMsg.textContent = 'Not valid JSON: ' + err.message;
        return;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        codeMsg.textContent = 'The entry must be a JSON object.';
        return;
      }
      const nextId = typeof parsed.id === 'string' ? parsed.id.trim() : '';
      if (!nextId) { codeMsg.textContent = 'The entry needs a non-empty "id".'; return; }
      if (state.tiles.some((t) => t !== tile && t.id === nextId)) {
        codeMsg.textContent = 'Another tile already uses the id "' + nextId + '".';
        return;
      }
      const nextType = typeof parsed.type === 'string' ? parsed.type.trim() : '';
      if (!SITES.tileRegistry[nextType]) {
        codeMsg.textContent = '"' + nextType + '" is not a registered tile type.';
        return;
      }

      edit('code:' + tile.id, () => {
        tile.id = nextId;
        tile.type = nextType;
        const config = parsed.config && typeof parsed.config === 'object' && !Array.isArray(parsed.config) ? parsed.config : {};
        tile.config = config;
        if (parsed.layout && typeof parsed.layout === 'object' && !Array.isArray(parsed.layout)) tile.layout = parsed.layout;
        else delete tile.layout;
        if (typeof parsed.variant === 'string' && parsed.variant) tile.variant = parsed.variant;
        else delete tile.variant;
        if (typeof parsed.panel === 'string' && parsed.panel) tile.panel = parsed.panel;
        else delete tile.panel;
      });
      setCodeMode(false);
      refresh();
      ensureBehaviour(nextType);
      codeMsg.textContent = 'Applied to #' + nextId + '. The preview, the export and the blueprint all read from here.';
    }

    codeEditBtn.addEventListener('click', () => setCodeMode(true));
    codeCancelBtn.addEventListener('click', () => setCodeMode(false));
    codeApplyBtn.addEventListener('click', applyCodeEdit);
    codeEdit.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setCodeMode(false); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyCodeEdit(); }
    });

    /** Paint the lint result for whatever is in the CSS box. */
    function renderCssLint(css) {
      codeCssLint.textContent = '';
      const lint = SITES.cssLint;
      if (!lint) { codeCssLint.appendChild(el('p', { class: 'bld-csslint__item is-warn', text: 'The CSS lint did not load — nothing here can be checked.' })); return; }
      const problems = lint.check(css);
      if (!problems.length) {
        if (String(css || '').trim()) codeCssLint.appendChild(el('p', { class: 'bld-csslint__item is-ok', text: 'Scoped to this tile, and every value is a token.' }));
        return;
      }
      problems.forEach((p) => {
        codeCssLint.appendChild(el('p', { class: 'bld-csslint__item is-' + p.level, text: 'Line ' + p.line + ' — ' + p.message }));
      });
    }

    codeCss.addEventListener('input', () => {
      const tile = state.tiles[state.index];
      if (!tile) return;
      const value = codeCss.value;
      // Coalesced by label, so typing a block is one undo step rather than one per
      // keystroke — the same rule the copy fields use.
      edit('css:' + tile.id, () => {
        if (value.trim()) tile.css = value;
        else delete tile.css;
      });
      renderCssLint(value);
      schedulePreview();
    });

    function renderCode() {
      if (codeEditing) return;   // never yank the textarea out from under a typist
      const tile = state.tiles[state.index];
      codeOut.textContent = '';
      if (!tile) {
        codeOut.appendChild(el('p', { class: 'adm-hint', text: 'Select a tile to see its entry.' }));
        codeCss.value = '';
        codeCss.disabled = true;
        renderCssLint('');
        return;
      }
      codeCss.disabled = false;
      // Do not fight a typist: only sync the box when it is not the focused element.
      if (document.activeElement !== codeCss) {
        const next = typeof tile.css === 'string' ? tile.css : '';
        if (codeCss.value !== next) codeCss.value = next;
        renderCssLint(next);
      }
      codeLines(tile).forEach((line, i) => {
        const row = el('div', { class: 'bld-coderow' });
        if (line.field) row.setAttribute('data-field', line.field);
        row.appendChild(el('span', { class: 'bld-codeln', text: String(i + 1) }));
        const text = el('span', { class: 'bld-codetext' });
        text.innerHTML = highlightJson(line.text);
        row.appendChild(text);
        codeOut.appendChild(row);
        // The annotation gets its OWN row rather than a right-hand gutter. The
        // inspector column is about 426px wide, so a side-by-side note was clipped
        // to "the binder matches d…" — the teaching content, unreadable. Full width
        // costs a line and reads at any column width.
        if (line.note) {
          const noteRow = el('div', { class: 'bld-codenoterow' });
          if (line.field) noteRow.setAttribute('data-field', line.field);
          noteRow.appendChild(el('span', { class: 'bld-codeln', text: '' }));
          noteRow.appendChild(el('span', { class: 'bld-codenote', text: '\u2190 ' + line.note }));
          codeOut.appendChild(noteRow);
        }
      });
    }

    function refresh() {
      if (previewTimer) { clearTimeout(previewTimer); previewTimer = 0; }
      renderStructure();
      renderEditor();
      renderLayout();
      renderPlate();
      renderChrome();
      renderCode();
      renderPreview(state, frame);
      renderProblems();
      updateStatus();
      // Validation needs every used snippet, and they load lazily. Fire and forget;
      // it re-renders the problems itself when the fetches land.
      ensureSnippets();
      // The screen name mirrors state.site.name, whichever surface changed it.
      if (document.activeElement !== screenName) screenName.value = state.site.name || '';
      undoBtn.disabled = history.past.length === 0;
      redoBtn.disabled = history.future.length === 0;
      undoBtn.title = history.past.length ? 'Undo (' + history.past.length + ' step' + (history.past.length === 1 ? '' : 's') + ')' : 'Nothing to undo';
      redoBtn.title = history.future.length ? 'Redo' : 'Nothing to redo';
    }

    frame.addEventListener('load', () => {
      wirePreview(frame);
      paintOverlay();
      refresh();
    });

    /**
     * Bring a tile into view in the preview and mark it.
     *
     * Without this the preview is a picture rather than a map: adding three tiles
     * left it showing only the first, scrolled to 0, because the iframe has its own
     * scroll position and nothing connected it to the structure list. Selecting a
     * tile in the inspector now moves the preview to the thing being edited.
     */
    function focusPreviewTile(id) {
      const d = frame.contentDocument;
      if (!d || !id) return;
      const target = d.querySelector('[data-tile-id="' + CSS_escape(id) + '"]');
      // Clear any previous mark, even when the new target is missing.
      d.querySelectorAll('.bld-marked').forEach((el2) => el2.classList.remove('bld-marked'));
      if (!target) return;
      target.classList.add('bld-marked');
      // Scroll the preview document itself, not the outer page.
      const top = target.getBoundingClientRect().top + d.documentElement.scrollTop - 16;
      if (d.documentElement && typeof d.documentElement.scrollTo === 'function') {
        d.documentElement.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    }

    /** CSS.escape is not in every browser this runs in; ids are slugs anyway. */
    function CSS_escape(s) {
      return String(s).replace(/["\\]/g, '\\$&');
    }

    /* ---- preview controls ------------------------------------------------- */
    // Frame widths. Tablet (834) sits just over the 48rem container-query boundary,
    // which makes it the interesting preset: it is where the tier changes.
    const VIEWPORTS = [['Fill', 0], ['Desktop', 1280], ['Tablet', 834], ['Mobile', 390]];

    /**
     * Size the preview to the width it is SHOWN at. No transform.
     *
     * The previous version laid the frame out at the preset width and scaled it down
     * with transform: scale() to fit the column. That looks like a device preview and
     * is not one: the container queries INSIDE the frame see the full 1280, so the
     * 12-column tier applies and the author is shown a desktop layout squeezed into a
     * phone-width box, with every element at desktop proportions and text too small
     * to read. What you see stopped being what the width does.
     *
     * Now the frame's layout width IS its display width, so a container query sees
     * exactly what the eye sees, at 1:1. A preset wider than the column is clamped to
     * the column and SAID SO, rather than silently showing something other than the
     * label on the button.
     */
    function setViewport(label, width) {
      viewportButtons.forEach((btn, l) => btn.classList.toggle('active', l === label));
      const avail = Math.max(240, frameScaler.clientWidth || previewWrap.clientWidth);
      const render = width ? Math.min(width, avail) : avail;

      frame.style.width = render + 'px';
      frame.style.marginInline = 'auto';
      frame.style.transform = '';
      frame.style.height = '100%';
      frame.removeAttribute('data-display-scale');
      frame.setAttribute('data-render-width', String(render));

      const clamped = width && width > avail;
      viewportReadout.textContent = clamped
        ? render + 'px · the column is ' + avail + 'px, so this is the widest that fits 1:1'
        : render + 'px';

      // A container query re-evaluates on layout change, so the tier follows the
      // frame with no reload — which is what makes this an emulation rather than an
      // approximation of a device.
      paintOverlay();
    }

    // Re-fit on resize: the scale depends on the column width, which the author
    // changes by resizing the window.
    window.addEventListener('resize', () => {
      const active = [...viewportButtons.entries()].filter((pair) => pair[1].classList.contains('active'))[0];
      const vp = active ? VIEWPORTS.filter((v) => v[0] === active[0])[0] : null;
      setViewport(vp ? vp[0] : 'Fill', vp ? vp[1] : 0);
    });

    VIEWPORTS.forEach((vp) => {
      // A stable hook per preset. A positional selector like ".bld-tool:last-child"
      // also matches the last button INSIDE .bld-viewbar, so a probe can silently
      // read the wrong control — which is exactly what happened while verifying this.
      const btn = el('button', { type: 'button', class: 'bld-tool', 'data-viewport': vp[0].toLowerCase(), text: vp[0] });
      btn.addEventListener('click', () => setViewport(vp[0], vp[1]));
      viewportButtons.set(vp[0], btn);
      viewportBar.appendChild(btn);
    });

    overlayBtn.addEventListener('click', () => {
      overlayOn = !overlayOn;
      overlayBtn.classList.toggle('active', overlayOn);
      paintOverlay();
    });

    /**
     * Draw the column grid over the preview.
     *
     * It reads the same custom properties the grid itself uses, so it cannot
     * disagree with what is rendered: --grid-cols in the wide tier,
     * --grid-cols-narrow below 48rem. The tier is decided the way the stylesheet
     * decides it — by the container's width, not the window's.
     */
    function paintOverlay() {
      const d = frame.contentDocument;
      if (!d || !d.body) return;
      let overlay = d.querySelector('.bld-grid-overlay');
      if (!overlayOn) { if (overlay) overlay.remove(); return; }

      const host = d.querySelector('.sites-grid--cols') || d.querySelector('.sites-container') || d.body;
      const cs = d.defaultView.getComputedStyle(host);
      const narrow = host.getBoundingClientRect().width < 768;
      const raw = narrow ? cs.getPropertyValue('--grid-cols-narrow') : cs.getPropertyValue('--grid-cols');
      const cols = Math.max(1, parseInt(raw, 10) || (narrow ? 6 : 12));

      if (!overlay) {
        overlay = d.createElement('div');
        overlay.className = 'bld-grid-overlay';
        d.body.appendChild(overlay);
      }
      // Shade the columns the selected tile spans, so "7" becomes something you can
      // see rather than a number you have to trust. Narrow tier uses spanSm.
      const tile = state.tiles[state.index];
      const layout = (tile && tile.layout) || {};
      const want = (narrow ? layout.spanSm : layout.span);
      const shade = typeof want === 'number' && want >= 1 ? Math.min(want, cols) : 0;

      overlay.textContent = '';
      overlay.setAttribute('data-cols', String(cols));
      overlay.setAttribute('data-shade', String(shade));
      for (let i = 0; i < cols; i++) {
        const sp = d.createElement('span');
        if (i < shade) sp.className = 'shaded';
        overlay.appendChild(sp);
      }
    }

    buildSettings();
    screenName.value = state.site.name || '';
    refresh();

    /* ---- recover unsaved work, and keyboard shortcuts ---------------------
       The draft prompt comes after the first render so the restored state lands
       in a builder that is already drawn, rather than one that renders twice. */
    (function offerDraft() {
      const draft = readDraft();
      if (!draft) return;
      const when = new Date(draft.at);
      const bar = el('div', { class: 'bld-notice' }, [
        el('span', { text: 'Unsaved work from ' + when.toLocaleString() + ' (' + (draft.state.tiles || []).length + ' tile(s)).' }),
        el('button', { type: 'button', class: 'bld-tool', text: 'Restore', onclick: '' }),
        el('button', { type: 'button', class: 'bld-tool', text: 'Discard', onclick: '' }),
      ]);
      const [restoreBtn, discardBtn] = [...bar.querySelectorAll('button')];
      restoreBtn.addEventListener('click', () => {
        applySnapshot(draft.state);
        history.past.length = 0; history.future.length = 0;
        bar.remove(); refresh();
        status.textContent = 'Restored the draft.';
      });
      discardBtn.addEventListener('click', () => { clearDraft(); bar.remove(); });
      root.insertBefore(bar, root.firstChild);
    })();

    root.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); return; }
      // Ctrl+S saves the artifact the compiler wants, rather than the page.
      if (key === 's') { e.preventDefault(); download('blueprint.md', buildBlueprint(state), 'text/markdown'); return; }
      if (key === 'd' && state.index >= 0) { e.preventDefault(); duplicateTile(state.index); }
    });

    const instance = {
      state,
      blueprint: () => buildBlueprint(state),
      content: () => buildContentDoc(state),
      refresh,
      undo,
      redo,
      // Exposed so a test can assert the rules directly, and so the console can ask
      // "what is wrong with this page?" without reading the panel.
      validate,
      problems: () => validate(),
      // How many undo steps are stacked. Exposed so a test can assert that a burst
      // of edits to one field coalesces instead of filling the stack.
      historyDepth: () => history.past.length,
    };
    SITES.builder.instance = instance;   // reachable from the console, like SITES.contentDoc
    return instance;
  }

  SITES.builder = {
    mount,
    // The pure halves, exposed so tests/builder-roundtrip.cjs can verify the
    // builder's central claim — that blueprint() compiles back to content() —
    // without standing up the whole UI in a browser.
    artifacts: { buildBlueprint, buildContentDoc, normalizeCopy, configObject },
  };
})();