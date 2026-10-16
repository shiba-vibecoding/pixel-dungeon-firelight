#!/bin/sh
# Firelight · part 5: the whole Pixel-Mart pack. PD_ASSETS = the client's public/assets (sources), P5_OUT = where mart/fl goes.
set -e
cd "$(dirname "$0")"
for s in looks fires hats pets effects quips decor profile catalog; do python3 $s.py; done
