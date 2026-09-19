// search.js — Pagefind client-side search (if the index exists) else fall back
// to the native form submit. Progressive: works without JS.
SITES.register('search', {
  async init(tile) {
    const form = tile.querySelector('[data-role="form"]');
    const input = tile.querySelector('[data-role="input"]');
    const results = tile.querySelector('[data-role="results"]');
    if (!form || !input || !window.pagefind) return; // no index: native submit only

    const run = async (q) => {
      const search = await window.pagefind.search(q);
      results && (results.innerHTML = '');
      search.results.slice(0, 8).forEach(async (r) => {
        const data = await r.data();
        const a = document.createElement('a');
        a.href = data.url;
        a.textContent = data.meta?.title || data.url;
        a.className = 'tile-search__result';
        results && results.appendChild(a);
      });
    };

    form.addEventListener('submit', (e) => { e.preventDefault(); run(input.value.trim()); });
    let debounce;
    input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => run(input.value.trim()), 220); });
  },
});
