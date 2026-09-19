# Nown S.I.T.E.S — Standard Specification

**Version:** 0.6.0 (draft) · **Status:** Beta · **Last updated:** 2026-09-09

> **S**eamlessly **I**ntegrated **T**echnology **E**nabling **S**uccess.
> The master, normative specification for the S.I.T.E.S framework. It binds the
> topic documents together and defines **conformance**. Canonical narrative source:
> *Nown S.I.T.E.S: Reclaiming Digital Sovereignty Through First-Principles Web
> Architecture* (Nown Digital).

**Normative language:** **MUST** / **MUST NOT** = required; **SHOULD** = strongly
recommended; **MAY** = optional.

**Companion documents**
| Doc | Covers |
|---|---|
| `docs/ARCHITECTURE.md` | Plate/Tile model, tokens, grid math, theming, integrations |
| `docs/MODULE-SPEC.md` | Tile naming/CSS/JS/data contracts, catalog, checklist |
| `docs/CONTENT-MODEL.md` | **The standardized content file + admin dashboard + storage adapters** |
| `docs/THEME-ENGINE.md` | **Content-driven sitewide theme (light + dark, admin-editable)** |
| `docs/ASSETS.md` | **Image deployment: repo assets or Firebase Storage token URLs** |
| `docs/BLUEPRINT-FORMAT.md` | **Markdown authoring format + compile pipeline** |
| `docs/INTAKE-FORM.md` | **Fill-in brief → everything needed to build a site** |
| `docs/INTEGRATIONS.md` | **Blocks, adapters & recipes (auth, payments, forms, AI)** |
| `docs/AI-HARNESS.md` | How AI agents generate compliant sites |
| `docs/DEPLOYMENT.md` | **Firebase default stack + alternatives + rules** |
| `docs/ROADMAP.md` | Vision: protocol home, programmatic + full builders |
| `ai-skill/sites-schema.json` | Machine-readable manifest/content contract |
| `ai-skill/prompt-instructions.md` | Drop-in agent prompt |
| `tools/blueprint.mjs` | Blueprint → content.json compiler (build-time only) |

---

## 1. Scope

This specification defines how a website is structured, styled, themed, authored,
managed, and deployed under S.I.T.E.S. It applies to hand-authored sites and
AI-generated sites alike.

## 2. Core principles (normative)

1. **Zero/minimal dependencies.** A conforming site MUST be deliverable as static
   HTML, CSS, and vanilla JS with **no build step** and **no package manager**.
2. **Native-first.** Structure = HTML; presentation = CSS (Grid/Flex/Container
   Queries/Custom Properties); behavior = vanilla JS.
3. **The plate & tiles model.** Every page MUST be a *plate* (background + grid)
   hosting self-contained *tiles* (see §5).
4. **Modularity.** A tile MUST be duplicable, deletable, and reorderable without
   cascading failure elsewhere.
5. **Tokenization.** Visual values MUST be design tokens (CSS custom properties);
   literal colors/radii/shadows in tile CSS are non-conforming (see §6).
6. **Breakpoint-free layout.** Page-level media queries for layout MUST NOT be used;
   the `auto-fit` grid (macro) + container queries (micro) govern responsiveness.
7. **Progressive enhancement.** All content MUST be readable with JavaScript disabled.
8. **Accessibility.** WCAG AA: semantic landmarks, keyboard operability, visible
   focus, reduced-motion support, sufficient contrast.
9. **Privacy & sovereignty.** No tracking by default; dynamic function MUST be
   achieved via decoupled, swappable embeddable services, not a captive backend.
10. **Separation of content and presentation.** Copy MUST live in the standardized
    content file (§8), never hardcoded across markup.

---

## 3. Conformance levels

| Level | Requirements |
|---|---|
| **L1 — Structural** | §2.1–§2.4, §5, §7 (tiles valid per `MODULE-SPEC.md`) |
| **L2 — Presentation** | L1 + §6 (full tokenization), §2.6 (breakpoint-free), §2.8 |
| **L3 — Content-managed** | L2 + §8 (externalized content file + admin) |
| **L4 — Managed & sovereign** | L3 + Git-storage adapter, offline/no-JS parity, no third-party trackers |

A site **MUST** state its target level. `nowndigital.app` targets **L4**.

---

## 4. The acronym (definition)

**Seamlessly Integrated Technology Enabling Success** — also rendered in the source
material as "**S**overeign **I**nternet **T**opology **E**ngines." Both are used in
Nown Digital materials; this spec treats **Seamlessly Integrated Technology Enabling
Success** as canonical and the other as brand phrasing.

## 5. Architecture (see `ARCHITECTURE.md`)

Three layers: **background** → **tiles** → **grid**.

- The plate (`<div class="sites-plate">`) is the root viewport; it **MUST** expose a
  content container (`.sites-container`) and the grid (`.sites-grid`).
- The automatic grid **MUST** be
  `display:grid; grid-template-columns: repeat(auto-fit, minmax(var(--grid-min), 1fr))`.
- A configured grid **MAY** be used (`.sites-grid--cols`): 12 columns in wide
  containers, 6 in narrow ones, with per-tile `data-span` / `data-span-sm`. Tier
  switching **MUST** be driven by the container's width, never the viewport.
- Tiles **MUST** set `container-type: inline-size` to be self-aware, and any
  container query **MUST** target a descendant — an element cannot query itself.
- Site chrome (nav-dock, announcement, footer) **MUST** be tiles too.

## 6. Design tokens (normative names)

Tokens are declared in `:root` and overridden under `[data-theme="dark"]`.
Tiles **MUST** consume tokens and **MUST NOT** hardcode their values.

| Category | Tokens (required minimum) |
|---|---|
| Color | `--color-background`, `--color-surface`, `--color-surface-2`, `--color-text`, `--color-text-muted`, `--color-primary`, `--color-accent` |
| Space | `--space-1..20` |
| Radius | `--radius-sm/md/lg/xl/pill` |
| Shadow | `--shadow-card`, `--shadow-elevated`, `--shadow-float` |
| Type | `--font-sans`, `--font-display`, `--text-base`, `--text-lead` |
| Grid | `--grid-min`, `--grid-gap` |

Legacy aliases are permitted **only** as aliases to the canonical set.

**Theming is content-driven** (`THEME-ENGINE.md`): the tokens above are supplied by
the `theme` object in the content file — a light palette (`theme.colors`), a dark
palette (`theme.dark` → `[data-theme="dark"]`), plus `fonts`/`radii`/`spacing`/
`shadows` — so the whole site re-skins from the admin.

- **MUST:** dark mode is a token override, never a second stylesheet.
- **MUST:** a light/dark switcher is available via `data-role="theme-toggle"`;
  modes are `light` | `dark` | `system`, persisted, with `system` tracking the OS
  live, applied before first paint.
- **MUST NOT:** tiles hardcode colors; pages re-implement theme logic.

## 7. Tile model (see `MODULE-SPEC.md`)

- Root: `class="tile tile-<name>"` + `data-tile="<name>"`. **MUST**.
- Parts: `data-role="…"`; classes `tile-<name>__<part>`.
- Behavior: registered via `SITES.register('<name>', { init(el) })`; **MUST NOT**
  pollute globals or query outside its element.
- The tile catalog is normative (§8 `MODULE-SPEC.md`); new tiles **MUST** be added
  to the catalog and to `sites-schema.json` before use.

## 8. Content model & management (see `CONTENT-MODEL.md`)

**The standardized content file is the site manifest** — a single `content.json`
validated against `ai-skill/sites-schema.json`. It carries `site`, `theme`, `nav`,
and an ordered `content[]` of tiles with their config.

**Granularity:** the default is **one `content.json` per site**. A site with custom
needs **MAY** split per page (`home.json`, `about.json`) or key the single file by
page (`pages[]`); the chosen granularity is declared once and is transparent to
tiles.

**Authoring:** a site **MAY** be authored as a Markdown **blueprint**
(`docs/BLUEPRINT-FORMAT.md`) and compiled to `content.json` by `tools/blueprint.mjs`.
The blueprint, the content file, and the admin describe the **same** site — a site
can start as a blueprint, be generated, then be maintained in the admin.

- A conforming L3+ site **MUST** externalize copy into `content.json`.
- Pages **MUST** render acceptably **without** JS (pre-rendered/baked copy) and
  **MAY** hydrate from `content.json` at runtime for live updates.
- The **admin dashboard** (`admin.html`, itself plate-and-tiles) **MUST**:
  - gate access behind login;
  - generate its editing form from the schema (predefined fields per tile type);
  - expose the **sitewide theme** with the same mechanism (`THEME-ENGINE.md`);
  - write `content.json` through a **storage adapter**;
  - never embed secrets in client code.

**Assets** (`ASSETS.md`): images are referenced by path, URL, or the logical
`asset:<key>` form, and are served from either **repo assets** or **Firebase
Storage token URLs** — a per-site adapter choice. Pages **MUST NOT** hardcode a
Storage URL into tile markup; the public site **MUST NOT** load the Firebase SDK to
display images.
- **Storage adapters** (provider-agnostic; one configured per site):
  | Adapter | Mechanism | Notes |
  |---|---|---|
  | `firebase` | Auth (email/password) + Firestore/Storage | **Recommended default** (matches primary deployment) |
  | `git` | GitHub Contents API commits | Most sovereign; content versioned in the repo |
  | `local` | File download/upload | Dev + offline authoring |
  | `http` | Any REST endpoint | Escape hatch, no lock-in |

## 9. AI harness (see `AI-HARNESS.md`)

AI-generated output **MUST** satisfy §2 and the `MODULE-SPEC.md` checklist, and
**SHOULD** be produced as a schema-valid manifest first, then expanded to pages.

## 10. Deployment & hosting (see `DEPLOYMENT.md`)

- **Default stack: Firebase** — Hosting (static site) + Auth (gates the admin) +
  Storage (the published `content.json`). Chosen for simplicity: one project, one
  CLI. A reference `firebase.json`, `.firebaserc`, `storage.rules` and
  `firestore.rules` ship with the framework.
- **Public pages MUST NOT load a Firebase (or any auth/storage) SDK** — they fetch
  the published JSON file. Only the gated admin page loads SDKs.
- **Alternatives MUST be supported** with no markup change: Cloudflare Pages,
  GitHub Pages, Netlify, IPFS + ENS, or Google Sites. Switching host/store **MUST**
  be possible by changing only the storage adapter + deploy target.
- It **MUST** remain possible to deploy with no server-side code.

## 11. Versioning

The standard is versioned independently of any site. Semantic versioning:
**MAJOR** = breaking contract change (token/schema/tile-breaking), **MINOR** = new
tiles/features, **PATCH** = clarifications. The current standard is **0.1.0**.

## 12. Conformance checklist (summary)

- [ ] No build step, no dependencies in output.
- [ ] Plate + grid + tiles per §5; tiles conform per §7.
- [ ] All values via tokens; dark mode via `[data-theme="dark"]`.
- [ ] No layout media queries; container queries for intra-tile reflow.
- [ ] Works with JS disabled; a11y AA.
- [ ] Copy externalized to schema-valid `content.json` (L3+).
- [ ] Admin edits `content.json` via a configured storage adapter (L3+).
- [ ] No trackers; dynamic needs met by swappable embeddable services.

## 13. Integrations — blocks, adapters & recipes (see `INTEGRATIONS.md`)

The modular philosophy extends **beyond the UI** into the core architecture.

- **Block** — a self-contained unit: a UI *tile* **or** an integration (auth,
  payments, forms, search, maps, analytics, AI).
- **Adapter** — the swappable provider behind a block. **One per site.**
- **Recipe** — a named assembly of blocks (e.g. `brochure`, `agency`, `shop`).

**Normative**
1. A block **MUST NOT** contain provider-specific logic; only its adapter may.
2. Swapping a provider **MUST** be a configuration change, never a markup change.
3. A block **MUST** degrade gracefully when its provider is absent.
4. Integration selection **MUST** be declarative (`integrations:` in the blueprint).
5. AI **MUST** be opt-in, key-free in the client, and grounded in the site's own
   content (`INTEGRATIONS.md` §5).
6. A recipe **MUST** be expressible as a blueprint + integration selection, with no
   bespoke code.

---

## Changelog

- **0.6.0** — **Two-mode grid.** `.sites-grid` (automatic `auto-fit`) and
  `.sites-grid--cols` (12 columns wide / 6 narrow, per-tile `data-span` /
  `data-span-sm`, `data-start`, alignment helpers). Documented the rule that a
  container query can never match its own element — the bug that left the hero
  stuck in one column.

- **0.5.0** — Agent-ready packaging: root **`AGENTS.md`** operating manual (the
  harness entry point), **`llms.txt`** index, and **`docs/INTAKE-FORM.md`** — the
  fill-in brief that maps 1:1 to the blueprint, content file and tile registry.
- **0.4.0** — Content-driven **theme engine** (light + dark palettes, fonts, radii;
  admin-editable, light/dark/system switcher, no-flash) and **asset deployment**
  (repo assets or Firebase Storage token URLs, `asset:<key>` indirection).
  New `docs/THEME-ENGINE.md`, `docs/ASSETS.md`.
- **0.3.0** — Default stack fixed: **Firebase** (Hosting + Auth + Storage) with
  reference config and rules; public pages MUST stay SDK-free; alternatives
  (Cloudflare/GitHub Pages/Netlify/IPFS/Sites) supported through the adapter
  contract. New `docs/DEPLOYMENT.md`.
- **0.2.0** — Blueprint authoring format + compiler; integration blocks/adapters/
  recipes (auth, payments, AI); content-file granularity (single by default,
  splittable); roadmap.
- **0.1.0** — Initial standard: principles, layers, tokens, tile model, content
  model + admin/adapters, AI harness, deployment, conformance levels.
