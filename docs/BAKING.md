# Baking — rendering copy into static pages

**Companion to `docs/CONTENT-MODEL.md` and `docs/SEO.md`.** Status: v0.1.

---

## 1. The problem baking solves

The runtime binder fills `data-role` slots from the content file *when a page
loads*. That is the right design for a human editing copy in the admin: change a
value, reload, see it.

It is the wrong design as the **only** source of a page's text, because a crawler
and a social scraper read the bytes the server hands them and run nothing. What
they see is whatever the file already contained — usually placeholder copy.

For most sites that is a ranking nuisance. For the pages this framework is aimed
at it is closer to fatal:

| What | Why it must be in the served HTML |
|---|---|
| A compact-keyword page's `<h1>` | The headline **is** the keyword. It is the strongest on-page relevance signal the page has. |
| A hub tile's cards | Those links **are** the crawl path that exposes the cluster to a search engine. |
| The body copy | 300–500 words of purchase-intent copy is the page's entire reason to exist. |

So: **bake**. Render the copy into the HTML at build time. The binder still runs
on load and re-applies the same values, which is a visual no-op — the admin stays
the source of truth for later edits, and the delivered site stays dependency-free.

`tools/seo.mjs` already does this for the `<head>`. Baking is the same principle
for the part of the page a human reads.

---

## 2. What it does and does not do

```bash
node tools/bake.mjs <siteDir> [--content <file>] [--check] [--og] [--seo] [--quiet]
```

**It does:** read each `.html` page in the directory, match every
`data-tile-id` to its content entry, apply the same rules the runtime binder
applies, and write the file back with its own line endings.

**It does not decide page structure.** AGENTS.md §3 is explicit that the HTML owns
structure and the content file owns copy. A baker that invented pages would be a
second, competing source of truth for layout — so baking fills pages that already
exist and never creates or deletes one. Adding a tile means editing the page;
changing its words means editing `content.json`.

The one exception is the nav: `nav` has always lived in the content file, so
baking rebuilds the dock's links exactly as the binder does.

| Flag | Effect |
|---|---|
| `--check` | Report what would change; write nothing. Use it as a CI gate. |
| `--og` | Then run `tools/og-image.mjs` — a stale share image keeps yesterday's headline in every link preview. |
| `--seo` | Then run `tools/seo.mjs`. |
| `--content` | Point at a content file other than `content.json`. |

`--og` and `--seo` chain in that order **after** baking, so the sequence cannot
be got wrong by forgetting a step. They are opt-in because a site may keep its
share image or its SEO block under separate control.

---

## 3. Idempotency

Baking is idempotent: run it twice and the second run writes nothing.

```
$ node tools/bake.mjs examples/pawn-shop
[bake] pawn-shop — 15 page(s), 66 tile(s), 23 content entries
  15 page(s) written
  ✓ no warnings
$ node tools/bake.mjs examples/pawn-shop
[bake] pawn-shop — 15 page(s), 66 tile(s), 23 content entries
  0 page(s) written, 15 already up to date
  ✓ no warnings
```

That property is worth more than it looks. A non-idempotent baker makes every run
a diff, which makes the real diff invisible — and a file that grows a byte each
time is a bug that hides for weeks.

Two things have to hold for it, and both were bugs first:

- **Attributes round-trip explicitly.** `<img src alt />` and
  `<img src="" alt="" />` mean the same thing, but only one of them survives a
  parse/serialize cycle unchanged. The serializer always emits `="…"`.
- **Line endings convert once.** Normalise to `\n` before parsing and restore
  after. Converting already-CRLF text appends a `\r` on every run.

---

## 4. Rules that must match the runtime binder

Baking and binding have to agree, or the page changes under the reader's eyes on
load — and the no-JS version is the wrong one. The rules, mirrored from
`src/js/sites-content.js`:

| Config value | Becomes |
|---|---|
| a string on a plain element | the element's text |
| a string on a `<div>` with a blank line | one `<p>` per block |
| a string on a `<ul>`/`<ol>` | one `<li>` per line; `Name\|Price` splits into two spans |
| an array | the container's `<template>` cloned once per item |
| `{src, alt}` | the `<img>`/`<iframe>` inside the slot |
| a value on `data-attr="x"` | the `x` attribute |
| `asset:key` | resolved through the `assets` map |

**An id is authoritative.** A `data-tile-id` binds the entry with that id, or
nothing at all. It never falls back to type-matching — one content file can serve
many pages, and a fallback would let pages steal each other's tiles.

---

## 5. Working with the pipeline

Baking is the copy half of a two-part split:

```
structure  ──▶  scaffold   create pages from src/modules/<type>.html
copy       ──▶  bake       fill the slots from content.json
metadata   ──▶  seo.mjs, og-image.mjs
```

`examples/pawn-shop/build.cjs` is a worked example of that split: it scaffolds 15
pages from the framework's own snippets and then calls
`bake.mjs --og --seo`.

A typical change-copy cycle on a baked site:

```bash
# edit content.json (or the blueprint, then recompile)
node tools/bake.mjs site/public --og --seo
node tools/check-site.mjs site/public
```

### A note on the framework's own site

`site/public` is hand-authored and is **not** currently baked — the preview by
`--check` is expected to report changes. The framework's own pages carry
placeholder copy that the binder replaces on load, which is exactly the situation
§1 describes. Baking them is available and would make the site coherent with
JavaScript disabled; it has not been done because it rewrites the site's own
committed pages, which is a content decision rather than a tooling one.
