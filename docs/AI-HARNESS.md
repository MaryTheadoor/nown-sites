# S.I.T.E.S AI Harness

Guidelines for **AI agents** (Claude, GPT/GPTs, Gemini, Cursor, Devin, and this
harness) that generate compliant S.I.T.E.S code autonomously from a short user
prompt. The goal is that an agent can produce a correct, complete site without a
human holding its hand — while never breaking the framework's constraints.

The drop-in prompt is `ai-skill/prompt-instructions.md`; the machine-readable
contract is `ai-skill/sites-schema.json`.

---

## 1. Why S.I.T.E.S is AI-friendly

- **Structured markup, no build step** — LLMs excel at deterministic, semantic HTML.
- **Small, constrained surface** — one grid, tokens, container queries. Fewer degrees
  of freedom = fewer failure modes.
- **Self-contained tiles** — the agent composes from a known catalog instead of
  inventing architecture.
- **No dependency graph** — nothing to compile, transpile, or resolve; output is
  directly viewable and verifiable.

---

## 2. The agent contract (non-negotiable rules)

1. **No build tools / no package manager.** Output only `.html`, `.css`, `.js`.
   Never emit `npm install`, bundler config, or framework imports.
2. **No third-party JS libraries.** Only vanilla JS. (Embeddable *services* via
   `<script>`/`<iframe>`/REST are allowed and encouraged for forms, maps, search,
   payments.)
3. **No hardcoded visual values.** Use the tokens in `:root` (`var(--color-*)`,
   `var(--space-*)`, `var(--radius-*)`, `var(--shadow-*)`).
4. **Compose tiles, don't invent pages.** Pull from the catalog in `MODULE-SPEC.md`
   §8. If the catalog is missing a needed tile, propose adding it to the catalog
   rather than shipping a one-off.
5. **Respect the three layers.** Background (plate) → tiles → grid. Never fight the grid.
6. **No page-level media queries.** Use the `auto-fit` grid + container queries.
7. **No global JS & no `window` pollution.** Use the `SITES.register` registry, or
   plain per-element `<script type="module">`.
8. **Progressively enhance.** The page must be coherent/readable with JS disabled.
9. **A11y.** Semantic landmarks, keyboard-navigable, `prefers-reduced-motion` honored,
   focus-visible styles, sufficient contrast on text.
10. **Accessibility & privacy by default.** No trackers; prefer privacy-first
    embeddable services.

---

## 3. Output workflow (manifest → modules → plate)

The agent should work from a **manifest** (see `sites-schema.json`) and expand it:

1. **Read the brief** → produce a `manifest` JSON: site (name, description, baseUrl,
   theme tokens, social) and an ordered list of sections, each referencing a tile
   `type` + its `config`.
2. **Resolve tokens** → map the brief's brand colors into `--color-*` variables.
3. **Assemble the plate** → a single `index.html`: `<head>` (tokens via
   `nown-plate.css` + `nown-tiles.css`), the `nav-dock`, then a `<main>` containing
   the sections as tiles in a grid, ending with the footer.
4. **Wire tools** → for each tile that uses an embeddable service, add the
   `data-*`/config fields from §6 of `MODULE-SPEC.md`.
5. **Hydrate JS** → add/enhance only what needs it (`sites.js` registry).
6. **Self-check** → run the compliance checklist (§7 `MODULE-SPEC.md`) and the
   quality gates below.

### Manifest → page mapping

```jsonc
// manifest snippet (see sites-schema.json for the full shape)
{
  "site": { "name": "Nown Digital", "baseUrl": "https://nowndigital.app" },
  "theme": { "colors": { "primary": "#1E4D4F", "accent": "#D97706" } },
  "nav": [ { "label": "Services", "type": "hero" }, { "label": "Work", "type": "gallery" } ],
  "content": [
    { "type": "hero", "config": { "headline": "…", "cta": [{ "label": "Start", "href": "/contact" }] } },
    { "type": "feature", "config": { "items": [ { "title": "…", "body": "…" } ] } },
    { "type": "contact-form", "config": { "provider": "formspree", "endpoint": "…" } }
  ]
}
```

---

## 4. Quality gates (verify before delivering)

- [ ] Opens with no console errors (and no failed network requests to dead assets).
- [ ] Renders correctly at smartphone width (1 column), tablet, and desktop.
- [ ] Single source of truth for colors (no stray hex outside `:root`).
- [ ] Dark mode inverts cleanly via `[data-theme="dark"]`.
- [ ] No layout shift on load (check `aspect-ratio` applied to media).
- [ ] Keyboard can reach every interactive element; focus is visible.
- [ ] Lighthouse: good Performance / Accessibility / SEO baseline (no build artifacts).
- [ ] No vendor/brand lock-in: any service used can be swapped by editing one
  `data-*`/config field.

---

## 5. Agent-specific notes

- **Claude / Codex / Cursor / Devin:** use the repo as a workspace; treat
  `docs/` + `src/modules/` as the source of truth; run the checklist each turn.
- **Custom GPT / Gemini / assistant prompt:** paste `ai-skill/prompt-instructions.md`
  as the system/context; the agent returns a single `index.html` + `styles.css` +
  `app.js` bundle (or a manifest + rendered page).
- **This harness (DSH):** `docs/AI-HARNESS.md` + `ai-skill/*` are pulled in as the
  operating manual when the task is "generate a S.I.T.E.S site."

---

## 6. Evolving the framework

The framework is versioned by the spec, not by code. When a new tile is needed:
1. Add it to the catalog (§8 `MODULE-SPEC.md`) with a full example.
2. Add its `type` + config to `sites-schema.json`.
3. Keep it dependency-free and token-driven.
