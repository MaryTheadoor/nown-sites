#!/usr/bin/env node
/* ==========================================================================
   builder-roundtrip.cjs — the builder's central claim, checked

   sites-builder.js asserts that the blueprint.md it exports compiles back to
   exactly the content.json it exports. That is a strong claim about two
   hand-written mirrors of tools/blueprint.mjs's YAML subset, and it had already
   gone stale once: after the compiler started preserving blank lines inside block
   scalars, the builder still stripped them, so a multi-paragraph body typed in the
   builder lost its paragraph breaks.

   So: build a state with deliberately awkward copy, emit both artifacts, run the
   REAL compiler on the blueprint, and diff the result against the content doc.

   Usage: node tests/builder-roundtrip.cjs
   ========================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

/* ------------------------------------------------------------- browser stubs */
const doc = { addEventListener: () => {}, createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, style: {} }), querySelector: () => null, querySelectorAll: () => [] };
const win = { document: doc, addEventListener: () => {}, MutationObserver: undefined, SITES: {} };
const load = (rel) => new Function('window', 'document', fs.readFileSync(path.join(ROOT, rel), 'utf8'))(win, doc);

load('src/js/tile-registry.js');
load('src/js/sites-builder.js');

const { buildBlueprint, buildContentDoc } = win.SITES.builder.artifacts;

/* ------------------------------------------------------------------ fixture */
// Copy chosen to stress the YAML subset: paragraph breaks, a colon, a leading
// quote, a bare number, a '#' line, and a value that looks like a boolean.
const state = {
  site: {
    name: 'Roundtrip Test',
    baseUrl: 'https://example.com',
    description: 'Deliberately awkward copy.',
    // Fields the builder edits only indirectly, or not at all. The export is a
    // PROJECTION of state, so anything the projection forgets is silently dropped:
    // site.layout was written by the grid-mode control and lost on export until
    // these were in the fixture.
    lang: 'en',
    layout: { mode: 'cols' },
    plate: { mode: 'color', color: '#123456' },
    seo: { title: 'Roundtrip — the awkward one', description: 'A description with a colon: see.' },
    business: { type: 'PawnShop', telephone: '+1-512-555-0199', openingHours: ['Mo-Fr 09:00-19:00'] },
  },
  page: { name: 'Home', path: '/' },
  theme: {
    defaultTheme: 'system',
    colors: { background: '#F7F8FA', primary: '#1B3A5C' },
    dark: { background: '#0B0F17' },
    fonts: { sans: 'system-ui, sans-serif' },
    radii: { md: '0.75rem' },
  },
  integrations: { auth: 'none', payments: 'none', forms: 'formspree', search: 'none', analytics: 'none', ai: 'none' },
  nav: [{ label: 'Home', href: '/' }, { label: 'Contact', href: '/contact.html' }],
  tiles: [
    {
      id: 'home-hero',
      type: 'hero',
      description: 'Opening band.',
      config: {
        headline: 'Cash for tools: same day',
        body: [
          'First paragraph. It has a colon: and that is fine.',
          '',
          'Second paragraph, after a blank line.',
          '',
          'Third paragraph, so the run is unambiguous.',
        ].join('\n'),
        actions: [{ label: 'Get a quote', href: '/contact.html', style: 'gold' }],
      },
    },
    {
      id: 'home-faq',
      type: 'faq',
      description: 'Questions.',
      config: {
        title: 'Questions',
        items: [
          { question: 'Do you take walk-ins?', answer: 'Yes — no appointment needed.' },
          { question: 'What about a value that looks boolean?', answer: 'yes' },
          { question: 'A number?', answer: '42' },
        ],
      },
    },
    { id: 'home-visit', type: 'visit', description: 'Where and when.', layout: { span: 7, spanSm: 6 }, variant: 'wide',
      css: 'padding: var(--space-12);\nborder-radius: var(--radius-xl);', config: {
      headline: 'Visit us', address: '1200 E 6th St, Austin, TX 78702',
      hoursTitle: 'Opening hours',
      hours: 'Mon–Fri 9:00–19:00\nSat 10:00–18:00\nSun 12:00–17:00',
      actions: [{ label: 'Get directions', href: 'https://maps.google.com/?q=1', style: 'gold' }],
    } },
  ],
};

/* --------------------------------------------------------------- the check */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-roundtrip-'));
const bpPath = path.join(tmp, 'builder.blueprint.md');
const outPath = path.join(tmp, 'compiled.json');
fs.writeFileSync(bpPath, buildBlueprint(state), 'utf8');

let compiled;
try {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/blueprint.mjs'), bpPath, '--out', outPath, '--quiet'], { stdio: 'pipe' });
  compiled = JSON.parse(fs.readFileSync(outPath, 'utf8'));
} catch (err) {
  console.log('FAIL: the exported blueprint did not compile');
  console.log(String(err.stderr || err.message));
  console.log('--- blueprint ---');
  console.log(fs.readFileSync(bpPath, 'utf8'));
  process.exit(1);
}

const claimed = buildContentDoc(state);

/* Compare the parts the compiler owns. It adds $schema and normalizes nav, so
   compare site / theme / nav / integrations / content rather than raw bytes. */
let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got, null, 2), w = JSON.stringify(want, null, 2);
  if (g === w) { pass++; return; }
  fail++;
  console.log('FAIL ' + label);
  const gl = g.split('\n'), wl = w.split('\n');
  for (let i = 0; i < Math.max(gl.length, wl.length); i++) {
    if (gl[i] !== wl[i]) {
      console.log('  first difference at line ' + (i + 1));
      console.log('  builder content: ' + JSON.stringify(gl[i]));
      console.log('  compiled:        ' + JSON.stringify(wl[i]));
      break;
    }
  }
};

eq('content entries', compiled.content, claimed.content);

// Entry-level placement, asserted by name rather than only inside the whole-array
// comparison, so a failure says which field went missing.
// These assert the VALUE the fixture set, NOT that the two sides agree.
//
// Comparing builder-output against compiler-output passes when both are equally
// absent, and that is exactly what happened: buildContentDoc never emitted
// entry-level layout or variant for two phases, and these assertions stayed green
// because neither side had them. agreement is the weaker claim; only the expected
// value catches a key that both sides drop.
const cv = compiled.content.filter((e) => e.id === 'home-visit')[0];
const cl = claimed.content.filter((e) => e.id === 'home-visit')[0];
eq('layout survives the projection', cv && cv.layout, { span: 7, spanSm: 6 });
eq('layout reaches the compiler', cl && cl.layout, { span: 7, spanSm: 6 });
eq('variant survives the projection', cv && cv.variant, 'wide');
eq('variant reaches the compiler', cl && cl.variant, 'wide');
eq('tile css survives the projection', cv && cv.css, 'padding: var(--space-12);\nborder-radius: var(--radius-xl);');
eq('tile css reaches the compiler', cl && cl.css, 'padding: var(--space-12);\nborder-radius: var(--radius-xl);');
eq('tile css lands on the entry, not in config', cl && cl.config && cl.config.css, undefined);
eq('site.layout survives the projection', compiled.site.layout, { mode: 'cols' });
eq('site.plate survives the projection', compiled.site.plate, { mode: 'color', color: '#123456' });
eq('site.lang survives the projection', compiled.site.lang, 'en');
eq('site.business survives the projection', compiled.site.business, { type: 'PawnShop', telephone: '+1-512-555-0199', openingHours: ['Mo-Fr 09:00-19:00'] });
eq('site.seo survives the projection', compiled.site.seo, { title: 'Roundtrip — the awkward one', description: 'A description with a colon: see.' });
eq('site block', compiled.site, claimed.site);
eq('theme block', compiled.theme, claimed.theme);
eq('nav', compiled.nav, claimed.nav);
eq('integrations', compiled.integrations, claimed.integrations);

// The specific regression: paragraph breaks must survive the round trip.
const hero = compiled.content.filter((e) => e.type === 'hero')[0];
const paras = hero.config.body.split(/\n\s*\n/).filter(Boolean);
if (paras.length === 3) { pass++; } else { fail++; console.log('FAIL paragraph count: got ' + paras.length + ', want 3'); }

// And the awkward scalars must come back as strings, not coerced.
const faq = compiled.content.filter((e) => e.type === 'faq')[0];
eq('boolean-looking answer stays a string', faq.config.items[1].answer, 'yes');
eq('number-looking answer stays a string', faq.config.items[2].answer, '42');

// The compiler warns on unknown fields/types; a clean run exits 0.
const check = execFileSync(process.execPath, [path.join(ROOT, 'tools/blueprint.mjs'), bpPath, '--stdout', '--quiet'], { stdio: 'pipe' });
if (check.length > 0) pass++; else { fail++; console.log('FAIL: compiler produced no output'); }

fs.rmSync(tmp, { recursive: true, force: true });
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
