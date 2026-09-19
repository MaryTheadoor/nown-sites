const fs = require('node:fs');
const path = require('node:path');

const here = __dirname;
const src = fs.readFileSync(path.join(here, '../src/modules/local/visit.js'), 'utf8');
const listeners = {};
const doc = { addEventListener: (k, fn) => { (listeners[k] = listeners[k] || []).push(fn); }, querySelector: () => null, querySelectorAll: () => [] };
const win = { document: doc, addEventListener: doc.addEventListener, MutationObserver: undefined, SITES: { register: () => {} } };
const fn = new Function('window', 'document', src);
fn(win, doc);
const H = (win.SITES || {}).visitHours;
if (!H) { console.log('FAIL: SITES.visitHours not exposed'); process.exit(1); }

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.log('FAIL ' + label + '\n  got  ' + g + '\n  want ' + w); }
};

// --- parseRule ---
eq('Mo-Fr rule', H.parseRule('Mo-Fr 09:00-19:00'), { days: [1,2,3,4,5], open: 540, close: 1140 });
eq('single day', H.parseRule('Sa 10:00-18:00'), { days: [6], open: 600, close: 1080 });
eq('wrap Sun', H.parseRule('Fr-Mo 08:00-20:00'), { days: [5,6,0,1], open: 480, close: 1200 });
eq('all week', H.parseRule('Mo-Su 00:00-23:59'), { days: [1,2,3,4,5,6,0], open: 0, close: 1439 });
eq('garbage rejected', H.parseRule('by appointment'), null);
eq('empty rejected', H.parseRule(''), null);

// --- describe ---
const week = [H.parseRule('Mo-Fr 09:00-17:00'), H.parseRule('Sa 10:00-14:00')];
const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi);
// 2026-09-16 is a Wednesday
eq('open midday Wed', H.describe(week, at(2026, 8, 16, 12, 0)), { open: true, text: 'Open now — until 5pm' });
eq('before open Wed', H.describe(week, at(2026, 8, 16, 7, 30)), { open: false, text: 'Closed — opens 9am' });
eq('after close Wed', H.describe(week, at(2026, 8, 16, 18, 0)), { open: false, text: 'Closed — opens tomorrow 9am' });
eq('open Sat', H.describe(week, at(2026, 8, 19, 11, 0)), { open: true, text: 'Open now — until 2pm' });
// Sunday closed; the next open day is Monday, which IS tomorrow.
eq('closed Sun', H.describe(week, at(2026, 8, 20, 12, 0)), { open: false, text: 'Closed — opens tomorrow 9am' });
eq('no hours', H.describe([], at(2026, 8, 16, 12, 0)), null);
eq('sat closed late', H.describe(week, at(2026, 8, 19, 15, 0)), { open: false, text: 'Closed — opens Monday 9am' });

// --- the pawn-shop recipe's real hours ---
const pawn = ['Mo-Fr 09:00-19:00','Sa 10:00-18:00','Su 12:00-17:00'].map(H.parseRule);
eq('pawn parses', pawn.filter(Boolean).length, 3);
eq('pawn open Sun noon', H.describe(pawn, at(2026, 8, 20, 12, 30)), { open: true, text: 'Open now — until 5pm' });
eq('pawn closed Sun 11', H.describe(pawn, at(2026, 8, 20, 11, 0)), { open: false, text: 'Closed — opens 12pm' });

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);