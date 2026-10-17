#!/bin/sh
# Firelight · part 10: the doors' 3D pieces (assets/doors/doors-<region>.png, -glow.png, doors-fx.png) and doors.json. Python 3 + Pillow.
# PD_ASSETS = the client's public/assets; P10_OUT = where to write.
set -e
cd "$(dirname "$0")"
python3 data.py
