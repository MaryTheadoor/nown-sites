#!/usr/bin/env node
/* ==========================================================================
   make-blueprint.cjs — assemble pawn-shop.blueprint.md from its parts

   The compact-keyword pages in this recipe are generated, not hand-written:

     business.json ──compact-keywords.mjs──▶ _keywords.blueprint.md
                                                    │
     blueprint.head.md ──────────┬───────────────────┴──▶ pawn-shop.blueprint.md
     blueprint.tail.md ──────────┘

   Re-run this after editing business.json or the generator:

     node make-blueprint.cjs && node ../../tools/blueprint.mjs pawn-shop.blueprint.md --out content.json
   ========================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../..');

const read = (f) => fs.readFileSync(path.join(HERE, f), 'utf8');

// 1. Regenerate the keyword fragment from the brief.
execFileSync(process.execPath, [
  path.join(ROOT, 'tools/compact-keywords.mjs'),
  path.join(HERE, 'business.json'),
  '--out', path.join(HERE, '_keywords.blueprint.md'),
], { stdio: 'inherit' });

// 2. Assemble. The fragment is the middle: hub index tile + one page per keyword.
const parts = [
  read('blueprint.head.md').replace(/\s*$/, ''),
  read('_keywords.blueprint.md').replace(/\s*$/, ''),
  read('blueprint.tail.md').replace(/\s*$/, ''),
];
fs.writeFileSync(path.join(HERE, 'pawn-shop.blueprint.md'), parts.join('\n\n') + '\n', 'utf8');

const pageCount = (parts[1].match(/^## Page:/gm) || []).length;
console.log('assembled pawn-shop.blueprint.md — ' + pageCount + ' generated keyword page(s)');
