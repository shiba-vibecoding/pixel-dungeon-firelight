#!/bin/sh
# Firelight · part 13: quests, places, the small magic, the bosses — the sheets, fx.json's additions, quest.json, places.json.
# Python 3 + Pillow. PD_ASSETS = the client's public/assets (read: fx/fx.json), P13_OUT = where to write (default: PD_ASSETS).
set -e
cd "$(dirname "$0")"
for s in portraits quest places minor bosses data13; do python3 $s.py > /dev/null; done
echo "part 13: art and data written"
