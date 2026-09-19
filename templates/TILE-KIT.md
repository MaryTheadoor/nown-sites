# The Tile Kit

Every tile in the S.I.T.E.S catalog, ready to **copy and paste**. No AI required,
no build step, no dependencies.

**The loop, four steps:**

1. **Copy** a tile's markup from below.
2. **Paste** it inside `<main>` in your page (start from `templates/plate.html`).
3. **Add** the matching entry to `content.json` — same `id` as the markup's `data-tile-id`.
4. **Save and refresh.** Your words appear.

Rules that keep it working:

- `data-tile-id` in the markup **must match** `id` in `content.json`.
- `data-role="…"` slots are where content lands — don't rename them.
- List tiles (feature, gallery, faq, pricing…) use a `<template>` child that is
  cloned once per item. Leave the template's slots **empty**; your text goes in
  `content.json`.
- Each list container also ships **one static placeholder instance** beside the
  template. It is what you see before any items exist (and with JavaScript off); the
  binder removes it the moment real items arrive. Keep it when you copy.
- Never hardcode colours — use the tokens in `src/css/nown-plate.css`. To re-skin
  the whole site, edit the `theme` block in `content.json`.

**Contents:** [chrome](#chrome) · [hero](#hero) · [compact keywords](#compact-keywords) · [cards](#cards) · [commerce](#commerce) · [conversion](#conversion) · [adding your own tile](#adding-your-own-tile)

---

## Layout & the grid

Tiles go inside a grid. There are two, and you pick per row.

**Automatic** — as many columns as fit. Nothing to configure.

```html
<div class="sites-grid">
  <article class="tile tile-feature">…</article>
  <article class="tile tile-feature">…</article>
  <article class="tile tile-feature">…</article>
</div>
```

**Configured** — a real column grid when a row should be deliberately uneven:
**12 columns** on wide containers, **6** on narrow ones.

```html
<div class="sites-grid sites-grid--cols">
  <article class="tile tile-card" data-span="4">one third</article>
  <article class="tile tile-card" data-span="4">one third</article>
  <article class="tile tile-card" data-span="4">one third</article>

  <article class="tile tile-card" data-span="8">two thirds</article>
  <article class="tile tile-card" data-span="4">one third</article>

  <article class="tile tile-card" data-span-sm="2" data-span="4">three across on a phone, one third on desktop</article>
</div>
```

| You write | You get |
|---|---|
| `data-span="4"` | one third of the wide grid |
| `data-span="8"` | two thirds |
| `data-span-sm="2"` | one third of the narrow grid (3 across on a phone) |
| *(nothing)* | full width — the safe default |

**Alignment helpers**

| Class | Effect |
|---|---|
| `.sites-grid--start` | tiles size to their content instead of stretching to equal heights |
| `.sites-grid--center` | vertically centre tiles of differing heights |
| `.tile--center` | centre a tile's text **and** its button row |
| `.tile--end` | push text and buttons to the end |

Buttons inside cards, pricing tiers and products already sit on the row baseline —
however much copy the neighbouring tiles carry.

> **Resizing is automatic.** The tiers switch on the width of the grid itself, not
> the device, so the same row behaves correctly in a wide main column and a narrow
> sidebar. There is no breakpoint to write. See the live demo at `site/public/grid.html`.

---

## Chrome

### `announcement`
A thin strip above the nav. Announcements, offers, a status line.

```html
<div class="tile-announcement" data-tile="announcement" data-tile-id="chrome-announcement">
  <span data-role="text">Welcome — replace this line.</span>
</div>
```
```json
{ "id": "chrome-announcement", "type": "announcement", "config": { "text": "Free shipping over $100" } }
```

### `nav-dock`
The floating pill navigation. **Links come from `content.json` → `nav[]`**, not from
the markup, so adding a page never means touching HTML.

```html
<nav class="nav-dock" data-tile="nav-dock" aria-label="Primary">
  <div class="nav-dock__links" data-role="nav-links">
    <template><a class="nav-dock-link" data-role="action"><span data-role="label"></span></a></template>
  </div>
  <button class="nav-dock-link nav-dock-theme" data-role="theme-toggle" type="button" aria-label="Toggle dark mode"><span>Theme</span></button>
</nav>
```
```json
"nav": [ { "label": "Home", "href": "/" }, { "label": "Services", "href": "/services" } ]
```
> The dark/light switcher is the `<button>` above — it needs no extra markup.

### `footer`
```html
<footer class="tile-footer sites-container" data-tile="footer" data-tile-id="chrome-footer">
  <div>
    <div class="tile-footer__brand" data-role="brand">My site</div>
    <p data-role="tagline">Built with S.I.T.E.S.</p>
  </div>
  <div class="tile-footer__legal"><span data-role="copyright">© 2026</span></div>
</footer>
```
```json
{ "id": "chrome-footer", "type": "footer", "config": { "brand": "My site", "tagline": "Built with S.I.T.E.S.", "copyright": "© 2026" } }
```

---

## Hero

### `hero`
Opening band: headline, one sentence, buttons. Use **once per page**.

```html
<section class="tile tile-hero" data-tile="hero" data-tile-id="home-hero">
  <div class="tile-hero__content">
    <h1 data-role="headline">Your headline goes here</h1>
    <p data-role="body">A sentence that explains what this is.</p>
    <div class="tile-hero__actions" data-role="actions">
      <template><a class="btn btn-tactile btn-gold-tactile" data-role="action"><span data-role="label"></span></a></template>
    </div>
  </div>
</section>
```
```json
{ "id": "home-hero", "type": "hero",
  "config": { "headline": "Your headline", "body": "One clear sentence.",
              "actions": [ { "label": "Get started", "href": "/contact", "style": "gold" } ] } }
```
Add a picture with `"media": { "src": "asset:hero", "alt": "…" }` and a
`<figure class="media media--4x3" data-role="media"><img data-role="src" src="" alt=""></figure>`
inside the section.

---

## Compact keywords

### `keyword-landing`

One compact keyword per page. The headline should contain the purchase-intent
phrase you want to rank for.

```html
<section class="tile tile-keyword-landing" data-tile="keyword-landing" data-tile-id="sell-guitars-city">
  <div class="tile-keyword-landing__content">
    <h1 data-role="headline">Sell guitars in [City]</h1>
    <div data-role="body">
      <p>Explain exactly how you solve this specific problem.</p>
    </div>
    <div class="tile-keyword-landing__actions" data-role="actions">
      <template>
        <a class="btn btn-tactile btn-gold-tactile" data-role="action"><span data-role="label"></span></a>
      </template>
    </div>
  </div>
</section>
```
```json
{ "id": "sell-guitars-city", "type": "keyword-landing",
  "config": { "headline": "Sell guitars in [City]",
              "body": "We buy electric, acoustic and vintage guitars same-day. Clean title, no haggling, cash on the spot.",
              "actions": [ { "label": "Get a quote", "href": "/contact", "style": "gold" } ] } }
```

### `compact-keywords`

An index card linking to each keyword-landing page.

```html
<section class="tile tile-compact-keywords" data-tile="compact-keywords" data-tile-id="services-cluster">
  <div class="tile-compact-keywords__intro">
    <h2 data-role="title">Popular searches</h2>
    <p data-role="intro">Find the exact service you need.</p>
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
```json
{ "id": "services-cluster", "type": "compact-keywords",
  "config": { "title": "Popular searches", "intro": "Find the exact service you need.",
              "items": [ { "keyword": "Sell guitars in [City]", "description": "Same-day cash for guitars.", "href": "/sell-guitars.html", "label": "Learn more" } ] } }
```

### `cta`
A closing band that asks for the next step.

```html
<section class="tile tile-cta tile-cta--center" data-tile="cta" data-tile-id="home-cta">
  <div class="glass-card tile-cta__inner">
    <h2 data-role="headline">Ready to start?</h2>
    <p data-role="body">One line of encouragement.</p>
    <div class="tile-hero__actions" data-role="actions">
      <template><a class="btn btn-tactile btn-gold-tactile" data-role="action"><span data-role="label"></span></a></template>
    </div>
  </div>
</section>
```
```json
{ "id": "home-cta", "type": "cta",
  "config": { "headline": "Ready to start?", "body": "One line.",
              "actions": [ { "label": "Book a call", "href": "/contact" } ] } }
```

---

## Cards

### `feature`
Repeating value-props. Drop it in a grid and it flows: 1 column on a phone, more as
the container widens. **The most-used tile.**

```html
<section class="section tile tile-feature-block" data-tile="feature" data-tile-id="home-why">
  <h2 data-role="title">Why us</h2>
  <div class="sites-grid" data-role="items">
    <template><article class="tile tile-feature"><h3 data-role="title"></h3><p data-role="body"></p></article></template>
  </div>
</section>
```
```json
{ "id": "home-why", "type": "feature",
  "config": { "title": "Why us",
              "items": [ { "title": "Fast", "body": "Loads in under a second." },
                         { "title": "Simple", "body": "No build step to maintain." } ] } }
```

### `content-card`
Heading + paragraph + link. Good for articles, services, teasers.

```html
<section class="section tile tile-card" data-tile="content-card" data-tile-id="home-story">
  <h2 data-role="headline">Our story</h2>
  <p data-role="body">Two or three sentences.</p>
  <div data-role="actions">
    <template><a class="tile-card__meta" data-role="action"><span data-role="label"></span></a></template>
  </div>
</section>
```
```json
{ "id": "home-story", "type": "content-card",
  "config": { "headline": "Our story", "body": "Two or three sentences.",
              "actions": [ { "label": "Read more", "href": "/about" } ] } }
```

### `media`
One image with a caption. Space is reserved, so nothing jumps while it loads.

```html
<figure class="tile tile-media" data-tile="media" data-tile-id="about-photo">
  <div class="media media--16x9"><img data-role="src" src="" alt="" loading="lazy" /></div>
  <figcaption data-role="caption"></figcaption>
</figure>
```
```json
{ "id": "about-photo", "type": "media",
  "config": { "media": { "src": "/assets/photo.jpg", "alt": "What the photo shows" },
              "caption": "An optional caption." } }
```
`media--16x9`, `media--4x3`, `media--1x1` set the shape.

### `gallery`
An image grid.

```html
<section class="section tile tile-gallery" data-tile="gallery" data-tile-id="home-work">
  <h2 data-role="title">Our work</h2>
  <p data-role="body">Optional intro.</p>
  <div class="sites-grid" data-role="items">
    <template><figure class="media media--1x1"><img data-role="src" src="" alt="" loading="lazy" /></figure></template>
  </div>
</section>
```
```json
{ "id": "home-work", "type": "gallery",
  "config": { "title": "Our work",
              "items": [ { "src": "/assets/w1.jpg", "alt": "Project one" },
                         { "src": "/assets/w2.jpg", "alt": "Project two" } ] } }
```
> Tip: reference a *logical key* (`"src": "asset:hero"`) and list the real file in
> `content.json` → `assets`. Swapping the image then never touches tile markup.

### `video`
An embed that only loads when scrolled into view.

```html
<div class="tile tile-video" data-tile="video" data-tile-id="home-video"
     data-role="src" data-attr="data-video-src" data-video-src="">
  <div class="media media--16x9">
    <div class="tile-video__placeholder" data-role="placeholder">▶ Play video</div>
  </div>
</div>
```
```json
{ "id": "home-video", "type": "video", "config": { "src": "https://www.youtube.com/embed/VIDEO_ID", "caption": "" } }
```
Needs `<script src="src/modules/video.js"></script>`.

### `team`
A person card.

```html
<article class="tile tile-team" data-tile="team" data-tile-id="team-sarah">
  <div class="media media--1x1"><img data-role="src" src="" alt="" loading="lazy" /></div>
  <h3 data-role="name"></h3>
  <p class="tile-card__meta" data-role="role"></p>
</article>
```
```json
{ "id": "team-sarah", "type": "team",
  "config": { "name": "Sarah Doe", "role": "Founder",
              "media": { "src": "/assets/sarah.jpg", "alt": "Portrait of Sarah" } } }
```

### `testimonial`
Social proof with attribution.

```html
<blockquote class="tile tile-testimonial" data-tile="testimonial" data-tile-id="quote-1">
  <p data-role="quote"></p>
  <footer data-role="attribution"></footer>
</blockquote>
```
```json
{ "id": "quote-1", "type": "testimonial",
  "config": { "quote": "They were great to work with.", "attribution": "A happy client" } }
```

### `quote`
A pull-quote, no attribution framing.

```html
<figure class="tile tile-quote" data-tile="quote" data-tile-id="quote-brand">
  <blockquote data-role="quote"></blockquote>
  <figcaption data-role="attribution"></figcaption>
</figure>
```
```json
{ "id": "quote-brand", "type": "quote",
  "config": { "quote": "Make it once, own it forever.", "attribution": "Our motto" } }
```

### `social`
A row of social links.

```html
<div class="tile tile-social" data-tile="social" data-tile-id="chrome-social" data-role="links">
  <template><a class="btn btn-ghost" data-role="action"><span data-role="label"></span></a></template>
</div>
```
```json
{ "id": "chrome-social", "type": "social",
  "config": { "links": [ { "label": "Instagram", "href": "https://instagram.com/you" },
                         { "label": "GitHub", "href": "https://github.com/you" } ] } }
```

---

## Commerce

### `product`
A product card with a buy button. Provider-agnostic — the button is wired by
`product.js` via `data-provider`.

```html
<article class="tile tile-product" data-tile="product" data-tile-id="shop-widget"
         data-sku="WIDGET-1" data-price="49" data-provider="html">
  <div class="tile-card__media"><img data-role="src" src="" alt="" loading="lazy" /></div>
  <h3 data-role="title"></h3>
  <div class="tile-product__meta">
    <span class="tile-price__amount" data-role="price"></span>
    <span class="tile-card__meta" data-role="variant"></span>
  </div>
  <button class="btn btn-tactile btn-primary-tactile" data-role="buy" type="button">Add to cart</button>
</article>
```
```json
{ "id": "shop-widget", "type": "product",
  "config": { "title": "Widget", "price": "$49", "variant": "One size",
              "media": { "src": "asset:widget", "alt": "Widget" } } }
```
`data-provider` → `snipcart` | `stripe` | `square` | `paypal` | `html` (see `sites-payments.js`).

### `pricing`
One tier; repeat for a table.

```html
<article class="tile tile-price" data-tile="pricing" data-tile-id="plan-basic">
  <h3 data-role="tier"></h3>
  <p class="tile-price__amount" data-role="price"></p>
  <ul data-role="features"></ul>
  <div data-role="actions">
    <template><a class="btn btn-tactile btn-gold-tactile" data-role="action"><span data-role="label"></span></a></template>
  </div>
</article>
```
```json
{ "id": "plan-basic", "type": "pricing",
  "config": { "tier": "Basic", "price": "$499", "features": "5-page site\nContact form\nDeployment",
              "actions": [ { "label": "Choose Basic", "href": "/contact" } ] } }
```
> `features` is multi-line text — a `<ul>` fills with one `<li>` per line.

### `menu`
A restaurant-style menu with categories.

```html
<section class="tile tile-menu" data-tile="menu" data-tile-id="menu-food">
  <h2 data-role="title"></h2>
  <div data-role="categories">
    <template>
      <div class="tile-menu__category"><h3 data-role="name"></h3><ul data-role="items"></ul></div>
    </template>
  </div>
</section>
```
```json
{ "id": "menu-food", "type": "menu",
  "config": { "title": "Menu",
              "categories": [ { "name": "Small plates", "items": "Edamame|6\nKaraage|11" },
                              { "name": "Mains", "items": "Ramen|16" } ] } }
```
> `items` is multi-line text: one dish per line, name and price separated by `|`.

---

## Conversion

### `contact`
Static contact details.

```html
<section class="tile tile-contact" data-tile="contact" data-tile-id="home-contact">
  <h2 data-role="headline"></h2>
  <p data-role="body"></p>
  <div data-role="lines">
    <template><p><span data-role="label"></span> <a data-role="value"></a></p></template>
  </div>
</section>
```
```json
{ "id": "home-contact", "type": "contact",
  "config": { "headline": "Get in touch", "body": "We reply within a day.",
              "lines": [ { "label": "Email", "value": "hi@example.com", "href": "mailto:hi@example.com" },
                         { "label": "Phone", "value": "555 0100", "href": "tel:5550100" } ] } }
```

### `contact-form`
A working form with **no backend** — it posts to an embeddable endpoint.

```html
<form class="tile tile-contact-form" data-tile="contact-form" data-tile-id="home-form"
      data-form-provider="formspree" data-form-endpoint="https://formspree.io/f/yourFormId"
      action="https://formspree.io/f/yourFormId" method="POST">
  <h2 data-role="title">Send a message</h2>
  <label>Name <input name="name" type="text" required autocomplete="name" /></label>
  <label>Email <input name="email" type="email" required autocomplete="email" /></label>
  <label>Message <textarea name="message" rows="4" required></textarea></label>
  <div class="tile-contact-form__status" data-role="status" role="status" aria-live="polite"></div>
  <button class="btn btn-tactile btn-gold-tactile" data-role="submit" type="submit">Send</button>
</form>
```
```json
{ "id": "home-form", "type": "contact-form",
  "config": { "title": "Send a message", "provider": "formspree", "endpoint": "https://formspree.io/f/yourFormId" } }
```
Sign up at the provider, paste the endpoint. Works with JS off; `contact-form.js` adds
inline success/error feedback.

### `event`
Scheduling without leaving the page.

```html
<div class="tile tile-event" data-tile="event" data-tile-id="home-booking"
     data-calendar-url="https://cal.com/you/consult">
  <h3 data-role="title"></h3>
  <p data-role="body"></p>
  <button class="btn btn-tactile btn-gold-tactile" data-role="open-calendar" type="button">Pick a time</button>
</div>
```
```json
{ "id": "home-booking", "type": "event",
  "config": { "title": "Book a call", "body": "Pick a slot that suits you.",
              "calendarUrl": "https://cal.com/you/consult" } }
```

### `map`
A privacy-first map (Leaflet + OpenStreetMap — no API key, no tracking).

```html
<div class="tile tile-map" data-tile="map" data-tile-id="home-map"
     data-center="45.6770,-111.0429" data-zoom="12" data-marker="My shop">
  <div class="tile-map__canvas" data-role="canvas"></div>
</div>
```
```json
{ "id": "home-map", "type": "map",
  "config": { "center": "45.6770,-111.0429", "zoom": "12", "marker": "My shop" } }
```

### `faq`
An accordion built on native `<details>` — it works with JS disabled.

```html
<section class="tile tile-faq" data-tile="faq" data-tile-id="home-faq">
  <h2 data-role="title">Questions</h2>
  <div data-role="items">
    <template><details><summary data-role="question"></summary><div data-role="answer"></div></details></template>
  </div>
</section>
```
```json
{ "id": "home-faq", "type": "faq",
  "config": { "title": "Questions",
              "items": [ { "question": "How long does it take?", "answer": "About two weeks." } ] } }
```

### `search`
Static full-text search (Pagefind). Without an index it falls back to a normal
search form, so nothing breaks.

```html
<div class="tile tile-search" data-tile="search" data-tile-id="chrome-search" data-index="/pagefind/">
  <form class="tile-search__form" role="search" action="/search" method="get" data-role="form">
    <input type="search" name="q" data-role="input" aria-label="Search" />
    <button class="btn btn-tactile btn-primary-tactile" type="submit" data-role="submit">Search</button>
  </form>
  <div class="tile-search__results" data-role="results"></div>
</div>
```

---

## Adding your own tile

A tile is just a section with a name. To invent one:

```html
<section class="tile tile-hours" data-tile="hours" data-tile-id="home-hours">
  <h2 data-role="title"></h2>
  <ul data-role="list"></ul>
</section>
```
```json
{ "id": "home-hours", "type": "hours", "config": { "title": "Opening hours", "list": "Mon–Fri 9–5\nSat 10–2" } }
```

Then:
1. Style it in **your own CSS file** using tokens only — never hex:
   ```css
   .tile-hours { padding: var(--space-6); background: var(--color-surface); border-radius: var(--radius-lg); }
   .tile-hours h2 { color: var(--color-primary); }
   ```
2. Add the fields to `tile-registry.js` if you want them editable in the admin.
3. Add the type to `sites-schema.json` if you want it validated.

`data-tile="hours"` maps content to the tile; `data-role` names each slot. That's the
whole contract — everything else is ordinary HTML and CSS.

## When you want the admin

The admin dashboard is optional. It generates its editing form from
`tile-registry.js`, so **any tile you register becomes editable** by someone who
doesn't want to touch JSON. Copy `site/public/admin.html` (or
`examples/admin.html`) and point it at your content file.
