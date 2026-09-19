/* ==========================================================================
   sites.config.js — per-site configuration.
   The ONE place a provider is chosen. Nothing else in the site changes when you
   swap storage or hosting (see docs/DEPLOYMENT.md).
   ========================================================================== */
window.SITES_CONFIG = {
  siteId: 'nowndigital',

  /* ---------------------------------------------------------------- DEFAULT
     Firebase is the default stack (Hosting + Auth + Storage).
     Uncomment and fill in your project's web config to go live:

  adapter: 'firebase',
  options: {
    siteId: 'nowndigital',
    mode: 'storage',                 // 'storage' (simple) | 'firestore' (draft→publish)
    publicUrl: '',                   // optional: skip the SDK lookup on public pages
    firebase: {
      apiKey: '…',
      authDomain: 'YOUR-FIREBASE-PROJECT.firebaseapp.com',
      projectId: 'YOUR-FIREBASE-PROJECT',
      storageBucket: 'YOUR-FIREBASE-PROJECT.appspot.com',
      messagingSenderId: '…',
      appId: '…',
    },
  },
  ------------------------------------------------------------------------- */

  /* Local authoring (works with no backend) — used for the offline demo.
     Swap to 'firebase' above, or 'git' for repo-committed content. */
  adapter: 'local',
  options: {
    siteId: 'nowndigital',
    url: 'nowndigital.content.json',
    filename: 'nowndigital.content.json',
  },

  /* Git adapter alternative (most sovereign — content versioned in your repo):
  adapter: 'git',
  options: { owner: 'OWNER', repo: 'REPO', path: 'content.json', branch: 'main' },
  */

  /* ------------------------------------------------------------- IMAGES
     repo     — files committed to /assets, referenced by path (default).
     firebase — files in Firebase Storage; the admin uploads them and stores a
                token URL in content.json (swap images without redeploying).
     Pages may also reference a logical key: src="asset:hero".
  ------------------------------------------------------------------------- */
  assets: {
    adapter: 'repo',
    options: { base: '/assets/' },

    // adapter: 'firebase',
    // options: {
    //   siteId: 'nowndigital',
    //   base: 'sites/nowndigital/assets',
    //   firebase: { /* the same web config as above */ },
    // },
  },
};
