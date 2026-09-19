# Page builder — design and build plan

**Design record.** Status: proposed. Supersedes the "Tile Builder" description in
`docs/ROADMAP.md` (M3).

---

## 1. What exists today

`site/public/builder.html` + `src/js/sites-builder.js` (780 lines). Three columns —
picker · configure · live preview — plus a sticky export toolbar. The parts worth
keeping and building on:

| Property | Why it matters for this redesign |
|---|---|
| **Registry-driven widgets** | Field controls come from `SITES.tileRegistry` / `SITES.themeRegistry` through the admin's own factory. The builder cannot drift from the registry, and a new tile appears automatically. |
| **Snippets are single-sourced** | Tile markup is fetched from `src/modules/<type>.html`; the builder only stamps `data-tile-id`. No tile markup is authored in JS. |
| **The preview is a real isolated document** | An iframe running the actual runtime, bound through `SITES.content.apply()`. A half-edited site cannot touch the tool's DOM. |
| **Export mirrors the compiler** | `buildBlueprint()` and `buildContentDoc()` are hand-written mirrors of `tools/blueprint.mjs`, now pinned by `tests/builder-roundtrip.cjs`. |

### What is missing

| Gap | Consequence |
|---|---|
| **No persistence of any kind** | A refresh loses the entire site. The single worst defect. |
| **No undo/redo** | |
| **No import** | It can create a site but never open one. Editing an existing `content.json` — the common case — is impossible. |
| **Single page** | `state.page` is one object. A multi-page site needs separate exports merged by hand. |
| **Preview loads no tile behaviours** | `visit.js`, `faq.js`, `map.js`, `product.js` never run, so every dynamic tile is invisible while you configure it. |
| **No grid-mode control** | `auto-fit` vs `--cols` is a site-level decision the builder never asks about. |
| **No validation** | Nothing mirrors `check-site.mjs`, so an unregistered type or a config key with no slot only shows up after export. |
| **Export is two data files** | `blueprint.md` + `content.json` are not a site. Deploying still needs a scaffolding step that **does not exist yet** (`tools/scaffold.mjs`, still open). |

### How the builder composes a page today

Worth stating precisely, because it is the crux of the redesign.

`renderPreview()` does this, and only this:

```
state.tiles[]  ->  for each tile:
                     clone src/modules/<type>.html        (the snippet)
                     stamp data-tile-id="<unique>"
                     append into the preview iframe host
                   then SITES.content.apply(buildContentDoc(state))
                     -> the real binder fills every data-role slot from the data
```

So the page **is** assembled from modular components — but only inside the preview
iframe, transiently, and thrown away on the next render. Nothing else ever produces
a page.

| Artifact | Produced? | By what |
|---|---|---|
| The preview DOM | yes, transiently | `renderPreview()` from snippets |
| `content.json` | yes | `buildContentDoc(state)` |
| `blueprint.md` | yes | `buildBlueprint(state)` |
| **The page HTML** | **no** | nothing — this is the gap |

The intuition that we are composing components into one file is right about the preview
and not yet true of the output. **Making it true of the output is the substantive change
in this redesign**, and it is what makes the rest of the brief — the work file shared by
the UI and the code panel — coherent rather than a special case. See section 3.7.

---

## 2. The proposed layout

```
+-----------------------------------------------------------------------+
| TOOLBAR   [Screen name]        Undo Redo | Import  Save as | Theme   |
+------------------+------------------------------+---------------------+
| TILE LIBRARY     |  PREVIEW                     |  INSPECTOR          |
|                  |                              |                     |
| > Hero           |  [desktop|tablet|mobile]     |  [Content] [Layout] |
| > Feature        |  [grid overlay] [outline]    |  [Chrome]  [Code]   |
| > Gallery        |                              |                     |
| > Visit          |  +------------------------+  |  (fields for the    |
| ...              |  |                        |  |   selected tile,    |
|                  |  |   the plate + tiles    |  |   its span, its     |
| CHROME           |  |   as they are added    |  |   chrome config,    |
|  Menu bar  v     |  |                        |  |   or its code)      |
|  Footer    v     |  |                        |  |                     |
|                  |  +------------------------+  |                     |
| BACKGROUND       |                              |                     |
|  color|image|anim|  scroll follows the          |                     |
|                  |  selected tile               |                     |
+------------------+------------------------------+---------------------+
```

**One refinement I would push for:** split *adding* from *arranging*. The brief puts
the resize inputs and the reorder controls inside the tile library. That mixes two
mental modes — "what can I add" and "what have I placed" — in one column, and the
library gets long fast. The **Inspector**'s *Layout* tab is the natural home for span
and order, and it already has the selected tile in hand. The library stays a
catalogue. Worth agreeing before it is built, because it is hard to un-mix later.

---

## 3. Feature by feature, against what exists

### 3.1 Viewport switching — no new machinery needed

The framework has **no page-level layout media queries**, and the 12/6 column tier is
a **container query on `.sites-container`** at `48rem` (see the note in
`nown-plate.css` section 5: the grid must not be its own container).

So resizing the preview iframe *is* the correct emulation — an iframe has its own
viewport, and `.sites-container` is `width: 100%; max-width: 64rem`, so its width
tracks the frame exactly:

| Preset | Frame width | Container | Tier |
|---|---|---|---|
| Mobile | 390 | 390px | narrow — 6 columns |
| Tablet | 834 | 834px | wide — 12 columns |
| Desktop | 1280 | 1024px (max-width) | wide — 12 columns |

`--grid-cols` / `--grid-cols-narrow` drive the column count. **Tablet sits just over
the 48rem boundary**, so it is the interesting preset — worth checking 760 and 780 as
well once the switcher exists.

### 3.2 Grid overlay — small, and it doubles as the span explainer

Rendered *inside* the preview document so it shares the container context and the
column tokens. It reads the tier the same way the grid does and draws 6 or 12
columns. Because it knows the same tokens it can also shade the columns the selected
tile spans — which turns "how many grid squares" from an abstract number into
something visible. **Build it that way from the start**; a plain column overlay is
barely worth the toggle.

### 3.3 Grid squares — the mechanism already exists

`.sites-grid--cols` is a real column grid with per-tile spans:

| Attribute | Range | Applies |
|---|---|---|
| `data-span` | 1-12 | wide tier (container >= 48rem) |
| `data-span-sm` | 1-6 | narrow tier |
| `data-start` | 1-12 | explicit column start (advanced) |

Default is `grid-column: 1 / -1` — full width until a span is asked for.

**So "resize inputs for grid squares" is two number inputs, not a new system** — but
it requires a decision the builder does not currently make: **the site has to be in
`--cols` mode.** In `auto-fit` mode spans do nothing. The builder therefore needs a
site-level *Layout* choice (`automatic` | `configured`), and the span inputs should be
disabled with an explanation in automatic mode rather than silently ignored.

### 3.4 Menu bar and footer configurations — this does not exist yet

`nav-dock` and `footer` are **single implementations**. There are no variants: no
`tile-nav-dock--*` classes, no alternate markup, nothing to select between.

So this is not a UI task, it is a **design task first**: decide which layouts are
worth having for the two niches, build them as variant snippets, wire them into the
registry, then expose a picker. Realistically three nav variants (centred pill, left
brand + right links, minimal) and three footer variants (single row, columns,
contact-heavy).

This is the largest single chunk in the brief and it blocks the Chrome panel.

### 3.5 Background — needs a content-model decision

Today `.plate-ambient` is two hardcoded radial gradients in `nown-plate.css` and is
not configurable by any content. Three modes were asked for (static colour, static
image, simple animation), which need:

1. **A model.** `site.plate = { mode, color?, image?, animation? }` — a new optional
   block, read by the runtime and by `seo.mjs` (for theme-colour consistency).
2. **A runtime.** Something has to apply it: tokens for colour, a background image for
   image, a CSS animation for animation.
3. **A rule about motion.** The a11y checklist requires `prefers-reduced-motion` to be
   honoured — so "simple animation" must degrade to static, and the builder should say
   so next to the control.

Contained, but it touches the content model, the runtime, the schema, `check-site` and
the builder. Do it as one piece.

### 3.6 The code panel — a demonstration surface first, an editor second

The reframe changes the design substantially, and for the better: **the primary job is
to show how the architecture works, not to be an IDE.** It is the cool factor of seeing
the code behind the interface being assembled, and a jumping-off point for someone who
wants to learn.

That inverts the usual priority. A demonstration surface must be:

- **Readable by default.** Formatted and colourised, not a raw text dump. It shows the
  real artifact — the same work file the UI edits — so what is on screen is the truth,
  not a rendering of it.
- **Connected to the UI.** Hover a field in the inspector and the line carrying it
  highlights. Move a tile and watch the entry move. That synchronisation *is* the lesson:
  it makes copy-is-data visible instead of theoretical.
- **Read-only until asked.** Editing is a deliberate mode switch, so the default
  experience is comprehension and nobody breaks a site by typing.
- **Annotated, not just displayed.** Short inline explanations of the parts that carry
  the architecture — why the `data-tile-id` matters, what `data-role` binds to, why the
  headline lives in the content file rather than the markup.

This also dissolves the Level 1 / 2 / 3 dilemma from the previous draft, which existed
because editing the code was ambiguous:

| Level | What it edits | Verdict |
|---|---|---|
| **1. Config** | The tile config as JSON | **Build it.** The escape hatch for data, no architectural cost, and the clearest teaching artifact there is. |
| **2. Tile CSS** | A per-instance block in a site-level stylesheet, token-linted | **Build it.** The honest home for cosmetic adjustment: survives re-theming, rejects raw hex. |
| **3. Markup override** | The instance HTML, overriding the snippet | **Drop it.** Section 3.8 replaces it with something better. |

Level 3 can be dropped because of the next section: if the escape hatch is a *visually
composed* custom tile rather than hand-edited markup, the framework keeps its invariants
and the user still gets what they asked for when no existing tile fits.

### 3.7 The work file — one document, two surfaces

The brief is explicit: the code panel should inject modifications into **the same work
file** the UI edits, so there is no added render complexity, just finer control. That is
exactly right, and it works — provided the work file is allowed to grow.

**The work file is `content.json`**, with `blueprint.md` as its Markdown projection.
Both surfaces write to it; nothing writes to a parallel override layer. For that to hold,
three things that currently live on the *element* in the page HTML have to move into the
*data*:

| Now on the element | Proposed in the content model | Applied by |
|---|---|---|
| `data-span` / `data-span-sm` | `entry.layout = { span, spanSm }` | the binder, at runtime and at bake |
| `tile-<name>--<variant>` | `entry.variant` | the binder |
| `data-start` | `entry.layout.start` | the binder |

This is not a hack — it is how everything else already works. The binder fills copy from
`config`; it can set `data-span` from `layout` the same way, and `tools/bake.mjs` already
bakes the same values into the static HTML. The payoff: layout becomes previewable live,
exportable, validatable by `check-site.mjs`, and visible in the code panel, instead of a
property the builder has to reach into the DOM to change.

With that, one document carries: site · theme · nav · integrations · assets · `plate` ·
per-entry `config` · per-entry `layout` · per-entry `variant`. That is the unified work
file, and it is one file.

### 3.8 The custom tile — a registered tile, not a markup override

The brief asks for a blank canvas where someone can add a picture and text with specific
colours from the palette, when no existing tile fits. Read carefully, that is **not**
hand-written HTML — it is visual composition of a small set of primitives. That
distinction is what keeps it inside the framework.

Proposal: one more registered tile type, `custom`, whose config is a list of blocks:

```yaml
### Tile: custom
id: home-promo
blocks:
  - kind: heading
    text: New arrivals every Friday
    level: 2
  - kind: image
    src: asset:promo
    alt: A table of new stock
    ratio: 4x3
  - kind: text
    body: |
      Two paragraphs, so the blank line matters.
  - kind: button
    label: See what came in
    href: /products.html
    tone: accent
```

Primitives worth having, and no more to begin with: `heading`, `text`, `image`, `button`,
`list`, `divider`. Every one uses theme tokens, so it re-themes with everything else and
cannot carry a raw hex value. `tone` resolves to a palette role — `accent`, `primary`,
`muted` — not to a colour.

**What this buys:** the escape hatch is a *registered tile* with a *schema-driven config*,
so `check-site` validates it, the admin can edit it, the builder configures it with real
widgets, and it bakes and binds like every other tile. Rules 3, 4 and 10 stay intact while
the framework still has room for expansion.

**The risk, stated plainly:** every escape hatch that is easier than the tile system
eventually becomes the tile system. If `custom` is the first thing people reach for, the
catalog has failed. The guard is editorial rather than technical — keep the catalog good
enough that the blank canvas stays the exception, and have the builder empty state point
at the catalog first.

### 3.9 Fonts — global, self-hosted, no layout shift

Today `theme.fonts.{sans, display}` are **font stacks only** — system fonts, no files, no
`@font-face` anywhere in the repo. Rich and custom fonts means real webfonts, and there
are three ways to get them:

| Approach | Verdict |
|---|---|
| A Google Fonts link tag | **No.** An external request on every page load, a third-party dependency in a framework whose claim is zero dependencies, and a privacy question the framework elsewhere answers firmly. |
| System stacks (today) | Fine as a default, and what most local-business sites should ship. Fast, private, zero risk. |
| **Self-hosted woff2 in /assets/fonts/** | **Yes.** Declared in the theme, emitted as `@font-face` by the theme engine, served from the site own origin. |

Concrete shape:

```yaml
theme:
  fonts:
    sans: "Inter, system-ui, sans-serif"
    display: "Fraunces, Georgia, serif"
    files:
      - family: Inter
        src: /assets/fonts/inter-var.woff2
        weight: "100 900"
        display: swap
```

Two things this has to respect:

- **Rule 7, no layout shift.** `font-display: swap` plus a fallback-metric story, or the
  headline jumps when the webfont lands. Worth doing properly rather than mentioning in a
  comment.
- **Sovereignty.** Self-hosted means the font file lives in the client repo. Same posture
  as the rest of the framework, and a selling point rather than a chore — but it means the
  builder needs an upload path and a licence note, not just a dropdown of family names.

A curated short list of open-licence families offered by name, plus upload for anything
else, covers both the choose-for-me and the we-have-a-brand-font cases.

### 3.10 The component manifest — one standard schema

The brief asks for a standard schema for components. There is one today, but it is
**spread across eight files**, and only three of the copies are enforced:

| Place | Enforced? |
|---|---|
| `src/modules/<cat>/<type>.html` — the markup | yes: a registered type must have a snippet |
| `src/js/tile-registry.js` — the editable fields | yes: the snippet must receive every declared field |
| `src/css/nown-tiles.css` — the styling | no |
| `ai-skill/sites-schema.json` — the type enum | **now yes** (see below) |
| `docs/MODULE-SPEC.md` section 8 — the catalog prose | no |
| `templates/TILE-KIT.md` — the copy-paste kit | no |
| `src/modules/<cat>/<type>.js` — the behaviour, if any | no |
| `site/public/src/modules/<type>.html` — the synced runtime copy | yes: regenerated by the sync script |

**This has already cost us.** Checking the enum against the registry for the first time
found it wrong in *both* directions, live in the repo:

- `nav-dock` was registered and shipped but **missing from the type enum** — an agent
  validating a content file against the schema would reject a valid tile.
- `theme-toggle` was **in the enum but is not a tile at all** — it is a button inside
  `nav-dock`. The schema advertised a tile that cannot exist.

Both are fixed, and `check-site.mjs` now fails when the two disagree in either direction.
Verified by reintroducing the drift and watching it fail.

**The next step is a real manifest**, carrying what the registry has no room for:

```jsonc
// src/modules/local/visit.tile.json  — beside the snippet
{
  "type": "visit",
  "label": "Visit us",
  "group": "conversion",
  "icon": "pin",
  "about": "Where you are, when you are open, and how to get there.",
  "fields": ["headline", "address", "note", "actions", "hoursTitle", "hours"],
  "variants": [
    { "name": "split",   "label": "Split",   "about": "Address left, hours right" },
    { "name": "stacked", "label": "Stacked", "about": "Address above hours" }
  ]
}
```

This is what makes the library panel in the brief possible at all — icons, one-line
descriptions and a foldable more-info section need somewhere to be declared, and the
registry has no room for them today.

**Do not turn this into a build step.** The registry is a browser-served runtime file;
generating it would put a compile between the framework and every site. Instead: author in
the manifest, keep the registry hand-written, and **gate the agreement** — the same pattern
already used for `blueprint.mjs` against `sites-builder.js`, pinned by
`tests/builder-roundtrip.cjs`, and now for the registry against the schema enum.

Gate additions, all cheap, each catching a class of silent defect:

1. registry against schema enum, both directions — **done**
2. every registered type has a manifest entry — catches a tile that exists but cannot
   appear in the library
3. every declared variant has both a CSS class and a markup variant — catches a variant
   offered in the UI that renders nothing
4. every manifest field list matches the registry — catches the half-added tile

That set turns adding a tile type from an eight-place ritual with four silent failure
modes into a task with a checklist that fails loudly.

---

## 4. Features the brief does not mention that I would add

### Must-have — prerequisites, not extras

1. **Autosave + crash recovery.** Draft to `localStorage` on a debounce, restore on
   load with an "you have unsaved work" prompt. Without it every other feature is a
   faster way to lose an afternoon. The precedence exists — `sites-theme.js` already
   uses `localStorage` for the theme mode.
2. **Import / open.** `content.json` first (the common edit case), `blueprint.md`
   second. A builder that can only create is a demo.
3. **Undo / redo with a real transaction boundary.** `state` is a plain object, so
   snapshot history is cheap. The work is deciding what commits — a field blur, a tile
   add/remove/move, a settings change — and coalescing keystrokes so typing a headline
   is not forty undo steps.
4. **Live validation.** Mirror `check-site.mjs`'s rules: unregistered type, config key
   with no slot in the snippet, duplicate `data-tile-id`, empty required fields,
   `asset:` keys that do not resolve. A status area saying "3 problems" that jumps to
   them. This is the difference between a toy and a tool.
5. **Grid-mode choice** (`automatic` | `configured`). Required before spans mean
   anything (3.3).

### High value, small

6. **Click a tile in the list -> the preview scrolls to it and outlines it.** Two-way
   selection. The biggest usability win in the list: it turns the preview from a
   picture into a map of the thing being edited.
7. **Duplicate tile.** Trivial, heavily used.
8. **Keyboard shortcuts.** Ctrl+Z / Ctrl+Shift+Z / Ctrl+S / Ctrl+D.
9. **Icons and one-line descriptions in the library.** The registry has `label` but no
   icon and no prose. Adding `icon` and `about` to `tileRegistry` is small and every
   future tile gets it for free — and it is what makes the foldable "more info"
   section possible.
10. **Empty state that teaches.** A first-run nudge ("start with a hero, then a feature
    block") rather than a blank canvas and a long list.

### Worth considering

11. **A zip export.** A `STORED`-only zip writer is about 60 lines in the browser with
    no dependency — the same trick `tools/og-image.mjs` uses to hand-write PNG. Only
    worth building once there is something to put in it; see section 5.
12. **Contrast / a11y panel.** The framework claims AA contrast; a live checker over the
    chosen theme is cheap to compute and a genuine differentiator.
13. **Multi-page.** At minimum a page list and a per-page tile set. Bigger than it looks:
    `state.page` is a single object, the export assumes one page, and the preview needs
    a page switcher.
14. **Copy tile as JSON to the clipboard**, for reuse across sites.

---

## 5. The gap nobody has mentioned: the export does not produce a site

The builder exports `blueprint.md` and `content.json`. Those are two data files.
Turning them into a deployable site needs a scaffolding step, and
**`tools/scaffold.mjs` does not exist** — it has been the top item on the handoff
since before this session.

`examples/pawn-shop/build.cjs` proves the sequence works (scaffold pages from snippets
-> bake copy -> og-image -> seo), but it is hand-written for one recipe.

**This matters for the builder round specifically**, because a builder is judged by
what comes out of it. A beautiful editor that emits a file you then have to assemble by
hand is a worse experience than the command line it replaced. So either:

- **A.** build `tools/scaffold.mjs` first, so the builder hands off to one command, or
- **B.** keep the builder emitting `blueprint.md` + `content.json` and have its export
  panel print the exact scaffold command, so the hand-off is one paste.

B is honest and cheap. A is the real fix and it is the item the business model waits on.
**Suggestion: B inside this round, A immediately after** — the builder gives the
scaffolder a reason to exist and a shape to match.

---

## 6. Build order

Each phase is independently shippable, and the order is a dependency order rather than
a preference order.

| Phase | Contents | Blocked by |
|---|---|---|
| **0a — Invariants** | Component manifest + the four gates (3.10) · `entry.layout` in the model and the binder (3.7) | ✅ **done** |
| **0b — Foundations** | State transactions · undo/redo · autosave + recovery · import | ✅ **done** |
| **1 — Shell** | Three-panel layout · toolbar (screen name, undo/redo, import, save as) · shortcuts | ✅ **done** |
| **2 — Preview** | Viewport switcher · grid overlay with span shading · behaviour modules · click-to-scroll | ✅ **done** |
| **3 — Library** | Icons · searchable descriptions · foldable info · duplicate | ✅ **done** |
| **4 — Layout** | Grid-mode choice ✅ · span inputs ✅ · reorder ✅ | ✅ **done** |
| **5a — Background** | `site.plate` model · runtime · bake · schema · builder control (3.5) | ✅ **done** |
| **5b — Chrome nav/footer** | Variants declared once, then CSS, picker, both-directions gate (3.4) | ✅ **done** |
| **6 — Validation** | Mirror `check-site` rules in a problems panel | ✅ **done** |
| **7 — Code panel** | Config level · demonstration mode with UI sync · scoped CSS level | ✅ **done** |

Phase 0 is not optional and not glamorous. It is the difference between a demo and
something you would trust with a client site.

---

## 7. Decisions needed

1. **Nav/footer variants** — which layouts, and how many? Blocks the whole Chrome panel
   (3.4).
2. **`site.plate` shape** — mode names and parameters (3.5).
3. **Code panel scope** — Levels 1+2, or 1+2+3? Level 3 changes what the export is and
   what the registry means (3.6).
4. **Library vs Inspector for span/order** — the one layout refinement I would push for
   (section 2).
5. **The `custom` tile** — which primitives make the first cut (3.8), and whether the
   risk of it becoming the default path is acceptable.
6. **Layout in the content model** (3.7) — confirm that `data-span` / `variant` move from
   the element into `entry.layout` / `entry.variant`. Everything else in the work-file
   design depends on this, and it is the one change that touches the runtime, the baker
   and the schema together.

---

## 8. What a codebase audit adds to this plan

Run before starting, and it changed the order. Measured, not remembered.

### 8.1 The binder/baker mirror is unpinned — and phase 0a edits both sides

| Mirror | Files | Lines | Pinned by |
|---|---|---|---|
| Binding rules | `src/js/sites-content.js` <-> `tools/bake.mjs` | 290 / 482 | **nothing** |
| YAML emission | `tools/blueprint.mjs` <-> `src/js/sites-builder.js` | 294 / 793 | `tests/builder-roundtrip.cjs` |

The binding rules exist twice: once in the browser binder, once as `makeBinder()` in the
baker. Nothing checks that they agree. **This is the same shape as the bug that already
bit us** — `sites-builder.js` carried a hand-written mirror of the compiler's copy
normalization, went stale, and silently flattened multi-paragraph bodies.

It matters more here than it did there, because when these two disagree the served HTML
and the JS-rendered DOM differ — **the page changes under the reader on load**, and the
no-JS version is the wrong one. For a crawler or a scraper it is the only version.

And phase 0a edits both: `entry.layout` is specified as "applied by the binder, at runtime
and at bake". So the safety net goes up before the change, not after.

**Verdict: `tests/binder-roundtrip.cjs` was the first task, ahead of the manifest — and it
immediately found a shipped regression.**

`bake.mjs` selected the template's first child with `tpl.children[0]`. On a snippet whose
`<template>` is written across lines that is a whitespace text node, so cloning it per item
produced one blank line per item instead of markup. The browser binder uses
`tpl.content.firstElementChild` and was immune — which is exactly why nobody noticed.

Blast radius, measured:

| Page | Baked list items before the fix | After |
|---|---|---|
| `examples/pawn-shop/services.html` | **0** — 12 whitespace nodes | 12 crawlable links |
| `examples/pawn-shop/index.html` | **0** | 4 |

The compact-keywords hub — the framework's flagship SEO feature — was shipping with **no
crawl path at all**. Every landing page was orphaned as far as a search engine was
concerned, while the page looked perfect in a browser. `docs/COMPACT-KEYWORDS.md` §5 makes
exactly this point about the hub being the crawl path; the code did not do it.

Why the existing checks missed it: `check-site.mjs` validates structure and metadata, not
baked list contents; and every browser check since the `build.cjs` refactor had JavaScript
**enabled**, so the binder repaired the page before anything looked at it. Both traps are
now recorded in `AGENTS.md` §9.

### 8.2 Three tiles break the documented root-class convention

`MODULE-SPEC.md` §1 says a tile root is `.tile-<name>`. Three disagree:

| Type | Actual root class |
|---|---|
| `content-card` | `.tile-card` |
| `feature` | `.tile-feature-block` |
| `pricing` | `.tile-price` |

Nothing has broken yet because nothing derives a selector from the type name. **This plan
is the first thing that wants to:** the manifest declares variants as
`tile-<name>--<variant>`, and the builder wants `.tile-<type>` to highlight the selected
tile. Both would silently miss these three.

Two options, and it should be a decision rather than an accident: make the three match the
spec, or record the root class in the manifest and stop deriving it. The second is more
honest — the class is already a design choice per tile, and renaming would touch every
site built so far. **Recommendation: the manifest carries `rootClass`.**

### 8.3 Rule 3 is violated five times, and nothing checks it

A scan of `src/css/nown-tiles.css` for raw colour values outside `:root`:

| Line | Value | Where |
|---|---|---|
| 30 | `rgba(0,0,0,.10)`, `rgba(255,255,255,.25)` | `.btn-tactile` box-shadow |
| 35 | `rgba(0,0,0,.08)`, `rgba(0,0,0,.06)` | `.btn-tactile:active` box-shadow |
| 265 | `#000` | `.tile-video` background |
| 266 | `#fff`, `rgba(0,0,0,.2)`, `rgba(0,0,0,.55)` | `.tile-video__placeholder` |
| 334 | `#000` | dark-mode `.tile-code pre` |

(`nown-plate.css` scans clean — everything the naive scan flagged is inside the
`[data-theme="dark"]` token block, which is legitimate.)

This matters to this plan specifically: §3.6 proposes a lint on the code panel that
**rejects raw hex, so that rule 3 holds for user CSS**. Pointed at the framework's own
stylesheet, that lint starts red. Either fix the five (they are all shadow and video-chrome
values that want tokens), or the lint has to ship with an allowlist that makes it a lie.

Verdict: **fix the five as part of phase 0a.** They are small, they are real rule
violations, and they unblock the lint.

### 8.4 `nav-dock` has zero editable fields and is never a content entry

The registry entry has `fields: []`, and `nav-dock` is the one tile that appears in
neither shipped site's content file — the nav is chrome, injected by the page shell and
driven by `doc.nav`, not by a tile config.

That is coherent, but the library panel in this brief would render it as a tile with
nothing to edit. Either give it a config (so it can be added and configured like anything
else) or mark it in the manifest as chrome-only so the library shows it under the Chrome
section rather than the catalog. **The manifest's `role: "chrome" | "content"` field
handles this**, and §3.4 already needs the Chrome section to exist.

### 8.5 Coverage and test depth

| Measure | Value |
|---|---|
| Registered tiles | 28 |
| Rendered by the framework site | 23 |
| Rendered by the generated recipe | 10 |
| Never rendered anywhere | 1 — `nav-dock`, because it is chrome |
| Test files | **2** |
| Total assertions | **23** |

So the catalog is reasonably exercised by the two sites, and the thin part is not coverage
of tiles — it is **assertions**: 23 of them for 28 tiles, 4 tools and 3 runtime modules. The
mirrors in 9.1 are the highest-value thing to pin next, which is why the order changed.

### 8.6 No variants exist anywhere

A scan for `tile-<name>--<variant>` modifier classes in the stylesheet returns nothing, and
the registry has no `variant` field. Confirms §3.4: nav and footer variants are greenfield,
not a picker over existing options. Budget accordingly.

### 8.7 The revised order

| Phase | Contents | Changed? |
|---|---|---|
| **0a — Safety net** | `tests/binder-roundtrip.cjs` — prove the binder and the baker agree | ✅ **done** |
| **0b — Invariants** | Tile metadata + gates · `entry.layout` / `entry.variant` in the model and both appliers · the five rule-3 violations | ✅ **done** |
| **0c — Foundations** | transactions · undo/redo · autosave · import | ✅ **done** |
| 3 | library fold-out — per-tile foldable info in the picker | ✅ **done** |
| 5a | background — `site.plate` | ✅ **done** |
| 5b | nav/footer variants | ✅ **done** (split out of 5a) |
| 7 | code panel — config, demonstration, and the CSS level | ✅ **done** |

**Every phase is built.** The table above is kept as the record of what the order
was and why; for what each phase actually turned into, read §8b onward.


## 8b. Phase 0a/0b — what was built, and two reversals

Landed in `06a1607` and `0b7a0a2`.

**`entry.layout` and `entry.variant` are real.** Applied by the binder at load and by
the baker at build time, lifted out of config by `tools/blueprint.mjs`, documented in the
schema, and mapped from the blueprint as `layout: { span, spanSm, start }` plus
`variant: <name>`. `variant` had been declared in the schema from the start and never
implemented.

**`site.layout.mode`** (`auto` | `cols`) is how a site says whether its tiles sit in the
configured 12-column grid. The recipe declares `cols` and its `build.cjs` wraps `<main>`
accordingly. Measured in headless Chrome with JavaScript disabled:

| Width | Container | Tier | visit (span 7) | products (span 5) |
|---|---|---|---|---|
| 1280 | 976px | 12 columns | 559px | 393px, side by side |
| 834 | 786px | 12 columns | 449px | 314px, side by side |
| 390 | 342px | 6 columns | 342px (spanSm 6) | 342px, stacked |

**Two gates, both verified by building a fixture that fails:** an out-of-range span
(`layout.span is 99 — must be a whole number from 1 to 12`), and a layout on a page with
no `.sites-grid--cols` container — because the binder writes the attribute either way and
it then simply does nothing.

**The five rule-3 violations are gone**, replaced by `--shadow-tactile`,
`--shadow-tactile-active`, `--color-media-void`, `--color-on-media`, `--scrim-media` and a
`color-mix` against the page background. Zero raw colour values remain in the tile
stylesheet. This unblocks the code panel's CSS lint, which would otherwise have started
red against the framework's own CSS.

**Tile metadata** (`icon`, `about`, `role`) is merged into every registry entry, with a
gate that fails when any is missing. That is what makes the library panel's icons,
one-line descriptions and Chrome-vs-content split possible.

### Reversal 1 — there is no separate manifest file

The plan proposed a `src/modules/<type>.tile.json` beside each snippet. Building it that
way would have meant 28 new files and a second table to keep in step with the registry.
The metadata went into `tile-registry.js` instead, which every consumer already reads —
admin, builder, `check-site` — so there is one object per tile rather than two to join.
The gates supply what the file would have supplied: proof that the pieces agree.

### Reversal 2 — `rootClass` was dropped, and the styling gate with it

The plan said the metadata should carry `rootClass` because four tiles break the
`.tile-<name>` convention. On building it, nothing consumed the field: the variant class
is derived from the **type** name and lands on whatever root the snippet has, so it works
either way. A recorded field nothing reads is a field that will go stale.

The styling gate went too. It was meant to warn when a tile has no CSS rule, but the root
element also carries the shared `tile` and `section` classes, which are always in the
stylesheet — so it passed vacuously; and making it accurate required an allowlist for the
four non-conforming tiles. A gate that is either vacuous or wrong is worse than no gate,
and an unstyled tile is obvious on sight. Both reversals are recorded in the code so the
next person does not re-add them.

MODULE-SPEC should note the four non-conforming root classes where it states the
convention — that is the useful half of the `rootClass` idea, without the field.

## 8c. Phase 0c — the builder can now be trusted with work

Landed with `tests/builder-undo.cjs`, which drives the real page in a browser and
asserts on `SITES.builder.instance.state` — the authority — rather than on DOM rows.
17 assertions, all passing.

| Was missing | Now |
|---|---|
| No persistence of any kind — a refresh lost the site | Draft to `localStorage` on a debounced edit, offered as a restore/discard bar after a reload |
| No undo | Snapshot history, 60 steps, with the toolbar buttons reflecting depth |
| No way to open existing work | **Open…** reads a `content.json` back into the builder |

**The commit boundary is the whole design.** `state` is a plain object so a deep clone
is cheap and there is no command log to keep in step. The work was deciding what
commits: every content mutation goes through one `edit(label, fn)` helper, and nothing
else touches `state`. Selection is deliberately not a content change.

**Coalescing matters more than it sounds.** The admin widgets fire `onChange` on every
keystroke, so a naive history would make typing a headline forty undo steps — the
feature would exist and be useless. `edit()` collapses a burst to the same target inside
600ms into one step, and the test asserts exactly that: three rapid edits to one field,
one step. Verified.

**A mistake the test made, recorded in its own header:** the first version counted
`.bld-list li` rows and concluded undo was broken. The structure list renders an `<li>`
for its own empty state, so the count never reached zero. It asserts on state now.

Import is `content.json` only. A blueprint importer would need a second YAML parser in
the browser, mirrored from `tools/blueprint.mjs` — and this project has already been
bitten twice by unpinned mirrors. The import path says so instead: point the author at
`node tools/blueprint.mjs <file> --out content.json`.

## 8d. What the builder actually looks like (checked in a browser)

Screenshotted and measured before restructuring, because every decision in this plan so
far came from reading code, and the plan is about how the thing *feels*.

### It is in better shape than the gap list suggested

- The toolbar is correctly sticky at `top: 0`; undo/redo disable correctly (Redo greyed
  with an empty future).
- The status line earns its place: *"3 tiles · 0 with copy · 3 showing snippet
  placeholder copy"* tells you what still needs writing.
- The preview column is already sticky, so it stays visible while you scroll the editor.
- Icons and the one-line `about` render in the picker and read well.
- No horizontal overflow at 1600px.

### Two real problems, both measured

**1. Adding a tile threw the viewport 1878px down the page.** `addTile()` focused the
first editor field, and the browser scrolled to it — away from the picker just used and
the preview being watched. Fixed with `focus({ preventScroll: true })`. This is the kind
of defect no amount of reading finds and one screenshot does.

**2. The preview does not follow the selection.** Adding three tiles left the preview
showing only the first, scrolled to 0, because the iframe has its own scroll position and
nothing connects it to the structure list. This is plan item 4.6 — click a tile, the
preview scrolls to it and outlines it — and it is now the single highest-value thing in
Phase 2, because without it the preview is a picture rather than a map of what you are
editing.

### What the screenshot changed about Phase 1

The current arrangement is `pick · configure · preview`, with the configure column the
longest and the preview column short — so the right third of the page is mostly empty
below the preview. The three-panel plan puts the preview in the middle and the inspector
on the right, which also means the inspector needs to be tabbed (Content · Layout ·
Chrome · Code): stacking four panels in one column is what made the middle column 2934px
tall in the first place.

## 8e. Phases 1 and 4 — the shell, and grid placement in the UI

Verified by screenshot and by measurement, in a browser, at two window widths.

```
  TOOLBAR  [Screen name] Undo Redo | Open…  Download blueprint.md  content.json | status
  +--------------+--------------------------+---------------------------+
  | ADD A TILE   |  PREVIEW                 |  INSPECTOR                |
  | filter       |  Fill Desktop Tablet …   |  Content Layout Site Code |
  | chrome       |  Grid toggle             |  Page order / Grid / fields |
  | hero         |  the real site, scaled   |                           |
  +--------------+--------------------------+---------------------------+
```

| Width | Columns | Preview scale | Overflow |
|---|---|---|---|
| 1600 | 236 · 810 · 426 | 0.571 | none |
| 1280 | 236 · 952 (preview on its own row) | 0.923 | none |

**The frame keeps its LAYOUT width and is scaled for DISPLAY.** Sizing the iframe
to 1280px inside a 560px column grew the grid track rather than shrinking the
frame — an iframe's width is a min-content contribution — which pushed the whole
inspector off screen. `transform: scale()` keeps the container query honest (the
container really is 1280px wide) while the column stays put. `min-width: 0` alone
was not enough; measured before and after.

### Three defects the browser found that reading could not

1. **Adding a tile threw the viewport 1878px.** `addTile()` focused the first editor
   field and the browser scrolled to it. Fixed with `focus({ preventScroll: true })`.
2. **Copy edits were not undoable at all.** The editor's field widgets mutated
   `tile.config` directly and never went through `edit()`. Found by the coalescing
   assertion in `tests/builder-undo.cjs`, which reported **zero** steps where it
   expected one — the test was written to check coalescing and caught a missing
   feature instead.
3. **The registry's icons rendered nowhere.** `icon` had been added to all 28 tiles
   and the picker still hardcoded `+ <label>`. The library now shows the glyph and
   the `about` line, and search covers both.

### A note on the tooling, which cost two wrong conclusions

Playwright's `locator.click()` **scrolls the element into view first**. Measuring
the page position around one of those clicks therefore measures the test, not the
app — which is how "adding a tile scrolls the page" appeared to survive its own
fix. Click in-page via `evaluate` when the measurement is about position. The same
heuristic error made an earlier run conclude undo was broken: the structure list
renders an `<li>` for its own empty state, so counting rows never reaches zero.

### And one about this repo

A read→modify→write cycle silently deleted the tail of `sites-builder.js`. The
cause turned out not to be what it looked like: the read tool caps its output at
roughly 50,000 characters and truncates **silently**, while `totalLines` keeps
reporting the truth. Measured — a 1627-line file returned 1120 lines, and a
synthetic 3000-line file with longer lines returned 733, so the limit is
characters rather than lines and sits far below the documented 2000-line ceiling.
The tell is `lines.length < totalLines`. Every change to a file that size goes
through targeted `edit` calls, and the trap is now recorded in `AGENTS.md` §9.

## 8f. Phase 2 — the preview became a map rather than a picture

Pinned by `tests/builder-preview.cjs`, 16 assertions driving the real page.

**The preview follows the selection.** Clicking a tile in the inspector marks it in
the preview and brings it into view. Before this, adding three tiles left the
preview showing only the first, scrolled to 0 — the iframe has its own scroll
position and nothing connected it to the structure list.

**Behaviour modules load into the preview.** The preview previously ran only the
binder, so every dynamic tile was invisible while you configured it. The visit
tile's "Closed — opens 9am" badge now appears in the preview, which is the
difference between configuring a tile and guessing at it.

**The overlay shades the columns the selected tile spans**, in whichever tier the
frame is in: 12 columns wide (7 shaded for a span of 7), 6 narrow. It reads the
same `--grid-cols` tokens the grid does, so it cannot disagree with what is
rendered.

### Three contracts that were silently broken

1. **`applyContent` never set `SITES.contentDoc`** — only the fetch path `load()`
   did. The builder applies a document directly, so every tile behaviour reading
   it at init did nothing, silently. Fixed at the source: `apply` records the
   document it bound, however it arrived.
2. **The blueprint emitter wrote `[object Object]` for nested site fields.**
   `yamlMap` called `yamlField` on every entry, so anything nested — `business`,
   `seo`, `layout` — was stringified into invalid front matter the compiler could
   not read back. The emitter is recursive now. Caught by extending the round-trip
   test's fixture with the nested blocks; the test had been passing because both
   sides were equally absent.
3. **`siteObject` dropped `site.layout`.** The export is a *projection* of state,
   so the grid mode the UI had just started writing never reached the file. Import
   had the mirror problem — it rebuilt the site block from three keys, so a content
   file's `business` or `seo` vanished on the next export. Both now pass the block
   through, and `tests/builder-roundtrip.cjs` asserts each key by name so a future
   omission says which one went missing.

### One more CSS collision

Hovering an active viewport button made its label disappear: `:hover` is `(0,3,0)`
— `.bld-tool`, `:hover`, `:not([disabled])` — and beat a plain `.bld-tool.active` at
`(0,2,0)`, so the label repainted in the background colour. A clicked button keeps
the pointer, so this is the normal case, not an edge one. Measured in the browser
rather than guessed.

### And a 404 per tile, removed by declaring rather than probing

Loading behaviour modules by fetching `src/modules/<type>.js` for every tile logged
a 404 for each tile without one — most of them. The registry now **declares**
`behaviour: true` for the nine types that have a module, and `check-site.mjs` fails
in both directions: a declared behaviour with no file, or a file with no
declaration. Verified by un-declaring one and watching it fail.

## 8g. Phase 6 — validation where the defect is made

Pinned by `tests/builder-validate.cjs`, 23 assertions.

The builder mirrors the rules `tools/check-site.mjs` enforces, so a problem appears
while it is being made rather than after an export and a command line. The point is
not to replace the gate — the gate still runs — it is that a defect should be
visible where it is created.

| Rule | Level |
|---|---|
| `layout.span` / `spanSm` / `start` out of range, or not a whole number | error |
| Duplicate tile id | error |
| Tile id missing — the binder matches on `data-tile-id` | error |
| Unregistered tile type | error |
| No snippet published for the type | error |
| A declared field with no slot in the snippet — typed copy would be dropped | warning |
| `layout` placement while the site is in automatic mode, where a span does nothing | warning |
| Unknown `layout` key | warning |
| No site name; no base URL; no tiles at all | warning |

Errors and warnings are separated visually — the error dot and left border use the
accent token — because a page with a warning is exportable and a page with an error
is not. Each row jumps to the tile it concerns and marks it in the preview.

**The panel sits above the tabs, not inside one.** A defect should be visible
whichever panel you happened to be in when you caused it.

### The bug this phase produced, and what caught it

`ensureSnippets()` was written at module scope while reading `state` and calling
`renderProblems()`, both closures inside `mount()`. Every render threw
`state is not defined` — and **the panel still looked completely correct**, because
the throw happened *after* the render. Only a console-error assertion in the browser
found it. That is the argument for asserting on the console, not just on the DOM.

### And the read cap, settled at last

Two phases ago a read → modify → write cycle deleted the tail of
`sites-builder.js` and the cause was guessed at as "a line cap somewhere around
1100". Measured properly this time: the read tool caps its **output at roughly
50,000 characters** and truncates **silently** — `totalLines` stays truthful while
`lines` does not. A 1627-line / 76 KB file returned 1120 lines; a synthetic
3000-line file with longer lines returned 733. Paging with `offset` works exactly
(1120 + 507 reconstructed the file), and the tell is `lines.length < totalLines`.
Recorded in `AGENTS.md` §9, since the file is over the limit and this will happen
again to whoever edits it next.

## 8h. Phase 7 — the code panel, demonstration first

Pinned by `tests/builder-code.cjs`, 34 assertions.

Built to §3.6's ordering: readable by default, connected to the UI, read-only until
asked, and annotated rather than merely displayed.

**Readable.** One row per line, colourised by a small hand-written JSON tokeniser —
no dependency, and the panel obeys the same token rule it will later lint other
people's CSS against. Every colour is a `var(--color-*)`.

**Connected.** Hovering or focusing a field in the Content tab lights the line of
JSON that carries it. That synchronisation is the lesson: it makes "copy is data"
visible instead of theoretical.

**Read-only until asked.** The view is the default and the textarea appears only
after Edit. Nobody breaks a site by typing.

**Annotated.** Each line carries an explanation — why `data-tile-id` matters, which
snippet renders the type, which `data-role` a field lands in, how many `<p>` a
multi-line string becomes.

**Editing writes into the same document.** Not a parallel override layer: Apply
parses the JSON and writes it into the tile through the same `edit()` every form
field uses, so undo covers it, the preview re-renders, and the change appears in
both the `content.json` export and the blueprint. Verified end to end, including
undo.

### Three things the build got wrong first, and what corrected each

**1. The panel lied about multi-line copy.** It rendered a string containing
newlines as an *array of paragraphs* — which reads nicely and misrepresents the
artifact, since `content.json` carries one escaped string. For a surface whose
whole claim is "the same work file, not a rendering of it", that is not a
presentation choice, it is a falsehood. Now one escaped line, exactly as
`JSON.stringify` writes it, with the paragraph behaviour in the annotation instead.
The test asserts the string round-trips through `JSON.stringify`.

The related distinction that is *not* a lie: condensing a nested group onto one line
(`"layout": { "span": 7 }`) changes whitespace, not the value. Edit mode shows the
fully expanded form, and the test asserts it is **byte-identical** to
`JSON.stringify(entry, null, 2)` — that is where exactness is guaranteed, because
that is the form Apply round-trips through.

**2. The annotations were unreadable.** In a right-hand gutter in a 426px column,
every one was clipped to "the binder matches d…" — and the annotations are the
teaching content, so clipping them defeats the feature. They now own a row beneath
the line they explain. Full width, no truncation, at any column width.

**3. Two of my own verifications were wrong before the code was.** Synthetic
`MouseEvent` dispatch proves a listener exists and nothing about whether hovering
works; it produced a false "leaving does not clear the light" failure, and the same
habit produced a false "the page scrolls on add" two phases earlier. The test now
uses real pointer movement via `locator.hover()` and `mouse.move()`. **This is the
third time this suite has been misled the same way**, and the pattern is now written
into the test header: any assertion about position or pointer state must drive a
real pointer.

## 8i. Phase 5a — the plate

Pinned by `tests/builder-plate.cjs`, 22 assertions.

`site.plate = { mode, color?, image? }` with five modes: **ambient** (the two radial
washes, now following the theme tokens), **color** (a flat plate), **image**, 
**animation** (the wash drifts), and **none**.

Applied twice, deliberately: the binder at load and `tools/bake.mjs` at build time,
writing the same two things — a `data-plate` attribute and two CSS variables. The
background is the first thing painted, so a page that set it only on load would
flash the default, and a page with JavaScript off would never set it at all. The
test asserts the baked page **with JavaScript disabled**.

**Reduced motion degrades the animation to the identical still wash**, not to
nothing — the motion is decoration, not information. Asserted in a context created
with `reducedMotion: 'reduce'`.

It also removed the last rule-3 violation outside a token block: the wash was
`rgba(217,119,6,0.06)` and `rgba(30,77,79,0.05)`, the accent and primary hardcoded,
so it did not follow a re-theme and would have failed the code panel's own token
lint. Both stylesheets now scan clean.

### The four bugs this phase produced

**1. `site.plate` was not in the builder's export projection.** The identical bug
`site.layout` had, two phases after being fixed — the export is a projection of
state and a forgotten key is a silent drop. `favicon` had it too. The round-trip
test now asserts each key by name, so the next omission says which one went missing
rather than showing a diff of a large object.

**2. Baking the plate was not idempotent.** Bake merged its declarations into the
existing `style` attribute and never removed any, so a colour deleted from
`content.json` stayed in the HTML across every later bake and no re-bake could clear
it. The plate's own declarations are replaced now; anything else on the element is
preserved.

**3. The parser was not the serializer's inverse.** `serialize()` escapes `"` to
`&quot;`; `parseAttrs()` decoded nothing. The round trip was lossy for any attribute
containing a quote and compounded on every bake. Latent until the plate's
`url("…")` was the first attribute value to contain one — and the first buggy bake
had already written debris into eight pages, which had to be restored from git
before the fix could be verified.

**4. `check-site` resolved rooted paths as filesystem-absolute.** On Windows
`path.resolve(dir, '/assets/x.svg')` is `C:\assets\x.svg`, so every rooted reference
was reported missing. That had never fired because the served pages still had
unbaked `src=""`; the first bake that filled in resolved asset URLs produced seven
errors on a site whose files were all present.

### And one from the plate's own control

`renderPlate()` was written inside `buildSettings()` and never called from
`refresh()`, so the Mode select read "ambient" while the state said "color"
whenever the plate changed from anywhere else — an import, an undo, the code panel.
Found by asserting the control against state rather than against itself.

Two of my own verification attempts were also wrong before the code was: a test that
aimed at `input[type=url]` filled the site's base URL, and one that aimed at "the
last input" filled the image's *alt* box, because the image widget renders two. Both
produced a plate with no image and **no error**. The controls now carry a
`.bld-platefields` class so they are addressed directly instead of by counting.

## 8j. Phase 5b — the menu bar and the footer bar

Pinned by `tests/builder-chrome.cjs`, 25 assertions.

`entry.variant` had been applied by the binder and the baker for two phases with
nothing to drive it. Three nav shapes and three footer shapes now ship, declared
once in `tile-registry.js` and read by the builder (which renders the picker) and
by `check-site` (which fails on a variant that does not exist **and** on a variant
rule nothing can select):

| Type | Variants |
|---|---|
| `nav-dock` | default (the floating pill) · `bar` (full width, links centred) · `minimal` (theme toggle alone) |
| `footer` | default (brand, links, legal) · `simple` (one row) · `minimal` (legal line only) |
| `cta` | default (left) · `center` |

**The minimal variants hide their links by clip, not by removal.** A nav or footer
that deletes its own destinations from the served HTML to look tidy costs real SEO.
The links stay in the DOM and stay in the crawl path; the test asserts both halves —
present, and visually hidden.

**The new gate paid for itself immediately.** Checking that every declared variant
has CSS *and* every variant rule is declared found `.tile-cta--center`: a variant
every snippet and every page hardcoded in markup, which the content model could not
express at all. It is declared now, and selectable from the tile editor.

### Rule 5, cleaned up on the way

Building the variants meant touching the nav, and the nav carried an
`@media (min-width: 768px)` — a page-level **layout** media query sitting in the
tile stylesheet, which is exactly what rule 5 forbids. A variant cannot decide how
the links reflow when the header is narrow, so that became a container query on
`.site-header`. `nown-tiles.css` now has no media queries at all.

### The bug this phase found, and the test that should have found it two phases ago

**`buildContentDoc` never emitted `entry.variant` or `entry.layout`.** The builder
wrote both into state, applied both in its own controls, and dropped both on the way
out — so neither had ever reached the preview or the exported `content.json`. The
binder code that applies them was correct and proven; the builder simply never fed
it.

`tests/builder-roundtrip.cjs` had assertions named *"layout survives the projection"*
and *"variant survives the projection"* that had been passing the whole time. They
compared the builder's output against the compiler's output, and **both were equally
absent** — the precise symmetric-absence weakness this plan's own verification
section warns about, in the test written to guard against it.

Every projection assertion now names the **value the fixture set** rather than
claiming agreement, and doing so immediately found a second bug behind the first:
`yamlScalar` quoted every number, so `layout.span` 7 round-tripped as the string
`"7"`. Both fixed; 18 assertions where there were 15.

The lesson is narrow and worth repeating: **an assertion that two things agree does
not test that either of them is right.**

### Two more verification mistakes, both mine

The chrome test asserted the dock was a pill while the preview was at the default
"Fill" width, where the frame is about 710px and the compact shape is *correct* —
it failed for the right reason and the test was wrong. And the "links are hidden"
check needed three attempts: `getBoundingClientRect().width` was wrong because the
clipped links kept their padding, and `checkVisibility()` — the tempting "just ask
the browser" answer — **does not consider `clip-path` at all** and reports them
visible. The assertion is on the mechanism now: a 1px box, clipped, still in the DOM.

## 8k. Phase 7b — the tile CSS level, and the hole it exposed

Pinned by `tests/builder-css.cjs`, 30 assertions. The last unimplemented item from
the original brief, and the last row of §3.6's level table.

`entry.css` is a small block of **declarations only**, scoped by the framework to
`[data-tile-id="…"]` and collected with every other tile's block into **one
site-level `<style>`** — not a style attribute per tile, and not one element per
tile. The binder builds it at load; `tools/bake.mjs` writes it into the served
HTML, so a page with JavaScript disabled is styled identically rather than flashing
an unstyled tile on every visit.

Three rules, implemented once in `tile-registry.js` as `SITES.cssLint` and called
by the builder (as you type), by `check-site` (as a gate) and by `bake` (before it
writes a page):

| Rule | Why |
|---|---|
| **No braces** | A `}` closes the scope the framework opened, and everything after it becomes page-wide CSS |
| **No at-rules** | `@media` cannot appear in a declaration list; `@import` would add a second stylesheet, which rule 6 forbids |
| **No raw colours** | Rule 3. A `#hex` is the one thing that cannot survive a re-theme |

It lives in `tile-registry.js` rather than a module of its own because every page
already loads that file and `check-site` already reads it with `new Function()`. A
separate file would have meant 28 script tags and a page that silently skips the
check by missing one.

### The hole the screenshot found

The baker refused a stray brace. **The binder did not.** It wrapped the block and
injected it, so `} body { display: none` closed the scope, escaped into page-wide
CSS and **blanked the entire preview** — while the lint beside it calmly reported
two errors. Every automated check passed, because every automated check was looking
at state and at the panel, not at whether the page still rendered.

The binder now runs the same check the baker does and drops a block that fails it.
This is the third time in this build that looking at the thing caught what asserting
on it did not.

### And the projection bug, for the third time

`entry.css` was missing from `buildContentDoc`, from `buildBlueprint` and from
`blueprint.mjs`'s entry-level lift — the same class as `site.layout` and
`site.plate` before it. It was caught this time by *predicting* it: the round-trip
fixture gained a `css` block before the feature was wired, so the assertion named
the value and failed immediately rather than after a user noticed.

`blueprint.mjs` now lifts `css` beside `variant` and `layout`. Worth recording why
that lift matters: a key that is not lifted falls into `config` and is then reported
as an unregistered field. The mistake announces itself — but only if something is
reading.

## 8l. Phase 3 — the picker, with the fold-out the brief asked for

Pinned by `tests/builder-library.cjs`, 27 assertions.

The brief asked for a tile list with *"a short name slash description and icon and
foldable drop down section for more info"*. The name, icon and description shipped
earlier; this is the fold-out.

**Adding and reading are two different controls.** The row's label adds a tile; a
small `i` beside it opens the facts. Making the whole row a `<details>` — the
obvious implementation — would mean the click that adds a tile sometimes only opens
a box instead. The test asserts both: clicking the label adds, and does not open a
panel; and adding still works with a panel already open.

**Every fact is assembled from declarations the framework already reads:**

| Fact | Source |
|---|---|
| Type · Snippet | the type, and `SNIPPET_DIR` — what the builder actually fetches |
| Fields | `reg.fields` labels, or "none — this tile is set up by the site" |
| Variants | `SITES.tileVariants`, by label; "one shape only" when there are none |
| Behaviour | `reg.behaviour` → `src/modules/<type>.js`, or "none — static markup" |

Nothing is restated, so nothing can drift from what the gates check — and the test
asserts that by expecting a tile *with* a behaviour to name its `.js` and one
*without* to say so.

**The search got wider to match.** Searching the label and description alone meant
"hours" did not find the visit tile — the word is in its *field list*, which is
exactly what an author would be searching for. The index now covers field labels and
variant labels too. The test caught that on its first run, by asking for a word a
person would plausibly type.

## 8m. Scope, and the one thing still missing

### Where the builder lives, and where it does not

**The builder is not a feature of the sites it produces.** It runs on the framework's
own site (`site/public`), where someone creates a new site or opens an existing one
to edit. A generated site receives the render runtime and nothing else.

| | Framework site | Generated site |
|---|---|---|
| Runtime | everything | `sites.js` · `sites-content.js` · `sites-theme.js` · `sites-assets.js` · `tile-registry.js` |
| Modules | every snippet and behaviour | only the ones the site uses |
| `sites-builder.js` | yes | **no** |
| `admin.html` | yes | **no** |

Verified by reading both copy paths rather than assuming: `tools/sync-site-runtime.sh`
(framework site — copies everything) against `examples/pawn-shop/build.cjs`
(generated site — three runtime files plus used modules, and no builder).

The reason is the target demographic. A page builder is a tool for the person
assembling a site, and a small business owner is not that person — they get the admin
surface for copy and theme, which is deliberately much smaller. The builder's
architecture is in this document so anyone who does want to stand up their own
builder site can, and the boundary is recorded in `AGENTS.md` §5 so it does not
drift.

`site/public` is deployable (`firebase.json` points hosting at it) but **no project
is linked** — `.firebaserc` still holds the `YOUR-FIREBASE-PROJECT` placeholder — so
there is no staging domain. Today the builder runs from a static server on localhost.

### The gap: page tabs, and why it is a bug rather than a feature request

Every site this framework produces is multi-page: each page is its own HTML file and
its entries carry `entry.page`. **The builder cannot edit more than one of them.**

`state.page` is a single `{ name, path }`; `buildContentDoc` stamps that one path on
every tile and emits only `state.tiles`; and `loadContentDoc` filters an imported
file down to its first page.

Measured, not inferred — importing a 3-page / 4-entry `content.json` and exporting
gives **1 page and 2 entries**. The status line does warn ("the builder edits one
page at a time"), but the export still destroys the rest, so this is **data loss**,
not a missing convenience.

What it needs:

1. `state.pages = [{ name, path, tiles, index }]` in place of `state.page` +
   `state.tiles`, with the active page derived rather than stored twice
2. A tab bar above the picker: existing pages as tabs, plus "New page"
3. `loadContentDoc` groups by `entry.page` instead of discarding all but the first
4. `buildContentDoc` and `buildBlueprint` emit every page, each as its own
   `## Page:` section
5. History snapshots the whole set, so undo crosses pages correctly

The format needs no change: `entry.page`, the compiler's `## Page:` sections and a
per-page `path:` all already work, and the recipe's 15-page site proves it. The work
is entirely in the builder's state and UI.

## 9. How each phase gets verified

The framework holds itself to gates, and a builder change is no exception.

- **Every phase:** `node tests/builder-roundtrip.cjs` — the exported blueprint must
  still compile to the exported content file. This is the guard that the editor and the
  compiler stay in agreement, and it already caught one divergence.
- **Phases 2, 3, 4:** drive the real builder in headless Chrome — add tiles, set spans,
  switch viewport, toggle the overlay — and assert on the preview DOM, not on a
  screenshot alone.
- **Phases 5a, 5b:** the exported site must pass `node tools/check-site.mjs` at 0/0,
  and the plate/nav/footer must render with JavaScript disabled.
- **Phase 7:** if Level 2 ships, a raw hex value in the tile CSS must be rejected by the
  lint — verified by trying it.