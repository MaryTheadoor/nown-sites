/* ==========================================================================
   tile-registry.js — S.I.T.E.S tile field registry ("predefined fields")
   Declares, per tile type, which copy fields are editable and what kind of input
   each uses. Shared by: the admin form generator, the content binder, validation.
   ========================================================================== */
(function () {
  'use strict';
  const SITES = (window.SITES = window.SITES || {});

  // Field types: text | textarea | richtext(opt-in) | url | image | items | actions | select | boolean
  const F = {
    text: (key, label) => ({ key, label, type: 'text' }),
    area: (key, label) => ({ key, label, type: 'textarea' }),
    url: (key, label) => ({ key, label, type: 'url' }),
  };

  SITES.tileRegistry = {
    /* ---- chrome ---- */
    announcement: { label: 'Announcement', group: 'chrome', fields: [F.text('text', 'Message')] },
    'nav-dock': {
      // Nav links are SITE-LEVEL (content.json -> nav[]), rendered into
      // [data-role="nav-links"], so this tile declares no editable fields.
      label: 'Navigation (links are site-level)', group: 'chrome',
      fields: [],
    },
    footer: {
      label: 'Footer', group: 'chrome',
      fields: [F.text('brand', 'Brand'), F.area('tagline', 'Tagline'),
        { key: 'links', label: 'Footer links', type: 'actions',
          itemFields: [F.text('label', 'Label'), F.url('href', 'Href')] },
        F.text('copyright', 'Copyright')],
    },

    /* ---- hero / cta ---- */
    hero: {
      label: 'Hero', group: 'hero',
      fields: [F.text('headline', 'Headline'), F.area('body', 'Sub-copy'),
        { key: 'media', label: 'Image', type: 'image',
          itemFields: [F.url('src', 'Image URL'), F.text('alt', 'Alt text')] },
        { key: 'actions', label: 'Buttons', type: 'actions',
          itemFields: [F.text('label', 'Label'), F.url('href', 'Href')] }],
    },
    cta: {
      label: 'CTA band', group: 'hero',
      fields: [F.text('headline', 'Headline'), F.area('body', 'Body'),
        { key: 'actions', label: 'Buttons', type: 'actions',
          itemFields: [F.text('label', 'Label'), F.url('href', 'Href')] }],
    },

    /* ---- compact keywords / SEO ---- */
    'keyword-landing': {
      label: 'Keyword landing', group: 'conversion',
      fields: [F.text('headline', 'Headline (compact keyword)'), F.area('body', 'Body copy'),
        { key: 'media', label: 'Image', type: 'image', itemFields: [F.url('src', 'Image URL'), F.text('alt', 'Alt text')] },
        F.text('caption', 'Image caption (optional)'),
        { key: 'actions', label: 'Buttons', type: 'actions', itemFields: [F.text('label', 'Label'), F.url('href', 'Href')] },
        F.text('quote', 'Proof quote (optional)'), F.text('attribution', 'Proof attribution (optional)')],
    },
    'compact-keywords': {
      label: 'Compact keywords index', group: 'content',
      fields: [F.text('title', 'Section title'), F.area('intro', 'Intro'),
        { key: 'items', label: 'Keyword pages', type: 'items',
          itemFields: [F.text('keyword', 'Keyword phrase'), F.area('description', 'Short description'), F.url('href', 'Page URL'), F.text('label', 'Link label')] }],
    },

    /* ---- cards ---- */
    'content-card': {
      label: 'Content card', group: 'content',
      fields: [F.text('headline', 'Title'), F.area('body', 'Body'),
        { key: 'media', label: 'Image', type: 'image', itemFields: [F.url('src', 'Image URL'), F.text('alt', 'Alt text')] },
        { key: 'actions', label: 'Link', type: 'actions', itemFields: [F.text('label', 'Label'), F.url('href', 'Href')] }],
    },
    code: {
      label: 'Code / snippet', group: 'content',
      fields: [F.text('title', 'Title'), F.text('language', 'Language'),
        F.area('code', 'Code')],
    },
    media: { label: 'Image', group: 'content', fields: [
      { key: 'media', label: 'Image', type: 'image', itemFields: [F.url('src', 'Image URL'), F.text('alt', 'Alt text')] },
      F.text('caption', 'Caption')] },
    video: { label: 'Video', group: 'content', fields: [F.url('src', 'Embed URL'), F.text('caption', 'Caption')] },
    gallery: { label: 'Gallery', group: 'content', fields: [F.text('title', 'Title'), F.area('body', 'Intro'),
      { key: 'items', label: 'Images', type: 'items',
        itemFields: [F.url('src', 'Image URL'), F.text('alt', 'Alt text')] },
      { key: 'actions', label: 'Link', type: 'actions',
        itemFields: [F.text('label', 'Label'), F.url('href', 'Href')] }] },
    feature: {
      label: 'Feature / value props', group: 'content',
      fields: [F.text('title', 'Section title'),
        { key: 'items', label: 'Items', type: 'items',
          itemFields: [F.text('title', 'Title'), F.area('body', 'Body')] },
        { key: 'actions', label: 'Link', type: 'actions', itemFields: [F.text('label', 'Label'), F.url('href', 'Href')] }],
    },
    team: { label: 'Team member', group: 'content', fields: [F.text('name', 'Name'), F.text('role', 'Role'),
      { key: 'media', label: 'Photo', type: 'image', itemFields: [F.url('src', 'Image URL'), F.text('alt', 'Alt text')] }] },
    testimonial: { label: 'Testimonial', group: 'content', fields: [F.area('quote', 'Quote'), F.text('attribution', 'Attribution')] },
    quote: { label: 'Pull quote', group: 'content', fields: [F.area('quote', 'Quote'), F.text('attribution', 'Attribution')] },
    products: {
      label: 'Products (links out)', group: 'commerce',
      fields: [F.text('title', 'Section title'), F.area('intro', 'Intro'),
        { key: 'items', label: 'Items', type: 'items',
          itemFields: [F.url('src', 'Image URL'), F.text('alt', 'Alt text'), F.text('title', 'Name'),
                       F.text('price', 'Price'), F.url('href', 'Link to the item page'),
                       F.text('label', 'Link label'), F.text('status', 'Badge (Sold, On hold…)')] },
        F.text('note', 'Note under the grid')],
    },
    product: { label: 'Product', group: 'commerce', fields: [F.text('title', 'Name'), F.text('price', 'Price'), F.text('variant', 'Variant'),
      { key: 'media', label: 'Image', type: 'image', itemFields: [F.url('src', 'Image URL'), F.text('alt', 'Alt text')] }] },
    menu: { label: 'Menu', group: 'commerce', fields: [F.text('title', 'Title'),
      { key: 'categories', label: 'Categories', type: 'items',
        itemFields: [F.text('name', 'Category'), F.text('items', 'Items (name|price, comma-separated)')] }] },
    pricing: { label: 'Pricing tier', group: 'commerce', fields: [F.text('tier', 'Tier name'), F.text('price', 'Price'),
      { key: 'features', label: 'Features (one per line)', type: 'textarea' },
      { key: 'actions', label: 'Button', type: 'actions', itemFields: [F.text('label', 'Label'), F.url('href', 'Href')] }] },
    faq: { label: 'FAQ', group: 'conversion', fields: [F.text('title', 'Title'),
      { key: 'items', label: 'Questions', type: 'items',
        itemFields: [F.text('question', 'Question'), F.area('answer', 'Answer')] }] },
    social: { label: 'Social links', group: 'conversion', fields: [
      { key: 'links', label: 'Links', type: 'actions', itemFields: [F.text('label', 'Short label'), F.url('href', 'Href')] }] },

    /* ---- local traffic ---- */
    visit: {
      label: 'Visit us', group: 'conversion',
      fields: [F.text('headline', 'Heading'), F.text('address', 'Address'),
        F.text('note', 'Note (parking, entrance…)'),
        { key: 'actions', label: 'Actions (directions, call)', type: 'actions',
          itemFields: [F.text('label', 'Label'), F.url('href', 'Href')] },
        F.text('hoursTitle', 'Hours heading'),
        { key: 'hours', label: 'Opening hours (one line per row)', type: 'textarea' }],
    },

    /* ---- footer / conversion ---- */
    contact: { label: 'Contact', group: 'conversion', fields: [F.text('headline', 'Heading'), F.area('body', 'Body'),
      { key: 'lines', label: 'Contact lines', type: 'items',
        itemFields: [F.text('label', 'Label'), F.text('value', 'Value'), F.url('href', 'Link (optional)')] }] },
    'contact-form': { label: 'Contact form', group: 'conversion', fields: [F.text('title', 'Title'),
      { key: 'provider', label: 'Provider', type: 'select', options: ['formspree', 'tally', 'staticforms', 'http'] },
      F.url('endpoint', 'Endpoint URL')] },
    map: { label: 'Map', group: 'conversion', fields: [F.text('center', 'Center (lat,lng)'), F.text('zoom', 'Zoom'), F.text('marker', 'Marker label')] },
    event: { label: 'Booking / calendar', group: 'conversion', fields: [F.text('title', 'Title'), F.area('body', 'Body'),
      F.url('calendarUrl', 'Calendar embed URL')] },
    search: { label: 'Search', group: 'conversion', fields: [F.text('placeholder', 'Placeholder'), F.url('index', 'Index path')] },
  };


  /* ---- tile metadata ------------------------------------------------------
     What the catalog needs beyond the editable fields: a glyph and a one-line
     description for the builder library, and whether the tile is content or
     chrome (chrome tiles belong to the page frame, so the library shows them
     under a Chrome heading rather than in the catalog list).

     NB: four tiles do NOT follow the documented .tile-<name> root convention —
       content-card -> .tile-card        feature -> .tile-feature-block
       pricing      -> .tile-price       nav-dock -> .nav-dock (no tile- prefix)
     Nothing derives a selector from the type name today, so this is a
     documentation mismatch rather than a bug, and MODULE-SPEC.md records it. Do
     not add a rootClass field here unless something actually consumes it: the
     variant class is built from the TYPE name and lands on whatever root the
     snippet has, so it works either way.
  ------------------------------------------------------------------------- */
  const TILE_META = {
    announcement: { icon: "✦", about: "A thin strip above the nav for a notice or offer.", role: 'chrome' },
    'nav-dock': { icon: "≡", about: "The floating pill navigation. Its links come from the content file, not from tile config.", role: 'chrome' },
    footer: { icon: "▁", about: "Brand, a row of links and the legal line at the foot of every page.", role: 'chrome' },
    hero: { icon: "◆", about: "The opening band: one headline, one sentence, buttons, optional image.", role: 'content' },
    cta: { icon: "➜", about: "A closing band that asks for the next step.", role: 'content' },
    'keyword-landing': { icon: "◈", about: "One compact keyword per page. The headline IS the keyword.", role: 'content' },
    'compact-keywords': { icon: "⊞", about: "The hub: one card per keyword landing page, each a real link in the served HTML.", role: 'content' },
    'content-card': { icon: "▢", about: "A heading, a paragraph and a link. The workhorse card.", role: 'content' },
    code: { icon: "<>", about: "A code or command block.", role: 'content' },
    media: { icon: "▣", about: "One image with an optional caption.", role: 'content' },
    video: { icon: "▶", about: "An embed that loads only when scrolled into view.", role: 'content' },
    gallery: { icon: "▦", about: "An auto-fit image grid.", role: 'content' },
    feature: { icon: "☰", about: "Repeating value props. The most-used tile.", role: 'content' },
    team: { icon: "☺", about: "A person card: photo, name, role.", role: 'content' },
    testimonial: { icon: "❝", about: "Social proof with an attribution.", role: 'content' },
    quote: { icon: "❞", about: "A pull quote, no attribution framing.", role: 'content' },
    products: { icon: "▤", about: "A curated showcase where each item links out to where it is already sold.", role: 'content' },
    product: { icon: "▥", about: "A single item card.", role: 'content' },
    menu: { icon: "≣", about: "A menu with categories and prices.", role: 'content' },
    pricing: { icon: "tag", about: "One pricing tier; repeat for a table.", role: 'content' },
    faq: { icon: "?", about: "Questions in a native accordion, so it works with no JavaScript.", role: 'content' },
    social: { icon: "✳", about: "A row of social links.", role: 'content' },
    visit: { icon: "⌖", about: "Where you are, when you are open, and how to get there.", role: 'content' },
    contact: { icon: "✉", about: "Static contact details.", role: 'content' },
    'contact-form': { icon: "✎", about: "A working form with no backend — it posts to an embeddable endpoint.", role: 'content' },
    map: { icon: "◎", about: "A privacy-first map: Leaflet and OpenStreetMap, no API key.", role: 'content' },
    event: { icon: "◷", about: "Scheduling without leaving the page.", role: 'content' },
    search: { icon: "⌕", about: "Static full-text search over the site.", role: 'content' },
  };

  // Merged into the registry so every consumer — admin, builder, check-site — reads
  // one object per tile instead of joining two tables.
  Object.keys(SITES.tileRegistry).forEach((type) => {
    Object.assign(SITES.tileRegistry[type], TILE_META[type] || {});
  });

  // Tiles that ship a behaviour module (src/modules/<type>.js). DECLARED, not
  // probed: the builder used to fetch src/modules/<type>.js for every tile it
  // added, which logged a 404 for every tile that has none — noise in the console
  // and a wasted request each time. check-tiles keeps this list honest by failing
  // when a declared behaviour has no file, or a file has no declaration.
  const TILE_BEHAVIOURS = ['contact-form', 'event', 'faq', 'map', 'nav-dock', 'product', 'search', 'video', 'visit'];
  TILE_BEHAVIOURS.forEach((type) => {
    if (SITES.tileRegistry[type]) SITES.tileRegistry[type].behaviour = true;
  });
  /* ---- chrome variants -----------------------------------------------------
     The shapes a tile can take, declared ONCE here and read by the builder (which
     renders the picker), the schema (which documents them) and check-site (which
     fails on a variant that does not exist). An empty name is the default shape and
     writes no variant at all, so a site that wants the framework's own look exports
     a clean entry.

     Each name must have a matching .tile-<type>--<name> rule in nown-tiles.css —
     check-site enforces that both ways, because a variant with no CSS is a class
     that silently does nothing.
  ------------------------------------------------------------------------- */
  SITES.tileVariants = {
    'nav-dock': [
      { name: '', label: 'Floating dock', about: 'The signature pill, centred under the header.' },
      { name: 'bar', label: 'Full-width bar', about: 'Square, edge to edge, links centred. Reads as a conventional site header.' },
      { name: 'minimal', label: 'Minimal', about: 'The theme toggle alone. The links stay in the served HTML — a nav that deletes its own destinations costs the crawl path — but are hidden from sight.' },
    ],
    footer: [
      { name: '', label: 'Full', about: 'Brand and tagline, the link row, then the legal line.' },
      { name: 'simple', label: 'One row', about: 'Brand and links side by side with the legal line beneath. About half the height.' },
      { name: 'minimal', label: 'Legal line only', about: 'Just the copyright. The brand and links are hidden, not removed, so the crawl path survives.' },
    ],
    // This one predates the variant model: every snippet and page hardcodes
    // class="tile tile-cta tile-cta--center" in the markup, so the class existed and
    // the content model could not express it. Declaring it makes it selectable like
    // any other variant, and the check-site gate that found it now passes honestly
    // rather than being silenced.
    cta: [
      { name: '', label: 'Left aligned', about: 'Heading and buttons start at the left edge.' },
      { name: 'center', label: 'Centred', about: 'Heading and buttons centred. What the catalog snippets ship with.' },
    ],
  };

  /* ---- per-tile CSS: the lint ----------------------------------------------
     A tile can carry a small block of CSS of its own (entry.css) — the cosmetic
     escape hatch: a padding tweak, a background, a border. It is DECLARATIONS ONLY
     and the framework scopes it for the author, wrapping it in
     [data-tile-id="…"], so it cannot reach another tile.

     Three rules follow, and they live HERE rather than in their own module because
     every page already loads tile-registry.js and tools/check-site.mjs already
     loads it with new Function(). A separate file would mean 28 script tags and a
     page that silently skips the check by missing one.

       1. NO BRACES. A "}" closes the scope the framework opened and everything
          after it becomes page-wide CSS. That is not a style preference; it is the
          safety property, and it is enforced before the text reaches a stylesheet.
       2. NO AT-RULES. @media cannot appear in a declaration list, and @import would
          add a second stylesheet, which rule 6 forbids.
       3. NO RAW COLOURS. Rule 3. A hardcoded #hex is the one thing that cannot
          survive a re-theme, and re-theming is what this escape hatch exists to
          respect.
  ------------------------------------------------------------------------- */
  const CSS_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g;

  /** The scope a tile's CSS block is wrapped in. */
  const cssScope = (id) => '[data-tile-id="' + String(id).replace(/["\\]/g, '\\$&') + '"]';

  /** Wrap a tile's declarations so they can only ever apply to that tile. */
  function cssWrap(id, css) {
    const body = String(css == null ? '' : css).trim();
    if (!body) return '';
    return cssScope(id) + ' {\n' + body.split('\n').map((l) => '  ' + l).join('\n') + '\n}';
  }

  /**
   * @returns {Array<{level, message, line}>} empty when the block is safe and obeys
   *   rule 3. The builder shows these as you type; check-site fails on any error,
   *   from this same function.
   */
  function cssCheck(css) {
    const out = [];
    const text = String(css == null ? '' : css);
    if (!text.trim()) return out;
    const lineOf = (i) => text.slice(0, i).split('\n').length;

    // Braces first: nothing else matters if the scope can escape.
    let m = text.match(/[{}]/);
    if (m) {
      out.push({ level: 'error', line: lineOf(text.indexOf(m[0])), message: 'No braces. The block is scoped to this tile for you — a brace would close that scope and the rest would apply to the whole page.' });
    }
    m = text.match(/@[a-zA-Z-]+/);
    if (m) {
      out.push({ level: 'error', line: lineOf(text.indexOf(m[0])), message: '"' + m[0] + '" cannot appear inside a tile block. Put the responsive rule in the tile snippet or the framework instead.' });
    }
    // Angle brackets. The block ends up inside a <style> element, so "</style>"
    // would close it early and everything after would land in the document as HTML.
    // A declaration list has no legitimate use for either character.
    m = text.match(/[<>]/);
    if (m) {
      out.push({ level: 'error', line: lineOf(text.indexOf(m[0])), message: '"' + m[0] + '" cannot appear in a tile block — the CSS is written into a <style> element, and a tag-like sequence would close it early.' });
    }
    // Colours, ignoring anything inside var(…).
    const stripped = text.replace(/var\([^)]*\)/g, ' ');
    CSS_COLOUR.lastIndex = 0;
    let c;
    const seen = Object.create(null);
    while ((c = CSS_COLOUR.exec(stripped)) !== null) {
      if (seen[c[0]]) continue;
      seen[c[0]] = true;
      out.push({ level: 'error', line: lineOf(c.index), message: '"' + c[0] + '" is a hardcoded colour. Use a token — var(--color-accent), var(--color-surface-2) — so the tile survives a re-theme and dark mode.' });
    }
    if (/!important/.test(text)) {
      out.push({ level: 'warn', line: lineOf(text.indexOf('!important')), message: '!important usually means this is fighting the tile it belongs to. Check whether the tile already exposes a token for it.' });
    }
    return out;
  }

  SITES.cssLint = { check: cssCheck, scope: cssScope, wrap: cssWrap };

  SITES.tileBehaviours = TILE_BEHAVIOURS;
  SITES.tileMeta = TILE_META;
  /** Look up the field list for a tile type (empty if unregistered). */
  SITES.fieldsFor = (type) => (SITES.tileRegistry[type] && SITES.tileRegistry[type].fields) || [];
})();