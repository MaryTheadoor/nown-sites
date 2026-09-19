// event.js — open a Cal.com / SavvyCal embed inline (no off-site redirect).
SITES.register('event', {
  init(tile) {
    const btn = tile.querySelector('[data-role="open-calendar"]');
    const url = tile.getAttribute('data-calendar-url');
    if (!btn || !url) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      // Inline embed: inject the provider's widget script if present, else open a modal iframe.
      const frame = document.createElement('iframe');
      frame.src = url;
      frame.title = 'Booking calendar';
      frame.style.cssText = 'width:100%;height:520px;border:0;border-radius:var(--radius-lg);margin-top:var(--space-4)';
      tile.appendChild(frame);
      btn.disabled = true;
    });
  },
});
