#!/bin/sh
# Serves the doors' rules sheet (sheet.html) with the repository's assets, fonts and the 3D frames on 127.0.0.1:8799.
set -e
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../../../../.." && pwd); ROOT=$(mktemp -d)
ln -s "$REPO/packages/client/public/assets" "$ROOT/assets"; ln -s "$REPO/packages/client/public/fonts" "$ROOT/fonts"
ln -s "$REPO/docs/design/previews/firelight/doors/vignettes" "$ROOT/vig"; ln -s "$REPO/docs/design/previews/firelight/doors/rooms" "$ROOT/rooms"
for f in sheet.html sheet.js; do ln -s "$HERE/$f" "$ROOT/$f"; done
cd "$ROOT" && exec python3 -m http.server 8799 --bind 127.0.0.1
