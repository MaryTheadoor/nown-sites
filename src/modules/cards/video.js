// video.js — lazy-load an embedded video when the tile scrolls into view.
SITES.register('video', {
  init(tile) {
    const src = tile.getAttribute('data-video-src');
    const placeholder = tile.querySelector('[data-role="placeholder"]');
    if (!src) return;
    const load = () => {
      // Build a sandboxed iframe on demand.
      const frame = document.createElement('iframe');
      frame.src = src;
      frame.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      frame.setAttribute('allowfullscreen', 'true');
      frame.setAttribute('loading', 'lazy');
      frame.setAttribute('title', 'Embedded video');
      frame.style.width = '100%';
      frame.style.height = '100%';
      frame.style.border = '0';
      const media = tile.querySelector('.media') || tile;
      (placeholder || media).replaceWith(frame);
      tile.dataset.loaded = 'true';
    };
    // Only start if scrolled near the viewport, else wait.
    if (Intl && Intl.Segmenter && document.visibilityState === 'visible') {
      const io = new IntersectionObserver((entries, obs) => {
        if (entries.some((e) => e.isIntersecting)) { load(); obs.disconnect(); }
      }, { rootMargin: '200px' });
      io.observe(tile);
      if (placeholder) placeholder.addEventListener('click', () => { load(); io.disconnect(); });
    } else if (placeholder) {
      placeholder.addEventListener('click', load);
    }
  },
});
