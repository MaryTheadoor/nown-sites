/* ==========================================================================
   sites-adapters.js — S.I.T.E.S content storage adapters
   One adapter is configured per site; it is the ONLY place provider-specific
   logic lives. Adapters read/write the standardized backend copy file
   (content.json, validated against sites-schema.json).
   ========================================================================== */
(function () {
  'use strict';
  const SITES = (window.SITES = window.SITES || {});
  SITES.adapters = SITES.adapters || {};

  /** Minimal structural validation against the schema's required shape. */
  function validate(doc) {
    const errors = [];
    if (!doc || typeof doc !== 'object') errors.push('content must be an object');
    else {
      if (!doc.site || !doc.site.name) errors.push('site.name is required');
      if (!Array.isArray(doc.content)) errors.push('content[] is required and must be an array');
      else doc.content.forEach((t, i) => {
        if (!t.type) errors.push(`content[${i}].type is required`);
      });
    }
    return errors;
  }
  SITES.validateContent = validate;

  /* ---------------------------------------------------------------------
     Adapter: local — no backend; reads /content.json, "save" downloads a file.
     Ideal for authoring/offline/dev and for a Git-based publish step.
     --------------------------------------------------------------------- */
  SITES.adapters.local = function localAdapter(opts) {
    const o = opts || {};
    const url = o.url || '/content.json';
    return {
      name: 'local',
      async login() { return { user: { name: 'Local author' } }; }, // no auth offline
      logout() {},
      currentUser() { return { name: 'Local author' }; },
      async load() {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('load failed: HTTP ' + res.status);
        return res.json();
      },
      async save(_siteId, content) {
        const errors = validate(content);
        if (errors.length) throw new Error('invalid content: ' + errors.join('; '));
        const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = o.filename || 'content.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        return { revision: 'local-' + Date.now(), note: 'Downloaded content.json — commit or upload it.' };
      },
      async history() { return []; },
    };
  };

  /* ---------------------------------------------------------------------
     Adapter: git — commits content.json to a repo via the GitHub Contents API.
     Most sovereign: content is versioned, diffable, and offline-owned.
     Requires a fine-grained token scoped to contents:write on this repo only,
     ideally obtained via a server-side OAuth exchange (never hardcoded).
     --------------------------------------------------------------------- */
  SITES.adapters.git = function gitAdapter(opts) {
    const o = opts || {};
    const { owner, repo, path = 'content.json', branch = 'main', token } = o;
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers = () => ({
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    });
    const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
    return {
      name: 'git',
      async login() { if (!token) throw new Error('git adapter needs an OAuth token'); return { user: { name: owner } }; },
      logout() {},
      currentUser() { return token ? { name: owner } : null; },
      async load() {
        const r = await fetch(`${api}?ref=${branch}`, { headers: headers() });
        if (!r.ok) throw new Error('load failed: HTTP ' + r.status);
        const j = await r.json();
        return JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g, '')))));
      },
      async save(_siteId, content, sha) {
        const errors = validate(content);
        if (errors.length) throw new Error('invalid content: ' + errors.join('; '));
        const body = { message: 'content: update copy', content: b64(JSON.stringify(content, null, 2)), branch, sha };
        const r = await fetch(api, { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
        if (!r.ok) throw new Error('save failed: HTTP ' + r.status);
        const j = await r.json();
        return { revision: j.commit && j.commit.sha };
      },
      async history() { return []; },
    };
  };

  /* ---------------------------------------------------------------------
     Adapter: firebase — THE DEFAULT. Auth (email/password) + a Storage file.
     - The ADMIN page loads the SDK (auth + storage) and writes
       sites/{siteId}/content.json.
     - The PUBLIC site never loads the SDK; it just fetches the file's public URL
       (pass `publicUrl`, or let the adapter resolve the Storage download URL).
     Modes: 'storage' (default, simple) | 'firestore' (draft→publish, optional).
     --------------------------------------------------------------------- */
  SITES.adapters.firebase = function firebaseAdapter(opts) {
    const o = opts || {};
    const fb = o.firebase;                       // { apiKey, authDomain, projectId, ... }
    const siteId = o.siteId || 'nowndigital';
    const mode = o.mode || 'storage';            // 'storage' | 'firestore'
    const filePath = o.path || `sites/${siteId}/content.json`;

    const ensureApp = () => {
      if (!window.firebase) throw new Error('Firebase SDK not loaded on this page (admin only)');
      if (!window.firebase.apps.length) window.firebase.initializeApp(fb);
    };

    return {
      name: 'firebase',
      async login(email, password) {
        ensureApp();
        await window.firebase.auth().signInWithEmailAndPassword(email, password);
        return { user: window.firebase.auth().currentUser };
      },
      async loginWithProvider(provider) {
        ensureApp();
        const p = provider === 'google' ? new window.firebase.auth.GoogleAuthProvider() : null;
        const c = await window.firebase.auth().signInWithPopup(p);
        return { user: c.user };
      },
      logout() { window.firebase && window.firebase.auth().signOut(); },
      currentUser() { return window.firebase && window.firebase.auth().currentUser; },

      async load() {
        // Public read path: fetch the published file (works with or without SDK).
        const url = o.publicUrl || await (async () => {
          ensureApp();
          return window.firebase.storage().ref(filePath).getDownloadURL();
        })();
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('load failed: HTTP ' + res.status);
        return res.json();
      },

      async save(_siteId, content) {
        const errors = validate(content);
        if (errors.length) throw new Error('invalid content: ' + errors.join('; '));
        ensureApp();
        if (mode === 'firestore') {
          // Optional draft→publish: write the draft doc (publish happens separately).
          await window.firebase.firestore().doc(`sites/${siteId}`).set({ ...content, _updatedAt: Date.now() });
          return { revision: String(Date.now()), note: 'Saved draft to Firestore — publish to update the live file.' };
        }
        // Default: write the published content file to Storage.
        const ref = window.firebase.storage().ref(filePath);
        await ref.putString(JSON.stringify(content, null, 2), 'raw', { contentType: 'application/json', cacheControl: 'no-cache' });
        return { revision: String(Date.now()), note: 'Published to ' + filePath };
      },

      async history() { return []; },
    };
  };

  /** Resolve the configured adapter for a page. */
  SITES.contentAdapterFor = function (name, opts) {
    const make = SITES.adapters[name] || SITES.adapters.local;
    return make(opts);
  };
})();
