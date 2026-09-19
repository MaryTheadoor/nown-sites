# Recipe: pawn shop — Compact Keywords

A complete, working example of a local-business site built around **compact
keywords**: specific, bottom-of-funnel pages that match what a ready buyer
actually types.

This recipe is the reference implementation for the two SEO tiles
(`keyword-landing`, `compact-keywords`) and for `tools/compact-keywords.mjs`,
the generator that turns a business brief into a page cluster.

## What is here

| File | What it is |
|---|---|
| `business.json` | The brief — the only hand-written input |
| `blueprint.head.md` | Front matter, home page, services-page hero |
| `blueprint.tail.md` | Contact page |
| `_keywords.blueprint.md` | **Generated** — the hub tile + one page per keyword |
| `pawn-shop.blueprint.md` | **Generated** — head + keywords + tail |
| `content.json` | **Generated** — compiled from the blueprint |
| `*.html` | **Generated** — the site (15 pages) |
| `src/` | A copy of the framework runtime, so the folder serves standalone |
| `make-blueprint.cjs` | Assembles the blueprint from its three parts |
| `build.cjs` | Bakes `content.json` into static HTML, then regenerates SEO |

## The pipeline

```bash
cd examples/pawn-shop
node make-blueprint.cjs                                          # business.json -> blueprint
node ../../tools/blueprint.mjs pawn-shop.blueprint.md --out content.json
node build.cjs                                                   # bake HTML, draw the og:image, run seo.mjs
node ../../tools/check-site.mjs .                                # must be 0 errors / 0 warnings
```

`build.cjs` runs `tools/seo.mjs` itself, because baking rewrites every page from
scratch and would otherwise drop the marker-delimited SEO block.

## What the cluster looks like

Twelve pages, three per specialty, generated from `business.json`:

| Pattern | Example |
|---|---|
| `<type> that buys <item> in <place>` | Pawn shop that buys guitars in Austin, TX |
| `Sell <item> near me in <city>` | Sell gold jewelry near me in Austin |
| `Buy used <item> in <place>` | Buy used electronics in Austin, TX |

Each is a root-level `.html` page with its own `<h1>` carrying the keyword
verbatim, its own static `<title>`/`description`/`canonical`/`JSON-LD`, and a CTA
back to `/contact.html`. `/services.html` is the hub — one card per keyword, each
a real `<a href>` in the served HTML.

Body copy is drafted across the method's five beats and lands at **301–324 words**
per page. Bracketed `[slots]` mark where the draft needs a fact only the business
has — appraisal times, warranty terms, review counts. Fill them before publishing:
they exist so the generator never invents a promise on the owner's behalf.

## Two things this recipe proves

**1. The pages are complete without JavaScript.** Every landing page and every hub
card is baked as real markup, not left as a placeholder for the binder to fill.
That matters more here than on a normal site: the `<h1>` *is* the keyword, and the
hub cards *are* the internal links that let a crawler discover the cluster. Verify
it yourself:

```bash
node ../../.agents/tools/browser/verify-nojs.cjs   # or any browser with JS off
```

Load `/services.html` with JavaScript disabled and count
`.tile-keyword-card a` — twelve links. Load a landing page and read the `h1` — the
keyword, not "Your compact keyword phrase".

**2. The binder re-applies the same values, invisibly.** With JS on, the runtime
loads `content.json` and binds it into the slots. Because the baked HTML already
carries the same copy, nothing visibly changes and the admin stays the source of
truth for later edits.

## Editing it

- **Change the business** — edit `business.json`, re-run the pipeline. Keywords,
  slugs, page titles and the hub all follow.
- **Curate the cluster** — the home page shows a hand-picked four; `blueprint.head.md`
  holds them. The services hub is generated and always lists every keyword page.
- **Change copy** — edit the blueprint and recompile, or edit `content.json` and
  re-run `build.cjs`. Never hand-edit the HTML: it is generated.
- **Re-theme** — the `theme` block in `blueprint.head.md`. No second stylesheet.

## Notes and known limits

- `baseUrl` is `https://austingoldpawn.example.com` — a placeholder. Canonical
  URLs, `og:url` and `sitemap.xml` all derive from it.
- `og:image` is a real 1200×630 raster at `assets/og-image.png`, drawn by
  `tools/og-image.mjs` from this recipe's own `content.json` — so the preview
  carries the shop's colours and headline, and `twitter:card` is
  `summary_large_image`. Re-run the pipeline after a re-theme.
- `openingHours` uses the quoted list form (`- "Mo-Fr 09:00-19:00"`). Unquoted,
  the compiler's mini-YAML reads the colon as a key/value separator.
- JSON-LD is site-wide (`WebSite` + `PawnShop`). Per-page `Service` nodes are not
  emitted yet; every landing page inherits the site's structured data.