# S.I.T.E.S Blueprint Format

The **authoring layer**. A human or an AI writes a site as a single Markdown
**blueprint**; each tile is its own section with a name, description and content.
Once the data and pages are structured, the blueprint **compiles** — first to the
standardized `content.json`, then to final HTML.

```
blueprint.md  ──compile──▶  content.json  ──bake──▶  index.html (+ pages)
  (authoring)                (backend copy file)      (deliverable)
```

**Normative companion to `docs/SPEC.md` §8.** Status: draft (v0.1).

---

## 1. Why a Markdown blueprint

- **Legible to everyone** — a client, a designer, or an AI can read and edit it.
- **Diffable** — it's a text artifact; it versions cleanly.
- **Structured before generated** — all content and page structure is settled
  *before* markup is produced, so generation is deterministic and reviewable.
- **One source → many outputs** — the same blueprint yields `content.json` (the
  runtime copy file) and baked HTML for zero-JS delivery.
- **AI-native** — an agent's job becomes "fill in the blueprint," not "invent a
  site," which is faster and far less error-prone.

---

## 2. Form of a blueprint

1. **Front matter** (`---` … `---`) — site identity, theme tokens, nav, and the
   integration selections.
2. **Pages** — `## Page: <name>` with `path`.
3. **Tiles** — `### Tile: <type>` with a `description` plus the tile's predefined
   fields (per the tile registry, `docs/CONTENT-MODEL.md` §3.1).

Field syntax is a small, strict YAML subset: `key: value` scalars, `key: |` blocks
for multi-line copy, and indented `- ` lists for repeatable items/links.

```markdown
---
site:
  name: Nown Digital
  baseUrl: https://nowndigital.app
  description: Sovereign Internet Topology Engines for creators & business.
theme:
  primary: "#1E4D4F"
  accent: "#D97706"
integrations:
  auth: firebase        # none | firebase | supabase | auth0 | clerk
  payments: stripe      # none | stripe | square | snipcart
  forms: formspree      # none | formspree | tally | staticforms
  search: pagefind      # none | pagefind
  analytics: none       # none | plausible | umami   (privacy-first only)
  ai: none              # none | assistant | generator
nav:
  - Home: /
  - About: /about
---

# Pages

## Page: Home
path: /

### Tile: hero
description: Opening band with the brand promise and primary CTA.
id: home-hero
headline: Your Vision, Built with Care.
body: |
  Sovereign Internet Topology Engines
  for Creators & Business.
actions:
  - label: Get a Free Consultation
    href: https://calendly.com/example/free-consultation

### Tile: feature
description: Value props under "Our Why".
id: home-why
title: Our Why
items:
  - title: True digital independence
    body: Build powerful websites without agency traps or subscriptions.
  - title: Powered by LazerFlow Intelligence
    body: Research into Information Substrate Theory and self-healing systems.
```

### Rules
- A `### Tile:` heading **MUST** name a registered tile type.
- `description` is for humans/AI; it is **not** rendered (it may seed alt text/SEO).
- `id` **MUST** be unique per page (it becomes `data-tile-id`).
- Field names **MUST** match the tile's registry fields; unknown fields are reported
  by the compiler, not silently dropped.
- A page is a `## Page:` section; tiles belong to the page that precedes them.

---

## 3. Compile pipeline

| Stage | Input → output | Tool |
|---|---|---|
| **1. Parse** | `blueprint.md` → JSON | `tools/blueprint.mjs` |
| **2. Validate** | JSON → errors/warnings | against `ai-skill/sites-schema.json` + the tile registry |
| **3. Emit copy file** | JSON → `content.json` | `tools/blueprint.mjs` |
| **4. Bake** *(later)* | `content.json` + page skeleton → `.html` | generator (planned) |

```bash
node tools/blueprint.mjs examples/nowndigital.blueprint.md --out examples/nowndigital.content.json
```

The compiler is **build-time only** — the delivered site stays dependency-free.

---

## 4. Relationship to the rest of the framework

| Artifact | Role | Written by |
|---|---|---|
| `blueprint.md` | human/AI authoring source | person or agent |
| `content.json` | runtime backend copy file | compiler |
| `admin.html` | post-launch copy editing | owner |
| `index.html` | deliverable | baker (planned) |

All four describe the **same** site, so a site can start as a blueprint, be
generated, then be maintained in the admin — without format drift.
