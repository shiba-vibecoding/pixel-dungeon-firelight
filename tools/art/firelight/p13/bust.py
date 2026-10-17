# Firelight · part 13: a small toolkit for the dialog portraits (48 x 48). Shapes are filled with a four-step ramp lit the
# Firelight way — the fire is below and in front: the top and left edges sink into shadow, the lower edge catches the fire's rim,
# the lower part of a shape is lit a step. Hard steps only; the silhouette gets a void outline.
import math
from PIL import Image
from px import hx

VOID = hx('#0b0b09')


class Bust:
    def __init__(self, w=48, h=48):
        self.w, self.h = w, h
        self.px = [[None] * w for _ in range(h)]       # (r, g, b, a) or None

    # ---- masks
    @staticmethod
    def ellipse(cx, cy, rx, ry):
        return lambda x, y: ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1

    @staticmethod
    def poly(pts):
        def inside(x, y):
            px_, py_ = x + 0.5, y + 0.5; c = False; n = len(pts)
            for i in range(n):
                (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % n]
                if (y1 > py_) != (y2 > py_) and px_ < (x2 - x1) * (py_ - y1) / (y2 - y1) + x1: c = not c
            return c
        return inside

    @staticmethod
    def union(*ms): return lambda x, y: any(m(x, y) for m in ms)

    @staticmethod
    def minus(a, b): return lambda x, y: a(x, y) and not b(x, y)

    # ---- painting
    def fill(self, mask, ramp, alpha=255, rim=True, light=0.62, clip=None):
        """ramp: [shadow, mid, lit, rim] hex. `light`: from this share of the shape's height down, a step lighter."""
        R = [hx(c) for c in ramp]
        cells = [(x, y) for y in range(self.h) for x in range(self.w) if mask(x, y) and (clip is None or clip(x, y))]
        if not cells: return
        top = min(y for _, y in cells); bot = max(y for _, y in cells)
        S = set(cells)
        ext = {}
        for x, y in cells:
            a, b = ext.get(y, (x, x)); ext[y] = (min(a, x), max(b, x))
        for x, y in cells:
            up, left = (x, y - 1) not in S, (x - 1, y) not in S
            down, right = (x, y + 1) not in S, (x + 1, y) not in S
            t = (y - top) / max(1, bot - top)
            x0, x1 = ext[y]; mid = (x0 + x1) / 2 + 1.5; half = max(1, (x1 - x0) / 2)
            rel = min(1, abs(x - mid) / half)
            c = R[1]
            if t >= light + 0.45 * rel * rel: c = R[2]
            if up or left: c = R[0]
            if rim and down: c = R[3]
            elif right and t >= light: c = R[3] if rim else R[2]
            a = alpha(x, y) if callable(alpha) else alpha
            self.px[y][x] = c + (a,)

    def flat(self, mask, color, alpha=255):
        c = hx(color)
        for y in range(self.h):
            for x in range(self.w):
                if mask(x, y): self.px[y][x] = c + (alpha,)

    def dots(self, pts, color, alpha=255):
        c = hx(color)
        for x, y in pts:
            if 0 <= x < self.w and 0 <= y < self.h: self.px[y][x] = c + (alpha,)

    def art(self, x0, y0, rows, pal):
        """Pixel strings at (x0, y0); '.' leaves the pixel."""
        for j, r in enumerate(rows):
            for i, ch in enumerate(r):
                if ch != '.' and ch != ' ':
                    x, y = x0 + i, y0 + j
                    if 0 <= x < self.w and 0 <= y < self.h: self.px[y][x] = hx(pal[ch]) + (255,)

    def image(self, outline=True):
        im = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0)); p = im.load()
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y][x]: p[x, y] = self.px[y][x]
        if outline:
            q = im.copy(); qp = q.load()
            for y in range(self.h):
                for x in range(self.w):
                    if p[x, y][3]: continue
                    if any(0 <= x + dx < self.w and 0 <= y + dy < self.h and p[x + dx, y + dy][3] > 100 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        qp[x, y] = VOID + (255,)
            im = q
        return im
