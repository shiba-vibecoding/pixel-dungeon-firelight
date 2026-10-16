#!/bin/sh
# Firelight · part 7: the competition art and data (assets/compete). PD_ASSETS = the client's public/assets; the part 5 pack
# (assets/mart/fl) must be there: the hero card is built from it. P7_OUT = where compete/ goes.
set -e
cd "$(dirname "$0")"
for s in beacon league season titles anchors data; do python3 $s.py; done
