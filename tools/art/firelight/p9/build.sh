#!/bin/sh
# Firelight · part 9: the weapons held in the hand (assets/weapons/held/<weapon>.png) and held.json (the hand, the angle and the layer
# in every frame of every class and view, and the trails of the blows). Python 3 + Pillow.
# PD_ASSETS = the client's public/assets (with part 8's dirs/ sheets); P9_OUT = where to write.
set -e
cd "$(dirname "$0")"
for s in weapons held; do python3 $s.py; done
