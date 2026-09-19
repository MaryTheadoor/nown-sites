# S.I.T.E.S Integrations — blocks, adapters & recipes

The S.I.T.E.S modular philosophy is **not limited to the UI**. Auth, payments,
storage, search, AI — everything is a **block** with a swappable **adapter**.
Think of it as a Lego set: a set of pre-made blocks plus instructions for one
assembly, which you are free to rearrange, swap, or extend.

**Normative companion to `docs/SPEC.md` §2.9.** Status: draft (v0.1).

---

## 1. The three concepts

| Concept | What it is | Example |
|---|---|---|
| **Block** | A self-contained unit with a stable contract. Two kinds: **UI tiles** and **integration blocks**. | `hero` (UI) · `auth` · `payments` · `ai-assistant` |
| **Adapter** | The swappable provider implementation behind a block. One per site. | `firebase` vs `supabase` auth |
| **Recipe** | The assembly instructions — which blocks, in what order, with what config. | "agency site with forms + booking" |

**Principles**
1. A block **MUST NOT** contain provider-specific logic; only its adapter may.
2. Swapping a provider **MUST** be a config change, never a markup change.
3. A block **MUST** degrade gracefully when its provider is absent.
4. No integration **MUST** require a tracking script or a captive backend.

---

## 2. The adapter contract

Every integration block exposes the same shape as `sites-adapters.js`:

```js
SITES.integrations.auth = {
  name: 'firebase',
  async init(config) {},          // load SDK lazily, wire UI
  async login(credentials) {},    // optional (auth)
  logout() {},
  currentUser() {},
  async charge(cartOrSku) {},     // optional (payments)
};
```

Blocks are selected in the blueprint (`integrations:`) and configured once:

```yaml
integrations:
  auth: firebase        # none | firebase | supabase | auth0 | clerk
  payments: stripe      # none | stripe | square | snipcart | paypal
  forms: formspree      # none | formspree | tally | staticforms
  search: pagefind      # none | pagefind
  analytics: none       # none | plausible | umami (privacy-first only)
  ai: none              # none | assistant | generator | search
```

---

## 3. Integration catalog

| Category | Block | Recommended providers | Notes |
|---|---|---|---|
| **Identity** | `auth` | Firebase, Supabase, Auth0, Clerk | email/password, magic link, OAuth; gates admin + member areas |
| **Payments** | `payments` | Stripe, Square, Snipcart/Trolley, PayPal | hosted checkout preferred → no PCI burden |
| **Forms** | `contact-form` | Formspree, Tally, StaticForms | REST endpoint, no backend |
| **Scheduling** | `event` | Cal.com, SavvyCal | inline embed, no off-site redirect |
| **Search** | `search` | Pagefind (WASM) | build-time index, ~100 KB |
| **Maps** | `map` | Leaflet + OpenStreetMap, MapLibre | privacy-first, no API key billing |
| **Analytics** | `analytics` | Plausible, Umami | cookieless, privacy-first only |
| **Email/CRM** | `capture` | Buttondown, Mailerlite | newsletter capture |
| **AI** | `ai-*` | see §5 | opt-in, key stays server-side |

---

## 4. Auth block (plug-and-play)

**Purpose:** optional gated areas (member pages, the admin dashboard) with an
identity provider of choice.

**Adapter interface**

```js
SITES.integrations.auth = {
  name, init(config), login(email, password) | loginWithProvider(p),
  logout(), currentUser(), onAuthChange(cb), isAuthorized(role),
};
```

**Providers**

| Adapter | Mechanism | When to use |
|---|---|---|
| `firebase` | Firebase Auth SDK | default; matches Firebase hosting |
| `supabase` | Supabase Auth | Postgres-centric projects |
| `auth0` | Auth0 SPA SDK | enterprise SSO / social |
| `clerk` | Clerk components | fastest drop-in UI |
| `local` | none | dev/offline |

**Security (normative)**
- The **site** (public pages) **MUST NOT** load an auth SDK; only gated pages do.
- Secrets/keys **MUST NOT** ship in client code beyond public client identifiers.
- Authorization decisions **MUST** be enforced server-side (rules/functions), never
  by hiding UI.

---

## 5. AI integrations — the modular plan

AI is a **first-class integration block**, provider-agnostic and opt-in. Four
progressive blocks, each usable alone:

| Block | What it does | Data flow |
|---|---|---|
| `ai-assistant` | Site-aware chat: answers questions using the site's own content | content.json → context → provider |
| `ai-search` | Semantic/natural-language search over site content | content.json → embeddings (optional) |
| `ai-generator` | Drafts copy from a brief **into the blueprint format** | brief → blueprint.md → (compile) |
| `ai-agent` | Automates tasks (lead triage, content updates) | server-side functions only |

**Provider adapters (bring-your-own model)**

| Adapter | Notes |
|---|---|
| `openai` · `anthropic` · `gemini` | hosted APIs |
| `local` (WebLLM / Ollama) | fully sovereign, runs on-device/edge |
| `proxy` | serverless function holding the key (default for production) |

**Normative rules**
1. AI **MUST** be off by default and explicitly enabled per site.
2. API keys **MUST NOT** be embedded in client code; use the `proxy` adapter or a
   serverless function.
3. The assistant **MUST** be grounded in the site's `content.json` (no unbounded
   external claims), and **MUST** disclose that it is an AI.
4. No visitor data **MUST** be sent to a provider without disclosure + consent.
5. The generator's output **MUST** be valid blueprint markdown (see
   `docs/BLUEPRINT-FORMAT.md`) so it flows through the same compile pipeline.

> This is the natural meeting point of the two systems: **the AI writes blueprints,
> the compiler produces the site, the admin maintains the copy.** One format, three
> actors (human, AI, owner).

---

## 6. Payments block (plug-and-play)

**Adapter interface**

```js
SITES.integrations.payments = {
  name, init(config), addToCart(item), checkout(cart), onSuccess(cb),
};
```

| Adapter | Mechanism | Notes |
|---|---|---|
| `stripe` | Checkout Sessions / Payment Links | hosted → no PCI scope |
| `square` | Square Web Payments SDK | matches Square-first merchants |
| `snipcart` | data-attribute buttons | Jamstack-native cart |
| `paypal` | PayPal Buttons | broad consumer reach |

**Rules:** prefer hosted checkout; never store card data; server-side price
verification (see the security note in `MODULE-SPEC.md` §6); the `product` tile's
`data-*` contract is the only interface the markup needs.

---

## 7. Recipes

A **recipe** is a named assembly pattern. Ships with the framework as
instructions (and, later, as a one-click bundle):

| Recipe | Blocks | Good for | Status |
|---|---|---|---|
| `brochure` | nav, hero, feature, gallery, contact, footer | simple business site | documented |
| `agency` *(nowndigital)* | brochure + testimonial, team, pricing, booking | studios/agencies | documented |
| `shop` | brochure + product, payments, cart | retail | documented |
| `restaurant` | nav, hero, menu, map, event, contact | hospitality (Café Tamaki) | documented |
| `member-site` | recipe + auth, member tiles | gated content | documented |
| `docs` | nav, content-card, search, faq | documentation | documented |
| **`pawn-shop`** | brochure + `compact-keywords` + `keyword-landing` × N + `contact-form` | **local business, Compact Keywords** | **`examples/pawn-shop/`** |

**Normative:** a recipe **MUST** be expressible purely as a blueprint + an
`integrations:` block selection — no bespoke code.

### The pawn-shop recipe (Compact Keywords)

`examples/pawn-shop/` is the first recipe that ships as a real, runnable example:
a business brief (`business.json`) goes in, a 15-page site comes out, with twelve
bottom-of-funnel landing pages generated by `tools/compact-keywords.mjs`.

The shape generalizes to any local business — the two tiles do not know what a
pawn shop is:

```
business.json ──compact-keywords.mjs──▶ blueprint fragment
                                          (hub index tile + one keyword-landing tile per keyword)
blueprint.md ──blueprint.mjs──▶ content.json ──▶ pages
```

See `examples/pawn-shop/README.md` for the pipeline and
`docs/MODULE-SPEC.md` §9 for the two tiles' contracts.
