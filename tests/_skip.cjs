/* ==========================================================================
   _skip.cjs — "this test did not run" is NOT "this test passed"

   Nine of the eleven suites need playwright. When it was missing they printed
   SKIPPED and called process.exit(0), so a loop like

       for t in tests/*.cjs; do node "$t"; done

   reported "2 pass, 0 fail" and read as green — while the entire builder surface
   and both round-trip tests had not executed at all. The MacBook harness hit this
   first; the fix is shared so the two machines cannot drift apart on it again.

   A suite that cannot run exits NON-ZERO, because "could not run" and "passed" are
   not the same claim and only one of them is safe to assume. The banner is printed
   last so it still lands in `| tail -1`.
   ========================================================================== */
'use strict';

const SKIP_EXIT = 1;

function skip(reason, hint) {
  console.log('');
  console.log('  ============================================================');
  console.log('  SKIPPED: ' + reason);
  console.log('  THIS TEST DID NOT RUN. It is NOT a pass.');
  if (hint) console.log('  ' + hint);
  console.log('  ============================================================');
  console.log('');
  process.exit(SKIP_EXIT);
}

module.exports = { skip, SKIP_EXIT };
