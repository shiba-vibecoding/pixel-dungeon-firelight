#!/bin/sh
# The animated previews (docs/design/previews/firelight/compete/anim): frames of the mock on its frozen clock, then GIFs.
# The mock must be served (serve.sh). Needs playwright and Pillow.
set -e
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../../../../.." && pwd); G=$(mktemp -d); O="$REPO/docs/design/previews/firelight/compete/anim"
cap() { node "$HERE/capture.cjs" "$G/$1" "$2" $3 $4 $5 "$6" $7 $8 $9 100; }
cap row-top1 "compete.html?s=cards&lang=ru" 375 812 2 .fl-row 0 0 4000
cap row-me "compete.html?s=cards&lang=en" 375 812 2 .fl-row 3 0 4000
cap podium "compete.html?s=boards&lang=ru" 375 812 2 .fl-podium 0 0 4000
cap profile "compete.html?s=profile&lang=ru" 375 812 2 .fl-hero-card 0 0 4000
cap beacon-frame "compete.html?s=art&lang=en" 1280 800 2 ".fl-honour .fl-stage" 0 0 1280
cap beacon-fire "compete.html?s=art&lang=en" 1280 800 2 ".fl-honour .fl-stage" 1 0 2400
G="$G" O="$O" python3 - <<'P'
import glob, os
from PIL import Image
G, O = os.environ['G'], os.environ['O']; os.makedirs(O, exist_ok=True)
for n in sorted({os.path.basename(f).rsplit('-', 1)[0] for f in glob.glob(G + '/*.png')}):
    fr = [Image.open(f).convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT) for f in sorted(glob.glob(f'{G}/{n}-*.png'))]
    fr[0].save(f'{O}/{n}.gif', save_all=True, append_images=fr[1:], duration=100, loop=0, optimize=True); print(n, len(fr))
P
