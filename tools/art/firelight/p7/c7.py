# Firelight · part 7 (competitions and the hero card): shared paths and helpers. Uses the part 5 helpers (../p5/common.py)
# and the part 5 pack in assets/mart/fl, which the hero card is built from.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'p5'))
P5 = os.environ.get('P5_DIR')
if P5: sys.path.insert(0, P5)
import common as _c5                      # noqa: E402  (part 5: palette, grid, outline, hero frames)
from common import P, hx, to_hex, hsv, rgb, mix, grid, outline, x_n, strip, FW, FH, COLS, TIERS, CLASSES  # noqa: E402,F401
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
SRC = os.environ.get('PD_ASSETS', os.path.join(ROOT, 'packages/client/public/assets')) + '/'
OUT = os.environ.get('P7_OUT', os.path.join(SRC, 'compete')) + '/'
MART = os.environ.get('P5_MART', os.path.join(SRC, 'mart/fl')) + '/'
_c5.SRC = SRC


def hero(cls, look=None):
    from PIL import Image
    return Image.open((MART + f'looks/{cls}-{look}.png') if look else (SRC + f'{cls}.png')).convert('RGBA')


def frame(sheet, f, tier): return sheet.crop((f * FW, tier * FH, f * FW + FW, tier * FH + FH))


def out(path):
    p = OUT + path; os.makedirs(os.path.dirname(p), exist_ok=True); return p


def save(im, path):
    im.save(out(path), optimize=True); return OUT + path
