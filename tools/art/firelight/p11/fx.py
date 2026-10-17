# Firelight · part 11: the growth effects of the 3D view (growth-fx.png), 16 px a cell like every sprite of the game.
# Four frames a row, 16 x 16 each (the pillar 16 x 32):
#   0 spark   — the upgrade sparks: a twinkle that grows and shrinks (variant A);
#   1 rune    — the enchantment's rune at the weapon, white: tinted with ItemSprite.Glowing's colour (view.ts ENCHANT_COLORS);
#   2 wisp    — the known curse: violet smoke rising off the item;
#   3 burst   — strength: a ring of red-gold breaking outward from the hero's feet;
#   4 glint   — the sweep of light over an upgraded weapon or armour, white: tinted by tier (variant B);
#   5 sigil   — the mastery: the subclass sigil flaring once over the hero;
#   6-7 pillar — the level-up: a column of gold light, 16 x 32.
# Drawn with integer pixels only: no blur, no anti-aliasing (nearest everywhere).
from PIL import Image
from c11 import PAL, hx

W = 16


def col(ch, a=255):
    return hx(PAL[ch]) + (a,)


def frame(px, ox, oy, pts):
    for x, y, ch in pts:
        if 0 <= x < W and 0 <= y < 32:
            px[ox + x, oy + y] = col(ch) if isinstance(ch, str) else ch


def spark(f):
    # a 4-point star: arms 0, 1, 2, 1 long; the middle spark-white, the arms gold
    arm = [0, 1, 2, 1][f]
    cx, cy = 7, 7
    pts = [(cx, cy, 's')]
    for d in range(1, arm + 1):
        c = 'l' if d == 1 else 'g'
        pts += [(cx + d, cy, c), (cx - d, cy, c), (cx, cy + d, c), (cx, cy - d, c)]
    if f == 2:
        pts += [(cx + 1, cy + 1, 'g'), (cx - 1, cy - 1, 'g'), (cx + 1, cy - 1, 'g'), (cx - 1, cy + 1, 'g')]
    return pts


RUNE = ["..w..", ".w.w.", "w.w.w", ".w.w.", "..w..", "..w..", ".w.w."]


def rune(f):
    # the rune draws itself in three frames, the fourth the whole rune with a halo
    cells = [(x, y) for y, r in enumerate(RUNE) for x, c in enumerate(r) if c == 'w']
    n = [len(cells) // 3, 2 * len(cells) // 3, len(cells), len(cells)][f]
    pts = [(5 + x, 4 + y, (255, 255, 255, 255)) for x, y in cells[:n]]
    if f == 3:
        for x, y in cells:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if (x + dx, y + dy) not in cells:
                    pts.append((5 + x + dx, 4 + y + dy, (255, 255, 255, 96)))
    return pts


def wisp(f):
    # two puffs climbing 3 px a frame, fading violet -> shade
    pts = []
    for k, (x0, y0) in enumerate(((5, 13), (9, 10))):
        y = y0 - 3 * f
        if y < 1:
            y += 12
        c = 'v' if (f + k) % 4 < 2 else 'V'
        pts += [(x0, y, c), (x0 + 1, y, c), (x0 - 1, y, 'V'), (x0, y - 1, c), (x0 + 1, y - 1, 'V'), (x0, y + 1, 'V'),
                (x0 + 1, y + 1, c), (x0 + (1 if f % 2 else -1), y - 2, 'V')]
    return pts


def burst(f):
    # a ring of radius 2, 4, 6, 7 — coal outside, gold inside — breaking up as it grows
    r = [3, 5, 6, 7][f]
    pts = []
    import math
    for i in range(48):
        if f >= 2 and i % (3 if f == 2 else 2):
            continue
        a = i / 48 * 2 * math.pi
        x, y = round(7.5 + r * math.cos(a)), round(7.5 + r * math.sin(a) * 0.55)
        pts.append((x, y + 4, 'g' if f < 2 else 'e'))
        if f < 2:
            pts.append((x, y + 5, 'c'))
    return pts


def glint(f):
    # a diagonal sweep two pixels wide crossing a 16-pixel cell in four steps (masked by the sprite at run time)
    pts = []
    o = -6 + f * 6
    for y in range(16):
        for w in (0, 1):
            x = y + o + w
            pts.append((x, 15 - y, (255, 255, 255, 255 if w == 0 else 140)))
    return pts


SIG = [
    "...g...",
    "..glg..",
    "g.glg.g",
    "gglllgg",
    "g.glg.g",
    "..glg..",
    "...g...",
]


def sigil(f):
    cells = [(x, y, c) for y, r in enumerate(SIG) for x, c in enumerate(r) if c != '.']
    pts = [(4 + x, 4 + y, ('s' if f == 1 else c)) for x, y, c in cells] if f < 3 else [(4 + x, 4 + y, 'e') for x, y, c in cells if c == 'g']
    if f in (1, 2):
        r = f + 4
        pts += [(7 + r, 7, 'l'), (7 - r, 7, 'l'), (7, 7 + r, 'l'), (7, 7 - r, 'l')]
    return pts


def pillar(f):
    # a 4-, 6-, 6-, 2-pixel column of light, gold edges and a spark core, sparks running up it
    w = [4, 6, 6, 2][f]
    x0 = 8 - w // 2
    pts = []
    top = [20, 4, 0, 0][f]
    for y in range(top, 32):
        for x in range(x0, x0 + w):
            edge = x in (x0, x0 + w - 1)
            a = 255 if f < 3 else 120
            pts.append((x, y, hx(PAL['g' if edge else ('l' if f != 1 else 's')]) + (a,)))
    for k in range(3):
        y = (28 - f * 7 - k * 9) % 30
        pts.append((x0 - 2 + (k % 2) * (w + 3), y, 's'))
    return pts


ROWS = [('spark', spark, 16), ('rune', rune, 16), ('wisp', wisp, 16), ('burst', burst, 16), ('glint', glint, 16), ('sigil', sigil, 16), ('pillar', pillar, 32)]


def sheet():
    im = Image.new('RGBA', (64, 128), (0, 0, 0, 0))
    px = im.load()
    where, y = {}, 0
    for name, fn, h in ROWS:
        where[name] = {'y': y, 'w': 16, 'h': h, 'frames': 4}
        for f in range(4):
            for x, yy, c in fn(f):
                if 0 <= x < 16 and 0 <= yy < h:
                    px[f * 16 + x, y + yy] = col(c) if isinstance(c, str) else c
        y += h
    return im, where


if __name__ == '__main__':
    import os
    from c11 import DIR
    os.makedirs(DIR, exist_ok=True)
    im, _ = sheet()
    im.save(DIR + 'growth-fx.png', optimize=False)
    print('growth-fx.png', im.size)
