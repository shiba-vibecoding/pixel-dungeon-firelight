#!/bin/sh
# Serves the mock with the paths the game's CSS expects (/assets, /fonts, /css) from a temporary root, on 127.0.0.1:8793.
set -e
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../../../../.." && pwd); ROOT=$(mktemp -d)
ln -s "$REPO/packages/client/public/assets" "$ROOT/assets"; ln -s "$REPO/packages/client/public/fonts" "$ROOT/fonts"
mkdir "$ROOT/css"; ln -s "$REPO/packages/client/src/ui.css" "$ROOT/css/ui.css"; ln -s "$REPO/packages/client/src/game.css" "$ROOT/css/game.css"
ln -s "$REPO/packages/client/src/fl-mart.css" "$ROOT/fl-mart.css"; ln -s "$REPO/packages/client/src/fl-compete.css" "$ROOT/fl-compete.css"
for f in compete.html compete.js herocard.js; do ln -s "$HERE/$f" "$ROOT/$f"; done
cd "$ROOT" && exec python3 -m http.server 8793 --bind 127.0.0.1
