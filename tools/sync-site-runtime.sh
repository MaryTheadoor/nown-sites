#!/usr/bin/env bash
# sync-site-runtime.sh — copy the framework runtime into the framework's own site.
#
# The site lives in this repo (self-referential), but a deployed static root must
# contain its own copy of the runtime. There is no build step — this is a plain
# file copy, run whenever src/ changes.
#
# Snippets are published too: builder.html fetches src/modules/<type>.html at
# runtime to compose its preview, so the markup stays single-sourced in src/modules/
# instead of being duplicated as template strings in JS.
#
# Usage: tools/sync-site-runtime.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/site/public/src"

mkdir -p "$DEST/css" "$DEST/js" "$DEST/modules"

# core CSS + JS
cp "$ROOT/src/css/nown-plate.css" "$ROOT/src/css/nown-tiles.css" "$DEST/css/"
cp "$ROOT/src/js/sites.js" \
   "$ROOT/src/js/tile-registry.js" \
   "$ROOT/src/js/sites-content.js" \
   "$ROOT/src/js/sites-theme.js" \
   "$ROOT/src/js/sites-assets.js" \
   "$ROOT/src/js/sites-adapters.js" \
   "$ROOT/src/js/sites-admin.js" \
   "$ROOT/src/js/sites-builder.js" \
   "$ROOT/src/js/sites-auth.js" \
   "$ROOT/src/js/sites-payments.js" \
   "$DEST/js/"

# tile behaviour modules (video, product, faq, map, event, search, nav-dock)
find "$ROOT/src/modules" -name '*.js' -exec cp {} "$DEST/modules/" \;

# tile markup snippets — flattened, because a snippet's basename IS its tile type
# (src/modules/<category>/<type>.html) and the builder fetches <type>.html.
dupes="$(find "$ROOT/src/modules" -name '*.html' -exec basename {} \; | sort | uniq -d)"
if [ -n "$dupes" ]; then
  echo "sync-site-runtime: duplicate snippet basenames would overwrite each other:" >&2
  echo "$dupes" >&2
  exit 1
fi
find "$ROOT/src/modules" -name '*.html' -exec cp {} "$DEST/modules/" \;

echo "Synced runtime -> site/public/src/"
echo "  css:     $(ls -1 "$DEST/css" | wc -l | tr -d ' ') files"
echo "  js:      $(ls -1 "$DEST/js" | wc -l | tr -d ' ') files"
echo "  modules: $(ls -1 "$DEST/modules" | wc -l | tr -d ' ') files (js + html snippets)"
