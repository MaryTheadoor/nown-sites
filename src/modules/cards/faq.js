// faq.js — optional enhancement (native <details> already works without JS):
// 1. Ensure the tile uses the correct open-state semantics.
// 2. Provide a11y cue (aria-expanded) for screen readers that don't surface it.
SITES.register('faq', {
  init(tile) {
    tile.querySelectorAll('[data-role="item"]').forEach((d) => {
      const summary = d.querySelector('summary');
      if (!summary || summary.getAttribute('aria-expanded')) return;
      const sync = () => summary.setAttribute('aria-expanded', d.open ? 'true' : 'false');
      sync();
      d.addEventListener('toggle', sync);
    });
  },
});
