# Compact Keywords — the SEO model this framework is built for

**Normative companion to `docs/SEO.md`.** Status: v0.1.

`docs/SEO.md` describes *how* the framework emits metadata. This document
describes *which pages* are worth emitting it for, and why the framework's tile
model fits that job unusually well.

---

## 1. The idea

Edward Sturm's **Compact Keywords** method (["SEO – Down the
Funnel"](https://edwardsturm.com/articles/seo-down-the-funnel/)) draws the line
that matters in SEO: not head vs. long-tail, but **purchase-intent vs.
exploratory**.

| | Compact (bottom-funnel) | Non-compact (mid/top-funnel) |
|---|---|---|
| Example | "Collaboration Software with Intuitive Learning" | "What is Collaboration Software" |
| Searcher state | Knows what they want, not which brand | Still learning the category |
| Competition | Very low | High |
| Words needed to rank | ~415 | 2,000–3,000+ |
| Authority/backlinks needed | Low | High |
| Conversion | High | Low |
| Search volume | Low | High |
| AI chatbots | Pattern-match to the page | Answer it themselves, no click |

The argument for compact keywords is not that they are easy — it is that they
are **the part of search that generative AI did not take**. A chatbot answers
"what is X" directly. It cannot answer "who near me will buy my X today for
cash" without the business having said so somewhere a machine can read.

That last property is what makes compact keywords a *static-site* problem: the
answer has to exist as plain, crawlable HTML.

### The six shipping tests

A candidate keyword ships only if it passes all six.

| # | Test | Fails when |
|---|---|---|
| T1 | **Purchase intent** — the searcher is ready to transact | The query is a definition or a comparison |
| T2 | **Specific** — one offer answers it completely | Answering it needs the whole site |
| T3 | **3–6 words** — short enough to be "compact" | It is a sentence, or a single head term |
| T4 | **Low competition** — specific enough that few pages target it | National brands own the exact phrase |
| T5 | **Fulfillable** — the business can actually deliver it | It promises a service that does not exist |
| T6 | **Non-cannibalizing** — no other page targets the same intent | Two pages would compete with each other |

T5 and T6 are the ones people skip, and they are the expensive ones: a page that
promises something undeliverable converts the click into a bad review, and two
pages for one intent split their own authority.

---

## 2. Why this framework fits

The framework's hard rules read like a specification for a compact-keyword
factory.

| Framework property | Why it matters for a keyword cluster |
|---|---|
| **No build step** | A new landing page is a file, not a deploy pipeline. Twelve pages cost twelve files. |
| **Copy is data** | The keyword lives in `content.json`, so a cluster is generated, reviewed and edited as data. |
| **Tiles compose** | Every landing page is the same tile arrangement — no bespoke design per keyword. |
| **Static HTML** | The `<h1>`, the copy and the internal links are in the served bytes, which is what a crawler without JS reads. |
| **`tools/seo.mjs`** | Per-page title, description, canonical, OpenGraph and JSON-LD are baked in, not rendered. |
| **LocalBusiness JSON-LD** | `site.business` turns on the node that local search and AI answer engines read. |

The failure mode this framework is designed to avoid: a beautiful multi-page
site whose pages are all rendered client-side, so the only thing a crawler sees
is a template.

---

## 3. The two tiles

```
compact-keywords  ──▶  the hub: one card per landing page, real <a href> in static HTML
keyword-landing   ──▶  one page per compact keyword: <h1> = the keyword, ~415 words, one CTA
```

Full markup and field contracts: `docs/MODULE-SPEC.md` §9.

**`keyword-landing`** is deliberately small. Five fields carry a page:
`headline` (the keyword, verbatim), `body` (the copy), `actions` (one CTA),
plus optional `media` and `quote`/`attribution` for proof. That constraint is
the point — 3–6 keyword words, one offer, one action.

**`compact-keywords`** is the hub. Its `items` array is the cluster; each item's
`href` is a root-level page. It renders through `.sites-grid`, so it is one
column on a phone and more as the container widens, with no media query.

---

## 4. Generating a cluster

`tools/compact-keywords.mjs` turns a brief into a blueprint fragment.

```bash
node tools/compact-keywords.mjs business.json --out _keywords.blueprint.md
```

`business.json` is the minimum a brief needs:

```json
{
  "name": "Austin Gold & Pawn",
  "city": "Austin",
  "state": "TX",
  "type": "pawn shop",
  "specialties": ["guitars", "gold jewelry", "electronics", "tools"],
  "services": ["buy", "sell", "loan"],
  "differentiators": ["same-day cash", "no credit check loans", "expert appraisals"]
}
```

It emits one `compact-keywords` hub tile and one `keyword-landing` page per
keyword, using patterns keyed to `services`:

| Service | Pattern | Example |
|---|---|---|
| `buy` | `<type> that buys <item> in <place>` | Pawn shop that buys guitars in Austin, TX |
| `buy` | `Sell <item> near me in <city>` | Sell gold jewelry near me in Austin |
| `sell` | `Buy used <item> in <place>` | Buy used electronics in Austin, TX |
| `loan` | `Loan on <item> in <place>` | Loan on tools in Austin, TX |

Keywords are interleaved across specialties and capped at 12, so a four-specialty
brief is represented four ways rather than exhausting the first specialty.

### What the body copy does

Each landing page's copy is drafted against the five beats the method implies —
sub-problem, cost of leaving it, how it works, specifics, proof, next step — and
lands in the **300–500 word** band the method targets (a bare four-specialty brief
produces 301–324 words, measured). That length is not padding: it is roughly what
a page needs to answer a purchase-intent query completely enough to rank without
the 2,000-word top-of-funnel treatment.

The beats that need facts a script cannot know — appraisal times, price ranges,
warranty terms, review counts, licence numbers — carry an explicit `[bracketed]`
prompt instead of invented specifics:

```
What we buy: guitars, and [list the other categories you buy]. Condition matters,
but "used" is not a disqualifier ...
```

That is deliberate. A generated page that invents a turnaround time or a warranty
publishes a promise the business has to honour or retract, under its own name.
Filling four or five brackets from the intake form takes minutes; discovering a
fabricated claim from a customer takes a lot longer.

**What it does not do:** apply T1–T6. A generator produces candidates; a human or
an agent filters them. Treat the output as a draft cluster to edit, not a
finished one — the tests in §1 are the point of the method, and a script cannot
know what a business can actually deliver.

---

## 5. The static-page rule

This is the part that is easy to get wrong, and it is worth stating bluntly:

> **A compact-keyword page whose `<h1>` arrives via JavaScript has no `<h1>`.**

The framework's binder fills `data-role` slots from `content.json` on load. That
is right for a human editing copy in the admin. It is wrong as the *only* source
of the page's text, because:

- The `<h1>` **is** the keyword. It is the strongest on-page relevance signal
  the page has.
- The hub's cards **are** the internal links that let a crawler find the cluster.
- A social scraper and most crawlers run no JavaScript at all.

So a generated cluster must be **baked**: the real copy written into the HTML at
build time, with the binder re-applying the same values afterwards (a visual
no-op). `examples/pawn-shop/build.cjs` is the reference implementation of that
bake step, and `examples/pawn-shop/README.md` shows the verification.

`tools/seo.mjs` already bakes the `<head>`. Baking the body is the same
principle applied to the part of the page a human reads.

The general form of this is `tools/bake.mjs` (see `docs/BAKING.md`): it renders
`content.json` into pages that already exist, using the same rules the runtime
binder uses, so the served HTML and the JS-rendered DOM agree. Run it after
changing copy:

```bash
node tools/bake.mjs <siteDir> --og --seo
```

The pawn-shop recipe does exactly this — its `build.cjs` scaffolds page structure
from the framework's snippets and then calls `bake.mjs` for the copy.

---

## 6. Definition of done for a keyword cluster

Beyond the standard checklist in `AGENTS.md` §7:

- [ ] Every shipped keyword passes T1–T6, and every rejection names the test it failed.
- [ ] Each `keyword-landing` page carries its keyword verbatim in the `<h1>`, the
      `<title>`, the meta description and the slug.
- [ ] The hub lists every landing page as a real `<a href>` **in the served HTML**.
- [ ] Body copy is roughly 300–500 words (the method's ~415 target) — long enough
      to answer the intent, short enough to stay compact.
- [ ] With JavaScript disabled, the `<h1>` reads the keyword and the hub's links
      are present and count correctly.
- [ ] `node tools/seo.mjs <site>` and `node tools/check-site.mjs <site>` both
      pass, and the second `seo` run writes nothing.
- [ ] No two pages target the same intent.

---

## 7. Reference

- Method: [SEO – Down the Funnel](https://edwardsturm.com/articles/seo-down-the-funnel/) · [Compact Keywords press kit](https://edwardsturm.com/compact-keywords/press-kit/)
- Framework SEO mechanics: `docs/SEO.md`
- Tile contracts: `docs/MODULE-SPEC.md` §9
- Worked example: `examples/pawn-shop/`
- Generator: `tools/compact-keywords.mjs`