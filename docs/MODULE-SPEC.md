# S.I.T.E.S Module Spec

How to build a compliant S.I.T.E.S **tile** (a.k.a. module). A tile is a
self-contained unit that occupies one slot in the grid and owns one piece of
content. Tiles are portable, reusable, and safe to reorder/duplicate/delete.

---

## 1. Naming conventions

- **Tile root class:** `tile-<name>` — kebab-case, semantic. e.g. `.tile-hero`,
  `.tile-contact`, `.tile-product`.
- **State / variant:** a modifier `tile-<name>--<variant>`. e.g. `tile-hero--dark`,
  `tile-card--outline`.
- **Inner elements:** `data-role` attributes, not generic classes. e.g.
  `data-role="headline"`, `data-role="media"`, `data-role="body"`, `data-role="action"`.
- **JS hook:** `data-tile="<name>"` on the root (the single init/anchor attribute).
- **Never:** utility-class spam, inline `style="..."`, or global selectors that leak.

### List containers ship a placeholder

A list slot holds a `<template>` (inert) **and one static placeholder instance**.
The binder removes non-template children before rendering real items, so:

- with no items yet, the tile still shows its shape (and reads fine with JS off);
- with items, the placeholder is replaced.

```html
<div class="sites-grid" data-role="items">
  <article class="tile tile-feature"><h3 data-role="title">First benefit</h3><p data-role="body">A short line.</p></article>
  <template><article class="tile tile-feature"><h3 data-role="title"></h3><p data-role="body"></p></article></template>
</div>
```

This is why a freshly added tile in the builder previews correctly instead of
rendering an empty box.

### Minimal HTML skeleton

```html
<section class="tile tile-hero" data-tile="hero">
  <div class="tile__content" data-role="content">
    <h1 data-role="headline">Headline</h1>
    <p data-role="body">Supporting copy.</p>
    <a class="btn btn-tactile btn-gold-tactile" data-role="action" href="/start">Start</a>
  </div>
  <figure class="tile__media" data-role="media">
    <img src="…" alt="…" loading="lazy" />
  </figure>
</section>
```

---

## 2. File structure

Each tile lives under `src/modules/<category>/<name>.html`, with an optional
behaviour module beside it. The snippet's basename **is** the tile type — that is
what `data-tile`, the registry and the builder all key on.

```
src/modules/cards/product.html   # the markup snippet (copy-able)
src/modules/cards/product.js     # optional; registers SITES.register('product', {...})
```

Styles are not per-tile: every tile's CSS lives in `src/css/nown-tiles.css`, so a
page loads one stylesheet rather than one per tile. A snippet must therefore carry
no `<style>` block of its own.

`tools/sync-site-runtime.sh` publishes these snippets into the framework site
(`site/public/src/modules/`, flattened, since the basename is the type) because
`builder.html` fetches them at runtime to compose its preview.

Category groups:
- `navigation/` — nav-dock, announcement, theme-toggle
- `hero/` — hero, cta
- `cards/` — content-card, media, video, gallery, feature, team, testimonial, quote,
  product, menu, pricing, faq, social
- `footer/` — footer, contact, contact-form, map, search, event/calendar

---

## 3. CSS contract (the rules a tile MUST follow)

1. **Tokens only.** No literal hex/rgba/px for colors, radii, shadows, or spacing.
   Use `var(--color-*)`, `var(--radius-*)`, `var(--shadow-*)`, `var(--space-*)`.
2. **Scope everything.** Prefix all rules with `.tile-<name>` (or use the
   `tile-<name>__<part>` BEM-ish blocks). Never select elements globally.
3. **No page media queries.** Macro placement comes from the grid — either
   `.sites-grid` (automatic `auto-fit`) or `.sites-grid--cols` with a per-tile
   `data-span`. Intra-tile reflow comes from container queries on the tile root,
   with the rule written against an **inner** element (never the container itself,
   which can never match its own query). See `ARCHITECTURE.md` §4–§5.
4. **Add dark mode via `[data-theme="dark"]` overrides only where the tile needs a
   different surface**; never redefine the global palette.
5. **Media safety.** Media wrappers use `aspect-ratio` + `object-fit`; images get
   `loading="lazy"` (and `width`/`height` where sensible).

### Example

```css
/* product.css */
.tile-product { container-type: inline-size; display: grid; gap: var(--space-4); }
.tile-product__title { font: var(--font-display); color: var(--color-text); }
.tile-product__price { color: var(--color-primary); font-weight: 600; }
.tile-product__media { aspect-ratio: 1 / 1; overflow: hidden; border-radius: var(--radius-lg); }
.tile-product__media img { width: 100%; height: 100%; object-fit: cover; }
.tile-product .btn-tactile { width: 100%; }
@container (min-width: 480px) {
  .tile-product { grid-template-columns: 1fr auto; align-items: center; }
}
```

---

## 4. JavaScript contract

- Register via `SITES.register('<name>', { init(el) {…}, destroy?(el) {…} })`.
- `init` receives the tile root element; **never** query the whole document.
- No globals, no external deps. Enhance progressively; do not mutate the DOM in a
  way that breaks rendering without JS.
- Keep behavior private to the tile; expose nothing on `window` except the module
  through the registry.

```js
SITES.register('event', {
  init(tile) {
    const btn = tile.querySelector('[data-role="open"]');
    if (btn) btn.addEventListener('click', (e) => { /* toggle calendar */ e.preventDefault(); });
  },
});
```

---

## 5. Data contract

- Content lives in either `data-*` attributes on elements or a small JSON config
  object (see `ai-skill/sites-schema.json`). Do **not** scrape content out of the DOM.
- For dynamic/templated content, the tile should accept a config and render
  (client-side), or the content is authored directly into the source (server-side)
  — the choice is per-site. The schema describes the shape either way.

---

## 6. Integration tiles

Some tiles are thin wrappers around an embeddable service. Keep them **disconnected
from the service's identity** and set config via `data-*` / config fields:

- Form → `data-form-endpoint`, `data-form-provider`
- Calendar → `data-calendar-url` (Cal.com / SavvyCal)
- Buy button → `data-sku`, `data-price` (Snipcart / Stripe)
- Map → `data-center`, `data-zoom` (Leaflet + OSM)
- Search → `data-index` (Pagefind)

---

## 7. Compliance checklist (lint, by hand or agent)

- [ ] Root has `class="tile tile-<name>"` and `data-tile="<name>"`.
- [ ] Inner parts use `data-role`; classes are `tile-<name>__<part>`.
- [ ] No hardcoded colors/radius/shadows/spacing — only `var(--*)`.
- [ ] No page-level media queries; grid placement via `.sites-grid` / `data-span`.
- [ ] Container queries target an element *inside* the container, never the container.
- [ ] No global selectors; everything scoped to the tile.
- [ ] Media uses `aspect-ratio` + `object-fit` + `loading="lazy"`.
- [ ] JS (if any) registers via `SITES.register` and is scoped to the element.
- [ ] Dark mode respected via tokens + `[data-theme="dark"]` overrides.
- [ ] Works with zero-JS (content not JS-dependent).
- [ ] Every field the registry declares has a slot (`data-role`) or a `data-*`
      attribute in the snippet — the linter enforces this.
- [ ] List containers (`data-role="items"`, `actions`, `lines`, `categories`) ship
      **one static placeholder instance** beside the `<template>`.

---

## 8. Tile catalog (canonical, v1 core)

**Structural / chrome (every page):** `nav-dock`, `announcement`, `footer`, `theme-toggle`.

**Local traffic:** `visit`, `today`. **Commerce (links out):** `products`.

**SEO / conversion (Compact Keywords):** `keyword-landing`, `compact-keywords`.

**Presentation / content cards:** `hero`, `content-card`, `media`, `video`,
`gallery`, `feature`, `team` (`profile`), `testimonial`, `quote`, `cta`.

**Function / commerce:** `product`, `event` (`calendar`), `contact-form`,
`contact`, `map`, `menu`, `pricing`, `faq`, `search`, `social`.

**v1 scope for the Nown Digital rebuild (≈14 tiles):** `nav-dock`, `announcement`,
`hero`, `content-card`, `feature`, `media`, `video`, `testimonial`, `team`, `cta`,
`contact-form`, `contact`, `footer`, `theme-toggle`.

## 9. Local-traffic tiles

The launch focus is causing real-world visits (docs/LOCAL-TRAFFIC.md), so the two
tiles that answer *where, when and how do I get there* are first-class.

### `visit`

The foot-traffic block. Every action is a plain link, so it works with no JS.

```html
<section class="tile tile-visit" data-tile="visit" data-tile-id="home-visit">
  <div class="tile-visit__grid">
    <div class="tile-visit__place">
      <h2 data-role="headline">Visit us on East 6th</h2>
      <address class="tile-visit__address" data-role="address">1200 E 6th St, Austin, TX 78702</address>
      <p class="tile-visit__note" data-role="note"></p>
      <div class="tile-visit__actions" data-role="actions">
        <template><a class="btn btn-tactile btn-gold-tactile" data-role="action" href=""><span data-role="label"></span></a></template>
      </div>
    </div>
    <div class="tile-visit__when">
      <h3 data-role="hoursTitle">Opening hours</h3>
      <p class="tile-visit__state" data-role="openState" hidden></p>
      <ul class="tile-visit__hours" data-role="hours"><li>Mon–Fri 9:00–19:00</li></ul>
    </div>
  </div>
</section>
```

Fields: `headline`, `address`, `note`, `actions` (`[{label, href, style}]`), `hoursTitle`,
`hours` (one row per line).

**`directions` belongs in `actions`** as a Google Maps link — take it from the business's
Maps listing (Share → Copy link), because that pins the real place where a geocoded
address guess may not. `visit.js` derives one from `address` if the first action has no
href, but the explicit link is correct without JavaScript.

**`openState` is filled by `visit.js`** from `site.business.openingHours` — the same list
`tools/seo.mjs` turns into JSON-LD. It stays hidden unless hours are known, so a page
with no content file shows the plain hours list rather than a wrong answer.

> **The gate.** `check-site.mjs` fails when a `visit` tile shows hours and
> `site.business.openingHours` is empty: a human would see the hours and a search
> engine would not. It warns when the two disagree on row count. Two representations,
> one truth — see docs/LOCAL-TRAFFIC.md §5.

### `today` *(planned)*

A food truck's location changes daily and is the whole reason someone looks.
Not built yet; see docs/LOCAL-TRAFFIC.md §5 item 3.

---

## 10. Commerce tile — links out

### `products`

A curated showcase where every item links **out** to where the business already sells
it. No cart, no checkout, no provider. See docs/COMMERCE.md for why that is the launch
scope.

```html
<section class="tile tile-products" data-tile="products" data-tile-id="home-products">
  <div class="tile-products__intro">
    <h2 data-role="title">In stock right now</h2>
    <p data-role="intro"></p>
  </div>
  <div class="sites-grid" data-role="items">
    <template>
      <article class="tile tile-product-card">
        <div class="media media--1x1"><img data-role="src" src="" alt="" loading="lazy" /></div>
        <h3 data-role="title"></h3>
        <p class="tile-product-card__price" data-role="price"></p>
        <a class="btn btn-ghost" data-role="action" href=""><span data-role="label"></span></a>
      </article>
    </template>
  </div>
  <p class="tile-products__note" data-role="note"></p>
</section>
```

Fields: `title`, `intro`, `items` (`[{src, alt, title, price, href, label, status}]`),
`note`. Item keys are **flat** — `bindItem` binds top-level keys, so a nested `media`
object would arrive as `[object Object]`. This matches the `gallery` tile.

Items without a `src` render no image: an unfilled `.media` hides itself rather than
drawing a broken-image glyph (see docs/ARCHITECTURE.md).

---

## 9. Compact Keywords tiles (SEO)

Two tiles support Edward Sturm's *Compact Keywords* methodology: specific,
bottom-of-funnel landing pages that match what a ready buyer actually types.

### `keyword-landing`

One compact keyword per page. The headline should contain the keyword phrase;
the body copy addresses the specific purchase intent in ~300–500 words. Use on
its own page and point `compact-keywords` cards at it.

```html
<section class="tile tile-keyword-landing" data-tile="keyword-landing" data-tile-id="sell-guitars-city">
  <div class="tile-keyword-landing__content">
    <h1 data-role="headline">Sell guitars in [City]</h1>
    <div data-role="body"><p>…</p></div>
    <div class="tile-keyword-landing__actions" data-role="actions">
      <template>
        <a class="btn btn-tactile btn-gold-tactile" data-role="action"><span data-role="label"></span></a>
      </template>
    </div>
  </div>
</section>
```

Config keys: `headline`, `body`, `actions`, `media` (`{src, alt, caption}`),
`quote`, `attribution`.

### `compact-keywords`

A cluster index: cards that link to every `keyword-landing` page. Drop it on
the home page or a "services" page.

```html
<section class="tile tile-compact-keywords" data-tile="compact-keywords" data-tile-id="services-cluster">
  <div class="tile-compact-keywords__intro">
    <h2 data-role="title">…</h2>
    <p data-role="intro">…</p>
  </div>
  <div class="sites-grid" data-role="items">
    <template>
      <article class="tile tile-keyword-card">
        <h3 data-role="keyword"></h3>
        <p data-role="description"></p>
        <a class="btn btn-ghost" data-role="action"><span data-role="label">Learn more</span></a>
      </article>
    </template>
  </div>
</section>
```

Config keys: `title`, `intro`, `items` (`[{keyword, description, href, label}]`).