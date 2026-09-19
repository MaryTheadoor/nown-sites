/* ==========================================================================
   sites-theme.js — S.I.T.E.S theme engine
   A sitewide, content-driven theme: palettes (light + dark), fonts, radii and
   spacing all come from the backend copy file (`theme`), so they are editable in
   the admin exactly like copy. Handles the light/dark switcher, system
   preference, and persistence.

   Load this in <head> (before render) to avoid a theme flash.
   ========================================================================== */
(function () {
  'use strict';
  const SITES = (window.SITES = window.SITES || {});
  const KEY = 'sites-theme';          // persisted MODE: 'light' | 'dark' | 'system'

  /* ------------------------------------------------- token name mapping */
  const GROUPS = {
    colors: '--color-',
    fonts: '--font-',
    radii: '--radius-',
    spacing: '--space-',
    shadows: '--shadow-',
  };

  function varName(group, key) {
    if (key.startsWith('--')) return key;
    return (GROUPS[group] || '--') + key;
  }

  /** Flatten one palette object ({background, primary,...}) into CSS var pairs. */
  function paletteVars(group, obj) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.entries(obj).forEach(([k, v]) => { if (v != null && v !== '') out[varName(group, k)] = String(v); });
    return out;
  }

  /* --------------------------------------------- inject the variable sheet */
  function ensureStyleEl() {
    let el = document.getElementById('sites-theme-vars');
    if (!el) {
      el = document.createElement('style');
      el.id = 'sites-theme-vars';
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  const toCss = (vars) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');

  /**
   * Apply a theme object from the content file.
   *   theme: {
   *     defaultTheme: 'system'|'light'|'dark',
   *     colors: {...}, dark: {...}, fonts: {...}, radii: {...}, spacing: {...}
   *   }
   */
  function apply(theme) {
    if (!theme || typeof theme !== 'object') return;
    SITES.themeDoc = theme;

    const light = {
      ...paletteVars('colors', theme.colors),
      ...paletteVars('fonts', theme.fonts),
      ...paletteVars('radii', theme.radii),
      ...paletteVars('spacing', theme.spacing),
      ...paletteVars('shadows', theme.shadows),
    };
    const dark = { ...paletteVars('colors', theme.dark) };

    let css = '';
    if (Object.keys(light).length) css += `:root{${toCss(light)}}`;
    if (Object.keys(dark).length) css += `[data-theme="dark"]{${toCss(dark)}}`;
    ensureStyleEl().textContent = css;

    if (theme.defaultTheme) setDefault(theme.defaultTheme);
  }

  /* ------------------------------------------------------- mode (light/dark) */
  let defaultMode = 'system';

  function setDefault(mode) {
    defaultMode = mode || 'system';
    // If the user has never chosen, follow the site default.
    if (!read()) setMode(defaultMode, { silent: true });
  }

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }

  function systemMode() {
    return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  /** Resolve 'system' to a concrete mode. */
  function resolved(mode) { return (mode === 'system' || !mode) ? systemMode() : mode; }

  function setMode(mode, opts) {
    const o = opts || {};
    if (!o.silent) { try { localStorage.setItem(KEY, mode); } catch (e) {} }
    document.documentElement.setAttribute('data-theme', resolved(mode));
    document.documentElement.setAttribute('data-theme-mode', mode);
    document.dispatchEvent(new CustomEvent('sites:themechange', { detail: { mode, resolved: resolved(mode) } }));
    updateToggles();
  }

  function currentMode() { return read() || defaultMode; }

  function toggle() { setMode(resolved(currentMode()) === 'dark' ? 'light' : 'dark'); }

  function updateToggles() {
    const dark = resolved(currentMode()) === 'dark';
    document.querySelectorAll('[data-role="theme-toggle"]').forEach((el) => {
      el.setAttribute('aria-pressed', dark ? 'true' : 'false');
      const label = el.querySelector('[data-role="label"]') || el.querySelector('span');
      if (label && el.hasAttribute('data-label-swap')) label.textContent = dark ? (el.getAttribute('data-label-light') || 'Light') : (el.getAttribute('data-label-dark') || 'Dark');
    });
  }

  /* ----------------------------------------------------------- public API */
  const api = {
    apply, setMode, currentMode, toggle, resolved,

    /** Wire every [data-role="theme-toggle"] plus system changes. */
    init() {
      setMode(currentMode(), { silent: true });
      document.querySelectorAll('[data-role="theme-toggle"]').forEach((el) => {
        if (el.__sitesThemeWired) return;
        el.__sitesThemeWired = true;
        el.addEventListener('click', (e) => { e.preventDefault(); toggle(); });
      });
      if (window.matchMedia) {
        const mq = matchMedia('(prefers-color-scheme: dark)');
        (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => {
          if (currentMode() === 'system') setMode('system', { silent: true });
        });
      }
      // Bind the theme as soon as the content file arrives.
      document.addEventListener('sites:content', (e) => {
        const doc = e.detail && e.detail.doc;
        if (doc && doc.theme) apply(doc.theme);
        setTimeout(() => { api.init(); }, 0);
      });
      updateToggles();
    },
  };
  SITES.theme = api;

  /* ------------------------------------------------ early, flash-free mode */
  // Runs at parse time (script in <head>) so the correct theme is set before paint.
  document.documentElement.setAttribute('data-theme', resolved(read() || defaultMode));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => api.init());
  else api.init();

  /* ---------------------------------------------- admin-editable theme spec */
  const C = (path, label) => ({ path, label, type: 'color' });
  const T = (path, label) => ({ path, label, type: 'text' });
  const H = (label) => ({ type: 'heading', label });

  SITES.themeRegistry = {
    label: 'Theme',
    fields: [
      H('Mode'),
      { path: 'defaultTheme', label: 'Default mode', type: 'select', options: ['system', 'light', 'dark'] },

      H('Light palette'),
      C('colors.background', 'Background'), C('colors.surface', 'Surface'), C('colors.surface-2', 'Surface (alt)'),
      C('colors.text', 'Text'), C('colors.text-muted', 'Text (muted)'),
      C('colors.primary', 'Primary'), C('colors.primary-deep', 'Primary (deep)'),
      C('colors.accent', 'Accent'), C('colors.accent-deep', 'Accent (deep)'), C('colors.accent-deep-2', 'Accent (deepest)'),
      C('colors.plum', 'Accent 2'), C('colors.plum-deep', 'Accent 2 (deep)'),
      C('colors.on-accent', 'Text on accent'),

      H('Dark palette'),
      C('dark.background', 'Background'), C('dark.surface', 'Surface'), C('dark.surface-2', 'Surface (alt)'),
      C('dark.text', 'Text'), C('dark.text-muted', 'Text (muted)'),
      C('dark.primary', 'Primary'), C('dark.accent', 'Accent'), C('dark.accent-deep-2', 'Accent (deepest)'),

      H('Translucent surfaces'),
      C('colors.glass', 'Light · glass fill'), C('colors.glass-border', 'Light · glass border'),
      C('dark.glass', 'Dark · glass fill'), C('dark.glass-border', 'Dark · glass border'),
      C('colors.dock', 'Light · dock fill'), C('colors.dock-border', 'Light · dock border'),
      C('dark.dock', 'Dark · dock fill'), C('dark.dock-border', 'Dark · dock border'),

      H('Type & shape'),
      T('fonts.sans', 'Body font stack'), T('fonts.display', 'Display font stack'),
      T('radii.md', 'Radius (md)'), T('radii.lg', 'Radius (lg)'), T('radii.xl', 'Radius (xl)'),
    ],
  };
})();
