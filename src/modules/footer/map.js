// map.js — lazy Leaflet + OpenStreetMap map (privacy-first, no API key).
//
// Nothing external is fetched until the tile actually scrolls into view, so a page
// containing a map stays fast and never blocks on a third-party CDN. Set
// `data-leaflet` on the tile to point at a self-hosted copy (fully offline/sovereign);
// otherwise the library is loaded from unpkg on demand.
SITES.register('map', {
  init(tile) {
    const canvas = tile.querySelector('[data-role="canvas"]');
    const center = (tile.getAttribute('data-center') || '').split(',').map(Number).filter((n) => !Number.isNaN(n));
    const zoom = +(tile.getAttribute('data-zoom') || 12);
    const marker = tile.getAttribute('data-marker') || '';
    const base = tile.getAttribute('data-leaflet') || 'https://unpkg.com/leaflet@1.9.4/dist';
    if (!canvas || center.length < 2) return;

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      if (!window.L) return; // library unavailable — leave the container
      const map = L.map(canvas).setView(center, zoom);
      L.tileLayer(tile.getAttribute('data-tiles') || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);
      if (marker) L.marker(center).addTo(map).bindPopup(marker);
      tile.dataset.loaded = 'true';
    };

    const load = () => {
      if (window.L) { start(); return; }
      // Leaflet's marker icons resolve relative to its CSS, so make that explicit.
      if (!document.querySelector('link[data-leaflet-css]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = base + '/leaflet.css'; css.setAttribute('data-leaflet-css', '');
        document.head.appendChild(css);
      }
      const s = document.createElement('script');
      s.src = base + '/leaflet.js';
      s.onload = () => {
        if (window.L && L.Icon && L.Icon.Default) L.Icon.Default.imagePath = base + '/images/';
        start();
      };
      s.onerror = () => console.warn('[SITES] map: Leaflet could not be loaded (offline or CDN blocked)');
      document.head.appendChild(s);
    };

    // Fetch nothing until the map is near the viewport; a click forces it early.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries, obs) => {
        if (entries.some((e) => e.isIntersecting)) { load(); obs.disconnect(); }
      }, { rootMargin: '250px' });
      io.observe(tile);
      canvas.addEventListener('click', () => { load(); io.disconnect(); });
    } else {
      load();
    }
  },
});
