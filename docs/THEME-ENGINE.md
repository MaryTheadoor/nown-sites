# S.I.T.E.S Theme Engine

A **sitewide, content-driven theme**. Palettes (light **and** dark), fonts, radii
and spacing live in the backend copy file, so the theme is edited in the admin
**exactly like copy** — no CSS editing, no redeploy.

**Normative companion to `docs/SPEC.md` §6.** Implementation: `src/js/sites-theme.js`.

---

## 1. The theme object

```jsonc
"theme": {
  "defaultTheme": "system",              // light | dark | system
  "colors": {                            // LIGHT palette -> --color-<key>
    "background": "#FAF6F0", "surface": "#FFFFFF", "surface-2": "#F0EBE3",
    "text": "#111827", "text-muted": "#6B7280",
    "primary": "#1E4D4F", "accent": "#D97706", "plum": "#935B8A"
  },
  "dark": {                              // DARK overrides -> [data-theme="dark"]
    "background": "#0F172A", "surface": "#1E293B", "surface-2": "#334155",
    "text": "#E5E7EB", "text-muted": "#94A3B8",
    "primary": "#2A6B6E", "accent": "#E68A00"
  },
  "fonts":   { "sans": "system-ui, …", "display": "Georgia, …" },
  "radii":   { "md": "0.75rem", "lg": "1rem", "xl": "1.5rem" },
  "spacing": { "4": "1rem" },            // optional
  "shadows": { "card": "0 2px 16px …" }  // optional
}
```

**Group → CSS variable family**

| Group | Emitted variables |
|---|---|
| `colors` | `--color-<key>` (on `:root`) |
| `dark` | `--color-<key>` (under `[data-theme="dark"]`) |
| `fonts` | `--font-<key>` |
| `radii` | `--radius-<key>` |
| `spacing` | `--space-<key>` |
| `shadows` | `--shadow-<key>` |

Any dark key omitted **falls back to the light value** — so a dark palette can be
partial.

---

## 2. How it applies (no flash)

`SITES.theme.apply(theme)` writes one injected `<style id="sites-theme-vars">`:

```css
:root { --color-background:#FAF6F0; --color-primary:#1E4D4F; … }
[data-theme="dark"] { --color-background:#0F172A; … }
```

Tiles never change — they already use `var(--color-*)`, so the whole site re-skins
at once. Because the dark values are a CSS rule, **switching modes costs nothing**
(no re-render).

The script is loaded in `<head>`, so the correct mode is set **before first paint**
(no flash of the wrong theme). It is applied again when the content file arrives.

---

## 3. The light/dark switcher

| Mode | Behaviour |
|---|---|
| `light` / `dark` | forced |
| `system` | follows `prefers-color-scheme` and **updates live** when the OS changes |

- Persisted in `localStorage` under `sites-theme`.
- `defaultTheme` from the content file applies until a visitor chooses.
- **Toggle contract:** any element with `data-role="theme-toggle"` is wired
  automatically (no per-page script). Emits `sites:themechange`.

```html
<button class="nav-dock-link nav-dock-theme" data-role="theme-toggle"
        type="button" aria-label="Toggle dark mode"><span>Theme</span></button>
```

API: `SITES.theme.apply(theme)`, `.setMode('light'|'dark'|'system')`,
`.currentMode()`, `.toggle()`, `.resolved(mode)`, `.init()`.

---

## 4. Admin (editable like copy)

`SITES.themeRegistry` declares the editable tokens; the admin renders inputs
(color pickers, selects, text) and **live-previews** on change; Save writes them to
`content.json` with the rest of the copy.

| Field group | Input |
|---|---|
| `defaultTheme` | select (system/light/dark) |
| `colors.*` / `dark.*` | colour picker + hex field |
| `fonts.*` | text (font stack) |
| `radii.*` | text |

Adding a token = add it to `themeRegistry` (+ optionally the CSS default). It then
appears in the admin automatically.

---

## 5. Normative rules

1. All visual values **MUST** be tokens; tiles **MUST NOT** hardcode them.
2. Tiles **MUST** consume only the token families in §1.
3. The dark palette **MUST** be expressed as `dark` (a `[data-theme="dark"]`
   override), **MUST NOT** be a second stylesheet.
4. The toggle **MUST** be wired via `data-role="theme-toggle"`; pages **MUST NOT**
   re-implement theme logic.
5. The initial mode **MUST** be applied before first paint.
6. `system` mode **MUST** track live OS changes.
7. Component-specific dark overrides **SHOULD** be eliminated in favour of token
   overrides (a small number of surface-specific rules remain permissible).

**Status:** the literal colours in `nown-tiles.css` have been migrated to tokens —
button depths (`--color-primary-deep`, `--color-accent-deep`, `--color-accent-deep-2`,
`--color-plum-deep`), text on accent (`--color-on-accent`), and the translucent
surfaces (`--color-glass`, `--color-glass-border`, `--color-dock`,
`--color-dock-border`), with accent tints via `color-mix()`. Component-level
`[data-theme="dark"]` overrides are gone — dark mode is entirely token-driven.

> Remaining literals are **structural only** (button depth shadows and the video
> overlay gradient), which are not theme colours.
