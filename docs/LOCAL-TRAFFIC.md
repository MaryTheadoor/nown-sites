# Local traffic — what this framework is actually for

**Decision record + gap analysis.** Status: v0.1. This is the launch focus; commerce is
deferred (`docs/COMMERCE.md`).

---

## 1. The goal, stated plainly

> A local business needs **real people to physically turn up**.
> The site exists to cause that, and to be the thing a search engine can read when
> deciding whether to show the business to someone standing two miles away.

That is a different goal from "sell things online", and it changes what matters:

| Matters | Does not matter (at launch) |
|---|---|
| Where you are, when you are open, how to get there | Cart, checkout, shipping |
| What you have and what it costs | Inventory API sync |
| Photos that look current | A design system |
| That the information is *true today* | Feature count |
| Name / address / phone that match Google exactly | Deep analytics |

---

## 2. Where local traffic actually comes from

Not from the website's own traffic. From **Google's local pack and Maps**, which is
driven overwhelmingly by the **Google Business Profile** — not by the site.

So the site has three jobs, in order of value:

1. **Do not contradict the Google Business Profile.** A mismatched phone number or a
   different address spelling actively hurts. NAP (name, address, phone) consistency is
   the single highest-leverage thing on the page, and it is free.
2. **Reinforce it in machine-readable form.** `LocalBusiness` JSON-LD with address, geo,
   telephone and `openingHours` — the site telling Google the same story the profile
   does, in the format it parses.
3. **Capture the searches the profile cannot serve.** A Google Business Profile cannot
   rank for "pawn shop that buys guitars in Austin" or "food truck near the lake today".
   That is what compact-keyword landing pages are for (`docs/COMPACT-KEYWORDS.md`).

**Consequence worth stating out loud:** if a prospect has no Google Business Profile,
the highest-value first deliverable may be helping them claim one — not a website. The
site multiplies a profile that exists; it cannot substitute for one.

---

## 3. What the framework already has

| Need | Status |
|---|---|
| `LocalBusiness` JSON-LD with address, geo, telephone, priceRange | ✅ `site.business` → `tools/seo.mjs` |
| `openingHours` in JSON-LD | ✅ supported — but never *displayed* (§4) |
| Static, crawlable pages with per-page meta | ✅ `tools/seo.mjs` |
| Purchase-intent landing pages | ✅ `keyword-landing` + `compact-keywords` |
| Menu with prices | ✅ `menu` tile |
| Photos | ✅ `gallery`, `media`, the asset map |
| A map | ✅ `map` tile (Leaflet + OSM, no API key) |
| A status line ("we're at the lake until 4") | ✅ `announcement` |
| Generatable end to end from a brief | ✅ `examples/pawn-shop/` |

---

## 4. The gaps

### 4.1 Hours are structured for machines and invisible to people

`site.business.openingHours` feeds the JSON-LD. The only way to *show* hours is a free-text
line in the `contact` tile. So the two can silently disagree, and the visible one cannot
be parsed by anything — including the page's own JavaScript.

### 4.2 No way to get directions

The strongest call to action a local site has is a button that starts navigation.
`https://www.google.com/maps/dir/?api=1&destination=…` needs no API key and works on
every device. The framework has a map *embed* and no directions *link*.

### 4.3 "Are they open right now?" is unanswerable

The single most common question a hungry person asks a food truck's website. It needs
structured hours and a few lines of JavaScript — and it must degrade to the plain hours
list when JavaScript is off.

### 4.4 "Where are they today?" has no shape

A food truck's location changes daily, and it is the whole reason someone looks. Today
that is an `announcement` string plus a `map` centred on one fixed point. It needs a
"today" concept: a place, a window, and a way to get there — editable from a phone in
under a minute, because that is where the owner will be standing.

### 4.5 Nothing checks that the site agrees with itself

`check-site.mjs` verifies the markup, the content file and the SEO block. It does not
notice when a page displays hours that the JSON-LD contradicts, or when a `visit` block
shows one phone number and the structured data carries another.

---

## 5. The build

Ordered by value per hour. Each is small and independent.

| # | What | Why it is worth it | Status |
|---|---|---|---|
| 1 | **`visit` tile** — address, a **Get directions** link, tap-to-call phone, structured hours | One tile answers where / when / how-to-get-there. The foot-traffic conversion block. | ✅ |
| 2 | **Hours consistency gate** in `check-site.mjs` | Stops the displayed hours and the JSON-LD drifting apart — the failure mode that actively hurts local ranking. | ✅ |
| 3 | **`openState` behaviour** on `visit` | "Open now" / "Opens at 11" — computed from `site.business.openingHours`, the same list the JSON-LD uses. | ✅ |
| 4 | **`products` tile** — a link-out showcase | Closes the commerce question for launch (`docs/COMMERCE.md`). | ✅ |
| 5 | **`today` tile** — today's location, window and directions, for the food-truck niche | The reason the food truck's site gets opened at all. | ⏳ next |
| 6 | **GBP checklist in the intake form** | Forces the NAP question early, and surfaces "you have no profile" before it becomes a surprise. | ✅ |

### What shipped

`src/modules/local/visit.html` + `visit.js`, `src/modules/cards/products.html`, and the
hours gate. The pawn-shop recipe uses both (its home page is hero → keyword cluster →
value props → **visit** → **products** → footer).

The day/time maths in `visit.js` is covered by `tests/visit-hours.cjs` (16 assertions
over ranges, single days, a week-crossing range, and the recipe's real hours):

```bash
node tests/visit-hours.cjs      # 16 passed, 0 failed
```

Writing that test found a wrong assumption in the *test* — a Sunday closure correctly
reports "opens tomorrow" when tomorrow is Monday. Worth recording because it is the
kind of thing that looks like a bug and is not.

### Hours format

Display hours live on the tile, one day-range per line, `|`-separated — the same
convention the `menu` tile already uses for `name|price`:

```yaml
hours: |
  Mon–Fri|9:00–19:00
  Sat|10:00–18:00
  Sun|Closed
```

Machine hours live in `site.business.openingHours` in schema.org's format:

```yaml
business:
  openingHours:
    - "Mo-Fr 09:00-19:00"
    - "Sa 10:00-18:00"
```

Two representations, deliberately: one is written for a shop owner to edit without
help, the other is what a search engine parses. Gate #2 exists so they cannot drift.

---

## 6. The Google Business Profile service line

**Decided.** Working the Business Profile is not just a prerequisite — it is a
product, and for many prospects it is the *first* thing worth selling.

### Three offers

| Offer | Shape | When it applies |
|---|---|---|
| **Profile setup / claim** | One-time fee | The business has no profile, or one nobody has claimed |
| **Profile refresh** | One-time fee | A profile exists but is stale: wrong hours, no photos, unclaimed categories, unanswered reviews, no posts |
| **Ongoing management** | Monthly upcharge on the site tier | The owner will not keep it current, and a stale profile is worse than none |

The ongoing tier is the one with leverage: it is the only recurring work in this
business that is genuinely continuous. A site is built once and edited occasionally;
a profile drifts every week — hours change, stock changes, someone leaves a review,
Google adds a category worth claiming.

### Why this is nearly free to deliver alongside a site

**The profile and the site want the same data.** Name, address, phone, hours,
categories, photos — that is the intake form, and it is also
`site.business` in the content file, which is also what `tools/seo.mjs` turns into
`LocalBusiness` JSON-LD.

So the workflow is one data capture feeding three consumers:

```
  intake  ──┬──▶  Google Business Profile
            ├──▶  site.business in content.json
            └──▶  LocalBusiness JSON-LD  (tools/seo.mjs)
```

That is also the consistency guarantee. **NAP mismatch between the profile and the
site actively suppresses local ranking**, and the surest way to avoid it is to have
one source. The `visit` tile and the hours gate (see §5) already enforce the site
half of that.

### What "managing" means, concretely

Worth writing down, because "we manage your Google profile" is otherwise a
retainer with no defined deliverable:

- hours kept current, including holiday and one-off changes
- photos added on a schedule (Google favours profiles that are updated)
- posts published (offers, new stock, events)
- reviews responded to, especially the bad ones
- questions answered — the Q&A section, which most owners never look at
- categories and attributes reviewed: the difference between appearing for
  "pawn shop" and appearing for "gold buyer"
- NAP consistency checked against the site and any other listing

### The gate, stated once

> **Before quoting a site, look up the prospect's Google Business Profile.**

Three outcomes, all of them useful:

- **No profile** → the highest-value first deliverable may be claiming one, not
  a website. A site multiplies a profile that exists; it cannot substitute for one.
- **Stale profile** → quote the refresh alongside the site. Two one-time line items
  and a plausible monthly.
- **Healthy profile** → the site is the right first offer, and the compact-keyword
  pages are the argument for it.

This is why the intake form now asks it early and explicitly (docs/INTAKE-FORM.md §9).

---

## 7. What is out of scope, deliberately

- **Google Business Profile API integration.** Real OAuth, real quotas, and it manages a
  profile the owner should own. The site *reinforces* the profile; it does not run it.
- **Review collection.** Valuable, and a different product.
- **Analytics beyond a privacy-first page counter.** A local business needs *visits*, not
  a dashboard.
- **Booking / reservations beyond the existing `event` tile.** The `event` tile embeds
  Cal.com or similar; that is enough.