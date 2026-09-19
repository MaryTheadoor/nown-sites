# S.I.T.E.S Deployment

**Default stack: Firebase** (Hosting + Auth + Storage). It's the reference
implementation — simple, one console, one CLI. Other hosts and stores are fully
supported through the same adapter contract; nothing in the framework requires
Firebase.

**Normative companion to `docs/SPEC.md` §10.**

---

## 1. The default Firebase architecture

```
        ┌──────────── ADMIN (gated) ────────────┐
        │  Firebase Auth (email/password)        │
        │  Firebase SDK → writes the content file│
        └───────────────┬───────────────────────┘
                        ▼
        Storage:  sites/{siteId}/content.json   ← the backend copy file
                        │  (public read)
                        ▼
        ┌──────────── PUBLIC SITE (dependency-free) ────────────┐
        │  Firebase Hosting serves index.html + asset CSS/JS     │
        │  plain fetch('…/sites/{siteId}/content.json')          │
        └───────────────────────────────────────────────────────┘
```

**Why this shape**
- The public site stays **dependency-free** — it only `fetch()`es a JSON file. No
  SDK, no auth, no runtime coupling to Firebase.
- The **admin** is the only page that loads SDKs, and it is gated by Auth.
- `content.json` is a real, cacheable, portable file — you can move it anywhere.

---

## 2. Firebase setup (one project)

```bash
npm i -g firebase-tools        # once
firebase login
firebase projects:create my-sites-project   # or reuse an existing project
```

1. **Hosting** — serve the static site from the `public/` directory:
   ```bash
   firebase init hosting        # public dir: public ; single-page app: No
   firebase deploy --only hosting
   ```
2. **Auth** — Console → Authentication → Sign-in method → enable
   **Email/Password** (add Google if you want). Create the owner account.
3. **Storage** — Console → Storage → create the default bucket, then deploy the
   rules in `storage.rules`.
4. **Content** — the admin writes `sites/{siteId}/content.json`. Nothing else is
   needed; the public site fetches it.

### Files in this repo
| File | Purpose |
|---|---|
| `firebase.json` | Hosting + Storage + (optional) Firestore config |
| `.firebaserc` | Project alias — **replace `YOUR-FIREBASE-PROJECT`** |
| `storage.rules` | Public read of content; authenticated/admin-only write |
| `firestore.rules` | Optional Firestore variant |

> Keep the framework's `firebase.json` as a template; a real site copies it into
> its own project root and sets `public` to its built directory.

---

## 3. Storage rules (default)

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // The backend copy file: world-readable, admin-writable.
    match /sites/{siteId}/content.json {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.token.email_verified == true
                   && request.auth.token.admin == true;   // see note
    }
    match /sites/{siteId}/{allPaths=**} { allow read: if true; allow write: if false; }
  }
}
```

**The `admin` claim** — set it once with the Admin SDK (or a one-off script):
```js
await getAuth().setCustomUserClaims(uid, { admin: true });
```
Simpler alternative for a single-owner site: `allow write: if request.auth != null
&& request.auth.token.email == 'you@example.com';`

---

## 4. Content file paths

| Granularity | Path |
|---|---|
| One file per site *(default)* | `sites/{siteId}/content.json` |
| Split per page *(custom)* | `sites/{siteId}/pages/{page}.json` |

The admin's storage adapter is configured once (`sites.config.js`).

---

## 5. Optional: Firestore (draft/publish)

If you want a draft→publish workflow, store the working copy in Firestore and
publish the static file on demand:

- Firestore doc `sites/{siteId}` = the editable draft.
- "Publish" writes `content.json` to Storage (the public artifact).
- Rules in `firestore.rules` (public read of the published doc; authenticated
  write). A Cloud Function can also mirror Firestore → Storage automatically.

This keeps the public site dependency-free while giving editors a preview stage.

---

## 6. Alternatives (equally supported)

Switch by changing the **storage adapter** and hosting target — no markup change.

| Host | Content store | Adapter |
|---|---|---|
| **Firebase** *(default)* | Storage file | `firebase` |
| **Cloudflare Pages** | repo + Pages Functions/KV | `git` / `http` |
| **GitHub Pages** | the repo itself | `git` |
| **Netlify** | repo / Netlify Blobs | `git` / `http` |
| **IPFS + ENS** | content-addressed upload | `http` (pinning service) |
| **Google Sites** *(simplest, least control)* | manual paste | none |

```js
// sites.config.js — swap the provider in one place
window.SITES_CONFIG = {
  adapter: 'firebase',                 // or 'git' | 'local' | 'http'
  options: { siteId: 'nowndigital', /* … */ },
};
```

**Rule:** the site's HTML/CSS/JS and `content.json` are portable artifacts. Moving
hosts must never require editing tiles.

---

## 7. Deployment checklist

- [ ] `firebase.json` `public` points at the built site directory.
- [ ] `.firebaserc` project id set.
- [ ] Auth provider enabled; owner account created; `admin` claim set.
- [ ] `storage.rules` deployed; content path world-readable, write locked down.
- [ ] `content.json` present at `sites/{siteId}/content.json`.
- [ ] Public page fetches the file and renders; JS-off shows baked copy.
- [ ] No API secrets in client code.
