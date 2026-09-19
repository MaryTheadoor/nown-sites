#!/usr/bin/env node
/* ==========================================================================
   run-all.cjs — run every suite and report honestly

   The reason this exists: a loop printing "2 pass, 0 fail" while nine suites
   silently skipped. Counting exit codes per suite fixes it, because a skip is
   now non-zero (tests/_skip.cjs) and this counts it as its own outcome rather
   than folding it into "pass".

   Run: node tests/run-all.cjs
   Exit: 0 only when every suite ran and passed.
   ========================================================================== */
'use strict';
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const HERE = __dirname;
const files = readdirSync(HERE)
  .filter((f) => f.endsWith('.cjs') && f !== '_skip.cjs' && f !== 'run-all.cjs')
  .sort();

// Forward --playwright <dir> to every suite. Without this the runner silently ignored
// it and used each suite's default, so "run everything against that directory" was
// impossible to express — and the run looked identical either way.
const pwIdx = process.argv.indexOf('--playwright');
const passThrough = pwIdx >= 0 && process.argv[pwIdx + 1] ? ['--playwright', process.argv[pwIdx + 1]] : [];

const results = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [join(HERE, f), ...passThrough], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const skipped = /SKIPPED:/.test(out);
  const tally = out.match(/(\d+) passed, (\d+) failed/);
  results.push({ file: f, code: r.status, skipped, tally: tally ? tally[0] : null, output: out });
}

const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
console.log('');
console.log('  ' + pad('suite', 26) + pad('result', 12) + 'detail');
console.log('  ' + '-'.repeat(62));
for (const r of results) {
  const verdict = r.skipped ? 'DID NOT RUN' : r.code === 0 ? 'pass' : 'FAIL';
  const detail = r.tally || (r.skipped ? 'dependency missing' : 'exit ' + r.code);
  console.log('  ' + pad(r.file, 26) + pad(verdict, 12) + detail);
}

// Print the OUTPUT of anything that did not pass. A red suite whose reason is not in
// the log is nearly as useless as a green one that never ran — the first run of this
// runner reported "1 failed" and nothing else, and the cause is now unrecoverable.
const bad = results.filter((r) => r.code !== 0 || r.skipped);
if (bad.length) {
  console.log('');
  console.log('  ---- output of everything that did not pass ----');
  for (const r of bad) {
    console.log('');
    console.log('  ### ' + r.file + '  (exit ' + r.code + (r.skipped ? ', skipped' : '') + ')');
    const lines = (r.output || '').split('\n').filter((l) => l.trim());
    const show = lines.length > 40 ? lines.slice(-40) : lines;
    for (const l of show) console.log('  | ' + l);
    if (lines.length > show.length) console.log('  | ...(' + (lines.length - show.length) + ' earlier lines)');
  }
}

const ran = results.filter((r) => !r.skipped);
const failed = ran.filter((r) => r.code !== 0);
const skipped = results.filter((r) => r.skipped);
console.log('');
console.log('  ' + results.length + ' suite(s): ' + (ran.length - failed.length) + ' passed, '
  + failed.length + ' failed, ' + skipped.length + ' did not run');
if (skipped.length) {
  console.log('');
  console.log('  A suite that did not run is NOT a pass. Install its dependency or point');
  console.log('  --playwright at a directory containing it, then run this again.');
}
process.exit(failed.length || skipped.length ? 1 : 0);
