// contact-form.js — AJAX submit + status for the contact-form tile.
// The form works without JS (native POST to the endpoint); this only enhances it.
SITES.register('contact-form', {
  init(form) {
    const status = form.querySelector('[data-role="status"]');
    const submit = form.querySelector('[data-role="submit"]');
    const endpoint = form.getAttribute('data-form-endpoint') || form.getAttribute('action');
    if (!endpoint) return;

    const setStatus = (msg, tone) => {
      if (!status) return;
      status.textContent = msg;
      status.style.color = tone === 'error' ? '#B91C1C' : (tone === 'ok' ? '#15803D' : '');
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submit) submit.disabled = true;
      setStatus('Sending…', '');
      try {
        const body = new FormData(form);
        const res = await fetch(endpoint, { method: 'POST', body, headers: { Accept: 'application/json' } });
        if (res.ok) { setStatus('Thanks — we’ll be in touch!', 'ok'); form.reset(); }
        else { setStatus('Something went wrong. Please try again or email us.', 'error'); }
      } catch (err) {
        setStatus('Network error. Please try again.', 'error');
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  },
});
