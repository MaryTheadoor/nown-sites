# templates/ — build a site by hand

Everything needed to build a S.I.T.E.S site **without an AI and without a build
step** — by copying and pasting.

| File | What it is |
|---|---|
| **`plate.html`** | The **starter page**. Copy it, rename to `index.html`, start pasting tiles into `<main>`. |
| **`TILE-KIT.md`** | **Every tile**, ready to copy: the markup + the matching content entry. |

A live version of this material runs at **`site/public/tiles.html`** — the tile
gallery renders every tile from one content file.

---

## The loop

1. Copy `plate.html` → `index.html`
2. Copy a tile's markup from `TILE-KIT.md` → paste it into `<main>`
3. Paste the matching entry into `content.json`
4. Refresh. Your words are on the page.

That is the entire workflow. No install, no compile, no deploy step to preview —
just a browser.

---

## What you need

- A text editor (VS Code, Sublime, even TextEdit in plain-text mode).
- A browser.
- A local server so the content file can be fetched:

  ```bash
  cd your-site && python3 -m http.server 8080
  # → http://localhost:8080
  ```
  (Opening the file directly with `file://` blocks the content fetch — that is the
  browser's security model, not a bug.)

---

## Making it yours

| Want to change | Open |
|---|---|
| Any words on the page | `content.json` |
| The whole colour scheme, fonts, roundness | `content.json` → `theme` |
| Which pages appear in the nav | `content.json` → `nav[]` |
| Images | drop files in `assets/`, then reference `/assets/name.jpg` (or a key in `content.json` → `assets`) |
| Layout / which tiles exist | `index.html` |
| How a tile *looks* | your own CSS file — **use `var(--…)` tokens, never hex** |
| Dark mode | it is automatic: edit `theme.dark` in `content.json` |

**Re-theming is the party trick.** Because every tile uses tokens, changing six
colours in `content.json` re-skins the entire site — including dark mode.

---

## Deploying

Copy the site folder plus the framework files next to it:

```
my-site/
├── index.html
├── content.json
├── src/css/nown-plate.css, nown-tiles.css
└── src/js/*.js
```

Then change the `../src/` paths in `index.html` to `src/`. Upload the folder to any
static host — Firebase Hosting (the default), Cloudflare Pages, GitHub Pages,
Netlify, or IPFS. There is nothing to build.

---

## If you are coming from a website builder

This is a genuinely good next step, and the mental model is small:

| You already know | In S.I.T.E.S |
|---|---|
| Dragging a "section" onto a page | Pasting a `<section data-tile="…">` into `<main>` |
| Editing text in a side panel | Editing an entry in `content.json` |
| Choosing a theme in a gallery | Editing `theme` in `content.json` |
| Uploading an image in a media library | Dropping a file in `assets/` |
| The builder deciding your layout | CSS Grid: `repeat(auto-fit, minmax(300px, 1fr))` |

Three ideas carry the whole framework:

1. **`data-tile`** names a section; **`data-role`** names a slot inside it.
2. **Tokens** (`--color-…`, `--space-…`) hold every value, so themes swap cleanly.
3. **The grid is automatic** — you never write a breakpoint.

Read a tile top to bottom once (`TILE-KIT.md` → `feature`), change one word in
`content.json`, refresh, and watch it move. That is the whole learning curve.

---

## Where to go deeper

- `docs/MODULE-SPEC.md` — the full tile contract and the compliance checklist.
- `docs/ARCHITECTURE.md` — the plate/tile model, tokens, grid mathematics.
- `docs/THEME-ENGINE.md` — the theme engine and the light/dark switcher.
- `docs/ASSETS.md` — repo images vs Firebase Storage.
- `docs/SPEC.md` — the normative standard (read when you want the fine print).
