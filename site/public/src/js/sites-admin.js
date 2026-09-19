/* ==========================================================================
   sites-admin.js — S.I.T.E.S admin dashboard
   Generates an editing UI purely from the tile registry (predefined fields),
   edits the backend copy file in memory, and saves it via a storage adapter.
   No hand-built forms per tile.
   ========================================================================== */
(function () {
  'use strict';
  const SITES = (window.SITES = window.SITES || {});
  const el = (tag, attrs = {}, children = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => c && n.appendChild(c));
    return n;
  };

  const labelOf = (type) => (SITES.tileRegistry[type] && SITES.tileRegistry[type].label) || type;

  /* ---------- field widgets (driven by the registry field `type`) ---------- */
  function widget(field, value, onChange) {
    if (field.type === 'heading') return el('h3', { class: 'adm-group', text: field.label });
    const wrap = el('label', { class: 'adm-field' });
    wrap.appendChild(el('span', { class: 'adm-label', text: field.label || field.key }));

    const set = (v) => onChange(field.key, v);

    switch (field.type) {
      case 'textarea': {
        const t = el('textarea', { rows: '4' }); t.value = value || '';
        t.addEventListener('input', () => set(t.value)); wrap.appendChild(t); break;
      }
      case 'select': {
        const s = el('select');
        (field.options || []).forEach((o) => s.appendChild(el('option', { value: o, text: o })));
        s.value = value || (field.options || [])[0] || '';
        s.addEventListener('change', () => set(s.value)); wrap.appendChild(s); break;
      }
      case 'url': {
        const i = el('input', { type: 'url', placeholder: 'https://…' }); i.value = value || '';
        i.addEventListener('input', () => set(i.value)); wrap.appendChild(i); break;
      }
      case 'color': {
        const row = el('div', { class: 'adm-subrow' });
        const swatch = el('input', { type: 'color' });
        swatch.value = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000';
        const hex = el('input', { type: 'text', placeholder: '#RRGGBB' });
        hex.value = value || '';
        swatch.addEventListener('input', () => { hex.value = swatch.value; set(swatch.value); });
        hex.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) swatch.value = hex.value; set(hex.value); });
        row.append(swatch, hex); wrap.appendChild(row); break;
      }
      case 'image': {
        // Each row must build on the last value the widget produced, not on the
        // value captured at render time — otherwise editing src and then alt
        // (the natural order) silently drops src, and vice versa.
        let obj = value || {};
        const put = (patch) => { obj = { ...obj, ...patch }; set(obj); };
        wrap.appendChild(rowOf([
          ['src', 'Image URL', obj.src || '', (v) => put({ src: v })],
          ['alt', 'Alt text', obj.alt || '', (v) => put({ alt: v })],
        ]));
        if (SITES.assets && SITES.assets.renderField) wrap.appendChild(SITES.assets.renderField((url) => put({ src: url })));
        break;
      }
      case 'items':
      case 'actions': {
        const list = Array.isArray(value) ? value : [];
        const group = el('div', { class: 'adm-rows' });
        const redraw = () => {
          group.innerHTML = '';
          list.forEach((item, idx) => {
            const r = el('div', { class: 'adm-row' });
            (field.itemFields || []).forEach((sub) => {
              const holder = el('label', { class: 'adm-sub' });
              holder.appendChild(el('span', { text: sub.label || sub.key }));
              const inp = el(sub.type === 'textarea' ? 'textarea' : 'input', sub.type === 'textarea' ? { rows: '2' } : { type: sub.type || 'text' });
              if (sub.type === 'textarea') inp.value = item[sub.key] || ''; else inp.value = item[sub.key] || '';
              inp.addEventListener('input', () => { item[sub.key] = inp.value; set(list); });
              holder.appendChild(inp); r.appendChild(holder);
            });
            const del = el('button', { type: 'button', class: 'adm-del', text: '✕', title: 'Remove' });
            del.addEventListener('click', () => { list.splice(idx, 1); set(list); redraw(); });
            r.appendChild(del);
            group.appendChild(r);
          });
          // add-row
          const add = el('button', { type: 'button', class: 'adm-add', text: '+ Add' });
          add.addEventListener('click', () => {
            const blank = {}; (field.itemFields || []).forEach((s) => (blank[s.key] = ''));
            list.push(blank); set(list); redraw();
          });
          // reorder
          group.appendChild(add);
        };
        redraw();
        wrap.appendChild(group);
        break;
      }
      default: {
        const i = el('input', { type: 'text' }); i.value = value || '';
        i.addEventListener('input', () => set(i.value)); wrap.appendChild(i);
      }
    }
    return wrap;
  }

  function rowOf(pairs) {
    const r = el('div', { class: 'adm-subrow' });
    pairs.forEach(([key, label, val, cb]) => {
      const l = el('label', { class: 'adm-sub' }, [el('span', { text: label })]);
      const i = el('input', { type: 'text' }); i.value = val || '';
      i.addEventListener('input', () => cb(i.value));
      l.appendChild(i); r.appendChild(l);
    });
    return r;
  }

  /* ---------- the dashboard ---------- */
  function mount(opts) {
    const { root, adapter, content } = opts;
    const state = { doc: content, index: 0, dirty: false, adapter };

    root.innerHTML = '';
    const sidebar = el('aside', { class: 'adm-side' });
    const editor = el('section', { class: 'adm-editor' });
    const bar = el('div', { class: 'adm-bar' });
    const status = el('span', { class: 'adm-status', 'aria-live': 'polite' });
    const saveBtn = el('button', { class: 'btn btn-tactile btn-gold-tactile', type: 'button', text: 'Save copy file' });
    bar.append(saveBtn, status);

    root.append(el('div', { class: 'adm-grid' }, [sidebar, editor]), bar);

    const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
    function setPath(obj, path, val) {
      const ks = path.split('.'); let o = obj;
      for (let i = 0; i < ks.length - 1; i++) { if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {}; o = o[ks[i]]; }
      o[ks[ks.length - 1]] = val;
    }

    function renderList() {
      sidebar.innerHTML = '';
      // Sitewide theme (edited exactly like copy).
      const t = el('button', { type: 'button', class: 'adm-item' + (state.index === -1 ? ' active' : '') });
      t.append(el('strong', { text: (SITES.themeRegistry && SITES.themeRegistry.label) || 'Theme' }), el('small', { text: 'sitewide tokens' }));
      t.addEventListener('click', () => { state.index = -1; renderList(); renderEditor(); });
      sidebar.appendChild(t);

      sidebar.appendChild(el('h3', { text: 'Sections' }));
      (state.doc.content || []).forEach((entry, i) => {
        const b = el('button', { type: 'button', class: 'adm-item' + (i === state.index ? ' active' : '') });
        b.append(el('strong', { text: labelOf(entry.type) }), el('small', { text: entry.id || ('#' + i) }));
        b.addEventListener('click', () => { state.index = i; renderList(); renderEditor(); });
        sidebar.appendChild(b);
      });
    }

    function renderThemeEditor() {
      editor.innerHTML = '';
      state.doc.theme = state.doc.theme || {};
      const reg = SITES.themeRegistry || { fields: [] };
      editor.appendChild(el('h2', { text: reg.label || 'Theme' }));
      editor.appendChild(el('p', { class: 'adm-hint', text: 'Sitewide theme tokens — light + dark palettes, fonts and radii. Saving re-themes every page.' }));
      reg.fields.forEach((f) => {
        if (f.type === 'heading') { editor.appendChild(widget(f, undefined, () => {})); return; }
        editor.appendChild(widget(
          { key: f.path, label: f.label, type: f.type, options: f.options },
          getPath(state.doc.theme, f.path),
          (_key, value) => {
            setPath(state.doc.theme, f.path, value);
            state.dirty = true; status.textContent = 'Unsaved changes';
            if (SITES.theme) SITES.theme.apply(state.doc.theme); // live preview
          }
        ));
      });
    }

    function renderEditor() {
      editor.innerHTML = '';
      if (state.index === -1) return renderThemeEditor();
      const entry = state.doc.content[state.index];
      if (!entry) return;
      editor.appendChild(el('h2', { text: labelOf(entry.type) }));
      editor.appendChild(el('p', { class: 'adm-hint', text: 'Tile type: ' + entry.type + ' · id: ' + (entry.id || '—') }));
      entry.config = entry.config || {};
      const fields = SITES.fieldsFor(entry.type);
      if (!fields.length) editor.appendChild(el('p', { class: 'adm-hint', text: 'No editable fields registered for this tile type.' }));
      fields.forEach((f) => {
        editor.appendChild(widget(f, entry.config[f.key], (key, value) => {
          entry.config[key] = value; state.dirty = true; status.textContent = 'Unsaved changes';
        }));
      });
    }

    saveBtn.addEventListener('click', async () => {
      status.textContent = 'Saving…';
      try {
        const res = await state.adapter.save('nowndigital', state.doc);
        state.dirty = false;
        status.textContent = 'Saved (' + (res.revision || 'ok') + ')' + (res.note ? ' — ' + res.note : '');
      } catch (err) { status.textContent = 'Save failed: ' + err.message; }
    });

    renderList(); renderEditor();
    return state;
  }

  SITES.admin = { mount, widget };
})();
