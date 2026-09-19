# S.I.T.E.S Information Intake Form

Everything needed to build a S.I.T.E.S site, in one fillable document — for a
**do-it-yourselfer**, an **agency working with a client**, or an **AI agent**
gathering a brief.

**How to use it**

1. Fill in the **Answer** column. Skip anything marked *(optional)*.
2. Hand the completed form back — a human or an AI converts it into a
   `blueprint.md` (`docs/BLUEPRINT-FORMAT.md`), compiles it to `content.json`
   (`tools/blueprint.mjs`), and builds the pages.
3. If you can't answer everything, fill §0 and §1–§5 — that is enough to start.

> **Agencies:** send §1–§5 to the client first, then §6 once the sitemap is agreed.
> **AI agents:** this form maps 1:1 onto the blueprint and the tile registry
> (`src/js/tile-registry.js`); §6 fields are the tile `config` keys.

```
Intake form  →  blueprint.md  →  content.json  →  site (index.html + admin)
```

---

## §0 — The absolute minimum (10 answers)

If you only fill in one part of this form, fill in this.

| # | Question | Answer |
|---|---|---|
| 1 | Business / organization name | |
| 2 | What do you do (one sentence)? | |
| 3 | Who is it for (audience)? | |
| 4 | What should a visitor **do** (primary goal/CTA)? | |
| 5 | List the 3–7 pages you need | |
| 6 | Do you have a logo? (yes / no / need one) | |
| 7 | Brand colors (hex codes, or "no preference") | |
| 8 | Primary contact (name, email, phone) | |
| 9 | Domain name (or "need one") | |
| 10 | Anything you definitely **don't** want? | |

---

## §1 — Project basics

| Field | Answer |
|---|---|
| Project / site name | |
| Client or owner (if agency work) | |
| Your name & role (person filling this in) | |
| Best contact (email / phone) | |
| Target launch date | |
| Budget range *(optional)* | |
| Working site you like / dislike, and why *(optional)* | |
| Languages needed | |

**Deliverable wanted** (tick one):
- [ ] Design + build + deploy
- [ ] Build only (design supplied)
- [ ] Content/copy help too
- [ ] Update an existing site

---

## §2 — Business / organization

| Field | Answer |
|---|---|
| Legal name | |
| Trading / display name | |
| What the business does (1–2 sentences) | |
| Year founded *(optional)* | |
| Location(s) / service area | |
| Business hours *(if applicable)* | |
| Products / services (list) | |
| What makes you different (2–3 points) | |
| Typical customer | |
| Competitors / similar sites *(optional)* | |
| Certifications, awards, affiliations *(optional)* | |
| Any numbers worth showing (years, clients, units) *(optional)* | |

---

## §3 — Goals & audience

| Field | Answer |
|---|---|
| Primary goal of the site (one) | |
| Secondary goals | |
| How will you know it worked? (success measure) | |
| What actions should visitors take? | |
| Common questions customers ask *(optional)* | |
| Objections / hesitations to address *(optional)* | |
| Existing traffic or marketing *(optional)* | |

---

## §4 — Brand & theme

| Field | Answer |
|---|---|
| Tagline / one-line positioning | |
| Tone of voice (e.g. warm, clinical, playful, premium) | |
| Words to use | |
| Words to avoid | |
| Logo file(s) *(link or attach)* | |
| Primary brand color (hex) | |
| Secondary / accent color (hex) | |
| Background preference (light / dark / either) | |
| Preferred fonts *(or "choose for me")* | |
| Roundness (sharp / slightly rounded / very rounded) | |
| Imagery style (photos / illustrations / mixed) | |
| Existing brand guide or assets *(optional)* | |

**Theme tokens** (a designer or AI fills this — see `docs/THEME-ENGINE.md`):

| Token | Light | Dark |
|---|---|---|
| `background` | | |
| `surface` | | |
| `text` | | |
| `primary` | | |
| `accent` | | |

---

## §5 — Site structure

**Pages** — list every page. Add rows as needed.

| # | Page name | URL path | Purpose (one line) | In nav? |
|---|---|---|---|---|
| 1 | Home | `/` | | ☐ |
| 2 | | | | ☐ |
| 3 | | | | ☐ |
| 4 | | | | ☐ |
| 5 | | | | ☐ |
| 6 | | | | ☐ |

**Navigation labels** (in order): _______________________________________

**Footer should contain:** _____________________________________________

**Recipe closest to what you need** (`docs/INTEGRATIONS.md` §7):
- [ ] `brochure` (simple business site)  - [ ] `agency` (studio/portfolio)
- [ ] `shop` (retail)  - [ ] `restaurant`  - [ ] `member-site` (gated)  - [ ] `docs`

---

## §6 — Content, page by page

The core of the build. For each page, list its **tiles** (sections) in order and
supply the copy. Available tile types are the catalog in `docs/MODULE-SPEC.md` §8 —
the common ones are pre-listed below; delete the ones you don't want and add rows
for repeat pages.

> **Tip:** you don't have to be a writer. Bullet points are fine — an AI can draft
> the final copy for approval.

### Page: Home

| Tile | Field | Copy |
|---|---|---|
| `announcement` | text | |
| `hero` | headline | |
| `hero` | sub-copy | |
| `hero` | button label → link | |
| `feature` | section title | |
| `feature` | item 1: title / body | |
| `feature` | item 2: title / body | |
| `feature` | item 3: title / body | |
| `gallery` | title | |
| `gallery` | images (how many / from where) | |
| `testimonial` | quote / attribution | |
| `cta` | headline / body / button | |
| `contact` | heading | |
| `contact` | phone / email / address | |
| `footer` | copyright line | |

### Page: ________ (copy this block per page)

| Tile | Field | Copy |
|---|---|---|
| | | |
| | | |
| | | |
| | | |

### Longer text

Some tiles take paragraphs (story, about, service descriptions). Paste or attach:

- **About / story:** _______________________________________________
- **Service 1 description:** _______________________________________
- **Service 2 description:** _______________________________________
- **FAQ items** (question → answer, as many as needed):
  1. ______________________________________________________________
  2. ______________________________________________________________

---

## §7 — Integrations

Tick what you need; the framework swaps providers by config (`docs/INTEGRATIONS.md`).

| Need | Wanted? | Provider preference | Details |
|---|---|---|---|
| **Contact form** | ☐ | Formspree / Tally / StaticForms | Where should submissions go? |
| **Booking / calendar** | ☐ | Cal.com / SavvyCal | Which calendar account? |
| **Payments** | ☐ | Stripe / Square / Snipcart / PayPal | What are you selling? Prices? |
| **Search** | ☐ | Pagefind | Roughly how many pages? |
| **Map** | ☐ | Leaflet + OpenStreetMap | Address to center on |
| **Analytics** | ☐ | Plausible / Umami *(privacy-first only)* | |
| **Newsletter / email** | ☐ | Buttondown / Mailerlite | Which list? |
| **Login / member area** | ☐ | Firebase / Supabase / Auth0 / Clerk | Who gets access? |
| **AI assistant** | ☐ | OpenAI / Anthropic / Gemini / local | What should it help with? |
| **Social links** | ☐ | — | Which platforms + handles |
| **Live chat** | ☐ | *(optional)* | |

**Existing accounts/keys you already have:** ________________________________
*(Never send secrets in this form — we'll set those up securely.)*

---

## §8 — Assets / images

| Question | Answer |
|---|---|
| Do you have photos? (yes / some / none) | |
| Where are they? (link, Drive, Dropbox) | |
| Do you have permission to use them all? | |
| Logo files (SVG/PNG, light + dark) | |
| Product images *(if shop)* | |
| Team photos *(if team section)* | |
| Preferred image style | |
| Should we source stock images? | |

**Deployment mode for images** (see `docs/ASSETS.md`):
- [ ] **Repo assets** — committed to the site, changed by editing files (simplest, sovereign)
- [ ] **Firebase Storage** — uploaded via the admin, swapped without redeploying (easiest to maintain)

**For each image, supply:** filename, what it shows, alt text, and any credit.

| File | Shows | Alt text | Credit |
|---|---|---|---|
| | | | |

---

## §9 — SEO & metadata

| Field | Answer |
|---|---|
| Page title (≈60 chars) | |
| Meta description (≈155 chars) | |
| Target keywords / phrases | |
| Primary location served | |
| Social share image (1200×630) | |
| **Google Business Profile URL** (Maps listing → Share → Copy link) | |
| Has it been claimed? (yes / no / don't know) | |
| Is it current — hours, photos, categories, reviews answered? | |
| Who can log in to it? | |
| Client wants profile **setup** / **refresh** / **ongoing management**? | |
| Should we add structured data (LocalBusiness, FAQ, etc.)? | |

---

## §10 — Legal & compliance

| Question | Answer |
|---|---|
| Privacy policy needed? (yes/no/have one) | |
| Terms of service needed? | |
| Accessibility target (WCAG AA recommended) | |
| Cookie/tracking notice needed? | |
| Industry regulations (health, finance, legal) *(optional)* | |
| Copyright year / ownership line | |

---

## §11 — Domain, hosting & accounts

| Field | Answer |
|---|---|
| Domain name | |
| Who controls the domain registrar? | |
| DNS access available? | |
| Preferred host | **Firebase (default)** / Cloudflare Pages / GitHub Pages / Netlify / IPFS / Google Sites |
| Business email(s) to publish | |
| Who will own the Firebase project? | |
| Who needs admin access to edit copy? | |
| Offline/no-JS requirement? | |

---

## §12 — Approvals

| Item | Who approves | Status |
|---|---|---|
| Sitemap / pages | | ☐ |
| Copy (final) | | ☐ |
| Brand/theme | | ☐ |
| Images | | ☐ |
| Integrations & accounts | | ☐ |
| Deploy / go-live | | ☐ |

**Notes, constraints, and anything else we should know:**

_______________________________________________________________________

---

## Appendix — how this form becomes a site

| Intake section | Becomes |
|---|---|
| §1, §5, §9, §11 | `site` block (name, baseUrl, description, seo) |
| §4 | `theme` block (colors + dark + fonts + radii) |
| §5 nav table | `nav[]` |
| §6 | `content[]` — one entry per tile (`type` + `config`) |
| §7 | `integrations` block + per-tile config (`data-form-endpoint`, `data-calendar-url`, `data-sku`) |
| §8 | `assets` map + files in `/assets` (or Firebase Storage) |
| §10 | `footer` + legal tiles/pages |
| §11 | hosting + storage adapter in `sites.config.js` |

**Then:** `docs/BLUEPRINT-FORMAT.md` → `tools/blueprint.mjs` → `content.json` →
pages → `docs/MODULE-SPEC.md` §7 checklist.