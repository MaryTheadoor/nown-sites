#!/usr/bin/env node
/* ==========================================================================
   seo-noindex.cjs — site.seo.noindex, in both directions

   The switch coordinates three artifacts: a robots meta on every page, no
   Sitemap: line in robots.txt, and no sitemap.xml at all. Any one of them alone
   leaves a contradiction, and each is easy to break without noticing — flip the
   flag and forget to re-run, and a stale sitemap keeps asking for a crawl of a
   site that is asking not to be crawled.

   So this asserts BOTH states, on a throwaway copy of the site, and asserts the
   restoration as carefully as the activation. A switch tested only in the ON
   position is a switch that may not turn off.

   Run: node tests/seo-noindex.cjs
   ========================================================================== */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'site/public');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sites-noindex-'));
const SITE = path.join(TMP, 'public');

let pass = 0, fail = 0;
const check = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return; }
  fail++;
  console.log('FAIL ' + label + '\n  got  ' + JSON.stringify(got) + '\n  want ' + JSON.stringify(want));
};

// A copy so the repo's own site is never mutated by a test.
fs.cpSync(SRC, SITE, { recursive: true });
const contentFile = path.join(SITE, 'content.json');

const setNoindex = (on) => {
  const d = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
  if (on) d.site.seo.noindex = true; else delete d.site.seo.noindex;
  fs.writeFileSync(contentFile, JSON.stringify(d, null, 2) + '\n');
};
const runSeo = () => execFileSync(process.execPath, [path.join(ROOT, 'tools/seo.mjs'), SITE], { encoding: 'utf8' });
const pages = () => fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));
const carriesRobotTag = (f) => /<meta[^>]*name="robots"[^>]*noindex/i.test(fs.readFileSync(path.join(SITE, f), 'utf8'));
const sitemapExists = () => fs.existsSync(path.join(SITE, 'sitemap.xml'));
const robotsAdvertises = () => /^\s*Sitemap:\s*\S+/im.test(fs.readFileSync(path.join(SITE, 'robots.txt'), 'utf8'));

try {
  /* ---- OFF: the launch state ---- */
  setNoindex(false);
  runSeo();
  check('off: sitemap.xml exists', sitemapExists(), true);
  check('off: robots advertises it', robotsAdvertises(), true);
  const offTagged = pages().filter(carriesRobotTag);
  check('off: only the hand-written pages are noindex', offTagged.sort(), ['admin.html', 'builder.html']);

  /* ---- ON: the pre-launch state ---- */
  setNoindex(true);
  runSeo();
  check('on: sitemap.xml is gone', sitemapExists(), false);
  check('on: robots advertises nothing', robotsAdvertises(), false);
  check('on: every page carries the tag', pages().filter(carriesRobotTag).length, pages().length);
  check('on: robots.txt stays crawlable (not Disallow)', /^\s*User-agent:\s*\*/im.test(fs.readFileSync(path.join(SITE, 'robots.txt'), 'utf8')) && !/^\s*Disallow:\s*\/\s*$/im.test(fs.readFileSync(path.join(SITE, 'robots.txt'), 'utf8')), true);

  /* ---- idempotent in the ON state ---- */
  const before = fs.readFileSync(path.join(SITE, 'robots.txt'), 'utf8');
  const htmlBefore = pages().map((f) => fs.readFileSync(path.join(SITE, f), 'utf8')).join('');
  runSeo();
  check('on: a second run changes nothing', fs.readFileSync(path.join(SITE, 'robots.txt'), 'utf8') === before
    && pages().map((f) => fs.readFileSync(path.join(SITE, f), 'utf8')).join('') === htmlBefore, true);

  /* ---- a page that hand-writes its own tag is not doubled ---- */
  const admin = fs.readFileSync(path.join(SITE, 'admin.html'), 'utf8');
  check('on: admin.html has exactly one robots tag', (admin.match(/<meta[^>]*name="robots"/g) || []).length, 1);

  /* ---- OFF again: everything comes back ---- */
  setNoindex(false);
  runSeo();
  check('restored: sitemap.xml is back', sitemapExists(), true);
  check('restored: robots advertises it', robotsAdvertises(), true);
  check('restored: only the hand-written pages are noindex', pages().filter(carriesRobotTag).sort(), ['admin.html', 'builder.html']);

  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
