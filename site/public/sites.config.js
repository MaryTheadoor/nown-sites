/* ==========================================================================
   sites.config.js — the framework site's provider configuration.
   The one place a provider is chosen (docs/DEPLOYMENT.md).
   ========================================================================== */
window.SITES_CONFIG = {
  siteId: 'nown-sites',

  /* Content storage: 'local' (this repo, authoring) | 'firebase' (production) */
  adapter: 'local',
  options: { siteId: 'nown-sites', url: 'content.json', filename: 'content.json' },

  /* Images: repo assets committed to /assets, or firebase Storage token URLs */
  assets: { adapter: 'repo', options: { base: '/assets/' } },

  /* Production (Firebase) — fill in and switch `adapter` above:
  adapter: 'firebase',
  options: {
    siteId: 'nown-sites',
    mode: 'storage',
    firebase: { apiKey: '…', authDomain: '…', projectId: '…', storageBucket: '…', appId: '…' },
  },
  */
};
