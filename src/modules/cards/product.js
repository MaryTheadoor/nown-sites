// product.js — wire a buy button to a provider (Snipcart, Stripe, Trolley, etc.).
// The tile is provider-agnostic: set data-provider on the tile (or the body) and
// this only dispatches to the chosen adapter. Content renders with no JS at all.
SITES.register('product', {
  init(tile) {
    const btn = tile.querySelector('[data-role="buy"]');
    if (!btn) return;
    const provider = tile.getAttribute('data-provider') || document.body.getAttribute('data-provider') || 'snipcart';
    const payload = {
      sku: tile.getAttribute('data-sku'),
      price: tile.getAttribute('data-price'),
      currency: tile.getAttribute('data-currency') || 'usd',
      name: (tile.querySelector('[data-role="title"]')?.innerText || '').trim(),
    };

    // Provider adapters. Each returns true if it handled the click.
    const adapters = {
      snipcart() {
        if (!window.Snipcart) return false;
        Snipcart.api.items.add({ id: payload.sku, price: payload.price, name: payload.name, url: location.href });
        return true;
      },
      // Stripe via a checkout-link builder (href-based) often requires no JS:
      // <a data-role="buy" href="https://buy.stripe.com/...">. Here we just surface it.
      stripe() { return false; },
      html() {
        // Fallback handler so the button always does something helpful.
        console.info('[SITES] product buy (no provider):', payload);
        return true;
      },
    };
    const adapter = adapters[provider] || adapters.html;
    btn.addEventListener('click', (e) => { e.preventDefault(); adapter(); });
  },
});
