# S.I.T.E.S Content Model & Management

How a S.I.T.E.S site stores its copy and how a non-technical owner edits it through
an **admin dashboard with login** — without touching HTML.

**Normative companion to `docs/SPEC.md` §8.** Status: draft (v0.1).

---

## 1. The standardized content file

The single source of truth is **`content.json`** — the site manifest, validated
against `ai-skill/sites-schema.json`. There is no second format.

```jsonc
{
  "site":  { "name": "Nown Digital", "baseUrl": "https://nowndigital.app", "seo": { … } },
  "theme": { "colors": { "primary": "#1E4D4F", "accent": "#D97706" }, "defaultTheme": "system" },
  "nav":   [ { "label": "Services", "href": "/services" } ],
  "content": [
    { "type": "hero",    "id": "top", "config": { "headline": "…", "actions": [ … ] } },
    { "type": "feature", "config": { "items": [ { "title": "…", "body": "…" } ] } },
    { "type": "contact", "config": { … } }
  ]
}
```

Why this design:
- **One file per site.** Everything editable lives here; markup stays structural.
- **Schema-defined fields.** The community/site owner never sees JSON — the admin
  renders a form from the schema. Add a tile `type` to the schema and its editor
  appears automatically ("predefined fields").
- **Portable.** `content.json` is plain JSON: diffable, versionable, hostable
  anywhere, no vendor lock-in.

### 1.1 Optional SEO and business blocks

`site.seo` and `site.business` are **optional**. A file that omits them stays
valid, and its pages still emit a `WebSite` JSON-LD node — they simply have no
per-page override and no `LocalBusiness` node. Existing content files therefore
need no migration.

Both blocks are read by the authoring tool `tools/seo.mjs` and written into the
pages' `<head>` at authoring time; **the runtime never reads them** (a crawler or
a link preview runs no JavaScript, so runtime metadata does not exist for it).
Full rules: `docs/SEO.md`.

```jsonc
"site": {
  "name": "Bellwood Pawn",
  "baseUrl": "https://bellwoodpawn.com",
  "lang": "en",
  "seo": {
    "title": "Bellwood Pawn — buy, sell, loan",     // site-wide fallback
    "description": "…",
    "image": "/assets/share-1200x630.jpg",          // og:image / twitter:image
    "pages": {                                      // per-page overrides
      "/":               { "title": "…", "description": "…" },
      "/services.html":  { "title": "…", "description": "…", "image": "…" }
    }
  },
  "business": {                                     // → LocalBusiness JSON-LD
    "type": "PawnShop",                             // default: LocalBusiness
    "telephone": "+1-555-0100",
    "priceRange": "$$",
    "address": { "streetAddress": "…", "addressLocality": "…",
                 "addressRegion": "…", "postalCode": "…", "addressCountry": "US" },
    "geo": { "latitude": 41.88, "longitude": -87.63 },
    "openingHours": [ "Mo-Fr 09:00-18:00", "Sa 10:00-16:00" ]
  }
}
```

---

## 2. How pages consume content — **the standard model**

**Structure and CSS are predefined; only the copy is drawn from the backend file.**

The page is authored once with the full tile skeleton (classes, layout, tokens) and
**placeholder copy** in every editable slot. On load, `sites-content.js` fetches
`content.json` and fills those slots. The owner then edits text in the admin, the
backend file changes, and every page reflects it on next load — with **no HTML edit
and no redeploy**.

```
predefined page (HTML/CSS)          backend file (content.json)
  <section data-tile-id="hero">  ←──  { "type":"hero", "config":{ "headline":"…" } }
    <h1 data-role="headline">…</h1>
```

**Binding rules (normative)**
1. A content-managed tile **MUST** carry `data-tile-id="<stable-id>"`.
2. Each editable slot **MUST** carry `data-role="<field>"` matching a `config` key.
3. List fields **MUST** use a `<template data-role="<field>">` the binder clones per item.
4. The page **MUST** ship meaningful placeholder copy so no-JS/crawler views are
   coherent; the binder only *replaces* it (progressive enhancement).
5. Editable text is written with `textContent` (no HTML injection) unless a field is
   explicitly flagged rich in the registry.

```html
<!-- predefined structure + placeholder copy; slots filled from content.json -->
<section class="tile tile-hero" data-tile="hero" data-tile-id="home-hero">
  <h1 data-role="headline">Your Vision, Built with Care.</h1>
  <p  data-role="body">Sovereign Internet Topology Engines for Creators &amp; Business.</p>
  <div data-role="actions">
    <template>
      <a class="btn btn-tactile btn-gold-tactile" data-role="action"><span data-role="label"></span></a>
    </template>
  </div>
</section>
```

> **Baked export (optional):** the same binder can run in an export step to write the
> copy permanently into the HTML for a fully static, zero-JS deliverable.

---

## 3. The admin dashboard

`admin.html` is itself a plate-and-tiles page built on the framework.

**Requirements**

1. **Login gate.** Unauthenticated users see only the login tile.
2. **Registry-driven editor (predefined fields).** For each entry in `content[]`,
   render the form from the **tile field registry** (§3.1): labelled text fields,
   textareas, repeatable item rows, link rows, media, and service config. No
   hand-built forms per tile — add a field to the registry and it appears.
3. **Live preview** (recommended): render the edited tile in place as you type.
4. **Save via a storage adapter** (§4) → writes the backend copy file, then confirms.
5. **No secrets in the client.** Credentials are handled by the adapter/backend.

**Editor anatomy (tiles)**
- `admin-login` — auth tile (provider per adapter).
- `admin-page-list` — the site's tiles (the `content[]` array), reorderable.
- `admin-tile-editor` — generated from the registry for the selected tile type.
- `admin-save` — validates + commits via the adapter; shows status.

### 3.1 The tile field registry — the "predefined fields"

A single registry declares, per tile type, **which fields are editable and what kind
of input each is**. It is the contract shared by the admin form, the content binder,
and validation. (`src/js/tile-registry.js`.)

```js
SITES.tileRegistry = {
  hero: {
    label: 'Hero',
    fields: [
      { key: 'headline', label: 'Headline', type: 'text' },
      { key: 'body',     label: 'Sub-copy',  type: 'textarea' },
      { key: 'actions',  label: 'Buttons',   type: 'actions',
        itemFields: [ { key: 'label', type: 'text' }, { key: 'href', type: 'url' } ] },
    ],
  },
  feature: {
    label: 'Feature / value props',
    fields: [
      { key: 'title', label: 'Section title', type: 'text' },
      { key: 'items', label: 'Items', type: 'items',
        itemFields: [ { key: 'title', type: 'text' }, { key: 'body', type: 'textarea' } ] },
    ],
  },
  // …one entry per catalog tile
};
```

**Field types:** `text`, `textarea`, `richtext` (opt-in, sanitized), `url`, `image`,
`items` (repeatable rows of `itemFields`), `actions` (repeatable label+href rows),
`select` (options), `boolean`.

**Normative:** a tile type used by a site **MUST** have a registry entry; the admin
**MUST** derive its form solely from the registry; the binder **MUST** only write
fields declared in the registry.

---

## 4. Storage adapters (provider-agnostic)

Mirrors the framework's embeddable-services philosophy: **one adapter configured per
site, swappable without touching content or markup.**

```js
// The contract every adapter implements.
SITES.contentAdapter = {
  name: 'firebase',
  async load(siteId) { /* -> object (content.json) */ },
  async save(siteId, content) { /* -> { revision } */ },
  async login() { /* -> { user } | throws */ },
  logout() {},
  currentUser() { /* -> user|null */ },
  async history(siteId) { /* optional -> revisions[] */ },
};
```

| Adapter | Auth | Storage | Best for |
|---|---|---|---|
| **`firebase`** *(recommended default)* | Firebase Auth (email/password) | Firestore doc `sites/<id>/content` or Storage file | Matches primary deployment; easiest managed auth |
| **`git`** | GitHub OAuth / fine-grained token | GitHub Contents API → commit `content.json` | Maximum sovereignty; content versioned in the repo (L4) |
| **`local`** | none (local only) | File download/upload | Offline authoring, dev, demos |
| **`http`** | site-defined | Any REST endpoint (`GET`/`PUT`) | Escape hatch; no lock-in |

**Selection:** `data-adapter="firebase"` on the admin page (or a `sites.config.js`).
A site **MUST NOT** hardcode provider-specific logic into tiles — only into adapters.

**Git adapter note (L4):** committing `content.json` gives a full audit trail for
free and keeps the site fully sovereign — the strongest fit for the S.I.T.E.S
philosophy. Firebase is the pragmatic default; Git is the purist path.

---

## 5. Security

- Public read of `content.json` (it's site copy — not secret).
- Write requires authentication; scope the token/role to **only** the content path.
- Never ship an API secret in client code — use Firebase Auth session or a
  server-side/serverless token exchange.
- Validate on write: `content.json` **MUST** validate against `sites-schema.json`
  before commit/save (the admin does this client-side; the adapter may re-check).
- Sanitize any user-entered HTML; prefer plain text fields.

---

## 6. Workflow (owner's view)

1. Open `…/admin` → log in.
2. Pick a section (tile) from the list.
3. Edit the predefined fields (headline, body, items, links, contact info…).
4. **Preview** → **Save** (adapter writes `content.json`).
5. Live-mode sites update immediately; baked-mode sites re-publish (or the adapter
   triggers a deploy hook).

---

## 7. Relationship to the AI harness

An agent can (a) **generate** an initial `content.json` from a brief, (b) **expand**
it into baked HTML, and (c) **edit** copy by producing a new `content.json`. The
admin and the agent operate on the *same* standardized file — so a human and an AI
can collaborate on one site without format drift.

---

## 8. Decisions

**Settled**
1. ✅ **Structure + CSS are predefined; copy is drawn from the backend file at page
   load.** No HTML editing and no redeploy to change text (§2).
2. ✅ **The backend copy file is the site manifest** (`content.json`), validated
   against `ai-skill/sites-schema.json` — one standardized format, no bespoke CMS.
3. ✅ **Editable fields are predefined** by the tile field registry (§3.1); the admin
   derives its text fields from it.

4. ✅ **Content file granularity** — **one `content.json` per site by default**;
   sites with custom needs **MAY** split per page (`home.json`, `about.json`) or key
   a single file by page (`pages[]`). Declared once; transparent to tiles.
5. ✅ **Authoring** — sites **MAY** be authored as a Markdown blueprint and compiled
   (`docs/BLUEPRINT-FORMAT.md`, `tools/blueprint.mjs`).

6. ✅ **Default storage adapter = `firebase`** (Auth + a Storage file at
   `sites/{siteId}/content.json`), with the **public site fetching the file
   directly** so it stays dependency-free. `git` / `local` / `http` remain
   first-class alternatives, selected in `sites.config.js`.
   See `docs/DEPLOYMENT.md`.

**Open (need your call)**
7. **Admin hosting** — same static site (`/admin`) vs a separate Firebase project.
