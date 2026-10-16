# Firelight · part 5 (Pixel-Mart): shared helpers for the art scripts.
import colorsys, math, os, random
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))     # tools/art/firelight/p5 -> the repository
SRC = os.environ.get('PD_ASSETS', os.path.join(ROOT, 'packages/client/public/assets')) + '/'
OUT = os.environ.get('P5_OUT', os.path.join(SRC, 'mart/fl')) + '/'
PREVIEW = os.environ.get('P5_PREVIEW', os.path.join(ROOT, 'docs/design/previews/firelight/mart/anim')) + '/'   # animated previews (GIF), not shipped
CLASSES = ['warrior', 'mage', 'rogue', 'ranger']     # ranger = the huntress
FW, FH, COLS, TIERS = 12, 15, 21, 7

# Fire palette (tokens.json, part 1-2)
P = dict(spark=(255, 250, 214), light=(255, 235, 164), gold=(255, 204, 102), flame=(255, 154, 58), ember=(232, 100, 31),
         coal=(178, 42, 42), coaldeep=(110, 22, 26), ash=(26, 10, 6), void=(11, 11, 9), stone9=(31, 33, 28), stone8=(40, 42, 36),
         stone7=(59, 62, 54), stone6=(74, 78, 69), stone5=(85, 89, 80), stone4=(98, 102, 91), stone3=(122, 129, 115), stone2=(159, 168, 150),
         ink=(232, 226, 200), lithi=(224, 184, 120), litmid=(168, 128, 78), litlo=(116, 88, 60), litdark=(74, 52, 36))


def hx(c):
    c = c.lstrip('#'); return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def to_hex(p): return '#%02x%02x%02x' % tuple(p[:3])


def hsv(p): return colorsys.rgb_to_hsv(*[x / 255 for x in p[:3]])


def rgb(h, s, v):
    return tuple(int(round(x * 255)) for x in colorsys.hsv_to_rgb(h % 1, max(0, min(1, s)), max(0, min(1, v))))


def mix(a, b, t): return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def out(path):
    p = OUT + path; os.makedirs(os.path.dirname(p), exist_ok=True); return p


def save(im, path):
    im.save(out(path), optimize=True); return OUT + path


def grid(rows, pal, scale=1):
    """A sprite from text rows: each char is a key of pal (RGB or RGBA), '.' or ' ' is empty."""
    h = len(rows); w = max(len(r) for r in rows)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); px = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in '. ': continue
            c = pal[ch]; px[x, y] = tuple(c) + ((255,) if len(c) == 3 else ())
    return im.resize((w * scale, h * scale), Image.NEAREST) if scale != 1 else im


def outline(im, color=(0, 0, 0, 255), diag=False):
    """A one-pixel outline around the opaque pixels (grown by 1 on every side)."""
    w, h = im.size; o = Image.new('RGBA', (w + 2, h + 2), (0, 0, 0, 0)); o.alpha_composite(im, (1, 1))
    src = o.copy().load(); px = o.load()
    nb = [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (1, -1), (-1, 1), (-1, -1)] if diag else [])
    for y in range(h + 2):
        for x in range(w + 2):
            if src[x, y][3]: continue
            if any(0 <= x + dx < w + 2 and 0 <= y + dy < h + 2 and src[x + dx, y + dy][3] > 128 for dx, dy in nb): px[x, y] = color
    return o


def x_n(im, n): return im.resize((im.width * n, im.height * n), Image.NEAREST)


def strip(frames):
    w = sum(f.width for f in frames); h = max(f.height for f in frames)
    o = Image.new('RGBA', (w, h), (0, 0, 0, 0)); x = 0
    for f in frames: o.alpha_composite(f, (x, 0)); x += f.width
    return o


def hero(cls): return Image.open(SRC + f'{cls}.png').convert('RGBA')


def frame(sheet, f, tier):
    return sheet.crop((f * FW, tier * FH, f * FW + FW, tier * FH + FH))


def cell_opaque(sheet, f, tier):
    fr = frame(sheet, f, tier); px = fr.load()
    return [(x, y) for y in range(FH) for x in range(FW) if px[x, y][3] > 0]


def gif(frames, path, ms=100, bg=(11, 11, 9)):
    fr = []
    for f in frames:
        b = Image.new('RGBA', f.size, bg + (255,)); b.alpha_composite(f); fr.append(b.convert('P', palette=Image.ADAPTIVE, colors=255))
    os.makedirs(PREVIEW, exist_ok=True); p = PREVIEW + os.path.basename(path)
    fr[0].save(p, save_all=True, append_images=fr[1:], duration=ms, loop=0, disposal=2)
    return p


def rnd(seed): return random.Random(seed)
