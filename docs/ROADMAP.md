# S.I.T.E.S Roadmap & Long-Term Vision

Where the framework is going. Near-term work is the framework itself; the vision
is a public protocol home and progressively more capable builders.

---

## Phase A — Framework (current)

| Deliverable | Status |
|---|---|
| Master standard (`docs/SPEC.md`) | ✅ v0.1 |
| Foundation CSS/JS (tokens, plate, tiles) | ✅ |
| Tile catalog + modules | ✅ |
| Content model + admin + adapters | ✅ |
| Blueprint format + compiler | ✅ |
| Integration blocks (auth/payments/AI) | ✅ spec + adapters |
| First spec-compliant site (Nown Digital rebuild) | ⏳ next |

---

## Phase B — The protocol home (`nownsite.com`)

Purpose: the public face of S.I.T.E.S — documentation, live examples, and the
on-ramp for builders. Hosts:

- **Protocol docs** — this spec, presented for humans (`nownsite.com/docs`).
- **Live examples** — the reference builds, each openable as source.
- **The tile gallery** — every tile, rendered live, with its blueprint snippet.
- **Recipes** — the assembly patterns (`brochure`, `agency`, `shop`, …).
- **Testimonial/case-study pages** built *in* S.I.T.E.S (eat our own dogfood).

Domains: **`nownsite.com`** (protocol) and **`marytheadoor.nownsite.com`**
(author/portfolio). Both are ordinary S.I.T.E.S sites: static, Firebase-hosted,
content-driven.

---

## Phase C — Programmatic builder (near-term, high value)

**"Pick tiles → see it live."** A browser tool on `nownsite.com/builder`.

1. The user ticks tiles (hero, feature, gallery, contact-form, …) and picks a recipe.
2. The builder assembles a **blueprint** in memory and previews it **live** using
   the existing binder — no generation step required to preview.
3. The user edits copy inline (the same registry-driven fields as the admin).
4. Export: **blueprint.md** + **content.json** + the tile HTML, or a **zip** of a
   complete static site.

Why it's cheap to build: the pieces already exist — the **binder** renders a
content doc against predefined structure, the **registry** defines the fields, and
the **compiler** turns blueprints into content files. The builder is mostly an
orchestration UI over them.

---

## Phase D — Full website builder (long-term)

An end-to-end product: a guided flow from business inputs to a deployed site.

1. **Onboarding** — the user answers questions (business, offer, audience, brand,
   goals, tone). An **AI pass** (`ai-generator`) drafts a **blueprint.md** from the
   answers — plus suggested palette, nav, and recipe.
2. **Design** — the user arranges tiles (reorder/add/remove), picks a theme, and
   sees the live preview.
3. **Integrations** — toggle auth / payments / forms / search / AI (the integration
   blocks; each swaps a provider via config).
4. **Export** — download the **full repository as a zip** (static site + content +
   admin + selected adapters) to deploy wherever they like (Firebase, IPFS,
   Cloudflare Pages, any host) — or one-click deploy.
5. **Maintain** — the shipped site includes the admin dashboard, so the owner edits
   copy forever without touching HTML.

**Non-negotiable:** whatever the builder produces is plain S.I.T.E.S — no runtime
dependency on the builder, no hosted lock-in. The output is yours.

---

## Phase E — AI integration (cross-cutting)

Per `docs/INTEGRATIONS.md` §5, AI is an **opt-in integration block**, not a
foundational dependency:

| Block | Role in the roadmap |
|---|---|
| `ai-generator` | Onboarding → blueprint.md; copy drafts |
| `ai-assistant` | Help visitors from the site's own content |
| `ai-search` | Natural-language search |
| `ai-agent` | Back-office automation (leads, content updates) |

The unifying insight: **the AI writes blueprints; the compiler produces sites; the
admin maintains them.** One format, three actors — human, AI, owner — with no drift.

---

## Milestones

| Milestone | Definition of done |
|---|---|
| **M1 — Standard** | `SPEC.md` published; all sub-specs exist; conformance levels defined |
| **M2 — Reference site** | Nown Digital rebuilt spec-compliant (L4), content-driven, Firebase-hosted |
| **M3 — Builder (preview)** | Tile picker with live preview + blueprint export on `nownsite.com/builder` |
| **M4 — Protocol home** | `nownsite.com` live with docs, tile gallery, recipes, examples |
| **M5 — Full builder** | Onboarding → design → export-zip → deploy, AI-assisted |
| **M6 — Ecosystem** | Community tiles/recipes; registry-driven contribution process |

---

## Explicitly out of scope (for now)

- A hosted SaaS where the site can only live on our servers (violates sovereignty).
- Node/build-tool requirements in the delivered output.
- Tracking/analytics by default.
