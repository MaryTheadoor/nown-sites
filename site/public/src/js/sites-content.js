/* ==========================================================================
   sites-content.js — S.I.T.E.S content binder
   Structure + CSS are predefined in the page; editable copy is drawn from the
   backend file (content.json, schema-validated). This binds config values into
   the predefined `data-role` slots. Progressive: placeholder copy stays if the
   fetch fails or JS is off.
   ========================================================================== */
(function () {
  'use strict';
  const SITES = (window.SITES = window.SITES || {});

  const text = (v) => (v == null ? '' : String(v));

  /** Resolve an image reference (path | URL | asset:key) through the asset adapter. */
  const resolveSrc = (v) => (SITES.assets && SITES.assets.resolve ? SITES.assets.resolve(text(v)) : text(v));

  /** Bind one scalar/attribute value onto an element, honouring its tag. */
  function bindValue(el, key, value) {
    if (!el || value == null) return;
    const tag = el.tagName;
    if ((key === 'href' || key === 'url') && (tag === 'A' || el.hasAttribute('href'))) {
      el.setAttribute('href', text(value)); return;
    }
    // Generic attribute binding: any slot may declare data-attr="<attribute>" to
    // receive its value as an attribute instead of text.
    // e.g. <div data-role="src" data-attr="data-video-src">, <pre data-role="language" data-attr="data-lang">
    const attrTarget = el.getAttribute && el.getAttribute('data-attr');
    if (attrTarget) {
      el.setAttribute(attrTarget, key === 'src' ? resolveSrc(value) : text(value));
      return;
    }
    if (tag === 'IMG' && key === 'src') { el.setAttribute('src', resolveSrc(value)); return; }
    if (tag === 'IMG' && key === 'alt') { el.setAttribute('alt', text(value)); return; }
    if (key === 'src' && (tag === 'IFRAME' || tag === 'SOURCE')) { el.setAttribute('src', resolveSrc(value)); return; }
    if (key === 'src' && (el.dataset.role === 'media' || el.dataset.role === 'image')) {
      const img = el.querySelector('img') || el;
      if (img.tagName === 'IMG') { img.setAttribute('src', resolveSrc(value)); return; }
    }
    // A list container always receives real list items (never a blob of text).
    // Separators: newlines, or commas when the value is a single line.
    // Within a line, "Name|Price" splits into a name span + a price span.
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      const raw = text(value);
      const lines = (raw.includes('\n') ? raw.split('\n') : raw.split(',')).map((s) => s.trim()).filter(Boolean);
      el.textContent = '';
      lines.forEach((line) => {
        const li = document.createElement('li');
        const parts = line.split('|');
        if (parts.length > 1) {
          const name = document.createElement('span');
          name.textContent = parts[0].trim();
          const price = document.createElement('span');
          price.className = 'tile-price__amount';
          price.textContent = parts.slice(1).join('|').trim();
          li.append(name, price);
        } else {
          li.textContent = line;
        }
        el.appendChild(li);
      });
      return;
    }
    // Multi-paragraph copy: a value with a blank line becomes one <p> per block.
    // A landing page's body is 300-500 words and paragraphs are part of the copy —
    // setting textContent would flatten it into a single wall of text. Only a <div>
    // qualifies: a <p> cannot legally contain another <p>.
    const raw = text(value);
    if (el.tagName === 'DIV' && /\n\s*\n/.test(raw)) {
      el.textContent = '';
      raw.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).forEach((para) => {
        const p = document.createElement('p');
        p.textContent = para; // text, never innerHTML — copy is data
        el.appendChild(p);
      });
      return;
    }
    el.textContent = raw;
  }

  /**
   * Find the slot for `key` inside `scope`. A scope that *is* the slot counts too,
   * so tiles may carry the role on their own root element.
   */
  function findSlot(scope, key) {
    if (!scope) return null;
    if (scope.getAttribute && scope.getAttribute('data-role') === key) return scope;
    return scope.querySelector(`[data-role="${key}"]`);
  }

  /** Bind a plain object's keys to [data-role="<key>"] inside `scope`. */
  function bindObject(scope, obj) {
    if (!scope || !obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach((key) => {
      const value = obj[key];
      if (value == null) return;
      const target = findSlot(scope, key);
      if (!target) return;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        bindValue(target, key, value);
      }
    });
  }

  /** Render a repeatable container from a <template> child + an array. */
  function renderList(scope, key, list) {
    const container = findSlot(scope, key);
    if (!container) return;
    const tpl = container.querySelector('template');
    // Nothing to clone from: keep whatever markup the page shipped. A baked page
    // carries the real items as plain children (that is what makes it coherent
    // with JS disabled, and what a crawler reads) — clearing the container before
    // this check would delete exactly that content and leave an empty list.
    if (!tpl || !Array.isArray(list)) return;
    // clear previously rendered clones (keep the template)
    Array.from(container.children).forEach((c) => { if (c.tagName !== 'TEMPLATE') c.remove(); });
    list.forEach((item) => {
      const node = tpl.content.firstElementChild
        ? tpl.content.firstElementChild.cloneNode(true)
        : document.importNode(tpl.content, true);
      bindItem(node, item);
      // A single root <a>/<button> may itself carry the row's href/label.
      if (item && typeof item === 'object') {
        if (item.href && node.tagName === 'A') node.setAttribute('href', text(item.href));
        if (item.label && !node.querySelector('[data-role="label"]')) node.textContent = text(item.label);
      }
      container.appendChild(node);
    });
  }

  /** Button styles a content author can request per action. */
  const STYLE_CLASSES = {
    gold: 'btn-tactile btn-gold-tactile',
    primary: 'btn-tactile btn-primary-tactile',
    plum: 'btn-tactile btn-plum-tactile',
    ghost: 'btn-ghost',
    outline: 'btn-ghost',
  };
  const VARIANT_CLASSES = ['btn-tactile', 'btn-gold-tactile', 'btn-primary-tactile', 'btn-plum-tactile', 'btn-ghost'];

  /** Apply a requested action `style` to the row's button. */
  function applyActionStyle(node, style) {
    const classes = STYLE_CLASSES[style];
    if (!classes) return;
    const btn = (node.matches && node.matches('a, button')) ? node : node.querySelector('a, button');
    if (!btn) return;
    VARIANT_CLASSES.forEach((c) => btn.classList.remove(c));
    btn.classList.add('btn');
    classes.split(' ').forEach((c) => btn.classList.add(c));
  }

  /** Bind one list item (object) into a cloned template node. */
  function bindItem(node, item) {
    if (item == null) return;
    if (typeof item !== 'object') { node.textContent = text(item); return; }
    if (item.style) applyActionStyle(node, item.style);
    Object.keys(item).forEach((key) => {
      const value = item[key];
      if (value == null) return;
      const target = node.querySelector(`[data-role="${key}"]`);
      if (target) { bindValue(target, key, value); return; }
      // graceful fallbacks
      if (key === 'href' && node.tagName === 'A') node.setAttribute('href', text(value));
      if ((key === 'src' || key === 'alt')) {
        const img = node.tagName === 'IMG' ? node : node.querySelector('img');
        if (img && img.tagName === 'IMG') img.setAttribute(key, text(value));
      }
    });
    // A row-level `href` links the row's anchor even without an explicit slot.
    if (item.href) {
      const a = node.tagName === 'A' ? node : node.querySelector('a');
      if (a) a.setAttribute('href', text(item.href));
    }
    if (item.src) {
      const img = node.tagName === 'IMG' ? node : node.querySelector('img, iframe');
      if (img && img.setAttribute) img.setAttribute('src', resolveSrc(item.src));
    }
  }

  /** Apply a `config` object to a tile element. */
  function applyConfig(tile, config) {
    if (!config) return;
    Object.keys(config).forEach((key) => {
      const value = config[key];
      if (value == null) return;

      if (Array.isArray(value)) { renderList(tile, key, value); return; }

      if (typeof value === 'object') {
        const container = findSlot(tile, key);
        if (!container) return;
        // media object {src, alt} -> bind to the <img>/<iframe> inside the container
        if (value.src != null) {
          const media = container.tagName === 'IMG' ? container : (container.querySelector('img, iframe') || container);
          if (media.getAttribute) {
            media.setAttribute('src', resolveSrc(value.src));
            if (value.alt != null && media.tagName === 'IMG') media.setAttribute('alt', text(value.alt));
          }
          return;
        }
        bindObject(container, value);
        return;
      }

      // scalar
      const target = findSlot(tile, key);
      if (target) bindValue(target, key, value);
    });
  }

  /**
   * Layout and variant live on the entry, not on the element.
   *
   * They used to be authored straight into the page markup (data-span, and a
   * tile-<type>--<variant> class), which meant the builder had to reach into the
   * DOM to change them and they could not be exported, validated or previewed.
   * Moving them into the content model lets the binder apply them exactly the way
   * it applies copy — at runtime here, and at build time in tools/bake.mjs.
   */
  function applyLayout(tile, entry) {
    if (entry.variant) {
      const cls = 'tile-' + entry.type + '--' + entry.variant;
      if (tile.classList) tile.classList.add(cls);
      else tile.setAttribute('class', ((tile.getAttribute('class') || '') + ' ' + cls).trim());
    }
    // The panel is set BEFORE the layout's early return below, because an entry can
    // carry a panel with no layout at all — and the old shape would have dropped it.
    if (entry.panel) tile.setAttribute('data-panel', String(entry.panel));
    else tile.removeAttribute('data-panel');

    const layout = entry.layout;
    if (!layout || typeof layout !== 'object') return;
    const set = (attr, value) => {
      if (value == null || value === '') tile.removeAttribute(attr);
      else tile.setAttribute(attr, String(value));
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

  /**
   * Apply a whole content document to the page.
   * Tiles are matched by `data-tile-id` first, then by `data-tile` type in order.
   */
  /* --------------------------------------------------- per-tile CSS blocks */
  /**
   * A tile's own CSS, collected into ONE site-level stylesheet.
   *
   * Not inline styles on the element: a hundred tiles each carrying a style
   * attribute is a page nobody can cache, read or diff. Not one <style> per tile
   * either — that is the same problem with extra elements. One block, scoped by
   * [data-tile-id], which is what docs/BUILDER-PLAN.md 3.6 means by "a per-instance
   * block in a site-level stylesheet".
   *
   * The lint is not optional. If SITES.cssLint is missing, this injects NOTHING and
   * says so, because the whole safety property is that the block cannot escape its
   * scope — and injecting unchecked text into a stylesheet is how a stray brace
   * becomes page-wide CSS.
   */
  function applyTileCss(doc) {
    const existing = document.querySelector('style[data-tile-css]');
    const entries = (doc && Array.isArray(doc.content)) ? doc.content : [];
    const withCss = entries.filter((e) => e && e.css && e.id);

    if (!withCss.length) {
      if (existing) existing.remove();
      return 0;
    }
    if (!SITES.cssLint || typeof SITES.cssLint.wrap !== 'function') {
      console.warn('[SITES] per-tile CSS skipped: the lint did not load with tile-registry.js.');
      if (existing) existing.remove();
      return 0;
    }

    // CHECK before injecting, not just wrap. The wrap is what keeps a block inside
    // its scope, but a stray "}" closes that scope and everything after it becomes
    // page-wide CSS — so an unchecked block is not merely ugly, it can hide the
    // whole page. tools/bake.mjs already refused these; the binder did not, and a
    // single brace in the Code tab blanked the preview. A block that fails the lint
    // is dropped and reported, exactly as the baker drops it.
    const blocks = [];
    withCss.forEach((e) => {
      const problems = SITES.cssLint.check(e.css).filter((p) => p.level === 'error');
      if (problems.length) {
        console.warn('[SITES] tile CSS for "' + e.id + '" was NOT applied — ' + problems.map((p) => 'line ' + p.line + ': ' + p.message).join(' '));
        return;
      }
      blocks.push(SITES.cssLint.wrap(e.id, e.css));
    });
    if (!blocks.length) {
      if (existing) existing.remove();
      return 0;
    }
    const el = existing || document.createElement('style');
    el.setAttribute('data-tile-css', '');
    el.textContent = blocks.join('\n');
    if (!existing) document.head.appendChild(el);
    return blocks.length;
  }

  /* ------------------------------------------------------------- the plate */
  const PLATE_MODES = ['ambient', 'color', 'image', 'animation', 'none'];

  /**
   * Apply site.plate — the background behind everything.
   *
   * Written as CSS variables plus a data-plate attribute rather than inline styles
   * on every element, so the modes stay in the stylesheet (rule 3) and a re-theme
   * still flows through. tools/bake.mjs writes the same two things into the served
   * HTML, so a page with JavaScript disabled looks identical.
   *
   * Unknown modes fall back to "ambient" rather than blanking the plate: a typo in a
   * content file should not leave a site with no background at all.
   */
  function applyPlate(plate) {
    const host = document.querySelector('.sites-plate');
    if (!host) return null;
    const p = plate && typeof plate === 'object' ? plate : {};
    const mode = PLATE_MODES.indexOf(p.mode) === -1 ? 'ambient' : p.mode;
    host.setAttribute('data-plate', mode);

    // On the plate element itself, not documentElement: the background belongs to
    // the plate, and tools/bake.mjs writes these to the same element. Setting them
    // on <html> put the two implementations' DOMs out of step — same effect, different
    // tree — which is exactly what a baked-vs-bound comparison is meant to catch.
    if (p.color) host.style.setProperty('--plate-color', String(p.color));
    else host.style.removeProperty('--plate-color');

    // "asset:key" resolves through the asset map exactly like a tile's image does,
    // through the same helper, so the two cannot drift.
    const image = p.image ? resolveSrc(p.image) : '';
    if (mode === 'image' && image) host.style.setProperty('--plate-image', "url('" + image + "')");
    else host.style.removeProperty('--plate-image');

    return { mode, color: p.color || null, image: image || null };
  }

  function applyContent(doc) {
    if (!doc || !Array.isArray(doc.content)) return;

    // Site-level context first, so tile binding can already resolve assets/theme.
    if (SITES.assets && SITES.assets.loadMap) SITES.assets.loadMap(doc);
    if (SITES.theme && doc.theme) SITES.theme.apply(doc.theme);
    // site.plate, not a top-level plate. The plan is ambiguous between the two
    // (3.5 writes site.plate, 3.7 lists it alongside site), and supporting both
    // would be a silent-typo generator: write it in the wrong place and the plate
    // just does not apply. site.plate matches site.layout, which already shipped.
    // check-site warns about a top-level plate so the mistake is not silent.
    applyPlate(doc.site && doc.site.plate);
    applyTileCss(doc);

    const byId = new Map();
    document.querySelectorAll('[data-tile-id]').forEach((el) => byId.set(el.getAttribute('data-tile-id'), el));
    const byType = new Map();
    document.querySelectorAll('[data-tile]').forEach((el) => {
      const t = el.getAttribute('data-tile');
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(el);
    });

    // Claim a page element for an entry, and never hand the same element out twice.
    function take(el) {
      const pool = byType.get(el.getAttribute('data-tile'));
      if (pool) { const i = pool.indexOf(el); if (i >= 0) pool.splice(i, 1); }
      return el;
    }

    let applied = 0;
    doc.content.forEach((entry) => {
      let tile = null;
      if (entry.id) {
        // An explicit id is authoritative: bind it, or leave it for the page that
        // owns it. Never fall back to type-matching, or pages would steal each
        // other's tiles (one content file can serve many pages).
        const el = byId.get(entry.id);
        if (el && !el.__sitesClaimed) { el.__sitesClaimed = true; tile = take(el); }
      } else {
        // No id: positional matching — next unconsumed tile of this type.
        const pool = byType.get(entry.type) || [];
        tile = pool.shift() || null;
        if (tile) tile.__sitesClaimed = true;
      }
      if (tile) { applyEntry(tile, entry); applied++; }
    });

    // Chrome: nav links + announcement + title.
    if (Array.isArray(doc.nav)) renderList(document, 'nav-links', doc.nav);
    if (doc.site) {
      // The per-page <title> is authored statically by tools/seo.mjs (docs/SEO.md),
      // because crawlers and link-preview scrapers never run this code. Rewriting it
      // here would make every page of a multi-page site advertise the same title to
      // anything that does run JS, so the binder only fills a page that ships none.
      if (doc.site.name && !document.title.trim()) {
        document.title = (doc.site.seo && doc.site.seo.title) || doc.site.name;
      }
      const ann = document.querySelector('[data-role="announcement"]');
      if (ann && doc.site.announcement) ann.textContent = doc.site.announcement;
    }
    // Record the document however it arrived. This used to be set only by load(),
    // so a caller that applied a document directly — the builder's preview, which
    // has no URL to fetch from — left SITES.contentDoc undefined, and every tile
    // behaviour that reads it at init silently did nothing. visit.js's "open now"
    // line was the visible symptom.
    SITES.contentDoc = doc;
    document.dispatchEvent(new CustomEvent('sites:content', { detail: { applied, doc } }));
    return applied;
  }

  /** Fetch the backend copy file and bind it. */
  async function load(url) {
    const src = url || document.body.getAttribute('data-content') ||
      (document.querySelector('script[data-content]') || {}).getAttribute?.('data-content') || '/content.json';
    try {
      const res = await fetch(src, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const doc = await res.json();
      applyContent(doc);   // records SITES.contentDoc
      return doc;
    } catch (err) {
      console.warn('[SITES] content not loaded (' + src + '):', err.message, '— keeping predefined copy.');
      return null;
    }
  }

  SITES.content = { load, apply: applyContent, applyConfig, applyEntry, applyLayout, bindObject, renderList, applyPlate, applyTileCss, plateModes: PLATE_MODES };
})();