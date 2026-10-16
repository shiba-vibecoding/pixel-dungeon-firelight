#!/bin/sh
# Firelight · part 8: the facing sheets and dirs.json.
#   stage 1: the heroes' front and back sheets, the Pixel-Mart looks, hats and pets for them;
#   stage 2: the monsters of the first depths (monsters.py).
# PD_ASSETS = the client's public/assets (with the part 5 pack in mart/fl); P5_DIR = part 5's scripts; P8_OUT = where to write.
set -e
cd "$(dirname "$0")"
for s in heroes looks hats monsters data; do python3 $s.py; done
