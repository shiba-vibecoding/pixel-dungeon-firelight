# Firelight · part 8: the 12 hats of Pixel-Mart (part 5) for the front and the back. Part 5's hats.py fits every hat to every
# frame from the frame itself (the top of the head, the eye, the neck): it is run unchanged on the facing sheets, the class sheet
# swapped for the facing's. Seen from the back a hat loses what is only on its front (the tricorn's cockade, the stargazer's star),
# the eyepatch is its strap and knot round the back of the head, and the rest is the same hat seen from behind.
import copy, os, sys
from PIL import Image
import c8
from c8 import CLASSES, COLS, TIERS, save

sys.path.insert(0, c8.P5)
os.environ.setdefault('PD_ASSETS', c8.SRC.rstrip('/'))
import common as p5c                                         # noqa: E402
p5c.SRC = c8.SRC
import hats as p5h                                           # noqa: E402 (guarded: importing it builds nothing)

FRONT_ONLY = {'tricorn': 'b', 'wizard': 'b'}     # the accent colour 'c' becomes this key on the back


def strap(front, cls):
    """The eyepatch from behind: the strap at the eye's height across the head, a knot in the middle."""
    OW, OH, OX, OY = p5h.OW, p5h.OH, p5h.OX, p5h.OY; pal = {k: c8.hx(v) for k, v in p5h.HATS['eyepatch']['pal'].items()}
    o = Image.new('RGBA', (COLS * OW, TIERS * OH), (0, 0, 0, 0)); p = o.load()
    for t in range(TIERS):
        for f in range(COLS):
            if 8 <= f <= 12: continue
            a = p5h.anchors(front, f, t)
            if not a or not a['eye']: continue
            ey = a['eye'][1] - 1; x0, x1 = a['head']; cx = (x0 + x1) // 2
            for x in range(x0, x1 + 1): p[f * OW + OX + x, t * OH + OY + ey] = pal['b'] + (255,)
            for dx in (0, 1): p[f * OW + OX + cx + dx, t * OH + OY + ey + 1] = pal['a'] + (255,)
    return o


def main():
    base = copy.deepcopy(p5h.HATS)
    for facing in ('front', 'back'):
        for cls in CLASSES:
            sheet = Image.open(c8.OUT + f'dirs/{cls}-{facing}.png').convert('RGBA'); front = Image.open(c8.OUT + f'dirs/{cls}-front.png').convert('RGBA')
            p5h.hero = lambda _c, s=sheet: s.copy()
            for key, h in base.items():
                p5h.HATS[key] = copy.deepcopy(h)
                if facing == 'back' and key in FRONT_ONLY: p5h.HATS[key]['pal']['c'] = h['pal'][FRONT_ONLY[key]]
                if facing == 'back' and key == 'eyepatch': o, g = strap(front, cls), None
                else: o, g = p5h.overlay(cls, key)
                save(o, f'mart/fl/hats/{cls}-{key}-{facing}.png')
                if h.get('glow'): save(g, f'mart/fl/hats/{cls}-{key}-glow-{facing}.png')
    p5h.HATS.update(base)
    print('hats ok')


if __name__ == '__main__':
    main()
