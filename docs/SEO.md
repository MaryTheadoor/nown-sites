# S.I.T.E.S SEO & AI search

What a S.I.T.E.S site actually publishes for search engines, social scrapers and
AI crawlers: the artifacts, where their data comes from, how to regenerate them,
and what is deliberately **not** covered.

Companions: `docs/CONTENT-MODEL.md` §1.1 (the content fields), `tools/seo.mjs`
(the generator), `tools/check-site.mjs` (the gate). Status: v0.1.

---

## 1. Why the artifacts are static

Crawlers and link-preview scrapers fetch the HTML and run **nothing**. A `<title>`
that `sites-content.js` writes after `fetch('content.json')` resolves does not
exist for Googlebot's first pass, for Slack, iMessage or WhatsApp link previews,
or for an LLM crawler. So the metadata is written into the pages at **authoring
time** by `tools/seo.mjs`.

The tool is not part of the site. It emits plain `.html`, `.xml` and `.txt`;
the site runs unchanged with the tool absent (same build-time-only contract as
`tools/blueprint.mjs`). No runtime dependency is added, and the page must still
read coherently with JavaScript off.

## 2. What is emitted

| Artifact | Location | Contents |
|---|---|---|
| SEO block | `<head>` of every page, between `<!-- seo:start -->` and `<!-- seo:end -->` | `<title>`, `<meta name="description">`, `<link rel="canonical">`, `og:type/site_name/title/description/url/locale/image`, `twitter:card/title/description/image`, one `application/ld+json` script |
| `sitemap.xml` | site root | one `<url>` per indexable page, with `<loc>` and `<lastmod>` |
| `robots.txt` | site root | `User-agent: *` / `Allow: /` plus `Sitemap: <baseUrl>/sitemap.xml` |

`og:image` and `twitter:image` appear only when an image is known — see §9.

## 3. Where the data comes from

Everything comes from `content.json`:

| Field | Feeds |
|---|---|
| `site.name` | `og:site_name`, JSON-LD `name` |
| `site.baseUrl` | canonical, `og:url`, sitemap, robots (required — the tool refuses to guess a domain) |
| `site.lang` | JSON-LD `inLanguage`, `og:locale` |
| `site.seo.title` / `.description` | fallback for any page without its own |
| `site.seo.image` | `og:image`, `twitter:image`, LocalBusiness `image` |
| `site.seo.pages["/<page>"]` | that page's `title`, `description`, `image` |
| `site.business` | the LocalBusiness JSON-LD node (§4) |
| `content[].page` + that page's copy | derived title/description when no override exists |

Per-page resolution order — first hit wins:

1. `site.seo.pages["/<page>"]` (takes `/`, `/tiles.html`, `tiles.html` or `/tiles` as the key).
2. The page's own copy: the first content entry carrying that page's `page` value
   (entries with no `page` belong to `/`), its `headline` as the title (suffixed
   with the site name) and its `body` as the description.
3. `site.seo.title` / `site.seo.description`.

Rule 2 is why a client site gets sane per-page metadata before anyone writes an
override; rule 3 is what a one-page site uses. A page that lands on rule 3 while
other pages exist is reported as a warning — five pages sharing one title is a
defect, not a default.

## 4. JSON-LD

One `@graph` per page:

- **`WebSite`** — always. `@id`, `url`, `name`, `description`, `inLanguage`.
- **`LocalBusiness`** — only when `site.business` exists, emitted from exactly
  the fields present, so nothing is invented:

| `site.business` | JSON-LD |
|---|---|
| `type` | `@type` (default `LocalBusiness`; use the real subtype — `PawnShop`, `FoodEstablishment` — it is what an answer engine can act on) |
| `name` | `name` (defaults to `site.name`) |
| `telephone` | `telephone` |
| `priceRange` | `priceRange` |
| `address.*` | `address` → `PostalAddress` (`streetAddress`, `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`) |
| `geo.latitude` / `.longitude` | `geo` → `GeoCoordinates` (both must parse as numbers, or the pair is dropped with a warning) |
| `openingHours` | `openingHours` (array of schema.org strings, e.g. `"Mo-Fr 09:00-18:00"`) |
| `site.seo.image` | `image` (absolute) |

Malformed optional data is dropped **with a warning** rather than emitted as
invalid schema: `address` with no usable parts, `geo` with non-numeric values,
`business` that is not an object. Silent omission is the failure mode this tool
exists to prevent, so every omission is printed.

## 5. Sitemap and robots rules

- `sitemap.xml` lists **indexable pages only**. A page carrying
  `<meta name="robots" content="noindex">` (admin, builder) is left out: a URL
  that asks not to be indexed has no business in a sitemap.
- `<lastmod>` is the page file's own modification date — a real timestamp, not a
  fabricated one. No `<changefreq>`/`<priority>`: search engines have ignored both
  for years.
- `robots.txt` allows crawling everywhere and points at the sitemap. `noindex`
  pages are deliberately **not** `Disallow`ed — a Disallow hides the `noindex`
  tag from the crawler, which is the opposite of the intent.
- The tool covers the `.html` files in the site root (non-recursive), which is the
  same page set `check-site.mjs` validates.

## 5b. Keeping a site out of the index while it is pre-launch

```jsonc
"site": { "seo": { "noindex": true } }
```

One site-wide switch, for the period when the site is reachable but not ready to be
found. It does three things together, because doing any one of them alone leaves a
contradiction:

| Artifact | With `noindex: true` | Why |
|---|---|---|
| Every page's SEO block | gains `<meta name="robots" content="noindex" />` | The only tag that reliably removes a URL |
| `robots.txt` | **no** `Sitemap:` line | Submitting a sitemap asks a crawler to index a site asking not to be indexed |
| `sitemap.xml` | **removed** | An empty `<urlset>` is not worth publishing, and a stale one lists URLs nothing should fetch |

**`robots.txt` stays crawlable on purpose — it does not become `Disallow: /`.** A
Disallow stops the crawler *fetching* the page, so it never reads the `noindex` tag
and the URL can stay in the index indefinitely. Crawlable plus `noindex` is the only
combination that actually removes a page.

It is a **site** setting rather than a per-page tag because the decision is "this site
is not ready to be found", not "this page differs from its neighbours". Page-level
`noindex` (admin, builder) still works and is independent: a page that hand-writes its
own tag keeps exactly one — the tool detects a tag *outside* its own generated block
before emitting another.

Removing the setting restores all three artifacts on the next run, and
`check-site.mjs` asserts **both** states rather than skipping the check: with the
switch on, a lingering `sitemap.xml` or an advertised one is an **error**, so a flag
flipped without a re-run cannot pass unnoticed.

## 6. Re-running after the owner edits copy

```bash
node tools/seo.mjs site/public            # write/fresh updated meta, sitemap, robots
node tools/seo.mjs site/public --dry-run  # show what would change
node tools/seo.mjs site/public --quiet    # for pipelines
```

- **Idempotent.** A file is only written when its bytes actually change, so a
  second run is a no-op and leaves an empty `git diff`.
- **Marked.** Everything the tool owns sits between `<!-- seo:start -->` and
  `<!-- seo:end -->`; a refresh replaces exactly that span and never touches
  anything outside it.
- **Adoption.** The first run on a hand-authored page moves the existing
  `<title>`, description, canonical, `og:*`, `twitter:*` and JSON-LD into the
  block instead of duplicating them. Favicon, stylesheets and
  `<meta name="robots">` are not owned by the tool and are left alone.
- Exit codes: `0` clean · `1` warnings (an indexable page still falls back to the
  site-wide title/description, or copy exceeds search-result length) · `2` cannot
  proceed (no content file, or no `site.baseUrl`).

## 7. The gate

`node tools/check-site.mjs site/public` fails — as errors, not warnings — when a
page has no `seo:start`/`seo:end` block, an empty title or description, more than
one `<title>`, a canonical that does not match the page's own path, a missing
`og:title/description/url/type` or `twitter:card`, a relative `og:image`,
JSON-LD that does not parse or has no `WebSite` node (`LocalBusiness` too, when
`site.business` is set), an indexable page missing from `sitemap.xml`, a
`noindex` page present in it, or a `robots.txt` that does not point at the
sitemap. A client site is expected to be provably compliant, so these cannot be
shrugged off.

## 8. Runtime note

`sites-content.js` no longer rewrites `document.title` from `site.seo.title`. It
fills the title only for a page that ships none, because otherwise every page of a
multi-page site would advertise the same title in the tab, in history and to any
crawler that does execute JavaScript — undoing exactly what this tool just wrote.
The visible copy is still bound from `content.json` at runtime as before.

## 9. Known limitations

1. **A runtime copy change does not refresh the static meta.** When the owner
   edits copy in `admin.html`, `content.json` changes and the visible text
   updates on reload — but the `<title>`, description and JSON-LD baked into the
   HTML stay as they were until `node tools/seo.mjs <site>` runs again and the
   files are republished. Run it in the publish step, not by hand.
2. **No `og:image` until an image is named.** Set `site.seo.image` (or
   `site.seo.pages[<page>].image`) to a raster — 1200×630 PNG/JPEG. SVG is not
   accepted by the social scrapers, so point at a real image or emit none;
   until then `twitter:card` falls back to `summary`. Use
   `tools/og-image.mjs` to produce one from the site's own content file — see §10.
3. **Root-level pages only.** Pages in subdirectories need the tool extended
   before their artifacts can be trusted; `check-site` reports a sitemap URL that
   matches no page in the directory.
4. **`<lastmod>` is a file timestamp.** A fresh checkout, a re-deploy or a
   formatting pass can move it without the words changing. It is not a content hash.
5. **No submission.** Nothing here pings a search console; submitting
   `sitemap.xml` is an operator step at go-live.
6. **No FAQ/Article/BreadcrumbList structured data.** Those need per-tile data the
   content model does not carry yet; the JSON-LD builder in `tools/seo.mjs` is
   where they would be added.

---

## 10. Generating the share image

`tools/seo.mjs` emits `og:image` only when one is named, and every social scraper
rejects SVG. So a site either ships a raster or every shared link renders as a bare
text card — which costs most in DM and email outreach, where the preview *is* the
hook.

`tools/og-image.mjs` produces that raster from the site's own `content.json`:

```bash
node tools/og-image.mjs site/public
# [og-image] public — 1200x630, 25.9 KB
#   wrote assets/og-image.png
#   next: set content.json -> site.seo.image = "/assets/og-image.png", then run node tools/seo.mjs site/public
```

It reads `site.name`, `site.seo.title`, `site.seo.description`, `site.baseUrl` and
`theme.colors` — so the card carries the site's real brand colours and its real
headline, and re-theming the site re-themes the preview. It draws:

- the brand name, in the theme's accent colour
- the SEO title, wrapped and auto-scaled to fit (a preview that clips its own
  headline is worse than no preview)
- the description, muted
- the domain, in a pill
- an atmospheric tint and a tile motif, echoing the plate

**It has no dependencies.** PNG is written by hand over Node's built-in `zlib`, and
the type is a 5×7 bitmap font compiled into the tool. No headless browser, no
canvas, no package manager — which matters, because a repository whose whole claim
is "no build step" should not acquire one to draw a link preview.

Output is 1200×630 by default (`--width`/`--height` exist for variants and tests).
Add the file to the content file, re-run `seo.mjs`, and `twitter:card` upgrades
itself from `summary` to `summary_large_image`.

```bash
node tools/og-image.mjs <siteDir> [--out <file>] [--title "..."] [--subtitle "..."]
```

Both shipped sites generate theirs this way: `site/public/assets/og-image.png` and
`examples/pawn-shop/assets/og-image.png`.