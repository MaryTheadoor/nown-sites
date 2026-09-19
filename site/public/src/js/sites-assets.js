/* ==========================================================================
   sites-assets.js — S.I.T.E.S image/asset deployment (plug-and-play)
   Two first-class modes behind one adapter:

     repo     — images compiled into the repository, referenced by path.
                Sovereign, offline-capable, cacheable; change = redeploy.
     firebase — images in Firebase Storage, referenced by token URL.
                Manage/replace without redeploying; upload from the admin.

   Content may reference an image three ways:
     1. a path        "/assets/hero.jpg"
     2. a full URL    "https://…/hero.jpg?alt=media&token=…"
     3. a logical key "asset:hero"   ← resolved through the site's asset map
   ========================================================================== */
(function () {
  'use strict';
  const SITES = (window.SITES = window.SITES || {});
  SITES.assetAdapters = SITES.assetAdapters || {};

  const isAbsolute = (v) => /^(https?:)?\/\//.test(v) || /^(data:|blob:)/.test(v) || v.startsWith('/');

  /* ------------------------------------------------------------ repo mode */
  SITES.assetAdapters.repo = function (opts) {
    const o = opts || {};
    const base = o.base || '/assets/';
    return {
      name: 'repo',
      /** logical key or filename -> servable path */
      url(key) { return isAbsolute(key) ? key : base + String(key).replace(/^\/+/, ''); },
      async upload() { throw new Error('repo mode: commit the file into ' + base + ' and reference its path'); },
      async list() { return []; },
    };
  };

  /* -------------------------------------------------------- firebase mode */
  // Files live at sites/{siteId}/assets/{name}; the download URL carries a token,
  // so it is safe to reference directly from page code / content.json.
  SITES.assetAdapters.firebase = function (opts) {
    const o = opts || {};
    const siteId = o.siteId || 'nowndigital';
    const base = o.base || `sites/${siteId}/assets`;
    const ensure = () => {
      if (!window.firebase) throw new Error('Firebase SDK not loaded on this page');
      if (!window.firebase.apps.length) window.firebase.initializeApp(o.firebase);
    };
    return {
      name: 'firebase',
      url(key) {
        if (isAbsolute(key)) return key;
        const mapped = (SITES.assetMap || {})[key];
        return mapped || key; // a token URL already, or unresolved
      },
      /** Upload a File; returns a stable token URL to store in content.json. */
      async upload(file, name) {
        ensure();
        const filename = name || file.name;
        const ref = window.firebase.storage().ref(`${base}/${filename}`);
        await ref.put(file, { contentType: file.type || 'application/octet-stream', cacheControl: 'public, max-age=31536000' });
        const url = await ref.getDownloadURL();
        return { url, path: `${base}/${filename}`, name: filename };
      },
      async remove(name) { ensure(); await window.firebase.storage().ref(`${base}/${name}`).delete(); },
      async list() {
        ensure();
        const res = await window.firebase.storage().ref(base).listAll();
        const out = [];
        for (const item of res.items) out.push({ name: item.name, url: await item.getDownloadURL() });
        return out;
      },
    };
  };

  /* ------------------------------------------------------------- facade */
  let adapter = SITES.assetAdapters.repo({});

  const api = {
    setAdapter(name, opts) { adapter = (SITES.assetAdapters[name] || SITES.assetAdapters.repo)(opts || {}); return adapter; },
    get adapter() { return adapter; },

    /** Load the site's asset map from the content doc (assets: {key: url}). */
    loadMap(doc) { SITES.assetMap = (doc && doc.assets) || {}; },

    /** Resolve any image reference to a servable URL. */
    resolve(src) {
      if (typeof src !== 'string' || !src) return src;
      const m = src.match(/^asset:(.+)$/);
      if (!m) return src;
      const key = m[1];
      const mapped = (SITES.assetMap || {})[key];
      if (mapped && isAbsolute(mapped)) return mapped;
      return adapter.url(mapped || key);
    },

    /** Admin widget: upload a file (firebase) or show the repo-path hint. */
    renderField(onPick) {
      const wrap = document.createElement('div');
      wrap.className = 'adm-upload';
      if (adapter.name === 'repo') {
        const hint = document.createElement('p');
        hint.className = 'adm-hint';
        hint.textContent = 'Repo mode: put the file in /assets and use its path (or asset:<key>).';
        wrap.appendChild(hint);
        return wrap;
      }
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const status = document.createElement('span');
        status.className = 'adm-hint'; status.textContent = 'Uploading…';
        wrap.appendChild(status);
        try {
          const { url } = await adapter.upload(file);
          status.textContent = 'Uploaded ✓';
          onPick(url);
        } catch (err) { status.textContent = 'Upload failed: ' + err.message; }
      });
      wrap.appendChild(input);
      return wrap;
    },
  };

  SITES.assets = api;
})();
