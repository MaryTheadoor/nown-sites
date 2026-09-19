/* ==========================================================================
   sites-auth.js — S.I.T.E.S authentication integration (plug-and-play)
   Identity is an integration BLOCK with a swappable ADAPTER. Public pages never
   load an auth SDK; only gated pages (e.g. admin) select an adapter.

   Contract:
     SITES.auth = { name, init(cfg), login(email,pw), logout(), currentUser(),
                    onAuthChange(cb), isAuthorized(role) }
   ========================================================================== */
(function () {
  'use strict';
  const SITES = (window.SITES = window.SITES || {});
  SITES.authAdapters = SITES.authAdapters || {};

  /* ---------------------------------------------------------------- local */
  SITES.authAdapters.local = function (opts) {
    const o = opts || {};
    let user = null;
    return {
      name: 'local',
      async init() { user = o.user || { name: 'Local author', role: 'admin' }; return user; },
      async login() { user = o.user || { name: 'Local author', role: 'admin' }; return user; },
      logout() { user = null; },
      currentUser() { return user; },
      onAuthChange() {},
      isAuthorized(role) { return !role || (user && user.role === role); },
    };
  };

  /* ------------------------------------------------------------- firebase */
  // Requires the Firebase SDK loaded on the GATED page only; key stays a public
  // client id. Authorization must also be enforced in Firestore/Storage rules.
  SITES.authAdapters.firebase = function (opts) {
    const o = opts || {};
    const cfg = o.config || {};
    const ensure = async () => {
      if (!window.firebase) throw new Error('Firebase SDK not loaded on this page');
      if (!window.firebase.apps.length) window.firebase.initializeApp(cfg);
    };
    return {
      name: 'firebase',
      async init() { await ensure(); return window.firebase.auth().currentUser; },
      async login(email, password) { await ensure(); const c = await window.firebase.auth().signInWithEmailAndPassword(email, password); return c.user; },
      async loginWithProvider(provider) { await ensure(); const p = new window.firebase.auth.GoogleAuthProvider(); const c = await window.firebase.auth().signInWithPopup(p); return c.user; },
      logout() { window.firebase && window.firebase.auth().signOut(); },
      currentUser() { return window.firebase && window.firebase.auth().currentUser; },
      onAuthChange(cb) { ensure().then(() => window.firebase.auth().onAuthStateChanged(cb)); },
      isAuthorized(role) {
        const u = this.currentUser();
        if (!u) return false;
        if (!role) return true;
        const claims = u.getIdTokenResult ? null : null; // async claims checked server-side
        return (u.role || (u.email && (o.admins || []).includes(u.email))) === role || (o.admins || []).includes(u.email);
      },
    };
  };

  /* ------------------------------------------------------------- supabase */
  SITES.authAdapters.supabase = function (opts) {
    const o = opts || {};
    const client = () => {
      if (!window.supabase) throw new Error('Supabase client not loaded on this page');
      return window.supabase.createClient(o.url, o.anonKey);
    };
    return {
      name: 'supabase',
      async init() { const { data } = await client().auth.getSession(); return data.session && data.session.user; },
      async login(email, password) { const { data, error } = await client().auth.signInWithPassword({ email, password }); if (error) throw error; return data.user; },
      async logout() { await client().auth.signOut(); },
      currentUser() { return null; }, // read async via onAuthChange in practice
      onAuthChange(cb) { client().auth.onAuthStateChange((_e, s) => cb(s && s.user)); },
      isAuthorized(role) { return !role; },
    };
  };

  /* --------------------------------------------------------------- auth0 */
  SITES.authAdapters.auth0 = function (opts) {
    const o = opts || {};
    return {
      name: 'auth0',
      async init() { if (!window.createAuth0Client) throw new Error('Auth0 SPA SDK not loaded'); window.__a0 = await window.createAuth0Client({ domain: o.domain, clientId: o.clientId }); return window.__a0.isAuthenticated() ? window.__a0.getUser() : null; },
      async login() { await window.__a0.loginWithRedirect(); },
      logout() { window.__a0.logout({ returnTo: location.origin }); },
      currentUser() { return null; },
      onAuthChange(cb) { cb(null); },
      isAuthorized(role) { return !role; },
    };
  };

  /* --------------------------------------------------------------- clerk */
  SITES.authAdapters.clerk = function (opts) {
    const o = opts || {};
    return {
      name: 'clerk',
      async init() { if (!window.Clerk) throw new Error('Clerk SDK not loaded'); await window.Clerk.load(); return window.Clerk.user; },
      async login() { window.Clerk.openSignIn(); },
      logout() { window.Clerk.signOut(); },
      currentUser() { return window.Clerk && window.Clerk.user; },
      onAuthChange(cb) { window.Clerk && window.Clerk.addListener(({ user }) => cb(user)); },
      isAuthorized(role) { const u = this.currentUser(); return !role ? !!u : !!(u && u.publicMetadata && u.publicMetadata.role === role); },
    };
  };

  /** Resolve an auth adapter by name (falls back to `local`). */
  SITES.authFor = function (name, opts) {
    return (SITES.authAdapters[name] || SITES.authAdapters.local)(opts);
  };
})();
