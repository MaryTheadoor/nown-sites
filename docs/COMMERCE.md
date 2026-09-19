# Commerce — how a site sells things

**Decision record.** Status: **decided (launch scope)**. Supersedes the "Square Catalog
sync" wording in `docs/INTEGRATIONS.md` §6 and in the WaaS business documents.

---

## 1. The decision

> **Launch ships no e-commerce integration.** A site links *out* to product pages the
> business already has. Nothing is built, nothing is synced, no payment provider is
> wired into the framework.

If a pawn shop already sells through a free Square site, a Shopify store, an Etsy
shop, a Facebook Marketplace listing or literally any product page, the item on our
site is a card with an `<a href>` to it. That is the whole feature.

A custom inventory backend — upload photos, manage stock, take payment — is a real
product and a **later, higher tier**, built once the agency has validation and cash
flow to justify it.

### Why

Bootstrapping. Every hour spent on a payments integration is an hour not spent on the
thing that actually generates the first customers: **real-world traffic to local
businesses**. Menus, hours, photos, prices, offers, directions — the information that
makes somebody get in a car. Commerce is a different product with a different buyer,
and it is not the wedge.

It is also honest about the market. A pawn shop's customer walks in and pays at the
counter on the POS they already own. A food truck's customer is standing outside it.

---

## 2. What "linking out" buys us

- **Zero integration surface.** No SDK, no API key, no server, no webhook, no OAuth.
- **Provider-agnostic by construction.** Square, Shopify, Etsy, eBay, PayPal, a Google
  Form — if it has a URL, it works. We never have to support a provider.
- **It works with JavaScript disabled**, because a link is a link. (The current
  `product` tile's buy button does *not* — see §4.)
- **The merchant keeps the money relationship.** Their account, their payouts, their
  refunds, their tax. We take no payment risk and touch no card data.
- **It survives us.** If they leave, every link still points at their own store.

---

## 3. The two shapes it takes

### `products` tile — a grid of items that link out

A curated showcase: image, title, price, and a link. Renders through the existing
`.sites-grid`. See `docs/MODULE-SPEC.md` §10.

### `product` tile — a single item, now link-capable

The existing tile gains a `link` field. When it is set the buy action is an
`<a href>`; when it is not, the tile renders without a buy action.

### Deliberately not built at launch

| Not built | Why |
|---|---|
| Square Catalog API sync | OAuth, webhooks, reconciliation, ongoing maintenance — for a problem the shop mostly does not have |
| On-page card entry (`sites-payments.js`) | Puts us in PCI scope and changes nothing about conversion |
| Cart / checkout / shipping / tax | A different business, with a different buyer |
| Inventory backend | **The later tier.** See §5. |

---

## 4. The bug this decision exposes

`src/modules/cards/product.js` wires the buy action to a **`<button>`**. A link-based
buy action that only works once JavaScript runs is not a link, and it violates hard
rule 9 (the page must be coherent with JS disabled).

The fix is part of this scoping: when an item has a `link`, the buy action is an
`<a href>` in the markup, present in the served HTML. `product.js` should have nothing
to do.

---

## 5. What the later tier looks like

Deferred, not cancelled. The trigger to build it is **paying customers asking for it**,
not a roadmap date.

When it happens, the research below still applies and it is smaller than it looks.

### You do not need a Catalog API to sell an item

Both Square and Stripe create a hosted checkout page for an ad-hoc item — a name and a
price — in one API call:

**Square — Quick Pay Checkout** (`POST /v2/online-checkout/payment-links`):

```json
{
  "idempotency_key": "{UNIQUE}",
  "quick_pay": {
    "name": "Used Makita 18V Drill",
    "price_money": { "amount": 6500, "currency": "USD" },
    "location_id": "{LOCATION_ID}"
  }
}
```

No Order object in the request, no Catalog item. It returns `payment_link.url` — a
Square-hosted page that takes the card and drops the order into the seller's existing
Order Manager. Square documents the constraint plainly: *"A payment link can only be
used to accept payment from a single buyer"* — for 1-of-1 pawn inventory that is not a
limitation, it is the correct semantics.

**Stripe — Payment Links** (`POST /v1/payment_links`): `line_items[].price_data`
generates the Price inline, so the same holds — no pre-created Product or Price.

And there is a no-code path: in the Square Dashboard or POS app, *Payment links →
Create link → Sell an item* produces a shareable link, a QR code, or a buy button in a
few taps.

**A hosted payment link is just an `<a href>`** — which is why §1's decision costs so
little. The inventory backend is about *managing the item list and the photos*, not
about the payment, and that is a photography-and-CMS problem more than a payments one.

### The eventual shape

1. Owner uploads a photo, types a name and price (or the shop's Square export is
   imported once).
2. The tool creates a payment link per item and writes it into the item record.
3. The tile renders it as a link. Same tile, same markup — the URL just stops being
   pasted by hand.

---

## 6. Sources

| Claim | Source |
|---|---|
| Square Quick Pay: name + price + location, no Order or Catalog object | [Square — Quick Pay Checkout](https://developer.squareup.com/docs/checkout-api/quick-pay-checkout) |
| Square Order Checkout accepts ad-hoc line items too | [Square — Square Order Checkout](https://developer.squareup.com/docs/checkout-api/square-order-checkout) |
| A Square payment link accepts payment from a single buyer | [Square — Checkout API Guidelines and Limitations](https://developer.squareup.com/docs/checkout-api/guidelines-and-limitations) |
| No-code Square payment links, shareable as link/QR/buy button | [Square — Create and share payment links](https://squareup.com/help/us/en/article/6692-get-started-with-square-checkout-links) |
| Stripe payment links accept an inline `price_data` | [Stripe — Create a payment link](https://docs.stripe.com/api/payment-link/create) |
