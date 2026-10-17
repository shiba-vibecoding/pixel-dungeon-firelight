# Firelight · part 13: the places of the dungeon, alive. Everything lies over the game's own tiles (tiles<n>.png) and never
# replaces them: the 3D view draws these frames on the well, the pot, the shelf, the pedestal, the sign, the grass.
#  fx/places/wells.png      16 x 16 x 6, rows: awareness, health, transmutation — the water's colour and shimmer (a loop)
#  fx/places/well-beam.png  16 x 48 x 8, same rows — the column of light when a well is used
#  fx/places/pot.png        16 x 32 x 6, rows: amber, green, crimson, azure — the brew bubbling, steam rising (a loop)
#  fx/places/statue.png     16 x 32 x 4 — a statue cracking and waking (cracks glow, chips fall), then a puff of dust 32 x 32 x 5
#  fx/places/motes.png      16 x 16 x 4, rows: firefly (garden), dust (library), dew glint
#  fx/places/glints.png     16 x 16 x 6, rows: shelf spines, sign runes, pedestal prize (shown 16 x 16 over the tile)
#  fx/places/pedestal.png   16 x 32 x 6 — the prize's glow over a pedestal (a loop)
#  ui/places/icons.png      16 x 16 — the «what is it» card's icon of each place
import math, random
from PIL import Image
from px import Cv, hx, mix, save, strip, rows, grid

WELLS = [('awareness', '#7fd0ff', '#2a6aa8', '#e8f8ff'), ('health', '#ff8a9a', '#a82a4a', '#ffe8ec'), ('transmutation', '#b88aff', '#5a2ca8', '#f2e8ff')]
BREWS = [('amber', '#ffb84a', '#a8641a'), ('green', '#8ae05a', '#3a7a1a'), ('crimson', '#ff5a5a', '#8a1a1a'), ('azure', '#6ab0ff', '#1a4a9a')]


def well_water(light, deep, spark, f):
    """the round of water inside the well's rim (the tile's middle 10 x 10), waves turning, a glint going round."""
    c = Cv(16, 16); L, D, S = hx(light), hx(deep), hx(spark)
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 7.5, (y - 7.5) * 1.1)
            if d > 5.2: continue
            wave = math.sin(d * 1.6 - f * 1.05) > 0.55
            c.put(x, y, mix(D, L, 0.55 if wave else 0.2), 230)
    a = f / 6 * 6.2832
    c.put(7.5 + math.cos(a) * 3.2, 7.5 + math.sin(a) * 2.8, S); c.put(7.5 + math.cos(a + 3.1) * 2, 7.5 + math.sin(a + 3.1) * 1.8, L)
    return c.im


def well_beam(light, deep, spark, f):
    """16 x 48: from the well a column of its light rises, wide then narrowing, specks climbing in it; the last frames fade."""
    c = Cv(16, 48); L, D, S = hx(light), hx(deep), hx(spark)
    w = [3, 6, 7, 7, 6, 5, 3, 1][f]; top = [36, 18, 6, 0, 0, 0, 4, 12][f]; fade = [1, 1, 1, 1, 0.85, 0.65, 0.45, 0.25][f]
    for y in range(top, 46):
        for x in range(8 - w, 8 + w):
            d = abs(x + 0.5 - 8) / max(1, w)
            col = S if d < 0.3 else (L if d < 0.7 else D)
            c.put(x, y, col, int(150 * fade * (0.35 + 0.65 * (y - top) / max(1, 46 - top))))
    for k in range(5):
        y = 44 - ((f * 6 + k * 9) % 40); x = 8 + ((k * 3) % 5) - 2
        if y > top: c.put(x, y, S)
    return c.im


def pot(light, deep, f):
    """16 x 32, the pot's mouth at y 22..25: the brew's surface, bubbles swelling and bursting, steam curling up."""
    c = Cv(16, 32); L, D = hx(light), hx(deep)
    for x in range(3, 13): c.put(x, 23, L if (x + f) % 3 else hx('#fffad6')); c.put(x, 24, D)
    for k, (bx, ph) in enumerate(((5, 0), (9, 2), (11, 4))):
        s = (f + ph) % 6
        if s < 3: c.disc(bx, 22 - s * 0.5, 0.6 + s * 0.6, L); c.put(bx, 21 - s * 0.5, hx('#fffad6'))
        elif s == 3: c.put(bx - 1, 21, L); c.put(bx + 1, 21, L); c.put(bx, 20, L)
    for k in range(3):
        t = (f + k * 2) % 6
        y = 19 - t * 3; x = 6 + k * 2 + round(math.sin((t + k) * 1.3) * 1.5)
        a = 150 - t * 22
        if a > 0: c.disc(x, y, 1.0 + t * 0.35, hx('#d8d4c8'), a)
    return c.im


def statue(f):
    """16 x 32 over the statue tile: cracks run down and glow (frames 0-2), then chips break off (3)."""
    c = Cv(16, 32)
    cracks = [[(8, 4), (7, 7), (9, 10), (8, 13)], [(8, 13), (6, 17), (7, 21), (5, 25)], [(8, 13), (10, 16), (9, 20), (11, 26)]]
    for i, path in enumerate(cracks[:f + 1] if f < 3 else cracks):
        for (x0, y0), (x1, y1) in zip(path, path[1:]):
            c.line(x0, y0, x1, y1, hx('#ffcc66' if f >= 2 else '#e8641f'))
            c.line(x0 + 1, y0, x1 + 1, y1, hx('#1a0a06'), 160)
    if f == 3:
        R = random.Random(4)
        for _ in range(9): c.put(R.randint(2, 13), R.randint(6, 30), hx(R.choice(['#7a8173', '#9fa896', '#555950'])))
    return c.im


def dust(f):
    """32 x 32 x 5: dust bursting out of the stone and settling."""
    c = Cv(32, 32); R = random.Random(3)
    for k in range(10):
        a = R.uniform(3.4, 6.0); sp = R.uniform(0.6, 1.2)
        r = 2 + f * 3 * sp; x, y = 16 + math.cos(a) * r, 22 + math.sin(a) * r * 0.6 + f
        c.disc(x, y, 1.5 + f * 0.4, hx('#9fa896'), max(0, 200 - f * 40))
    return c.im


def motes(kind, f):
    c = Cv(16, 16)
    if kind == 'firefly':          # a warm yellow-green dot that breathes
        a = [255, 200, 120, 200][f]; c.put(8, 8, hx('#f0ff8a'), a)
        if f in (0, 3): c.plus(8, 8, hx('#9ade4a'), 1, a=140)
    elif kind == 'dust':           # a speck turning in the light of a shelf
        c.put(8 + (f % 2), 8, hx('#e0d8c0'), [180, 255, 180, 90][f])
    else:                          # dew: a drop's glint
        c.put(8, 9, hx('#bfe0ff')); c.put(8, 10, hx('#7fb0e0'))
        if f < 3: c.plus(9, 7, hx('#ffffff'), [0, 1, 0][f])
    return c.im


def glints(kind, f):
    c = Cv(16, 16)
    if kind == 'shelf':            # light running over the spines of the books, left to right
        x = -2 + f * 4
        for y in range(3, 14):
            if y not in (8,): c.put(x, y, hx('#fff2c8'), 150); c.put(x + 1, y, hx('#fff2c8'), 70)
    elif kind == 'sign':           # the carved runes glow by turns
        for i, (x, y) in enumerate(((5, 6), (8, 6), (11, 6), (6, 9), (10, 9))):
            if (i + f) % 3 == 0: c.put(x, y, hx('#ffcc66')); c.put(x, y + 1, hx('#e8641f'))
    else:                          # a prize on its pedestal: four points of light turning
        a = f / 6 * 6.2832
        for k in range(4):
            t = a + k * 1.5708; c.put(8 + math.cos(t) * 6, 8 + math.sin(t) * 2.5, hx('#ffeba4'))
    return c.im


def pedestal(f):
    """16 x 32: a soft column of gold over a pedestal (the prize is drawn by the game), breathing."""
    c = Cv(16, 32); w = [4, 5, 5, 4, 3, 3][f]
    for y in range(4, 28):
        for x in range(8 - w, 8 + w):
            d = abs(x + 0.5 - 8) / w; t = (28 - y) / 24
            a = int(200 * (1 - t) * (1 - d))
            if a > 18: c.put(x, y, hx('#ffeba4' if d < 0.4 else '#ffcc66'), a)
    return c.im


ICONS = {
    'well-awareness': ('b', 'B'), 'well-health': ('r', 'R'), 'well-transmutation': ('v', 'V'),
}
ICON_ART = {
    'well': """
................
................
................
....77777777....
...7888888887...
..788XXXXXX887..
..78XxXXXXxX87..
..788XXXXXX887..
..677777777776..
..655555555556..
..656565656566..
..655555555556..
...6666666666...
................
................
................""",
    'pot': """
................
.......s.l......
......l.s.......
.......l.s......
..666666666666..
..6gggfggggg6...
.66666666666666.
..6555555555556.
..655555555556..
..655555555556..
...6555555556...
....65555556....
....fe....ef....
...fef....fef...
................
................""",
    'garden': """
................
.......l........
...G........l...
....h..G.h......
...hGh.h.hGh....
...hGhhGhhGh..G.
....hGhGhGh..hGh
..h.hGhGhGhh.hGh
.hGhhGhGhGhGhhGh
.hGhhGhGhGhGhhG.
.hhhhhhhhhhhhhh.
.2222222222222..
................
................
................
................""",
    'statue': """
................
......8888......
.....8iii98.....
.....8i9998.....
......8998......
....888998888...
...8i99999998...
...8i9999.998...
...8i99999998...
....89998998....
.....8999.98....
.....899..98....
....88888888....
...7777777777...
...6666666666...
................""",
    'library': """
................
.2222222222222..
.2cRhGbBvVcRg2..
.2cRhGbBvVcRg2..
.2cRhGbBvVcRg2..
.2222222222222..
.2gYbBcRhGvV42..
.2gYbBcRhGvV42..
.2gYbBcRhGvV42..
.2222222222222..
.2hGcRgYvVbB22..
.2hGcRgYvVbB22..
.2222222222222..
.1111111111111..
................
................""",
    'pedestal': """
................
.......l........
......lgl.......
.....lgsgl......
......lgl.......
.......l........
................
....88888888....
...8iiiiiiii8...
....88888888....
.....777777.....
.....766667.....
.....766667.....
....88888888....
...7777777777...
................""",
    'sign': """
................
................
..222222222222..
..234444444432..
..24g.g.g.gg42..
..24.g.gg.g.42..
..24g.gg.g.g42..
..234444444432..
..222222222222..
.......22.......
.......32.......
.......32.......
.......32.......
.....222222.....
................
................""",
    'dew': """
................
................
.......b........
.......b........
......bwb.......
......bwb.......
.....bwbbb......
.....bwbbb......
....bbbbbBb.....
....bbbbbBb.....
....bbbbBBb.....
.....bbBBb......
......bbb.......
................
................
................""",
    'altar': """
................
.......f........
......fgf.......
......fef.......
.......e........
....88888888....
...8iiiiiiii8...
...8ccccccccc...
....88888888....
....87777778....
....87766778....
....87777778....
...8888888888...
..777777777777..
................
................""",
}


def icons():
    from quest import PAL
    out = []
    for name in ['well-awareness', 'well-health', 'well-transmutation', 'pot', 'garden', 'statue', 'library', 'pedestal', 'sign', 'dew', 'altar']:
        if name.startswith('well'):
            l, d = ICONS[name]; art = ICON_ART['well'].replace('X', d).replace('x', l)
        else: art = ICON_ART[name]
        pal = {k: hx(v) for k, v in PAL.items()}
        g = grid([(r + '.' * 16)[:16] for r in (art.strip('\n').split('\n') + ['.' * 16] * 16)[:16]], pal)
        o = g.copy(); p, q = g.load(), o.load()
        for y in range(16):
            for x in range(16):
                if not p[x, y][3] and any(0 <= x + dx < 16 and 0 <= y + dy < 16 and p[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    q[x, y] = pal['k'] + (255,)
        out.append(o)
    return strip(out)


ICON_NAMES = ['well-awareness', 'well-health', 'well-transmutation', 'pot', 'garden', 'statue', 'library', 'pedestal', 'sign', 'dew', 'altar']

if __name__ == '__main__':
    save(rows([strip([well_water(l, d, s, f) for f in range(6)]) for _, l, d, s in WELLS]), 'fx/places/wells.png')
    save(rows([strip([well_beam(l, d, s, f) for f in range(8)]) for _, l, d, s in WELLS]), 'fx/places/well-beam.png')
    save(rows([strip([pot(l, d, f) for f in range(6)]) for _, l, d in BREWS]), 'fx/places/pot.png')
    save(strip([statue(f) for f in range(4)]), 'fx/places/statue.png')
    save(strip([dust(f) for f in range(5)]), 'fx/places/dust.png')
    save(rows([strip([motes(k, f) for f in range(4)]) for k in ('firefly', 'dust', 'dew')]), 'fx/places/motes.png')
    save(rows([strip([glints(k, f) for f in range(6)]) for k in ('shelf', 'sign', 'prize')]), 'fx/places/glints.png')
    save(strip([pedestal(f) for f in range(6)]), 'fx/places/pedestal.png')
    save(icons(), 'ui/places/icons.png')
    print('places art')
