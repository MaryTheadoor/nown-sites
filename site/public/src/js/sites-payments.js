/* ==========================================================================
   sites-payments.js — S.I.T.E.S payments integration (plug-and-play)
   Payments are an integration BLOCK with a swappable ADAPTER. The only interface
   the markup needs is the `product` tile's data-* contract (data-sku/price).

   Contract:
     SITES.payments = { name, init(cfg), addToCart(item), checkout(cart),
                        onSuccess(cb) }
   ========================================================================== */
(function () {
  'use strict';
  const SITES = (window.SITES = window.SITES || {});
  SITES.paymentAdapters = SITES.paymentAdapters || {};

  /* ---------------------------------------------------------------- none */
  SITES.paymentAdapters.none = function () {
    return {
      name: 'none',
      async init() {}, addToCart() {}, async checkout() { throw new Error('no payment provider configured'); }, onSuccess() {},
    };
  };

  /* -------------------------------------------------------------- stripe */
  // Hosted Checkout: redirect to a Checkout Session / Payment Link.
  // Prefer creating the session server-side so prices are never trusted client-side.
  SITES.paymentAdapters.stripe = function (opts) {
    const o = opts || {};
    const cart = [];
    return {
      name: 'stripe',
      async init() { if (o.publishableKey && !window.Stripe) console.warn('[SITES] load Stripe.js for on-page elements'); },
      addToCart(item) { cart.push(item); },
      async checkout(items) {
        const lineItems = items || cart;
        // Option A: a payment link with prefilled quantity; Option B: server creates a session.
        if (o.paymentLink) { location.href = o.paymentLink; return { redirect: true }; }
        if (o.createSessionUrl) {
          const res = await fetch(o.createSessionUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: lineItems }) });
          if (!res.ok) throw new Error('checkout session failed: HTTP ' + res.status);
          const { url } = await res.json();
          location.href = url; return { redirect: true, url };
        }
        throw new Error('stripe adapter needs `paymentLink` or `createSessionUrl`');
      },
      onSuccess(cb) {
        const p = new URLSearchParams(location.search);
        if (p.get('checkout') === 'success') cb({ sessionId: p.get('session_id') });
      },
    };
  };

  /* -------------------------------------------------------------- square */
  // Square Web Payments SDK (on-page card form) or a hosted Square payment link.
  SITES.paymentAdapters.square = function (opts) {
    const o = opts || {};
    let payments = null, card = null;
    return {
      name: 'square',
      async init() {
        if (!window.Square) throw new Error('Square Web Payments SDK not loaded');
        payments = window.Square.payments(o.applicationId, o.locationId);
        return payments;
      },
      addToCart() {},
      async checkout(_cart) {
        if (!payments) await this.init();
        if (!card) card = await payments.card();
        // The host page must mount `card` into a container and tokenize:
        const result = await card.tokenize();
        if (result.status !== 'OK') throw new Error('card tokenization failed');
        // Send `result.token` + server-verified amounts to your function.
        return { token: result.token };
      },
      onSuccess(cb) { cb && cb(); },
    };
  };

  /* ------------------------------------------------------------ snipcart */
  SITES.paymentAdapters.snipcart = function () {
    return {
      name: 'snipcart',
      async init() { if (!window.Snipcart) console.warn('[SITES] Snipcart not loaded'); },
      addToCart(item) { if (window.Snipcart) window.Snipcart.api.items.add(item); },
      async checkout() { if (window.Snipcart) window.Snipcart.api.theme.cart.open(); },
      onSuccess(cb) {
        document.addEventListener('snipcart.ready', () => {
          window.Snipcart.events.on('order.completed', (order) => cb(order));
        });
      },
    };
  };

  /* -------------------------------------------------------------- paypal */
  SITES.paymentAdapters.paypal = function (opts) {
    const o = opts || {};
    return {
      name: 'paypal',
      async init() { if (!window.paypal) throw new Error('PayPal SDK not loaded'); },
      addToCart() {},
      async checkout() { return { note: 'Mount Buttons with createOrder; capture server-side.' , clientId: o.clientId }; },
      onSuccess(cb) { cb && cb(); },
    };
  };

  /** Resolve a payments adapter by name (falls back to `none`). */
  SITES.paymentsFor = function (name, opts) {
    return (SITES.paymentAdapters[name] || SITES.paymentAdapters.none)(opts);
  };
})();
