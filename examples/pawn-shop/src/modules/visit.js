// visit.js — when the content file carries machine-readable opening hours
// (site.business.openingHours, the same list tools/seo.mjs turns into JSON-LD),
// say whether the place is open right now.
//
// A pure enhancement: the hours list is already on the page and reads fine
// without this file. The state line stays hidden unless hours are known and the
// clock is readable, so a missing content file leaves the page correct rather
// than wrong.
(function () {
  'use strict';
  const SITES = (window.SITES = window.SITES || {});

  const DAY_INDEX = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  /** "Mo-Fr 09:00-19:00" -> { days: [1,2,3,4,5], open: 540, close: 1140 }, or null. */
  function parseRule(rule) {
    const re = new RegExp("^([A-Za-z]{2})(?:\\s*-\\s*([A-Za-z]{2}))?\\s+(\\d{1,2}):(\\d{2})\\s*-\\s*(\\d{1,2}):(\\d{2})$");
    const m = String(rule).trim().match(re);
    if (!m) return null;
    const key = (s) => s.charAt(0).toUpperCase() + s.charAt(1).toLowerCase();
    const from = DAY_INDEX[key(m[1])];
    const to = m[2] ? DAY_INDEX[key(m[2])] : from;
    if (from === undefined || to === undefined) return null;
    const days = [];
    let d = from;
    // Walk forward through the week, so a range crossing Sunday still works.
    for (let i = 0; i < 7; i++) {
      days.push(d);
      if (d === to) break;
      d = (d + 1) % 7;
    }
    return { days: days, open: Number(m[3]) * 60 + Number(m[4]), close: Number(m[5]) * 60 + Number(m[6]) };
  }

  function clock(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const suffix = h >= 12 ? "pm" : "am";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + (m ? ":" + String(m).padStart(2, "0") : "") + suffix;
  }

  /** Human phrasing for the state line, or null when nothing applies. */
  function describe(rules, now) {
    const today = now.getDay();
    const mins = now.getHours() * 60 + now.getMinutes();
    const todays = rules.filter((r) => r.days.indexOf(today) !== -1).sort((a, b) => a.open - b.open);

    for (let i = 0; i < todays.length; i++) {
      const r = todays[i];
      if (mins >= r.open && mins < r.close) return { open: true, text: "Open now — until " + clock(r.close) };
    }
    const upcoming = todays.filter((r) => r.open > mins)[0];
    if (upcoming) return { open: false, text: "Closed — opens " + clock(upcoming.open) };

    for (let step = 1; step <= 7; step++) {
      const day = (today + step) % 7;
      const next = rules.filter((r) => r.days.indexOf(day) !== -1).sort((a, b) => a.open - b.open)[0];
      if (next) {
        const label = step === 1 ? "tomorrow" : DAY_NAMES[day];
        return { open: false, text: "Closed — opens " + label + " " + clock(next.open) };
      }
    }
    return null;
  }

  /** Derive a directions URL from an address, for a tile with no explicit link. */
  function directionsFor(tile) {
    const link = tile.querySelector("[data-role=\"action\"]");
    if (!link || link.getAttribute("href")) return;
    const addr = tile.querySelector("[data-role=\"address\"]");
    const text = addr ? addr.textContent.trim() : "";
    if (text) link.setAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(text));
  }

  function refresh(tile, doc) {
    const el = tile.querySelector("[data-role=\"openState\"]");
    if (!el) return;
    const business = doc && doc.site && doc.site.business;
    const hours = business && Array.isArray(business.openingHours) ? business.openingHours : [];
    const rules = hours.map(parseRule).filter(Boolean);
    if (!rules.length) { el.hidden = true; return; }
    const state = describe(rules, new Date());
    if (!state) { el.hidden = true; return; }
    el.textContent = state.text;
    el.setAttribute("data-open", state.open ? "true" : "false");
    el.hidden = false;
  }

  function init(tile) {
    directionsFor(tile);
    // The binder announces the content document once it has loaded and bound;
    // booting earlier than that would read an empty clock.
    if (SITES.contentDoc) refresh(tile, SITES.contentDoc);
    document.addEventListener("sites:content", (e) => refresh(tile, e.detail && e.detail.doc));
  }

  // Exposed for testing: the day/time maths is the part worth pinning down, and
  // a browser is a slow place to discover it is wrong.
  SITES.visitHours = { parseRule: parseRule, describe: describe };

  SITES.register('visit', { init: init });
})();