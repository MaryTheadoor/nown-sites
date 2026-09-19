# S.I.T.E.S Architecture

> **Canonical source:** *Nown S.I.T.E.S: Reclaiming Digital Sovereignty Through
> First-Principles Web Architecture* (15 pp., Nown Digital). This document is the
> engineering distillation — it is the source of truth for how a S.I.T.E.S site is
> put together.

---

## 1. The three layers (Plate & Tiles)

Every interface is a **Plate** of **Tiles**:

| Layer | Role | Tech |
|---|---|---|
| **Background** | Atmospheric tone (color, gradient, subtle animation), signposts the page mood | CSS on `body` / plate wrapper |
| **Tiles** | Self-contained index cards; **one tile = one data payload** | semantic HTML + scoped CSS + optional scoped JS |
| **Grid** | The invisible mathematical matrix governing spatial relationships | native CSS Grid |

The *Plate* is the root viewport container that owns global layout (spacing,
context, background). The *Tiles* float within it. This is the "background plate
with floating tiles" model.

**Why tiles are safe to move:** each tile is encapsulated in semantic HTML and
scoped with its own styles and JS. Reordering, duplicating, or deleting a tile
cannot cascade into the rest of the document.

---

## 2. First principles (no build, no deps)

A web page is, at its core, **structured text + imagery**. Everything beyond the
semantic structure is *technically optional*.

- **HTML** provides structural integrity.
- **CSS** dictates visual presentation.
- **JavaScript** governs *localized* behavior (never the skeleton).

All three are natively interpreted by every browser on every OS → a universal,
dependency-free foundation. Nothing is compiled; the source **is** the site.

The protocol expands that with a **curated ecosystem of decoupled, embeddable
services** (forms, scheduling, payments, search, mapping, RSS) so a static page
gains enterprise-grade function while the host keeps total sovereignty. See the
`Integration Index` below and `MODULE-SPEC.md`.

---

## 3. Design tokens (the CSS variable contract)

All themable values live as CSS custom properties in `:root`; **no tile hardcodes
a color, radius, or shadow**. Dark mode is a token override, not a second file.

```css
:root {
  --color-background: #FAF6F0;
  --color-surface:    #FFFFFF;
  --color-text:       #111827;
  --color-primary:    #1E4D4F;
  --color-accent:     #D97706;
  --color-muted:      #6B7280;

  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-display: Georgia, "Times New Roman", serif;

  --space-1: 0.25rem;  --space-2: 0.5rem;  --space-3: 0.75rem;
  --space-4: 1rem;     --space-6: 1.5rem;  --space-8: 2rem;
  --space-12: 3rem;    --space-16: 4rem;

  --radius-md: 0.75rem; --radius-lg: 1rem; --radius-xl: 1.5rem; --radius-pill: 999px;

  --shadow-card:    0 2px 16px -4px rgba(30,77,79,.06);
  --shadow-elevated: 0 8px 32px -6px rgba(30,77,79,.10);
  --shadow-float:   0 16px 40px -10px rgba(30,77,79,.12);
}
```

**Naming rule (forward-looking normalization):** prefer a
`--<category>-<name>` shape (`--color-*`, `--space-*`, `--radius-*`, `--shadow-*`,
`--font-*`). Legacy names (`--color-cream`, `--color-gold`, etc.) are permitted in
existing code but should be aliased to the canonical set going forward.

---

## 4. The grid — two modes, no layout media queries

There are two ways to lay tiles out. Neither uses a layout media query.

### a) Automatic (default) — `.sites-grid`

```css
.sites-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--grid-min), 1fr));
  gap: var(--grid-gap);
}
```

- **`auto-fit` (not `auto-fill`)** collapses empty implicit tracks, so tiles stretch
  to fill the row — no awkward negative space.
- **`minmax(300px, 1fr)`** sets the floor; the browser fits as many columns as that
  minimum allows and shares the remainder evenly.
- Result: 1 column on a phone → 2 / 3 / 4+ as space appears, with zero configuration.

Use it for rows of equal cards. Tune it with `--grid-min` and `--grid-gap`.

### b) Configured — `.sites-grid--cols`

When a row must be *deliberately* uneven, opt into a real column grid:

```html
<div class="sites-grid sites-grid--cols">
  <article class="tile tile-card" data-span="8">two thirds</article>
  <article class="tile tile-card" data-span="4">one third</article>
</div>
```

**Two tiers**, driven by the container's own width (never the viewport):

| Tier | Trigger | Columns | Span attribute |
|---|---|---|---|
| narrow | container `< 48rem` | **6** | `data-span-sm="1..6"` |
| wide | container `≥ 48rem` | **12** | `data-span="1..12"` |

- A tile with no span is **full width** (`grid-column: 1 / -1`) — the safe default.
- `data-start="1..7"` places a tile on a specific column (centring a 6-wide tile, etc.).
- `--grid-cols` and `--grid-cols-narrow` retune the tier sizes.
- Alignment: `.sites-grid--start` (tiles size to content), `--center`, `--stretch`
  (default, equal heights); `.tile--center` / `.tile--end` centre or right-align a
  tile's text and its button row.

> **Why a container query here is still "breakpoint-free":** the tier switches on the
> width of the grid's own box, so the same markup behaves correctly in a narrow
> sidebar and a wide main column. It is not a device breakpoint.

---

## 5. Self-aware micro-layouts with container queries

While the grid handles *macro*-layout, each tile's *internal* content must adapt too.
S.I.T.E.S uses native **Container Queries** so a tile knows its own context:

```css
.tile { container-type: inline-size; }

/* inside the tile: */
@container (min-width: 500px) {
  .tile__body { display: flex; flex-direction: row; }
}
```

Because a tile queries its own container width (not the viewport), the *same* tile
can stack vertically in a narrow sidebar and go side-by-side in a wide central
grid track. Tiles are therefore **environment-agnostic and portable**.

> **The one rule that trips everyone up:** a `@container` query resolves against the
> nearest **ancestor** container — an element can never query itself. So
> `.tile-hero { container-type: inline-size }` followed by
> `@container (min-width: 45rem) { .tile-hero { … } }` **never fires**.
>
> The fix, and the pattern to copy: put `container-type` on the tile root and change
> an **inner** element.
>
> ```html
> <section class="tile tile-hero">        <!-- the container -->
>   <div class="tile-hero__grid">          <!-- the element that reflows -->
> ```
> ```css
> @container (min-width: 45rem) { .tile-hero__grid:has(.media) { grid-template-columns: 1.1fr .9fr; } }
> ```

---

## 6. Theming: native light/dark, zero dependency

1. Design tokens live in `:root`.
2. `[data-theme="dark"]` overrides the color tokens.
3. A tiny script reads `localStorage.getItem("theme")`; if unset it falls back to
   `window.matchMedia("(prefers-color-scheme: dark)")`, and applies the result to
   `<html data-theme=...>`.

Because the whole color matrix is tokenized, the site inverts instantly with no
second stylesheet.

---

## 7. Dimensional integrity (no layout shift)

Prevent Cumulative Layout Shift (CLS) with native `aspect-ratio` + `object-fit`:

```css
.tile__media {
  aspect-ratio: 16 / 9;      /* or 1 / 1, 4 / 3, 3 / 2 */
  overflow: hidden;
}
.tile__media img { width: 100%; height: 100%; object-fit: cover; }
```

- `aspect-ratio` reserves the exact box **before** the image transfers.
- `object-fit: cover` crops the excess; `contain` keeps the whole asset visible.

---

## 8. JavaScript: the tile init registry

One small `sites.js`, one registry, no globals, fully scoped:

```js
const SITES = window.SITES = window.SITES || {};
SITES.tiles = SITES.tiles || {};

SITES.register = (name, mod) => { SITES.tiles[name] = mod; };

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-tile]').forEach((el) => {
    const name = el.dataset.tile;
    const mod = SITES.tiles[name];
    if (mod && mod.init) mod.init(el);
  });
});
```

Modules register themselves with `SITES.register('hero', { init(el) { … } })` and
never touch the global scope. Enhancement is **progressive**: content renders with
no JS at all.

---

## 9. Integration index (curated embeddable services)

Dynamic behavior on a static plate, without a backend you own/maintain:

| Need | Recommended service | Why |
|---|---|---|
| Rapid base styling | Pico.css / Sakura.css / Water.css | 1 `<link>`, classless, dark-mode aware |
| Forms / data | Formspree, Tally, StaticForms | REST `action=`, privacy-first |
| Scheduling | Cal.com, SavvyCal | embeddable, no redirect off-site |
| Payments | Stripe, NOWPayments, Snipcart/Trolley | data-attr buy buttons, no PCI burden |
| Maps | Leaflet + OpenStreetMap, MapLibre GL | open, no tracking/API-key billing |
| Search | Pagefind (WASM) | chunked index, sub-100 KB typical |
| Content syndication | RSS via `fetch()` + rss2json proxy | cross-origin-safe feed injection |
| Decentralized hosting | IPFS + ENS/HNS; Cloudflare/GitHub Pages | content-addressed, censorship-resistant |

## 10. Deployment

- **Primary:** Firebase Hosting — serve the static folder (`firebase.json` → static
  public dir). Single upload; pairs with the serverless services above.
- **Optional:** Google Sites — simpler method, lower control; supported as a
  lightweight fallback.

## 11. Status & roadmap

- **Done:** philosophy + principles (this doc), module spec, AI harness, schema.
- **Next:** source of truth CSS (`nown-plate.css`, `nown-tiles.css`), the
  `sites.js` registry, per-tile modules, and the first spec-compliant prototype
  (rebuild of nowndigital.app).
