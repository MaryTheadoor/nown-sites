# Nown S.I.T.E.S Framework

**S**eamlessly **I**ntegrated **T**echnology **E**nabling **S**uccess.

A zero/minimal-dependency framework for building fast, portable, fully-owned
websites from **native HTML, native CSS, and vanilla JavaScript** — arranged as a
dynamic collection of modular **tiles** floating across a **responsive, mathematical
grid**.

> The S.I.T.E.S protocol is an *architectural philosophy*, not a bundler, not a
> component library, and not a template engine. There is no build step, no package
> manager, and no vendor lock-in. It is a methodology for constructing websites
> that remain entirely under the ownership and control of the creator.

---

## Clone this into your agent harness

This repo is built to be **loaded into an AI agent as context**, so the agent can
produce spec-compliant S.I.T.E.S sites with minimal fine-tuning.

```bash
git clone https://github.com/MaryTheadoor/nown-sites.git
cd nown-sites
# point your agent at this directory (Claude Code, Cursor, Devin, DSH, …)
```

| File | Role |
|---|---|
| **`AGENTS.md`** | **The operating manual — harnesses auto-load this.** Rules, repo map, workflow, contracts, definition-of-done. |
| `llms.txt` | Plain-text index of every key file, for a quick context pull. |
| `ai-skill/prompt-instructions.md` | Drop-in system prompt (for ChatGPT/Gemini/custom GPTs). |
| `ai-skill/sites-schema.json` | Machine-readable contract for validation. |
| `docs/INTAKE-FORM.md` | Fill-in brief → everything needed to build a site. |
| `docs/SPEC.md` | The normative standard. |

**Agent workflow:** intake form → blueprint → `tools/blueprint.mjs` → `content.json`
→ pages → checklist. Start with `AGENTS.md`; it routes you to the right spec.

## …or build it by hand

No AI required, and no build step. Two files do the teaching:

| File | Role |
|---|---|
| **`templates/plate.html`** | The starter page. Copy it, rename to `index.html`, paste tiles into `<main>`. |
| **`templates/TILE-KIT.md`** | Every tile's markup **and** its content entry, ready to copy-paste. |
| `templates/README.md` | The four-step loop, deploy steps, and a primer for people coming from drag-and-drop builders. |

Copy a tile → paste it → add the matching entry to `content.json` → refresh. That
is the whole workflow.

Lint it before you ship — no browser needed:

```bash
node tools/check-site.mjs public
```

## The framework's own website

`site/` is **this framework, built with this framework** — self-referential
documentation and a live demo:

```bash
cd site/public && python3 -m http.server 8091
# home        → http://127.0.0.1:8091/index.html
# tile gallery→ http://127.0.0.1:8091/tiles.html   ← every tile, rendered live
# admin       → http://127.0.0.1:8091/admin.html
```

`site/public/tiles.html` renders the entire tile catalog from a single content
file — the clearest proof of the model. Authoring source: `site/blueprint.md`.

---

## Why S.I.T.E.S

Modern web development has drifted toward heavy, centralized, abstracted stacks:
multi-megabyte JavaScript payloads, proprietary drag-and-drop builders, opaque
rent-seeking subscriptions, and homogenized templates. S.I.T.E.S strips the web
back to first principles and reclaims **digital sovereignty**:

- **Zero/minimal dependencies** — pure HTML5 + CSS3 (CSS Variables, Grid,
  Flexbox, Container Queries) + lightweight vanilla JS. No compilation, no bundler.
- **Unpackable by design** — the source *is* the site. Deploy anywhere; migrate anytime.
- **Fast by construction** — no framework runtime, no trackers, `aspect-ratio` kills
  layout shift, `auto-fit` grid means no media-query whack-a-mole.
- **Privacy-first by default** — dynamic behavior is achieved through a curated
  ecosystem of decoupled, embeddable services instead of proprietary backends.

## The core idea: a Plate of Tiles

Every interface is understood as **three layers**:

1. **Background** — atmospheric tone (color, gradient, or subtle animation).
2. **Tiles** — self-contained "index cards" that each hold one data payload
   (a menu item, an event, a map, a video, a form, a product...).
3. **Grid** — the invisible mathematical matrix governing spatial relationships.

Tiles are modular and decentralized: because they are wrapped in semantic HTML and
scoped with their own styles, they can be duplicated, deleted, or reordered without
cascading failures.

## Repository layout

```
nown-sites/
├── AGENTS.md                 # ★ AGENT OPERATING MANUAL (harnesses auto-load)
├── llms.txt                  # plain-text index of key files for agents
├── README.md                 # this file — pitch, philosophy, quick start
├── CHANGELOG.md              # version history (current: 0.6.0 beta)
├── docs/
│   ├── SPEC.md               # ★ MASTER SPEC — normative standard + conformance
│   ├── ARCHITECTURE.md       # Plate & Tile principles, design tokens, core CSS
│   ├── MODULE-SPEC.md        # How to build a custom S.I.T.E.S tile/module
│   ├── CONTENT-MODEL.md      # Standardized copy file + admin dashboard + adapters
│   ├── INTAKE-FORM.md        # ★ Fill-in brief: everything needed to build a site
│   ├── BLUEPRINT-FORMAT.md   # ★ Markdown authoring format + compile pipeline
│   ├── INTEGRATIONS.md       # ★ Blocks, adapters & recipes (auth, payments, AI)
│   ├── AI-HARNESS.md         # Guidelines for AI agents generating S.I.T.E.S sites
│   ├── DEPLOYMENT.md         # ★ Firebase default stack + alternatives
│   └── ROADMAP.md            # Vision: protocol home, programmatic + full builders
├── firebase.json             # ★ Hosting + Storage + Firestore config (default stack)
├── .firebaserc               # project id (replace YOUR-FIREBASE-PROJECT)
├── storage.rules             # public-read content; admin-only write
├── firestore.rules           # optional draft→publish rules
├── ai-skill/
│   ├── prompt-instructions.md  # Drop-in context file for AI agents / custom GPTs
│   └── sites-schema.json       # Declarative spec for module assembly (manifest)
├── templates/                # ★ Build-by-hand kit (no AI, no build step)
│   ├── plate.html            #   starter page — copy, paste tiles into <main>
│   ├── TILE-KIT.md           #   every tile's markup + content entry
│   └── README.md             #   the loop, deploy steps, builder-to-code primer
├── site/                     # ★ The framework's own website (self-referential)
│   ├── blueprint.md          #   its authoring source
│   └── public/               #   index.html · tiles.html · admin.html · content.json
├── tools/
│   ├── blueprint.mjs         # ★ Blueprint (markdown) → content.json compiler
│   ├── check-site.mjs        # ★ Static site linter (pages vs content file, no browser)
│   └── sync-site-runtime.sh  #   copy src/ into site/public/src
├── src/
│   ├── css/
│   │   ├── nown-plate.css    # Tokens, reset, plate/grid, theming
│   │   └── nown-tiles.css    # Core tile styles (nav, cards, buttons, heroes)
│   ├── js/
│   │   ├── sites.js          # Tiny tile init registry (no globals, progressive)
│   │   ├── tile-registry.js  # ★ Predefined editable fields per tile type
│   │   ├── sites-content.js  # ★ Binder: draws copy from the backend file
│   │   ├── sites-adapters.js # ★ Storage adapters (local / git / firebase)
│   │   ├── sites-admin.js    # ★ Admin dashboard: registry-driven text fields
│   │   ├── sites-auth.js     # ★ Auth adapters (firebase/supabase/auth0/clerk)
│   │   └── sites-payments.js # ★ Payment adapters (stripe/square/snipcart/paypal)
│   └── modules/              # Plug-and-play tile snippets
│       ├── navigation/  ├── hero/  ├── cards/  └── footer/
└── examples/
    ├── prototype-template.html    # predefined structure; copy from content.json
    ├── admin.html                 # content dashboard (login + text fields)
    ├── sites.config.js            # ★ provider selection (firebase | git | local | http)
    ├── nowndigital.blueprint.md   # ★ authoring source (markdown)
    ├── nowndigital.content.json   # backend copy file for the agency site
    └── NOWNDIGITAL-PAGE-MAP.md    # section → tile mapping
```

### Content management (headline feature)

**Structure and CSS are predefined; only the copy is drawn from the backend file.**

- `content.json` (schema-validated) is the single source of truth for copy —
  one file per site by default, splittable for custom needs.
- `tile-registry.js` declares the **predefined editable fields** per tile type.
- `admin.html` generates its text fields from that registry and writes `content.json`
  through a swappable storage adapter — so the owner edits copy, never HTML.
- See `docs/CONTENT-MODEL.md`.

### Authoring a site (blueprint → site)

```
nowndigital.blueprint.md  ──tools/blueprint.mjs──▶  content.json  ──▶  live page / admin
```

Write each tile as its own Markdown section (name, description, content), then:

```bash
node tools/blueprint.mjs examples/nowndigital.blueprint.md --out examples/nowndigital.content.json
```

See `docs/BLUEPRINT-FORMAT.md`.

### Integrations — a Lego set, not a monolith

Everything beyond the UI is a **block** with a swappable **adapter**: identity
(auth), payments, forms, search, maps, analytics, and **AI**. One config change
swaps a provider; no markup changes. See `docs/INTEGRATIONS.md`.

## Quick start

No install. Clone (or copy) the folder and open `examples/prototype-template.html`
in a browser — or serve it with any static file server:

```bash
python3 -m http.server 8080
# → http://localhost:8080/examples/prototype-template.html
```

To build your own site, copy `examples/prototype-template.html`, set the design
tokens in `src/css/nown-plate.css` `:root`, then compose tiles using the markup
conventions in `docs/MODULE-SPEC.md` and the manifest contract in
`ai-skill/sites-schema.json`.

## Deployment

**Default stack: Firebase** — Hosting + Auth + Storage. One project, one CLI.

```
admin (Auth + SDK) ──write──▶ Storage: sites/{id}/content.json ──fetch──▶ public site
```

- Public pages never load an SDK — they just `fetch()` the published JSON.
- Reference config ships here: `firebase.json`, `.firebaserc`, `storage.rules`,
  `firestore.rules`. Set the project in `.firebaserc`, then
  `firebase deploy --only hosting,storage`.
- **Alternatives are first-class** — Cloudflare Pages, GitHub Pages, Netlify,
  IPFS + ENS, or Google Sites — swapped by changing the adapter in
  `examples/sites.config.js`. No markup changes.
- Full setup: `docs/DEPLOYMENT.md`.

## Status

**Prototype stage.** The standard, foundation CSS/JS, tile modules, the
content-management layer (registry → binder → adapters → admin), the blueprint
compiler, and the integration adapters (auth/payments/storage) are in place and
**verified in-browser**: editing `content.json` updates the page copy with no HTML
change.

- Standard: `docs/SPEC.md` **v0.3.0** (draft) — default stack Firebase.
- Existing live sites were built on *beta* versions of this framework and serve
  only as design reference.
- Live `nowndigital.app` is currently a Google Sites shell; the rebuild targets
  Firebase Hosting.

## License

MIT — see [LICENSE](./LICENSE).
