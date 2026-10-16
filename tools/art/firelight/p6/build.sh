#!/bin/sh
# Firelight · part 6: the effect sheets, the GIF previews and fx.json. PD_ASSETS = the client's public/assets, P6_OUT = where fx/ goes.
set -e
cd "$(dirname "$0")"
for s in bolts waves potions traps combat boss fxdata; do python3 $s.py; done
