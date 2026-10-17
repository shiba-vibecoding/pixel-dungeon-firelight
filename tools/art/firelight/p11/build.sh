#!/bin/sh
# Firelight · part 11: the growth art (assets/ui/growth/growth-icons.png, growth-fx.png) and growth.json. Python 3 + Pillow.
# PD_ASSETS = the client's public/assets; P11_OUT = where to write (default: PD_ASSETS).
set -e
cd "$(dirname "$0")"
python3 data.py
