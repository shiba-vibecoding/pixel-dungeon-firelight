#!/bin/sh
# Serves the rules sheet (rules.html) with the repository's assets and fonts on 127.0.0.1:8795.
set -e
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../../../../.." && pwd); ROOT=$(mktemp -d)
ln -s "$REPO/packages/client/public/assets" "$ROOT/assets"; ln -s "$REPO/packages/client/public/fonts" "$ROOT/fonts"
for f in rules.html rules.js; do ln -s "$HERE/$f" "$ROOT/$f"; done
cd "$ROOT" && exec python3 -m http.server 8795 --bind 127.0.0.1
