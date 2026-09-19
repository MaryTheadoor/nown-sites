# Changelog

All notable changes to the Nown S.I.T.E.S framework. Versions follow semantic
versioning: **MAJOR** = breaking contract change, **MINOR** = new tiles/features,
**PATCH** = clarifications and fixes.

The standard is versioned independently of any site built with it.

---

## [0.6.1] — 2026-09-10

Found by looking at the live site in a browser rather than reading the code.

### Fixed
- **The configured grid never left its narrow tier.** `.sites-grid--cols` set
  `container-type` on itself, and a container query can never match its own
  element — so the 12-column wide tier never applied and every `data-span` was
  resolved against 6 columns. The grid now queries the surrounding container
  (`.sites-container`, or the enclosing tile), and 4/8 spans measure correctly.
- **13 of 24 catalog snippets could not receive the fields their registry
  declares** — `feature.html` was a single card while the registry promised
  `items`; `gallery`, `faq`, `menu`, `pricing`, `contact`, `hero`, `cta`,
  `content-card`, `code` and `video` had similar gaps, and `announcement` had no
  snippet at all. Every snippet is now canonical and complete.
- **List tiles rendered an empty box until items existed** — and nothing at all
  with JavaScript disabled, since the only child was an inert `<template>`. Every
  list container now ships one static placeholder instance, which the binder
  removes when real items arrive. This is a progressive-enhancement fix.

### Added
- `nav-dock` declares no editable fields: nav links are site-level (`nav.json` →
  `nav[]`), edited in the builder's Nav panel and rendered into
  `data-role="nav-links"`.
- Tile **groups** in `tile-registry.js` (`chrome`, `hero`, `content`, `commerce`,
  `conversion`) — the builder's picker is grouped and filterable.
- `check-site.mjs` now also fails when a snippet cannot receive a declared field,
  so the gap above cannot come back.

### Builder UI
- Preview column is **sticky** — the live render sits beside the editor instead of
  2,400px below it (page height dropped from 3,083px to 2,419px).
- Export actions moved into a **sticky toolbar** at the top.
- Tile picker is grouped by purpose and has a **filter box**.
- The preview has a real **empty state** instead of a blank panel.

---

## [0.6.0] — 2026-09-10 — **initial beta**

### Grid
- **Two grid modes.** `.sites-grid` remains the automatic `auto-fit` grid (zero
  configuration). New `.sites-grid--cols` is a configured column grid: **12 columns**
  in wide containers, **6** in narrow ones, with per-tile `data-span` (1–12),
  `data-span-sm` (1–6) and `data-start` (1–7). Tiers switch on the grid's own width
  via a container query — not a device breakpoint. New tokens `--grid-cols`,
  `--grid-cols-narrow`.
- Alignment helpers: `.sites-grid--start` / `--center` / `--stretch` for how tiles
  fill a row; `.tile--center` / `.tile--end` for a tile's text and button row.
- Buttons in cards, pricing tiers and products now bottom-align on the row baseline.
- **Fixed:** container queries never matched their own element, so the hero's
  two-column rule silently never fired and heroes stayed single-column everywhere.
  The tile root is the container; an inner `.tile-hero__grid` is what reflows. This
  pattern is now documented (`docs/ARCHITECTURE.md` §5) and applied repo-wide.

### Site & docs
- New pages: **Grid** (documents and demonstrates both modes with live tiles),
  **Docs** (the standard, the hard rules, conformance levels), **Quickstart**
  (build by hand), **Blueprint** (the authoring format).
- New tile: **`code`** for displaying snippets.
- `tiles.html` gained per-tile **Copy markup** / **Copy content entry** buttons,
  reading the live page (pristine markup is snapshotted before content binds).
- **Builder** added to the nav.

### Tooling
- `tools/check-site.mjs` — static site linter (no browser): tiles vs content file,
  config keys vs slots, orphans, internal links, referenced files, `asset:` keys,
  and the SEO gate.

---

## [0.5.0] — agent-ready packaging
- Root **`AGENTS.md`** — the harness entry point: hard rules, repo map, workflow,
  tile contract, definition of done, and pitfalls that have actually bitten.
- **`llms.txt`** index; **`docs/INTAKE-FORM.md`** — the fill-in brief mapping 1:1 to
  the blueprint, content file and tile registry.
- **Copy-paste tile kit**: `templates/plate.html` (starter page) and
  `templates/TILE-KIT.md` (every tile's markup + content entry), plus a primer for
  people coming from drag-and-drop builders.

## [0.4.0] — theme engine & assets
- **Content-driven theme engine** (`sites-theme.js`): light **and** dark palettes,
  fonts, radii and spacing live in the content file; light/dark/system switcher with
  persistence, live OS tracking and no flash. Editable in the admin with live preview.
- Fully tokenized `nown-tiles.css` — component-level `[data-theme="dark"]` overrides
  removed.
- **Asset deployment** (`sites-assets.js`): images from repo assets **or** Firebase
  Storage token URLs, with logical `asset:<key>` indirection.

## [0.3.0] — Firebase default stack
- **Firebase** (Hosting + Auth + Storage) is the default reference stack, with
  `firebase.json`, `.firebaserc`, `storage.rules`, `firestore.rules`.
  Public pages stay SDK-free and simply fetch the published JSON.
- Alternatives (Cloudflare Pages, GitHub Pages, Netlify, IPFS + ENS, Google Sites)
  supported by changing the storage adapter only.

## [0.2.0] — authoring & integrations
- **Blueprint format** + `tools/blueprint.mjs` compiler (markdown → `content.json`).
- **Integration blocks**: auth, payments, forms, scheduling, search, maps, analytics
  and AI — each a block with swappable adapters, plus recipes.
- Content-file granularity: one `content.json` per site by default, splittable.
- `docs/ROADMAP.md` — protocol home, programmatic and full builders.

## [0.1.0] — the standard
- Plate-and-tiles architecture, design tokens, the `auto-fit` grid, theming and
  dimensional integrity.
- Tile naming/CSS/JS/data contracts and the tile catalog.
- The AI harness: `ai-skill/sites-schema.json` and a drop-in agent prompt.
- Master specification `docs/SPEC.md` with conformance levels L1–L4.

---

## Versioning the site you built

A site states the standard it targets (e.g. "L4"). Upgrade by re-running
`tools/seo.mjs`, `tools/check-site.mjs` and the module sync — the delivered site
has no runtime dependency on the framework version.
