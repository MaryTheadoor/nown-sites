// nav-dock.js — active-link highlight + theme toggle.
// Register with SITES so the framework boots it on <[data-tile="nav-dock"]>.
SITES.register('nav-dock', {
  init(dock) {
    // 1. Highlight the link matching the current path (best-effort).
    const here = location.pathname.replace(/\/+$/, '') || '/';
    dock.querySelectorAll('[data-role="link"]').forEach((a) => {
      const href = (a.getAttribute('href') || '/').replace(/\/+$/, '') || '/';
      if (href === here) { dock.querySelectorAll('[data-role="link"]').forEach((x) => x.classList.remove('active')); a.classList.add('active'); }
    });

    // 2. Theme toggle lives inside the dock (a <button data-role="theme-toggle">).
    const toggle = dock.querySelector('[data-role="theme-toggle"]');
    if (toggle) {
      const root = document.documentElement;
      const apply = (t) => {
        root.setAttribute('data-theme', t);
        toggle.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        try { localStorage.setItem('theme', t); } catch (e) {}
      };
      toggle.addEventListener('click', () => apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
    }
  },
});
