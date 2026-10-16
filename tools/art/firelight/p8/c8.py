# Firelight · part 8: shared paths and pixel helpers for the facing sheets (front and back views of the PD 1.9 sprites).
import os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))      # tools/art/firelight/p8 -> the repository
SRC = os.environ.get('PD_ASSETS', os.path.join(ROOT, 'packages/client/public/assets')) + '/'
OUT = os.environ.get('P8_OUT', SRC) + '/'                                 # writes assets/dirs/** and mart/fl/** (new sheets only)
P5 = os.environ.get('P5_DIR', os.path.join(HERE, '..', 'p5'))
PREVIEW = os.environ.get('P8_PREVIEW', os.path.join(ROOT, 'docs/design/previews/firelight/dirs/anim')) + '/'
FW, FH, COLS, TIERS = 12, 15, 21, 7
CLASSES = ['warrior', 'mage', 'rogue', 'ranger']        # ranger = the huntress (her sheet's name in PD 1.9)


def hx(c): c = c.lstrip('#'); return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
def to_hex(p): return '#%02x%02x%02x' % tuple(p[:3])


def out(path):
    p = OUT + path; os.makedirs(os.path.dirname(p), exist_ok=True); return p


def save(im, path): im.save(out(path), optimize=True); return OUT + path
def sheet(cls): return Image.open(SRC + f'{cls}.png').convert('RGBA')
def cell(sh, f, t, w=FW, h=FH): return sh.crop((f * w, t * h, f * w + w, t * h + h))
def blank(w=FW, h=FH): return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def shift(im, dx=0, dy=0):
    o = blank(im.width, im.height); o.alpha_composite(im, (0, 0)) if False else None
    o.paste(im, (dx, dy), im); return o


def x_n(im, n): return im.resize((im.width * n, im.height * n), Image.NEAREST)
