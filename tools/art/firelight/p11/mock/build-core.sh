#!/bin/sh
# core.js for the mock: the repository's core and the client's texts (with growth.ts), bundled for the browser.
set -e
cd "$(dirname "$0")"
ROOT=$(cd ../../../../.. && pwd)
"$ROOT/node_modules/.bin/esbuild" core-entry.ts --bundle --format=esm --outfile=core.js --loader:.css=empty \
  --alias:@pd/core="$ROOT/packages/core/src/index.ts" --log-level=warning
