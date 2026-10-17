# Firelight · part 13: the bosses, staged.
#  ui/boss/bar.png        the boss bar: frame 64 x 16 (slice 6), the fill steps 16 x 16 (health, the wound's trace, armour), a skull;
#                         ui/boss/bar-frame.png the frame alone (for border-image)
#  ui/boss/icons.png      16 x 16 x 5: goo, tengu, dm300, king, yog — the bar's emblem
#  fx/boss/dm300.png      32 x 32 x 4, rows: damage 1 (sparks), 2 (smoke, sparks), 3 (fire, black smoke, dents) — a loop over DM-300
#  fx/boss/steam.png      16 x 32 x 6 — steam from the arena's pipes (a loop)
#  fx/boss/explode.png    64 x 64 x 8 — DM-300 bursting; fx/boss/debris.png 16 x 16 x 4, rows: plate, gear, bolt (tumbling)
#  fx/boss/tengu.png      32 x 32 x 6 — the smoke of Tengu's jump; fx/boss/shuriken.png 16 x 16, 3 rows — the marks left on the floor
#  fx/boss/throne.png     32 x 32 x 6 — motes of gold in the King's light (a loop)
#  fx/boss/undead.png     16 x 32 x 6 — the ground cracks with violet light, a hand comes up (then the undead's own sprite)
#  fx/boss/crown.png      16 x 16 x 6 — the King's crown falls and rolls
#  fx/boss/goo.png        32 x 32 x 6 — Goo's splash when struck; fx/boss/goo-pop.png 48 x 48 x 8 — Goo bursting
#  fx/boss/yog.png        32 x 32 x 6 — the glint of Yog's eye; fx/boss/fist.png 32 x 32 x 6, rows: rotting, burning — a fist coming up
#  fx/boss/yog-death.png  64 x 64 x 8 — the shock of Yog's death; fx/boss/amulet.png 32 x 64 x 8 — the Amulet of Yendor's moment
import math, random
from PIL import Image
from px import Cv, hx, mix, save, strip, rows, grid

K = hx('#0b0b09')


def bar():
    fr = Cv(64, 16)
    for y in range(2, 14):
        for x in range(64):
            d = min(x, y - 2, 63 - x, 13 - y)
            if (x in (0, 63) and y in (2, 13)): continue
            col = K if d == 0 else (hx('#9fa896') if d == 1 and y < 7 else (hx('#e8641f') if d == 1 and y > 11 else (hx('#3b3e36') if d <= 2 else hx('#1a1010'))))
            fr.put(x, y, col)
    tiles = []
    for kind in ('hp', 'trace', 'armor'):
        t = Cv(16, 16)
        for y in range(5, 11):
            for x in range(16):
                if kind == 'hp': col = hx('#ff5a3a') if y < 7 else (hx('#c8302a') if y < 9 else hx('#7a1a1e'))
                elif kind == 'trace': col = hx('#e8d8c0') if y < 8 else hx('#b0a088')
                else: col = hx('#bfe0ff') if y < 7 else hx('#6a8ab0')
                t.put(x, y, col)
        tiles.append(t.im)
    skull = Cv(16, 16)
    for (x, y) in [(5, 4), (6, 4), (7, 4), (8, 4), (9, 4), (10, 4), (4, 5), (11, 5), (4, 6), (11, 6), (4, 7), (11, 7), (5, 8), (10, 8), (5, 9), (10, 9), (6, 10), (9, 10)]:
        skull.put(x, y, K)
    for y in range(5, 10):
        for x in range(5, 11): skull.put(x, y, hx('#e8e2c8'))
    for (x, y) in ((6, 6), (9, 6), (6, 7), (9, 7)): skull.put(x, y, hx('#c8302a'))
    skull.put(7, 9, K); skull.put(8, 9, K)
    return strip([fr.im] + tiles + [skull.im])


ICONS = {
    'goo': ["................", "................", "................", "......hhhh......", "....hhGGGGhh....", "...hGGGGGGGGh...", "..hGGkGGGGkGGh..",
            "..hGGkGGGGkGGh..", "..hGGGGGGGGGGh..", ".hGGGGkkkkGGGGh.", ".hGGGGGGGGGGGGh.", ".hhGGGGGGGGGGhh.", "..hhhhhhhhhhhh..", "................", "................", "................"],
    'tengu': ["................", "......cccc......", "....cccccccc....", "...cciiiiiicc...", "...ciiiiiiiic...", "..cikkiiiikkic..", "..ciiiiiiiiiic..",
              "..ciiiicciiiic..", "...ciiicciiic...", "...ciiiccciic...", "....ciiiiiic....", ".....cccccc.....", "......k..k......", "................", "................", "................"],
    'dm300': ["................", "....77777777....", "...7888888887...", "..788777777887..", "..787kkkkkk787..", "..787krrrrk787..", "..787kkkkkk787..",
              "..788777777887..", "..788888888887..", "..7878787878787.", "...7777777777...", "....6......6....", "...666....666...", "................", "................", "................"],
    'king': ["................", "................", "..g...g..g...g..", "..gg.ggg.ggg.gg.", "..glgggggggglgg.", "..gggcgggcgggg..", "..ggggggggggggg.",
             "..eeeeeeeeeeeee.", "................", "....8888888.....", "...8iiiiiiii8...", "...8ikkiiikk8...", "...8iiiiiiii8...", "....8iiiiii8....", ".....888888.....", "................"],
    'yog': ["................", "................", "....cccccccc....", "..cccdddddddcc..", ".ccddiiiiiiddcc.", ".cddiiiRRiiiddc.", "cddiiiRkkRiiiddc",
            "cddiiiRkkRiiiddc", ".cddiiiRRiiiddc.", ".ccddiiiiiiddcc.", "..cccdddddddcc..", "....cccccccc....", "................", "................", "................", "................"],
}


def icons():
    from quest import PAL
    pal = {k: hx(v) for k, v in PAL.items()}
    out = []
    for k in ('goo', 'tengu', 'dm300', 'king', 'yog'):
        g = grid(ICONS[k], pal); o = g.copy(); p, q = g.load(), o.load()
        for y in range(16):
            for x in range(16):
                if not p[x, y][3] and any(0 <= x + dx < 16 and 0 <= y + dy < 16 and p[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    q[x, y] = pal['k'] + (255,)
        out.append(o)
    return strip(out)


def dm300(stage, f):
    c = Cv(32, 32); R = random.Random(stage * 10 + f)
    if stage >= 3:                                   # dents: dark hollows in the hull, fixed (no flicker)
        for (x, y) in ((11, 15), (12, 15), (19, 18), (20, 18), (20, 19), (14, 22)): c.put(x, y, hx('#1a1612'), 200)
        for k in range(3):                           # flames licking out of the dents
            y = 14 - ((f + k) % 4) * 2; c.put(12 + k * 4, y, hx('#ff9a3a')); c.put(12 + k * 4, y + 1, hx('#e8641f'))
    if stage >= 2:                                   # smoke out of the back: grey for 2, black for 3
        for k in range(3):
            t = (f + k) % 4
            c.disc(20 + k * 2 - t, 9 - t * 2, 1.5 + t * 0.6, hx('#2a2622' if stage == 3 else '#6e6a62'), 200 - t * 40)
    n = [3, 4, 6][stage - 1]                          # sparks off the hull
    for k in range(n):
        if (f + k) % 2 == 0:
            x, y = R.randint(8, 24), R.randint(10, 24)
            c.plus(x, y, hx('#fffad6'), 1, tip=hx('#ff9a3a'))
    return c.im


def steam(f):
    c = Cv(16, 32)
    for k in range(4):
        t = (f + k * 1.5) % 6
        c.disc(8 + math.sin(t + k) * 2, 28 - t * 4.2, 1.5 + t * 0.5, hx('#e8e4dc'), int(220 - t * 34))
    return c.im


def explode(f):
    c = Cv(64, 64); R = random.Random(11)
    r = [5, 11, 17, 22, 25, 27, 28, 29][f]
    if f < 5: c.glow(32, 34, max(2, r * (0.9 - f * 0.12)), [hx('#ffffff'), hx('#fffad6'), hx('#ffcc66'), hx('#ff9a3a'), hx('#e8641f')])
    c.ring(32, 34, r, hx('#ff9a3a' if f < 4 else '#6e6a62'), 230 - f * 25, w=2, sq=0.7, jag=1.5, seed=f)
    if f >= 3:
        for k in range(9):
            a = k / 9 * 6.2832; d = r * 0.7
            c.disc(32 + math.cos(a) * d, 34 + math.sin(a) * d * 0.7 - (f - 3) * 2, 3 + (f - 3) * 0.7, hx('#3a3630'), 210 - f * 18)
    for k in range(10):
        a = R.uniform(0, 6.28); d = r * R.uniform(0.6, 1.1)
        if f < 6: c.put(32 + math.cos(a) * d, 34 + math.sin(a) * d * 0.7, hx('#fffad6'))
    return c.im


def debris(kind, f):
    c = Cv(16, 16); a = f * 1.5708
    pts = {'plate': [(-3, -2), (3, -2), (3, 2), (-3, 2)], 'gear': [(math.cos(t) * 3, math.sin(t) * 3) for t in [i * 0.785 for i in range(8)]], 'bolt': [(-1, -3), (1, -3), (1, 3), (-1, 3)]}[kind]
    rot = [(8 + x * math.cos(a) - y * math.sin(a), 8 + x * math.sin(a) + y * math.cos(a)) for x, y in pts]
    for (x0, y0), (x1, y1) in zip(rot, rot[1:] + rot[:1]): c.line(x0, y0, x1, y1, hx('#9fa896'))
    c.put(8, 8, hx('#555950'))
    if kind == 'gear': c.ring(8, 8, 1.2, hx('#7a8173'))
    return c.im


def tengu_smoke(f):
    c = Cv(32, 32)
    for k in range(8):
        a = k / 8 * 6.2832 + 0.3; r = 2 + f * 2.2
        c.disc(16 + math.cos(a) * r, 20 + math.sin(a) * r * 0.6 - f, 3 + f * 0.5 - (k % 2), hx('#c8ccd8' if k % 2 else '#9aa0b0'), 240 - f * 38)
    if f == 0: c.glow(16, 18, 5, [hx('#ffffff'), hx('#d8e4ff')])
    return c.im


def shuriken(v):
    c = Cv(16, 16); R = random.Random(v)
    a = R.uniform(0, 3.14)
    for k in range(4):
        t = a + k * 1.5708; c.line(8, 8, 8 + math.cos(t) * 3, 8 + math.sin(t) * 3, hx('#1a1612'), 200)
    for k in range(3): c.put(8 + R.randint(-4, 4), 8 + R.randint(-4, 4), hx('#3a3630'), 160)
    c.put(8, 8, hx('#7a8173'))
    return c.im


def throne(f):
    c = Cv(32, 32)
    for k in range(6):
        t = (f + k) % 6; x = 6 + k * 4; y = 28 - t * 4
        c.put(x, y, hx('#ffeba4' if t < 3 else '#ffcc66'), 255 - t * 30)
        if t == 1: c.plus(x, y, hx('#ffcc66'), 1, a=150)
    return c.im


def undead(f):
    c = Cv(16, 32)
    for x in range(3, 13):                       # the crack in the floor, violet light in it
        if f >= 1: c.put(x, 29 + (x % 3 == 0), hx('#5a2c8c'))
        if f >= 2 and x % 2: c.put(x, 28, hx('#b88aff'), 180)
    if f >= 2:
        r = 2 + (f - 2) * 1.5; c.glow(8, 28, r, [hx('#d8b0ff'), hx('#7a4ac8')], sq=0.4)
    if f >= 3:                                   # a bony hand reaching up
        h = (f - 2) * 3
        for y in range(29 - h, 29): c.put(8, y, hx('#e8e2c8')); c.put(9, y, hx('#c8c0a8'))
        top = 29 - h
        for dx in (-1, 0, 1, 2): c.put(8 + dx, top - 1 - (dx in (0, 1)), hx('#e8e2c8'))
    return c.im


def crown(f):
    c = Cv(16, 16); a = [0, 0.5, 1.2, 1.57, 1.57, 1.57][f]; x0 = [8, 8, 9, 10, 12, 13][f]; y0 = [4, 7, 10, 12, 12, 12][f]
    pts = [(-3, 2), (-3, -1), (-2, 0), (-1, -2), (0, 0), (1, -2), (2, 0), (3, -1), (3, 2)]
    rot = [(x0 + x * math.cos(a) - y * math.sin(a), y0 + x * math.sin(a) + y * math.cos(a)) for x, y in pts]
    for (xa, ya), (xb, yb) in zip(rot, rot[1:]): c.line(xa, ya, xb, yb, hx('#ffcc66'))
    c.line(rot[0][0], rot[0][1], rot[-1][0], rot[-1][1], hx('#e8641f'))
    if f >= 3: c.disc(x0 - 2, 14, 1.5 + (f - 3) * 0.5, hx('#9fa896'), 160 - (f - 3) * 40)
    return c.im


def goo_splash(f):
    c = Cv(32, 32); R = random.Random(2)
    for k in range(9):
        a = R.uniform(3.3, 6.1); sp = R.uniform(0.8, 1.3); t = f + 1
        x, y = 16 + math.cos(a) * t * 2.4 * sp, 20 + math.sin(a) * t * 2.2 * sp + 0.45 * t * t
        if f < 5: c.disc(x, y, 1.2 - f * 0.1, hx('#7fdc4a' if k % 3 else '#c8f08a'))
    if f >= 3:
        for k in range(3): c.disc(10 + k * 6, 27, 1.5, hx('#3a7a1a'), 200)
    return c.im


def goo_pop(f):
    c = Cv(48, 48); R = random.Random(8)
    if f < 3:
        r = 10 + f * 3; c.disc(24, 28, r, hx('#3a7a1a'), sq=0.7); c.disc(24, 26, r - 2, hx('#5aa82a'), sq=0.7); c.disc(20, 23, 3, hx('#c8f08a'))
    if f >= 2:
        r = 6 + (f - 2) * 4
        for k in range(14):
            a = R.uniform(0, 6.28); d = r * R.uniform(0.7, 1.2)
            c.disc(24 + math.cos(a) * d, 28 + math.sin(a) * d * 0.7 + (f - 2) * 0.8, max(0.8, 2.4 - (f - 2) * 0.3), hx('#7fdc4a' if k % 2 else '#3a7a1a'))
    if f >= 6:
        for k in range(5): c.disc(12 + k * 6, 40, 2.5, hx('#2a5a12'), 220, sq=0.5)
    return c.im


def yog_glint(f):
    c = Cv(32, 32)
    s = [0, 1, 3, 2, 1, 0][f]
    if s: c.plus(19, 11, hx('#ffffff'), s, tip=hx('#ff8a9a'))
    if f in (2, 3): c.ring(16, 16, 8 + f, hx('#ff2a4a'), 120, sq=0.8)
    return c.im


def fist(kind, f):
    c = Cv(32, 32); L, D = (hx('#ff9a3a'), hx('#b22a2a')) if kind == 'burning' else (hx('#9ab06a'), hx('#4a5a2a'))
    r = [3, 7, 10, 12, 12, 11][f]
    c.ring(16, 26, r, L, 230 - f * 25, w=2, sq=0.4, jag=1.2, seed=f)
    for k in range(7):
        a = 3.3 + k * 0.45; d = r * 0.8
        x, y = 16 + math.cos(a) * d, 26 + math.sin(a) * d - f * 1.5
        c.disc(x, y, 1.6, D if k % 2 else L, 230 - f * 30)
    if kind == 'burning' and f < 4:
        for k in range(4): c.put(10 + k * 4, 20 - f * 3 - k % 2, hx('#ffeba4'))
    return c.im


def yog_death(f):
    c = Cv(64, 64); r = 4 + f * 3.6
    c.ring(32, 34, r, hx('#ff2a4a'), 240 - f * 25, w=3, sq=0.6)
    c.ring(32, 34, r * 0.7, hx('#ffb0c0'), 200 - f * 22, w=1, sq=0.6)
    if f < 3: c.glow(32, 30, 8 - f * 2, [hx('#ffffff'), hx('#ffb0c0'), hx('#ff2a4a')])
    R = random.Random(f)
    for k in range(12):
        a = k / 12 * 6.2832; c.put(32 + math.cos(a) * (r + 2), 34 + math.sin(a) * (r + 2) * 0.6, hx('#2a0610'), 200)
    return c.im


def amulet(f):
    """32 x 64: the Amulet of Yendor lies where Yog fell — a column of gold comes down, the amulet's glint, rings at its feet."""
    c = Cv(32, 64)
    top = [56, 40, 20, 4, 0, 0, 0, 0][f]; w = [2, 4, 6, 7, 6, 5, 5, 4][f]
    for y in range(top, 58):
        for x in range(16 - w, 16 + w):
            d = abs(x + 0.5 - 16) / w
            a = int(230 * (1 - d) * (0.4 + 0.6 * (y - top) / max(1, 58 - top)))
            if a > 20: c.put(x, y, hx('#fffad6' if d < 0.35 else '#ffcc66'), a)
    if f >= 3:
        k = (f - 3) * 2.5
        c.ring(16, 56, 5 + k, hx('#ffcc66'), 230 - (f - 3) * 40, sq=0.35)
        c.plus(20, 44, hx('#ffffff'), 2 if f % 2 else 1, tip=hx('#ffeba4'))
    return c.im


if __name__ == '__main__':
    save(bar(), 'ui/boss/bar.png')
    save(bar().crop((0, 0, 64, 16)), 'ui/boss/bar-frame.png')
    save(icons(), 'ui/boss/icons.png')
    save(rows([strip([dm300(s, f) for f in range(4)]) for s in (1, 2, 3)]), 'fx/boss/dm300.png')
    save(strip([steam(f) for f in range(6)]), 'fx/boss/steam.png')
    save(strip([explode(f) for f in range(8)]), 'fx/boss/explode.png')
    save(rows([strip([debris(k, f) for f in range(4)]) for k in ('plate', 'gear', 'bolt')]), 'fx/boss/debris.png')
    save(strip([tengu_smoke(f) for f in range(6)]), 'fx/boss/tengu.png')
    save(rows([shuriken(v) for v in range(3)]), 'fx/boss/shuriken.png')
    save(strip([throne(f) for f in range(6)]), 'fx/boss/throne.png')
    save(strip([undead(f) for f in range(6)]), 'fx/boss/undead.png')
    save(strip([crown(f) for f in range(6)]), 'fx/boss/crown.png')
    save(strip([goo_splash(f) for f in range(6)]), 'fx/boss/goo.png')
    save(strip([goo_pop(f) for f in range(8)]), 'fx/boss/goo-pop.png')
    save(strip([yog_glint(f) for f in range(6)]), 'fx/boss/yog.png')
    save(rows([strip([fist(k, f) for f in range(6)]) for k in ('rotting', 'burning')]), 'fx/boss/fist.png')
    save(strip([yog_death(f) for f in range(8)]), 'fx/boss/yog-death.png')
    save(strip([amulet(f) for f in range(8)]), 'fx/boss/amulet.png')
    print('boss art')
