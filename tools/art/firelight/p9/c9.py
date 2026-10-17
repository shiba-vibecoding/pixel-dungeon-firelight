# Firelight · part 9: shared paths and pixel helpers for the weapons held in the hand.
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))      # tools/art/firelight/p9 -> the repository
SRC = os.environ.get('PD_ASSETS', os.path.join(ROOT, 'packages/client/public/assets')) + '/'
OUT = os.environ.get('P9_OUT', SRC) + '/'                                 # writes assets/weapons/** only
FW, FH, COLS, TIERS = 12, 15, 21, 7
CLASSES = ['warrior', 'mage', 'rogue', 'ranger']        # ranger = the huntress (her sheet's name in PD 1.9)
FACINGS = ['side', 'front', 'back']
CELL, GRIP = 17, 8                                      # a weapon's cell, and the grip (the hand) at its middle pixel
ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]           # 0 = up the screen, clockwise


def hx(c): c = c.lstrip('#'); return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
def to_hex(p): return '#%02x%02x%02x' % tuple(p[:3])
def blank(w=FW, h=FH): return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def out(path):
    p = OUT + path; os.makedirs(os.path.dirname(p), exist_ok=True); return p


def save(im, path): im.save(out(path), optimize=True); return OUT + path
def sheet(path): return Image.open(SRC + path).convert('RGBA')
def cell(sh, f, t, w=FW, h=FH): return sh.crop((f * w, t * h, f * w + w, t * h + h))
def x_n(im, n): return im.resize((im.width * n, im.height * n), Image.NEAREST)
