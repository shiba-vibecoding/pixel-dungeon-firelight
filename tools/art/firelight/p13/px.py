# Firelight · part 13 (copied from part 6): pixel helpers for the effect sheets (hard steps, no gradients: light comes from the palette).
import math, os, random
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))      # tools/art/firelight/p13 -> the repository
SRC = os.environ.get('PD_ASSETS', os.path.join(ROOT, 'packages/client/public/assets')) + '/'
OUT = os.environ.get('P13_OUT', SRC) + '/'                                # writes fx/{quest,places,minor,boss}/**, ui/{quest,places,boss}/**
PREVIEW = os.environ.get('P13_PREVIEW', os.path.join(ROOT, 'docs/design/previews/firelight/quests/sheets')) + '/'


def hx(c):
    c = c.lstrip('#'); return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t): return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


class Cv:
    def __init__(self, w, h):
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); self.p = self.im.load(); self.w, self.h = w, h

    def put(self, x, y, c, a=255, over=True):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h and a > 0:
            if over or self.p[x, y][3] == 0: self.p[x, y] = tuple(c[:3]) + (int(a),)

    def disc(self, cx, cy, r, c, a=255, sq=1.0):
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                if (x - cx) ** 2 + ((y - cy) / sq) ** 2 <= r * r: self.put(x, y, c, a)

    def ring(self, cx, cy, r, c, a=255, w=1.0, sq=1.0, gap=None, jag=0.0, seed=0):
        R = random.Random(seed)
        n = max(12, int(r * 7))
        for k in range(n):
            t = k / n * 6.2832
            if gap and (k // gap[0]) % 2 == 1 and k % gap[0] < gap[1]: continue
            rr = r + (R.uniform(-jag, jag) if jag else 0)
            for d in range(int(math.ceil(w))):
                self.put(cx + math.cos(t) * (rr - d), cy + math.sin(t) * (rr - d) * sq, c, a)

    def line(self, x0, y0, x1, y1, c, a=255):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / max(1, n); self.put(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c, a)

    def plus(self, x, y, c, arm=1, a=255, tip=None):
        self.put(x, y, c, a)
        for d in range(1, arm + 1):
            for dx, dy in ((d, 0), (-d, 0), (0, d), (0, -d)): self.put(x + dx, y + dy, tip if (tip and d == arm) else c, a)

    def glow(self, cx, cy, r, ramp, sq=1.0):
        """A glowing ball in hard steps: ramp[0] the core ... ramp[-1] the rim."""
        n = len(ramp)
        for i in range(n - 1, -1, -1):
            self.disc(cx, cy, r * (i + 1) / n, ramp[i], 255, sq)

    def blit(self, other, x, y): self.im.alpha_composite(other.im if isinstance(other, Cv) else other, (int(x), int(y)))


def strip(frames):
    w = sum(f.width for f in frames); h = max(f.height for f in frames)
    o = Image.new('RGBA', (w, h), (0, 0, 0, 0)); x = 0
    for f in frames: o.alpha_composite(f, (x, 0)); x += f.width
    return o


def rows(lines):
    w = max(l.width for l in lines); h = sum(l.height for l in lines)
    o = Image.new('RGBA', (w, h), (0, 0, 0, 0)); y = 0
    for l in lines: o.alpha_composite(l, (0, y)); y += l.height
    return o


def save(im, path):
    p = OUT + path; os.makedirs(os.path.dirname(p), exist_ok=True); im.save(p, optimize=True); return path


def x_n(im, n): return im.resize((im.width * n, im.height * n), Image.NEAREST)


def add_over(bg, im):
    """Additive blending (the 'add' effects): bg + rgb * alpha."""
    from PIL import ImageChops
    rgb = im.convert('RGB'); a = im.getchannel('A')
    pre = ImageChops.multiply(rgb, Image.merge('RGB', (a, a, a)))
    return Image.merge('RGBA', (*ImageChops.add(bg.convert('RGB'), pre).split(), Image.new('L', bg.size, 255)))


def gif(frames, name, ms=80, scale=4, bg=(18, 19, 16), hold=0, add=False):
    os.makedirs(PREVIEW, exist_ok=True); fr = []
    for f in frames + [Image.new('RGBA', frames[0].size, (0, 0, 0, 0))] * hold:
        b = Image.new('RGBA', (f.width * scale, f.height * scale), bg + (255,))
        b = add_over(b, x_n(f, scale)) if add else (b.alpha_composite(x_n(f, scale)) or b)
        fr.append(b.convert('P', palette=Image.ADAPTIVE, colors=255))
    fr[0].save(PREVIEW + name, save_all=True, append_images=fr[1:], duration=ms, loop=0, disposal=2)


def grid(rows_, pal):
    h = len(rows_); w = max(len(r) for r in rows_); im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); p = im.load()
    for y, r in enumerate(rows_):
        for x, ch in enumerate(r):
            if ch not in '. ': c = pal[ch]; p[x, y] = tuple(c) + ((255,) if len(c) == 3 else ())
    return im
