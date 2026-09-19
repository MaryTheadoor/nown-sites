# AGENTS.md — Nown S.I.T.E.S framework

**You are building with the Nown S.I.T.E.S framework.** Read this file first; it is
the operating manual. Deeper detail lives in `docs/` — this file tells you which
one to open and gives you the rules you must not break.

> **S.I.T.E.S** = *Seamlessly Integrated Technology Enabling Success.* A zero-dependency
> website framework: native HTML, native CSS, vanilla JS, no build step, no package
> manager. A site is a **plate** (background + grid) hosting modular **tiles**.

---

## 1. The 10 hard rules (never break these)

1. **No build step, no bundler, no package manager.** Output `.html`, `.css`, `.js` only.
2. **Vanilla JS only.** No React/Vue/Angular/Svelte/jQuery. Embeddable *services*
   (Formspree, Cal.com, Pagefind, Stripe, Leaflet…) are fine.
3. **No hardcoded visual values.** Only CSS custom properties: `var(--color-*)`,
   `var(--space-*)`, `var(--radius-*)`, `var(--shadow-*)`, `var(--font-*)`.
4. **Compose registered tiles** — don't invent one-off sections. Catalog: `docs/MODULE-SPEC.md` §8.
5. **No page-level media queries for layout.** Two grid modes: `.sites-grid`
   (automatic `auto-fit`) or `.sites-grid--cols` (12 columns wide / 6 narrow, with
   per-tile `data-span`). Intra-tile reflow uses container queries
   (`container-type: inline-size` on the tile, the query on an inner element).
6. **Dark mode is a token override**, never a second stylesheet. Use the theme engine.
7. **No layout shift:** media wrappers use `aspect-ratio` + `object-fit`; images are
   `loading="lazy"` except the hero/LCP image.
8. **No globals.** Register behavior with `SITES.register('<tile>', { init(el) })`.
9. **Progressive enhancement.** The page must be coherent with JS disabled.
10. **Copy is data, not markup.** Editable text lives in the content file and is
    bound into `data-role` slots.

---

## 2. Repo map — what to open when

| You need | Open |
|---|---|
| **What changed and when** | `CHANGELOG.md` |
| **The normative standard** (MUST/SHOULD, conformance levels) | `docs/SPEC.md` |
| Plate/tile model, design tokens, grid math, theming | `docs/ARCHITECTURE.md` |
| Tile naming / CSS / JS / data contracts + catalog + checklist | `docs/MODULE-SPEC.md` |
| Content file, admin dashboard, storage adapters | `docs/CONTENT-MODEL.md` |
| **SEO artifacts** (static meta, JSON-LD, sitemap, robots) | `docs/SEO.md` + `tools/seo.mjs` |
| **Compact Keywords** (which pages are worth writing) | `docs/COMPACT-KEYWORDS.md` + `tools/compact-keywords.mjs` |
| **Local traffic** (the launch focus) | `docs/LOCAL-TRAFFIC.md` |
| **Commerce** (links out, no integration) | `docs/COMMERCE.md` |
| **The share image** (`og:image`, 1200×630 raster) | `tools/og-image.mjs` + `docs/SEO.md` §10 |
| **Baking copy into static pages** | `tools/bake.mjs` + `docs/BAKING.md` |
| **The page builder** (design + build plan) | `docs/BUILDER-PLAN.md` |
| Theme engine (light/dark palettes, switcher, admin) | `docs/THEME-ENGINE.md` |
| Image deployment (repo vs Firebase Storage) | `docs/ASSETS.md` |
| Blocks / adapters / recipes (auth, payments, AI) | `docs/INTEGRATIONS.md` |
| Markdown authoring format + compiler | `docs/BLUEPRINT-FORMAT.md` |
| Firebase stack, rules, alternatives | `docs/DEPLOYMENT.md` |
| **Gathering a client's content** | `docs/INTAKE-FORM.md` |
| Long-term vision (protocol site, builders) | `docs/ROADMAP.md` |
| Drop-in agent prompt | `ai-skill/prompt-instructions.md` |
| Machine-readable contract | `ai-skill/sites-schema.json` |
| Runtime CSS | `src/css/nown-plate.css` (tokens/plate/grid), `src/css/nown-tiles.css` |
| Runtime JS | `src/js/*.js` (see §5) |
| Copy-able tile markup | `src/modules/<category>/*.html` |
| A complete worked example | `examples/nowndigital.*` + `examples/prototype-template.html` |
| A generated keyword cluster, end to end | `examples/pawn-shop/` (brief → blueprint → content.json → 15 baked pages) |
| Compiler | `tools/blueprint.mjs` |

---

## 3. The build workflow

```
brief / intake form  →  blueprint.md  →  content.json  →  index.html (+ admin)
   docs/INTAKE-FORM.md   docs/BLUEPRINT-FORMAT.md   tools/blueprint.mjs   pages
```

1. **Gather** — fill `docs/INTAKE-FORM.md` (or take the brief directly).
2. **Author** — write a **blueprint** (`docs/BLUEPRINT-FORMAT.md`): front matter
   (site / theme / nav / integrations) then one `### Tile: <type>` section per tile
   with a `description` and the tile's registry fields.
3. **Compile** — `node tools/blueprint.mjs blueprint.md --out content.json`.
   Fix every warning (unknown tile type, unregistered field, missing id).
4. **Compose pages** — write the predefined structure with `data-tile`,
   `data-tile-id`, and `data-role` slots; use the snippets in `src/modules/`.
5. **Bake** — `node tools/bake.mjs <siteDir> --og --seo` renders the copy into
   the HTML so a crawler and a no-JS reader see it. The binder re-applies the same
   values on load. See `docs/BAKING.md`.
6. **Wire** — include the runtime in this order:
   `sites-theme.js` (in `<head>`), then `tile-registry.js`, `sites.js`,
   `sites-assets.js`, `sites-content.js`, plus `sites-adapters.js` /
   `sites-admin.js` on the admin page.
7. **Verify** — run the checklist in §7.

**Never hand-edit `content.json` and the HTML out of sync** — the HTML owns
*structure*, the content file owns *copy, theme and assets*.

---

## 4. Tile contract (memorize this)

```html
<section class="tile tile-hero" data-tile="hero" data-tile-id="home-hero">
  <h1 data-role="headline">Placeholder copy (must read fine without JS)</h1>
  <p  data-role="body">…</p>
  <div data-role="actions">
    <template><a class="btn btn-tactile btn-gold-tactile" data-role="action"><span data-role="label"></span></a></template>
  </div>
</section>
```

- Root: `class="tile tile-<name>"` + `data-tile="<name>"` + `data-tile-id="<stable-id>"`.
- Slots: `data-role="<field>"` matching a `config` key; lists use a `<template>` child.
- Content mapping: `headline: "…"` → `[data-role="headline"]`; arrays → the
  `<template>` in `[data-role="<key>"]`; `{src,alt}` → the `<img>` in the slot.
- `{{asset:key}}`-style indirection uses the literal form `asset:key` in `src`.

---

## 5. Runtime modules (`src/js/`)

| File | Responsibility |
|---|---|
| `sites.js` | tile init registry — `SITES.register(name, {init(el)})`, boots `[data-tile]` |
| `tile-registry.js` | **predefined editable fields per tile type** (drives admin + validation) |
| `sites-content.js` | binder — fetches the content file, fills `data-role` slots, renders lists, binds nav/assets/theme |
| `sites-theme.js` | theme engine — applies palettes/fonts/radii, light/dark/system switcher, no-flash |
| `sites-assets.js` | asset adapters (`repo` \| `firebase`), resolves `asset:<key>` |
| `sites-adapters.js` | content storage adapters (`local` \| `git` \| `firebase`) + validation |
| `sites-admin.js` | admin dashboard — registry-driven forms, **Theme** editor, save via adapter |
| `sites-builder.js` | tile builder page — registry-driven picker, live preview through the binder, `blueprint.md` + `content.json` export |
| `sites-auth.js` | auth adapters (firebase/supabase/auth0/clerk/local) |
| `sites-payments.js` | payment adapters (stripe/square/snipcart/paypal/none) |

**Adding a tile type:** add it to `src/modules/`, add an entry to
`tile-registry.js`, add the type to `ai-skill/sites-schema.json`, and document it in
`docs/MODULE-SPEC.md` §8. Then it appears in the admin automatically.

### Where styling lives — global first

**Default to global.** The theme tokens in the content file and the two framework
stylesheets (`nown-plate.css`, `nown-tiles.css`) are where styling belongs, and a
change there reaches every page and every tile at once.

The escape hatches exist, in order of preference:

| Level | Shape | Use it for |
|---|---|---|
| **Global** (default) | `theme` in the content file; `src/css/*.css` | Almost everything |
| **Per page** | `site.pages["/<page>"].css` | A page that genuinely differs — not yet implemented |
| **Per tile** | `entry.css` — declarations only, scoped to `[data-tile-id]` | A one-off adjustment when a token does not exist for it |

**The per-tile hatch stays.** It is part of the modular system, the binder and the
baker both apply it, and it is what fixes a tile the tokens do not reach — the
four-item grid on the home page is set with it. Removing it would remove capability.

What the ordering above is about is **which to reach for first**, not what is allowed.
A site whose every tile carries its own CSS block has been built the wrong way up,
because the same result was usually one token away. Reach for global first, then a
page, then a tile — and when a tile is genuinely the right level, use it.

Correspondingly: **the rigour the framework owes is in the grid and the tile box** —
predictable columns, no ragged rows, no overlap, one rhythm for panel padding — rather
than in per-tile styling. That is what `entry.layout` and the panel layer are for.

### Scope — authoring tools are NOT shipped to generated sites

`sites-builder.js` and `admin.html` run on the FRAMEWORK'S OWN site
(`site/public`), where someone creates a new site or edits an existing one. They are
not part of what a built site receives. A generated site gets the render runtime —
`sites.js`, `sites-content.js`, `sites-theme.js`, `sites-assets.js`,
`tile-registry.js` and the module files it actually uses — and nothing else. Confirm
it holds by reading `tools/sync-site-runtime.sh` (framework site: everything) against
`examples/pawn-shop/build.cjs` (generated site: three runtime files plus the modules
it uses). Small businesses do not want a page builder on their own site; the copy and
theme editing they get is the admin surface, and that is the whole of it.

The builder's architecture is documented so someone can stand up their own —
`docs/BUILDER-PLAN.md` is the design record, and this section is the boundary.

---

## 6. Authoring the content file

```jsonc
{
  "site":  { "name": "…", "baseUrl": "…", "seo": { "title": "…", "description": "…" } },
  "theme": { "defaultTheme": "system",
             "colors": { "background": "#FAF6F0", "primary": "#1E4D4F", "accent": "#D97706" },
             "dark":   { "background": "#0F172A", "primary": "#2A6B6E" },
             "fonts":  { "sans": "…", "display": "…" },
             "radii":  { "md": "0.75rem" } },
  "assets": { "hero": "/assets/hero.jpg" },          // referenced as "asset:hero"
  "integrations": { "auth": "none", "payments": "none", "forms": "formspree", "ai": "none" },
  "nav": [ { "label": "Services", "href": "/services" } ],
  "content": [ { "id": "home-hero", "type": "hero", "config": { "headline": "…" } } ]
}
```

Optional, both read only by `tools/seo.mjs` (never by the runtime): `seo.image`,
`seo.pages["/<page>"] { title, description }`, and
`business { type, telephone, address { … }, openingHours [ … ], priceRange, geo { … } }`
→ the LocalBusiness JSON-LD node. Omit them and the site emits WebSite-only
JSON-LD; a page with no override falls back to its own headline, then `seo.title`.
See `docs/SEO.md`.

Validate against `ai-skill/sites-schema.json`. One file per site by default;
splitting per page is allowed for custom needs.

---

## 7. Definition of done (run before you report success)

- [ ] No build step; output is plain `.html`/`.css`/`.js`.
- [ ] No hex/rgba outside `:root` / the theme object; every tile uses tokens.
- [ ] No page-level layout media queries; container queries for intra-tile reflow.
- [ ] Works at mobile (1 col) → tablet → desktop with no breakpoint code.
- [ ] Dark mode inverts cleanly via `[data-theme="dark"]`.
- [ ] No layout shift (`aspect-ratio` on media); images lazy except the hero.
- [ ] Keyboard-reachable, visible focus, AA contrast, `prefers-reduced-motion` honoured.
- [ ] Reads coherently with JS disabled (placeholder copy present).
- [ ] `content.json` validates against the schema; every `content[].type` is a
      registered tile; every `config` key is a registered field.
- [ ] Every page carries the generated SEO block (`<!-- seo:start -->` … `<!-- seo:end -->`),
      its JSON-LD parses, and it is listed in `sitemap.xml` — `node tools/seo.mjs <site>`,
      then `node tools/check-site.mjs <site>` must pass (docs/SEO.md).
- [ ] Services (forms/maps/payments/AI) are swappable via config — no vendor logic
      in tiles; no API secrets in client code; AI opt-in only.
- [ ] `node --check` passes on every `.js`.

Useful commands:
```bash
node tools/check-site.mjs public                           # lint: pages vs content file + SEO gate (no browser)
node tools/blueprint.mjs blueprint.md --out content.json   # compile + warn
node tools/compact-keywords.mjs business.json --out _kw.md # brief -> compact-keyword blueprint fragment
node tools/og-image.mjs site/public                        # draw the 1200x630 og:image (no dependencies)
node tools/bake.mjs site/public --og --seo                 # render content.json into the pages, then og + seo
node tools/seo.mjs site/public                             # write/fix sitemap.xml, robots.txt, static <head> meta
node tests/run-all.cjs                                     # every suite; a SKIP counts as NOT passing
node tests/seo-noindex.cjs                                 # site.seo.noindex: on, off, and restored (12 assertions)
node tests/visit-hours.cjs                                 # opening-hours maths (16 assertions)
node tests/builder-roundtrip.cjs                           # builder blueprint -> compiler -> content.json
node tests/binder-roundtrip.cjs                            # baked HTML vs the runtime binder (needs playwright; SKIPS without it)
node tests/builder-undo.cjs                                # builder history, drafts and import, driven in a browser
node tests/builder-preview.cjs                             # builder preview: viewports, grid overlay, selection
node tests/builder-validate.cjs                            # builder live validation rules
node tests/builder-code.cjs                                # builder code panel: fidelity, sync, edit write-back
node tests/builder-plate.cjs                               # site.plate: model, export, baked page, reduced motion
node tests/builder-chrome.cjs                              # nav/footer variants: declared, applied, and visible
node tests/builder-css.cjs                                 # tile CSS: scoped, token-linted, and baked
node tests/builder-library.cjs                             # the tile picker: rows, fold-out facts, search
python3 -m http.server 8080                                # then open index.html / admin.html
python3 -c "import json;json.load(open('content.json'))"   # JSON sanity
```

**`tools/check-site.mjs` is the fastest way to catch a broken page** — it verifies,
without a browser, that every `data-tile-id` has a content entry, every config key
has a slot (or a `data-*` attribute), every internal link and referenced file
resolves, every `asset:<key>` exists, that every catalog snippet can receive the
fields its registry declares, and every page carries the static SEO block
(title, description, canonical, OpenGraph, Twitter card, parsing JSON-LD) and is
listed in `sitemap.xml` while `robots.txt` points at that sitemap. Run it before
claiming a site works.

---

## 8. Common tasks

- **Build a site from a brief:** intake → blueprint → compile → compose `index.html`
  from `src/modules/` snippets → wire runtime → verify.
- **Add a page:** new HTML file, same plate + chrome; add its tiles to the content
  file (use `page` / split files if the site opted in).
- **Change copy:** the owner uses `admin.html`. You edit `content.json` (or the
  blueprint, then recompile).
- **Re-theme:** edit `theme` in the content file (or admin → Theme). Never add a
  second stylesheet.
- **Swap a provider:** change the adapter in `sites.config.js` only.
- **Add images:** repo mode → commit to `/assets`; firebase mode → upload in admin.

## 9. Pitfalls that have actually bitten

- Content loads **after** tiles bind if you order scripts wrong — load the asset map
  and theme **before** binding (the binder already does this; don't reorder).
- A heading/registries change that skips `tile-registry.js` silently drops admin fields.
- Nav links and asset keys are resolved from the content doc — a typo'd `asset:key`
  falls back to a raw path and 404s.
- **One content file can serve many pages.** An entry with an `id` binds only where
  that `data-tile-id` exists; it never falls back to type-matching. So a missing id,
  or a mismatched `data-tile-id`, silently leaves a tile showing its placeholder copy.
- A slot's `data-role` may sit on the tile root *or* a descendant — both work, but be
  consistent so copy-pasted markup behaves predictably.
- `Theme` values must be valid CSS (`#rrggbb`, `rgba()`, `hsl()`, `color-mix()`).
- **A copy edit in the admin does not refresh the static meta.** `content.json`
  changes and the visible text updates on reload, but the `<title>`, description
  and JSON-LD baked into the HTML stay stale until `node tools/seo.mjs <site>`
  runs again and the files are republished (docs/SEO.md §9).
- **A container query never matches its own element.** `@container` resolves against
  the nearest *ancestor* container, so a rule like
  `@container (min-width: 45rem) { .tile-hero { … } }` silently never fires when
  `.tile-hero` is the container. Put `container-type` on the tile root and change an
  **inner** element (`.tile-hero__grid`) — this was a real bug that left the hero
  one column.
- A tile inside `.sites-grid--cols` is only as wide as its `data-span`; forgetting the
  span makes it full width, which is the intended default.
- **A snippet is the contract, not a sample.** `src/modules/<type>.html` is both the
  copy-paste source and what the builder previews, so a snippet missing a slot the
  registry declares silently drops typed copy. `check-site.mjs` now fails on that.
- Give every list container a static placeholder beside its `<template>`, or the tile
  renders as an empty box until items exist (and renders nothing at all with JS off).
- **A JS-enabled browser check hides every baking bug.** When the binder repairs a page
  on load, the rendered DOM looks correct while the served HTML is wrong — so only a
  JS-disabled check catches it, and only if you check *that* page. This is how a real
  regression shipped: `tools/bake.mjs` picked the template's first child instead of its
  first *element* child, so any snippet whose `<template>` was written across lines
  rendered **nothing** when baked. The compact-keywords hub shipped with 12 empty
  whitespace nodes where its 12 landing-page links belonged — the entire crawl path,
  gone, while the page looked perfect in a browser. `tests/binder-roundtrip.cjs` now
  pins it by comparing the baked DOM against the bound one.
- **Whitespace is a node.** Anything that walks a parsed tree has to skip text nodes:
  `tpl.children[0]` on a multi-line `<template>` is a newline, not the markup. The DOM
  API gives you `firstElementChild` for free; a hand-written parser does not.
- **`read` caps its OUTPUT at roughly 50,000 characters and truncates SILENTLY.**
  `totalLines` reports the file truthfully; `lines` does not. Measured: a
  1627-line / 76 KB file returned 1120 lines, and a synthetic 3000-line file with
  longer lines returned only 733 — so the limit is characters, not lines, and it
  sits nowhere near the documented 2000-line ceiling. **A read → modify → write
  cycle on a file over ~50 KB therefore deletes everything past the cut.** That
  actually happened to `src/js/sites-builder.js` and removed its last ~400 lines,
  including the module's exports. The tell is `lines.length < totalLines`: check it
  before writing anything back, page with `offset` (paging does work — 1120 + 507
  reconstructed a 1627-line file exactly), or better, use targeted `edit` calls,
  which are the right tool for a file that size anyway.
- **`bake.mjs`'s HTML parser must be the exact inverse of its serializer.** The
  serializer escapes one character — `"` → `&quot;` — and the parser decoded
  nothing, so an attribute containing a quote came back as the six literal
  characters `&quot;` and every later bake compounded the damage. It stayed hidden
  because no attribute value contained a quote until `site.plate` wrote
  `url("…")`. Two consequences worth remembering: **any hand-written parser must be
  tested against its own serializer's output, not against tidy HTML**, and a bake
  that merges into an existing attribute is not idempotent — the plate's
  declarations are replaced, not merged, or a colour removed from `content.json`
  is baked into the HTML forever.
- **A leading `/` in a page reference is SITE-root-relative, not filesystem-absolute.**
  `path.resolve(dir, '/assets/x.svg')` gives `C:\assets\x.svg` on Windows, so every
  rooted reference looked missing. `check-site.mjs` had that bug and it only showed
  up once a bake actually filled resolved asset URLs into the pages.
- **THE BUILDER EDITS ONE PAGE AND THE EXPORT WRITES ONE PAGE.** `state.page` is a
  single `{ name, path }`; every tile is stamped with that one path, and
  `buildContentDoc` emits only `state.tiles`. `loadContentDoc` filters an imported
  file down to its first page. So opening a multi-page `content.json` and exporting
  **silently discards every other page**: measured by importing a 3-page / 4-entry
  file and exporting 1 page / 2 entries. The builder does warn in its status line
  ("the builder edits one page at a time") but the export is still destructive, which
  makes this a data-loss bug rather than a missing feature. The content model already
  supports multi-page — `entry.page` is real and the compiler reads it — so the fix
  is in the builder's state and UI, not the format.
- Do not put real API keys in `sites.config.js` — public config only.