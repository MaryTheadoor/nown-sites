/* ==========================================================================
   sites.js — S.I.T.E.S tile registry + boot
   Tiny, dependency-free. One registry, no globals beyond SITES itself, and
   progressive enhancement (content renders with JS disabled).
   ========================================================================== */
(function () {
  'use strict';

  const SITES = (window.SITES = window.SITES || {});
  SITES.tiles = SITES.tiles || {};

  /**
   * Register a tile module.
   * @param {string} name  Must match the tile's `data-tile="<name>"`.
   * @param {Object} mod   { init(el, ctx) {...}, destroy?(el) {...} }
   */
  SITES.register = function register(name, mod) {
    SITES.tiles[name] = mod;
  };

  /** Boot all tiles found in the DOM. */
  function boot(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-tile]').forEach(initTile);
  }

  function initTile(el) {
    const name = el.getAttribute('data-tile');
    const mod = SITES.tiles[name];
    if (!mod || !mod.init) return;
    // Avoid double-init if this tile already has a marker.
    if (el.__sites_init) return;
    el.__sites_init = true;
    try {
      mod.init(el, { SITES });
    } catch (err) {
      // A broken tile must never break the page.
      console.error(`[SITES] tile "${name}" failed to init:`, err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot());
  } else {
    boot();
  }

  // Expose helpers that tiles may use.
  SITES.boot = boot;
  SITES.initTile = initTile;

  // Optional: watch for hot-inserted tiles (e.g. from a CMS or fetch injection).
  if (window.MutationObserver) {
    let queue;
    const flush = () => { if (!queue || !queue.length) { queue = null; return; } const nodes = queue; queue = null; nodes.forEach(initTile); };
    new MutationObserver((muts) => {
      muts.forEach((m) => m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches('[data-tile]')) (queue = queue || []).push(n);
        if (n.querySelectorAll) n.querySelectorAll('[data-tile]').forEach((el) => (queue = queue || []).push(el));
      }));
      flush();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.SITES = SITES;
})();
