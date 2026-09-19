# S.I.T.E.S Assets — image deployment

How images are stored, referenced, and managed. Two first-class modes behind one
adapter, so a site can start simple and grow without changing its markup.

**Normative companion to `docs/SPEC.md` §8/§13.** Implementation:
`src/js/sites-assets.js`.

---

## 1. Two deployment modes

| Mode | Where images live | Change an image | Best for |
|---|---|---|---|
| **`repo`** *(default)* | committed into the repository (`/assets/…`), referenced by path | edit the file + redeploy | sovereignty, offline, simple, cacheable, versioned with the code |
| **`firebase`** | Firebase Storage, referenced by **token URL**; uploaded from the admin | upload in the admin — **no redeploy** | non-technical owners, frequent image changes, larger libraries |

Switching is a one-line change in `sites.config.js` — **no markup changes**:

```js
assets: { adapter: 'repo', options: { base: '/assets/' } }
// or
assets: { adapter: 'firebase', options: { siteId: 'nowndigital', base: 'sites/nowndigital/assets' } }
```

---

## 2. Three ways to reference an image

Content and markup may use any of these, interchangeably:

| Form | Example | Notes |
|---|---|---|
| Path | `/assets/hero.jpg` | repo mode; committed file |
| Full URL | `https://firebasestorage.googleapis.com/…?alt=media&token=…` | firebase mode; token URL |
| **Logical key** | `asset:hero` | resolved through the site's **asset map** |

**The asset map** lives in the content file — this is what makes images easy to
manage: page code keeps a *name*, and the file behind it can be swapped.

```jsonc
"assets": {
  "hero":   "/assets/hero.jpg",
  "work-1": "https://firebasestorage.googleapis.com/…&token=…"
}
```

```html
<img data-role="src" src="" alt="">   <!-- content: { "src": "asset:hero" } -->
```

`SITES.assets.resolve('asset:hero')` → the mapped value (or, in firebase mode, the
adapter resolves the key to its token URL).

---

## 3. Adapter contract

```js
SITES.assets.setAdapter('repo' | 'firebase', options);

SITES.assets.adapter = {
  name,
  url(key)                 // key/filename -> servable URL
  async upload(file, name) // -> { url, path, name }   (firebase only)
  async remove(name)
  async list()             // -> [{ name, url }]
};
SITES.assets.resolve(src)  // path | URL | asset:key -> URL
```

**Firebase mode** stores files at `sites/{siteId}/assets/{name}` with
`cacheControl: public, max-age=31536000` and returns the **download token URL**.
Token URLs are long-lived and public-but-unguessable; revoke by rotating the token
in the console (or re-uploading).

---

## 4. Admin upload flow (firebase mode)

1. An `image` field renders an upload control next to the src/alt inputs.
2. The file uploads to `sites/{siteId}/assets/`, returning its token URL.
3. The URL is written into `content.json` (or into `assets` under a logical key).
4. The public page picks it up on next load — **no redeploy**.

Repo mode instead shows the convention: commit the file to `/assets/` and
reference its path (or add a key to the asset map).

---

## 5. Storage rules & paths

`storage.rules` ships with the framework:

```javascript
match /sites/{siteId}/content.json { allow read: if true; allow write: if isAdmin(); }
match /sites/{siteId}/{allPaths=**} { allow read: if true; allow write: if false; }
```

- Public **read** of site assets; **write** only for the authenticated admin.
- Admin uploads happen client-side with the Storage SDK **on the admin page only**
  — the public site stays SDK-free and just references URLs.

| Granularity | Content path | Asset path |
|---|---|---|
| One file per site *(default)* | `sites/{id}/content.json` | `sites/{id}/assets/…` |
| Split per page *(custom)* | `sites/{id}/pages/{page}.json` | `sites/{id}/assets/…` |

---

## 6. Normative rules

1. Every image **MUST** have `alt` text (empty `alt=""` only for decorative art).
2. Media wrappers **MUST** use `aspect-ratio` + `object-fit`; images **MUST** be
   `loading="lazy"` except the hero/LCP image.
3. Referencing images **MUST** go through `src`/`asset:` — pages **MUST NOT** hardcode
   a Storage URL into tile markup.
4. Swapping asset mode **MUST** be a config change only.
5. Uploaded files **MUST** be validated (type + size) before upload.
6. The public site **MUST NOT** load the Firebase SDK to display images.
7. Repository assets **SHOULD** be optimised (modern formats, sensible dimensions)
   at author time — there is no build step to do it later.
